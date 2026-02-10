import { Collection, DataAPIClient } from "@datastax/astra-db-ts";
import { PuppeteerWebBaseLoader } from 'langchain/document_loaders/web/puppeteer';
import OpenAI from "openai";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter"; 
import dotenv from "dotenv";
dotenv.config();
import { PDFLoader } from "langchain/document_loaders/fs/pdf";
import path from "path";


const { ASTRA_DB_NAMESPACE, 
    ASTRA_DB_COLLECTION, 
    ASTRA_DB_API_ENDPOINT, 
    ASTRA_DB_APPLICATION_TOKEN
} = process.env;


const openai = new OpenAI({ apiKey:  process.env.OPENAI_API_KEY })

const SitesArmazenamento = [
]

const PDFArmazenamento = [
    path.resolve('./script/pdfs/TeseAlcimaria.pdf'),
]



const cliente = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN)
const db = cliente.db(ASTRA_DB_API_ENDPOINT , {namespace: ASTRA_DB_NAMESPACE})

const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 512,
    chunkOverlap: 100
});

type SimilarityMetric = "dot_product" | "cosine" | "euclidean"

const CollectionCriacao = async(similarityMetric: SimilarityMetric = "dot_product") => {
    const res = await db.createCollection(ASTRA_DB_COLLECTION, {
        vector: {
            dimension: 1536,
            metric: similarityMetric
        }
    })
    console.log(res)
}


const scrapePage = async (url: string) => {
    const loader = new PuppeteerWebBaseLoader(url, {
        launchOptions: {
            headless: true
        },
        gotoOptions: {
            waitUntil: "domcontentloaded"
        },
        evaluate: async(page, browser) => {
            const resultado = await page.evaluate(() => document.body.innerHTML)
            await browser.close()
            return resultado
        }
    })
    return (await loader.scrape())?.replace(/<[^>]*>?/gm, '')
}
  

const loadPDF = async(filePath: string) => {
    const loader = new PDFLoader(filePath)
    const docs = await loader.load()
    return docs.map(doc => doc.pageContent).join("\n")
} 

const CarregarOCoisa = async() => {
    const colecao = await db.collection(ASTRA_DB_COLLECTION)
    for await (const url of SitesArmazenamento) {
        const content = await scrapePage(url)
        const chunks = await splitter.splitText(content)
        for await (const chunk of chunks){
            const embedding = await openai.embeddings.create(({
                model: "text-embedding-3-small",
                input: chunk,
                encoding_format: "float"
            }))

            const vector = embedding.data[0].embedding

            const resp = await colecao.insertOne({
                $vector: vector,
                text: chunk
            })
            console.log(resp)
        } 
    }
    for await (const pdfPath of PDFArmazenamento) {
    const content = await loadPDF(pdfPath);
    const chunks = await splitter.splitText(content);
    for await (const chunk of chunks) {
      const embedding = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: chunk,
        encoding_format: "float"
      });

      const vector = embedding.data[0].embedding;

      await colecao.insertOne({
        $vector: vector,
        text: chunk
      });
    }
  }
}

CollectionCriacao().then(() => CarregarOCoisa())

