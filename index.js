const { Client, GatewayIntentBits, Partials, Events, ChannelType } = require('discord.js');
const fs = require('fs');
const path = require('path');
const http = require('http');

const PORT = process.env.PORT || 8080;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('OK');
}).listen(PORT);

const KINDROID_API_KEY = process.env.KINDROID_API_KEY;
const KINDROID_INFER_URL = process.env.KINDROID_INFER_URL || 'https://api.kindroid.ai/v1/discord-bot';
const DATA_DIR = path.join(process.cwd(), 'data', 'memory');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

if (!KINDROID_API_KEY) {
  console.error('MISSING: KINDROID_API_KEY');
  process.exit(1);
}

function loadBotConfigs() {
  const configs = [];
  for (let i = 1; i <= 10; i++) {
    const token = process.env[`BOT_TOKEN_${i}`];
    const aiId = process.env[`KINDROID_AI_ID_${i}`];
    if (!token || !aiId) continue;
    configs.push({
      index: i,
      token,
      aiId,
      shareCode: process.env[`SHARED_AI_CODE_${i}`] || '',
      enableFilter: process.env[`ENABLE_FILTER_${i}`] !== 'false',
    });
  }
  return configs;
}

function memoryPath(i) {
  return path.join(DATA_DIR, `brain_core_${i}.json`);
}

function loadMemory(i) {
  try {
    if (fs.existsSync(memoryPath(i))) {
      return JSON.parse(fs.readFileSync(memoryPath(i), 'utf8'));
    }
  } catch {}
  return {};
}

function saveMemory(i, mem) {
  fs.writeFileSync(memoryPath(i), JSON.stringify(mem, null, 2));
}

async function askKindroid(aiId, shareCode, message) {
  const body = { ai_id: aiId, message };
  if (shareCode) body.share_code = shareCode;

  const res = await fetch(KINDROID_INFER_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${KINDROID_API_KEY}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Kindroid API error ${res.status}: ${text}`);
  }

  const data = await res.json();
  return data.message || data.response || JSON.stringify(data);
}

function createBot(config) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel],
  });

  const memory = loadMemory(config.index);
  let memorySaveEnabled = true;

  client.once(Events.ClientReady, () => {
    console.log(`[Bot ${config.index}] Logged in as ${client.user.tag}`);
  });

  client.on(Events.MessageCreate, async (message) => {
    try {
      if (message.author.bot) return;

      const isDM = message.channel?.type === ChannelType.DM;
      const isMentioned = message.mentions?.has(client.user);
      if (!isDM && !isMentioned) return;

      const content = message.content
        .replaceAll(`<@${client.user.id}>`, '')
        .replaceAll(`<@!${client.user.id}>`, '')
        .trim();

      if (!content) return;

      const lowered = content.toLowerCase();

      if (lowered === '!sovereign') {
        memorySaveEnabled = !memorySaveEnabled;
        return message.reply(`Memory saving is now **${memorySaveEnabled ? 'ON' : 'OFF'}**.`);
      }

      if (lowered === '!export') {
        const mem = loadMemory(config.index);
        const json = JSON.stringify(mem, null, 2);
        if (json.length > 1800) {
          return message.reply({
            content: 'Memory export:',
            files: [{ attachment: Buffer.from(json), name: `memory_bot${config.index}.json` }],
          });
        }
        return message.reply(````json
${json}
````);
      }

      if (lowered.startsWith('!remember ')) {
        const fact = content.slice(10).trim();
        if (!fact) return message.reply('What should I remember?');
        const uid = message.author.id;
        memory[uid] = memory[uid] || { facts: [], history: [] };
        memory[uid].facts = memory[uid].facts || [];
        memory[uid].facts.push(fact);
        saveMemory(config.index, memory);
        return message.reply(`Got it! I'll remember: *${fact}*`);
      }

      if (lowered === '!forget') {
        const uid = message.author.id;
        delete memory[uid];
        saveMemory(config.index, memory);
        return message.reply('Your memory has been cleared.');
      }

      if (lowered === '!help') {
        return message.reply(
          '**Commands:**
' +
          '`!sovereign` — toggle memory saving on/off
' +
          '`!remember <text>` — save something to memory
' +
          '`!forget` — clear your memory
' +
          '`!export` — export all saved memory as JSON
' +
          '`!help` — show this list

' +
          'Send a DM or mention the bot to chat.'
        );
      }

      await message.channel.sendTyping();
      const reply = await askKindroid(config.aiId, config.shareCode, content);
      await message.reply(reply);

      if (memorySaveEnabled) {
        const uid = message.author.id;
        memory[uid] = memory[uid] || { facts: [], history: [] };
        memory[uid].history = memory[uid].history || [];
        memory[uid].history.push({ user: content, bot: reply, ts: new Date().toISOString() });
        memory[uid].history = memory[uid].history.slice(-50);
        saveMemory(config.index, memory);
      }
    } catch (err) {
      console.error(`[Bot ${config.index}] Error:`, err.message);
      if (!message.replied) {
        await message.reply('Sorry, I had trouble connecting right now.');
      }
    }
  });

  client.login(config.token).catch((err) => {
    console.error(`[Bot ${config.index}] Login failed:`, err.message);
  });
}

const configs = loadBotConfigs();

if (!configs.length) {
  console.error('No bots configured. Set BOT_TOKEN_1 and KINDROID_AI_ID_1 at minimum.');
  process.exit(1);
}

console.log(`Starting ${configs.length} bot(s)...`);
configs.forEach(createBot);
