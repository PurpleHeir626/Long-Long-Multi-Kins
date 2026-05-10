const { Client, GatewayIntentBits, Collection } = require('discord.js'); 
const fs = require('fs'); 
 
const bots = [ 
  { 
    token: process.env.BOT_TOKEN_1, 
    kindroidId: process.env.KINDROID_AI_ID_1, 
    apiKey: process.env.KINDROID_API_KEY, 
    inferUrl: process.env.KINDROID_INFER_URL || 'https://api.kindroid.ai/v1/discord-bot', 
    index: 1, 
    memoryFile: 'memory_bot1.json' 
  } 
]; 
 
function loadMemory(index) { 
  const fileName = `memory_bot${index}.json`; 
  try { 
    if (fs.existsSync(fileName)) { 
      return JSON.parse(fs.readFileSync(fileName, 'utf8')) || {}; 
    } 
    return {}; 
  } catch (error) { 
    console.error(`Error loading memory for bot ${index}:`, error); 
    return {}; 
  } 
} 
 
function saveMemory(index, memory) { 
  try { 
    fs.writeFileSync(`memory_bot${index}.json`, JSON.stringify(memory, null, 2)); 
  } catch (error) { 
    console.error(`Error saving memory for bot ${index}:`, error); 
  } 
} 
 
async function sendToKindroid(message, config) { 
  const memory = loadMemory(config.index); 
  const uid = message.author.id; 
   
  if (!memory) memory = { facts: , history: }; 
  memory.history.push({ role: 'user', content: message.content }); 
   
  // Keep history manageable (e.g., last 20 messages) 
  if (memory.history.length > 20) memory.history.shift(); 
   
  try { 
    const response = await fetch(config.inferUrl, { 
      method: 'POST', 
      headers: { 
        'Authorization': `Bearer ${config.apiKey}`, 
        'Content-Type': 'application/json', 
      }, 
      body: JSON.stringify({ 
        kindroidId: config.kindroidId, 
        message: message.content, 
        memory: memory 
      }) 
    }); 
     
    const data = await response.json(); 
    const aiReply = data.reply || "No response from AI."; 
     
    memory.history.push({ role: 'assistant', content: aiReply }); 
    saveMemory(config.index, memory); 
     
    return aiReply; 
  } catch (error) { 
    console.error('Kindroid error:', error); 
    return "AI service error - check logs."; 
  } 
} 
 
function createBot(config) { 
  const client = new Client({ 
    intents: [ 
      GatewayIntentBits.Guilds,  
      GatewayIntentBits.GuildMessages,  
      GatewayIntentBits.MessageContent 
    ] 
  }); 
 
  client.once('ready', () => { 
    console.log(`Bot ${config.index} is logged in as ${client.user.tag}`); 
  }); 
 
  let memorySaveEnabled = true; 
 
  client.on('messageCreate', async (message) => { 
    if (message.author.bot) return; 
     
    const lowered = message.content.toLowerCase().trim(); 
     
    // Commands for memory control 
    if (lowered === 'memory on') { 
      memorySaveEnabled = true; 
      return message.reply("Memory saving is now **ON**."); 
    } 
    if (lowered === 'memory off') { 
      memorySaveEnabled = false; 
      return message.reply("Memory saving is now **OFF**."); 
    } 
     
    if (!memorySaveEnabled) return; 
     
    // Fixed lexport logic 
    if (lowered === 'lexport') { 
      const mem = loadMemory(config.index); 
      const json = JSON.stringify(mem, null, 2); 
       
      if (json.length > 1900) { 
        return message.reply({ 
          content: 'Memory file is too large for a message, sending as attachment:', 
          files: , 
        }); 
      } 
      // FIXED: Corrected the backtick syntax here 
      return message.reply("```json\n" + json + "\n```"); 
    } 
     
    // Command to remember facts 
    if (lowered.startsWith('iremember ')) { 
      const fact = message.content.slice(10).trim(); 
      if (!fact) return message.reply('What should I remember?'); 
       
      const uid = message.author.id; 
      const memory = loadMemory(config.index); 
       
      if (!memory) memory = { facts: , history: }; 
      memory.facts.push(fact); 
      saveMemory(config.index, memory); 
       
      return message.reply(`✅ Remembered: ${fact}`); 
    } 
     
    // Default: Send message to Kindroid API 
    const reply = await sendToKindroid(message, config); 
    message.reply(reply); 
  }); 
 
  client.login(config.token).catch(err => { 
    console.error(`Failed to login Bot ${config.index}:`, err); 
  }); 
} 
 
bots.forEach(createBot
