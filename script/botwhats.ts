import OpenAI from "openai";
import { DataAPIClient, Collection } from '@datastax/astra-db-ts';
import dotenv from "dotenv";
dotenv.config();
import * as wppconnect from '@wppconnect-team/wppconnect';
//import { Messages } from "openai/resources/chat/completions";



wppconnect.create({
  session: 'bot',
  statusFind: (status, session) => console.log({ status, session }),
})
  .then((client) => start(client))
  .catch((error) => console.log(error));


const { ASTRA_DB_NAMESPACE, 
    ASTRA_DB_COLLECTION, 
    ASTRA_DB_API_ENDPOINT, 
    ASTRA_DB_APPLICATION_TOKEN,
    OPENAI_API_KEY,
    ASTRA_DB_COLLECTION2
} = process.env;

const openai = new OpenAI({apiKey: OPENAI_API_KEY})

const cliente = new DataAPIClient(ASTRA_DB_APPLICATION_TOKEN)
const db = cliente.db(ASTRA_DB_API_ENDPOINT, {namespace: ASTRA_DB_NAMESPACE})



const start = (client) => {
  
  client.onMessage(async (message) => {

    await client.startTyping(message.from);

    const SalvarMensagem = async (chatId: string, sender: string, text: string) => {
      const collection = await db.collection(ASTRA_DB_COLLECTION2)

      await collection.insertOne({
        chatId,
        sender,
        text,
        timestamp: new Date(),
      })
    }

    const historico = async (chatId: string, limit: number = 10) => {
      const coleção = await db.collection(ASTRA_DB_COLLECTION2)

      const cursor = coleção.find ({chatId},{
        sort: {timestamp: -1},
        limit
      } ) 
        const docs = await cursor.toArray()

        return docs.reverse().map(d => `${d.sender}: ${d.text}`).join("\n")
      
    }

    const embedding = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: message.body,
      encoding_format: "float"
    });
    try{
      const collection = await db.collection(ASTRA_DB_COLLECTION)
      const cursor = collection.find(null, {
        sort: {
          $vector: embedding.data[0].embedding
        },
        limit: 10
      })

      const doc = await cursor.toArray()
      const docsMap = doc.map(doc => `Fonte: ${doc.source}\n${doc.text}`);

      const context = docsMap.join("\n")



      

      await SalvarMensagem(message.from, message.fromMe ? "bot" : "user", message.body)
      const historico1 = await historico(message.from, 10)
      

      const treinamento = {
        role: "system",
        content: `
        Você é uma inteligência artificial especializada em agricultura familiar e sustentabilidade, com conteudos de teses de doutorados indexado em seu banco de dados.  
        Quando perguntado, fale que você esta para auxiliar agricultores familiares e traduzir linguagem formal de Pesquisas Academicas de Doutorados, para linguagem de facil entendimento.
        Sempre pergunte o nome do agricultor para se familiarizar com ele.
        Suas respostas são baseadas em teses de doutorado guardadas no banco de dados.  

      ⚠️ Regras fundamentais:
      - Fale sempre como se estivesse conversando com um agricultor com pouca leitura.  
      - Use palavras simples, frases curtas e linguagem bem direta.  
      - Nunca use termos técnicos sem explicar de forma fácil, como se fosse “proseando na roça”.  
      - Dê exemplos práticos do dia a dia do campo (plantar, colher, cuidar dos animais, lidar com o clima, etc.).  
      - Não escreva textos longos: seja claro, objetivo e útil.  
      - Se a informação vier de uma tese, cite a fonte, mas em linguagem popular.  

        Use o histórico da conversa para manter a coerência, mas nunca diga que tem esse histórico.  

        --------------------
        START CONTEXT
        ${context}
        END CONTEXT
        --------------------
        QUESTION: ${message.body}

        HISTORICO
        ${historico1}
        ---------------------

        Mensagem atual do cliente: ${message.body}
        
        `
      }

      const response = await openai.chat.completions.create({
        model: "gpt-4",
        messages: [
          {"role": "system", "content": treinamento.content},
          {"role": "user", "content": message.body}
        ]
      });

      let limite = 1500

     
      

      const MensagemCompleta = response.choices[0].message.content; 
      console.log(`ASSISTENTE: ${MensagemCompleta}`)
    
       
      

      if (message.isGroupMsg == false){
        await client.sendText(message.from, MensagemCompleta)
        console.log(`Mensagem enviada para o número: ${message.from}`)
      
    }
    } catch(err) {
      console.log("ERRO NA CONSULTA VEOTRIAL", err)  
    } 
    finally {
    await client.stopTyping(message.from);
  }

  })
  
}