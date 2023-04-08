const express = require('express')
const request = require('request')
const app = express()
const fs = require('fs');
const { promisify } = require('util')
const readFile = promisify(fs.readFile)
const ChatGPT = require('ChatGPT.js')


const GPT_MODE = process.env.GPT_MODE
const CHATBOT_MODE = process.env.CHATBOT_MODE
const TWITCH_OAUTH = process.env.TWITCH_OAUTH
const TWITCH_CHANNEL = process.env.TWITCH_CHANNEL
const TWITCH_BOTNAME = process.env.TWITCH_BOTNAME
const REFLECTIONS = process.env.REFLECTIONS



const tmi = require('tmi.js');


if (CHATBOT_MODE == "STANDALONE"){
  const client = new tmi.Client({
    options: { debug: true },
    identity: {
      username: TWITCH_BOTNAME,
      password: TWITCH_OAUTH
    },
    channels: [ TWITCH_CHANNEL ]
  });
  
  client.connect();
  
  client.on('message', (channel, tags, message, self) => {
    // Ignore echoed messages.
    if(self) return;
  
    if(message.toLowerCase() === '@' + TWITCH_BOTNAME) {
      // "@alca, heya!"
      client.say(channel, `@${tags.username}, heya!`);
    }
  });

}





let file_context = "You are a helpful Twitch Chatbot."

const messages = [
  {role: "system", content: "You are a helpful Twitch Chatbot."}
];

console.log("GPT_MODE is " + GPT_MODE)
console.log("History length is " + process.env.HISTORY_LENGTH)
console.log("OpenAI API Key:" + process.env.OPENAI_API_KEY)

app.use(express.json({extended: true, limit: '1mb'}))

app.all('/', (req, res) => {
    console.log("Just got a request!")
    res.send('Yo!')
})

if (process.env.GPT_MODE === "CHAT"){

  fs.readFile("./file_context.txt", 'utf8', function(err, data) {
    if (err) throw err;
    console.log("Reading context file and adding it as system level message for the agent.")
    messages[0].content = data;
  });

} else {

  fs.readFile("./file_context.txt", 'utf8', function(err, data) {
    if (err) throw err;
    console.log("Reading context file and adding it in front of user prompts:")
    file_context = data;
    console.log(file_context);
  });

}

app.get('/gpt/:text', async (req, res) => {
    
    //The assistant should recieve Username:Message in the text to identify conversations with different users in his history. 
    
    const text = req.params.text
    const { Configuration, OpenAIApi } = require("openai");

    const configuration = new Configuration({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const openai = new OpenAIApi(configuration);      
    
    if (GPT_MODE === "CHAT"){
      //CHAT MODE EXECUTION

      //Add user message to  messages
      messages.push({role: "user", content: text})
      //Check if message history is exceeded
      console.log("Conversations in History: " + ((messages.length / 2) -1) + "/" + process.env.HISTORY_LENGTH)
      if(messages.length > ((process.env.HISTORY_LENGTH * 2) + 1)) {
          console.log('Message amount in history exceeded. Removing oldest user and assistant messages.')
          messages.splice(1,2)
     }
    
      console.log("Messages: ")
      console.dir(messages)
      console.log("User Input: " + text)

      const response = await openai.createChatCompletion({
        model: "gpt-3.5-turbo",
        messages: messages,
        temperature: 0.5,
        max_tokens: 256,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
      });
    
      if (response.data.choices) {
        let assistant_response = response.data.choices[0].message.content

        console.log ("assistant answer: " + assistant_response)
        messages.push({role: "assistant", content: assistant_response})

        //Enter Reflection

        // Create new Message history for reflections
        

        let reflection_history = [
          {role: "system", content: "ContextFile"},
          {role: "user", content: text},
          {role: "assistant", content: assistant_response},
          {role: "system", content: "Überprüfe ob deine vorherige Antwort alle Anforderungen erfüllt. Falls nicht, verbessere deine Antwort."},
          {role: "system", content: "Gib nur die bessere Antwort aus und erkläre nicht dein Vorgehen."},
        ]
        //context
        fs.readFile("./file_context.txt", 'utf8', function(err, data) {
          if (err) throw err;
          console.log("Reading context file and adding it as system level message for the assistant.")
          reflection_history[0].content = data;
        });

        const reflection = await openai.createChatCompletion({
          model: "gpt-3.5-turbo",
          messages: reflection_history,
          temperature: 0.5,
          max_tokens: 256,
          top_p: 1,
          frequency_penalty: 0,
          presence_penalty: 0,
        });
        if (reflection.data.choices) {
          console.log("Reflected assistant answer:" + reflection.data.choices[0].message.content)
          assistant_response = reflection.data.choices[0].message.content
          

        } else {
          res.send("Something in the reflection went wrong. Try again later!")
        }


        res.send(assistant_response)
      } else {
        res.send("Something went wrong. Try again later!")
      }

    } else {
      //PROMPT MODE EXECUTION
      const prompt = file_context + "\n\nQ:" + text + "\nA:";
      console.log("User Input: " + text)

      const response = await openai.createCompletion({
        model: "text-davinci-003",
        prompt: prompt,
        temperature: 0.5,
        max_tokens: 128,
        top_p: 1,
        frequency_penalty: 0,
        presence_penalty: 0,
      });
      if (response.data.choices) {
        let agent_response = response.data.choices[0].text
          console.log ("Agent answer: " + agent_response)
          //Check for Twitch max. chat message length limit and slice if needed
          if(agent_response.length > 399){
            console.log("Agent answer exceeds twitch chat limit. Slicing to first 399 characters.")
            agent_response = agent_response.substring(0, 399)
            console.log ("Sliced Agent answer: " + agent_response)
          }

          res.send(agent_response)
      } else {
          res.send("Something went wrong. Try again later!")
      }
    }
    
})
app.listen(process.env.PORT || 3000)
