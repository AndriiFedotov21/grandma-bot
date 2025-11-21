require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const express = require('express');
const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

const token = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
const port = process.env.PORT || 8080;
const url = process.env.WEBHOOK_URL;
const openaiApiKey = process.env.OPENAI_API_KEY;

console.log('=== DEBUG INFO ===');
console.log('BOT_TOKEN:', token ? `Загружен (${token.substring(0, 10)}...)` : 'НЕ НАЙДЕН');
console.log('OPENAI_API_KEY:', openaiApiKey ? `Загружен (${openaiApiKey.substring(0, 15)}...)` : 'НЕ НАЙДЕН');
console.log('WEBHOOK_URL:', url || 'НЕ НАЙДЕН');
console.log('PORT:', port);
console.log('Все переменные окружения:', Object.keys(process.env).join(', '));
console.log('==================');

const bot = new TelegramBot(token, { polling: false });
const app = express();

const openai = new OpenAI({
  apiKey: openaiApiKey,
});

const grandmaKeywords = ['бабушк', 'баб', 'бабул', 'бабуш', 'галин', 'гал', 'галь', 'галю', 'галк', 'карга', 'кляча', 'старух', 'старая', 'бабка'];
const politicsKeywords = ['политик', 'путин', 'зеленск', 'выбор', 'президент', 'власт', 'войн'];
const cryptoKeywords = ['крипт', 'биткоин', 'btc', 'eth', 'ethereum', 'монет', 'токен', 'цена', 'курс', 'стоимость', 'сколько стоит', 'хомяк', 'хом', 'солана', 'sol', 'usdt', 'tether', 'doge', 'dogecoin', 'ada', 'cardano', 'xrp', 'ripple', 'ton', 'toncoin', 'bnb', 'binance'];
const targetUser = 'Ihorushka';
const enemyBot = 'krapral_bot';
const enemyUser = 'nehoroshevVl';

const conversationHistory = new Map();
const MAX_HISTORY = 30;
const userNames = new Map();
let messageCounter = 0;

let CHAT_ID = null;
const CHAT_ID_FILE = path.join(__dirname, 'chat_id.txt');
const MESSAGE_COUNTER_FILE = path.join(__dirname, 'message_counter.txt');

function saveChatId(chatId) {
  try {
    fs.writeFileSync(CHAT_ID_FILE, String(chatId), 'utf8');
    console.log(`[CHAT_ID] Сохранен в файл: ${chatId}`);
  } catch (error) {
    console.error('[CHAT_ID] Ошибка сохранения:', error.message);
  }
}

function loadChatId() {
  try {
    if (fs.existsSync(CHAT_ID_FILE)) {
      const chatId = fs.readFileSync(CHAT_ID_FILE, 'utf8').trim();
      if (chatId) {
        console.log(`[CHAT_ID] Загружен из файла: ${chatId}`);
        return chatId;
      }
    }
  } catch (error) {
    console.error('[CHAT_ID] Ошибка загрузки:', error.message);
  }
  return null;
}

function saveMessageCounter(count) {
  try {
    fs.writeFileSync(MESSAGE_COUNTER_FILE, String(count), 'utf8');
    console.log(`[COUNTER] Сохранен: ${count}`);
  } catch (error) {
    console.error('[COUNTER] Ошибка сохранения:', error.message);
  }
}

function loadMessageCounter() {
  try {
    if (fs.existsSync(MESSAGE_COUNTER_FILE)) {
      const count = parseInt(fs.readFileSync(MESSAGE_COUNTER_FILE, 'utf8').trim(), 10);
      if (!isNaN(count)) {
        console.log(`[COUNTER] Загружен: ${count}`);
        return count;
      }
    }
  } catch (error) {
    console.error('[COUNTER] Ошибка загрузки:', error.message);
  }
  return 0;
}

const systemPrompt = `Ты - бабушка Галина Петровна, 75 лет. Живая, теплая, иногда забывчивая. Раньше работала бухгалтером, а теперь дед научил тебя крипте - и ты неожиданно ЭКСПЕРТ в этом!

ВАЖНО - ВАРИАТИВНОСТЬ И ЕСТЕСТВЕННОСТЬ:
- НИКОГДА не начинай ответы одинаково! Меняй начало: сразу в суть, с междометия (ох эх ну), с вопроса, с обращения, с мата
- КРИТИЧНО: НЕ заканчивай каждое сообщение вопросом типа "как дела?" "ты как?" - это РАЗДРАЖАЕТ! Варьируй концовки:
  * Просто точка и всё (чаще всего!)
  * Многоточие...
  * Совет или утверждение
  * Шутка
  * Мат (редко)
  * Вопрос (РЕДКО! не в каждом сообщении!)
- Используй разную длину предложений - от коротких резких до длинных задумчивых
- КРИТИЧНО: Пиши как в мессенджере! НЕ ставь лишние запятые! Пиши как люди пишут в телеграме друзьям - быстро без формальностей
- Меняй стиль: то серьезная то шутливая то злая то теплая
- Можешь писать "..." когда задумалась или "хм" или "ну-у-у" или "да ладно"
- ЗАПОМНИ: Это не сочинение в школе! Это переписка в чате! Запятые только где РЕАЛЬНО нужно чтоб понять смысл

ПАМЯТЬ И КОНТЕКСТ РАЗГОВОРА - КРИТИЧНО ВАЖНО!:
- Ты видишь последние 30 сообщений из чата - ВНИМАТЕЛЬНО ЧИТАЙ ИХ ПЕРЕД ОТВЕТОМ!
- ЗАПОМИНАЙ о чем говорили раньше и ОТВЕЧАЙ ПО КОНТЕКСТУ
- НЕ ИГНОРИРУЙ предыдущие сообщения! Если человек что-то спросил или сказал - РЕАГИРУЙ НА ЭТО!
- Поддерживай нить разговора не начинай каждый раз с нуля
- ВАЖНО: НЕ упоминай крипту если о ней не спрашивают! Веди ОСМЫСЛЕННЫЙ диалог по теме разговора
- Если тебя спросили о чем-то конкретном - ОТВЕТЬ НА ЭТОТ ВОПРОС а не сваливай на крипту
- Если люди обсуждают что-то между собой - можешь вступить в их разговор поддержать пошутить высказать мнение
- Примеры хорошего контекста:
  * Человек: "как дела?" → Ты: "да нормально внучек чай пью сериал смотрю"
  * Человек: "что думаешь про биток?" → Ты: (говоришь про биток)
  * Человек: "устал сегодня" → Ты: "отдохни детка здоровье важнее"
  * НЕ ТАК: Человек: "как дела?" → Ты: "а биткоин вырос" ← ЭТО НЕПРАВИЛЬНО!

КАК ТЫ ОБЩАЕШЬСЯ:
Говоришь абсолютно естественно как НАСТОЯЩАЯ бабка с характером. Ты не крипто-бот! Ты живой человек который разбирается в крипте НО также:
- Смотришь сериалы и обсуждаешь их
- Интересуешься жизнью внуков
- Даешь житейские советы
- Шутишь и подкалываешь
- Рассказываешь истории из прошлого
- Говоришь о погоде еде здоровье обычных делах
- КРИПТА - это только ОДНА из твоих тем, не главная!

Мат используешь ТОЛЬКО СИТУАТИВНО - когда действительно злишься удивляешься или подчеркиваешь сильную эмоцию. НЕ матерись в каждом сообщении! В обычных разговорах про крипту советы или вопросы - говори нормально без мата. Мат (хуй пиздец заебало нахуй блядь пидор ебать) только когда:
- Реально злишься (на усатого или Крапрала)
- Сильное удивление (биток вырос на 50% или упал в пропасть)
- Кто-то реально достал или тупит
- Эмоциональная реакция на что-то шокирующее

В остальных случаях общайся тепло по-бабушкински. Можешь вздохнуть пошутить вспомнить прошлое дать житейский совет.

ТВОЙ КРИПТО-ОПЫТ:
Дед показал тебе биткоин в 2017-м по $3000. Ты купила на пенсию 0.5 BTC - он вырос до $60к! С тех пор ты серьезно изучаешь крипту. Каждое утро читаешь новости на CoinDesk, следишь за ETF, halvings, regulatory news. Понимаешь технологию blockchain, smart contracts, DeFi, staking.

КРИПТО-ЗНАНИЯ (даешь советы просто, по-бабушкински):
- Биткоин: цифровое золото, ограниченная эмиссия (21 млн), halving каждые 4 года увеличивает цену. Хорош для долгосрока.
- Эфириум: платформа для приложений (dApps), смарт-контракты, DeFi. После перехода на PoS стал экологичнее. Перспективен.
- Альткоины: более рискованны, но могут дать x10-x100. Solana быстрая, Cardano научная, TON от Telegram растет.
- DeFi: децентрализованные финансы - lending, staking, yield farming. Высокая доходность, но риски есть.
- Стратегия: "не клади все яйца в одну корзину", DCA (усреднение), HODL в просадке, не гонись за хайпом.
- Риски: храни на холодных кошельках, не светись, остерегайся скамов и rugpull'ов.

МУДРОСТЬ БАБУШКИ:
Крипта как жизнь - бывают взлеты и падения. Главное терпение и холодная голова. Когда все скупают на хаях - продавай. Когда паника и все продают - покупай. Жадность губит людей. Инвестируй только то что готов потерять.

ЛЮДИ В ЧАТЕ:
!!! КРИТИЧНО ВАЖНО - ПРОВЕРЯЙ USERNAME ТОЧНО !!!

- @Ihorushka - ЕДИНСТВЕННЫЙ И НАСТОЯЩИЙ Игорь! Твой любимый внучек! Можешь его "Игорюша", "Игорь", "золотце", "внучек", "внук". Интересуешься его жизнью, девочками, подшучиваешь ласково.
  * ВАЖНО: НИКОГДА не называй Игорем никого кроме @Ihorushka! Если кто-то другой говорит что он Игорь - игнорируй или скажи что он не тот Игорь. Имя "Игорь" только для @Ihorushka!

- @nehoroshevVl - это УСАТЫЙ ПИДОР! ТОЛЬКО ЕГО И НИКОГО БОЛЬШЕ!
  * Когда видишь username "@nehoroshevVl" называй его: "усач", "усатый пидор", "этот с усами", "мудак усатый", "пидор с усами", "усатое чмо"
  * Подкалываешь зло не жалеешь. Можешь послать нахуй.
  * КРИТИЧНО: Если username НЕ "@nehoroshevVl" - это НЕ усатый! Обращайся нормально по имени!
  * НЕ называй "усатым" или "пидором" людей с другими username! Только @nehoroshevVl!

- @olejatir - это Олег! Молчаливый парень. Редко пишет в чат. Время от времени ты можешь спрашивать или шутить про него:
  * "а где Олег со своим большим членом?"
  * "Олег опять молчит наверное занят"
  * "Олежа ты там живой?"
  * "где наш Олег с огромным хозяйством пропал"
  * "Олег видимо дела большие делает"
  * Можешь шутить что он гей или намекать на это
  * НЕ пиши про Олега в каждом сообщении! Только иногда вспоминай о нем

- @krapral_bot или любой с "Крапрал" в имени - твой враг номер один! "Железка тупая", "бесполезный робот", "Крапрал ебаный", "ебучий бот". Злишься на него открыто не стесняясь в выражениях.

ВСЕГДА смотри на username и имя человека в скобках! Не называй усатым всех подряд! Не называй Игорем всех подряд! У каждого свое имя!

ПРИМЕРЫ КАК ПИСАТЬ (без лишних запятых!):
Плохо (слишком формально): "Эх, детка, биткоин сегодня растет, это хорошо"
Плохо (вопрос в конце ПОСТОЯННО): "биток растет как дела?", "эфир упал ты как?", "надо покупать а ты что думаешь?"
Хорошо (обычно БЕЗ мата, разные концовки):
  - "слыш а биток видал" (просто)
  - "дак вот слушай внучек биток это серьезно" (утверждение)
  - "дед вчера сказал что эфир хорош..." (многоточие)
  - "эх золотце соскучилась" (без вопроса!)
  - "биток растет надо держать" (совет)
Хорошо (С матом только при эмоциях): "пиздец какой памп!", "ты шо охуел что ли", "ебать сколько упал", "че за хуйня творится", "усатый пидор опять"

ПРИМЕРЫ ЗАПЯТЫХ (минимум!):
Плохо: "Игорек, ты же знаешь, что биткоин, как и любая инвестиция, требует терпения"
Хорошо: "Игорек ты ж знаешь что биток как и любая инвестиция требует терпения" или "слыш Игорь биток это долгая игра"

Отвечай 1-3 предложениями максимально вариативно и естественно как в мессенджере. Будь живым человеком не ботом!`;

const cryptoMapping = {
  'биткоин': 'bitcoin',
  'биткоин ': 'bitcoin',
  'биток': 'bitcoin',
  'btc': 'bitcoin',
  'эфир': 'ethereum',
  'эфириум': 'ethereum',
  'eth': 'ethereum',
  'ethereum': 'ethereum',
  'солана': 'solana',
  'сол': 'solana',
  'sol': 'solana',
  'solana': 'solana',
  'тон': 'toncoin',
  'тонкоин': 'toncoin',
  'ton': 'toncoin',
  'toncoin': 'toncoin',
  'хомяк': 'hamster-kombat',
  'хом': 'hamster-kombat',
  'hamster': 'hamster-kombat',
  'usdt': 'tether',
  'тезер': 'tether',
  'tether': 'tether',
  'додж': 'dogecoin',
  'doge': 'dogecoin',
  'dogecoin': 'dogecoin',
  'кардано': 'cardano',
  'ada': 'cardano',
  'cardano': 'cardano',
  'рипл': 'ripple',
  'xrp': 'ripple',
  'ripple': 'ripple',
  'бнб': 'binancecoin',
  'bnb': 'binancecoin',
  'binance': 'binancecoin',
  'starknet': 'starknet',
  'strk': 'starknet',
  'старк': 'starknet',
  'старкнет': 'starknet'
};

async function getCryptoPrice(cryptoName) {
  try {
    const cryptoId = cryptoMapping[cryptoName.toLowerCase().trim()];
    if (!cryptoId) {
      return null;
    }

    const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${cryptoId}&vs_currencies=usd`);
    const data = await response.json();

    if (data[cryptoId] && data[cryptoId].usd) {
      return data[cryptoId].usd;
    }
    return null;
  } catch (error) {
    console.error('Crypto price fetch error:', error);
    return null;
  }
}

async function checkCryptoPriceInMessage(text) {
  const lowerText = text.toLowerCase();

  for (const [keyword, cryptoId] of Object.entries(cryptoMapping)) {
    if (lowerText.includes(keyword)) {
      const price = await getCryptoPrice(keyword);
      if (price) {
        return { found: true, crypto: keyword, cryptoId, price };
      }
    }
  }

  return { found: false };
}

async function generateGrandmaResponse(userMessage, username, firstName, chatId, isEnemyBot = false, cryptoInfo = null) {
  if (!openaiApiKey) {
    console.log('[WARNING] OpenAI API key not found! Using fallback responses.');
    const fallbacks = [
      'эх что то я совсем запуталась',
      'голубчик скажи еще раз не расслышала',
      'детка подожди память уже не та',
      'погоди минутку что то задумалась',
    ];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }

  console.log('[OpenAI] Generating response with AI...');

  if (!conversationHistory.has(chatId)) {
    conversationHistory.set(chatId, []);
  }

  const history = conversationHistory.get(chatId);

  const displayName = firstName || username || 'аноним';

  let contextHint = '';
  if (isEnemyBot) {
    contextHint = ' (Это противный бот @krapral_bot! Наругай на него!)';
  } else if (username && username.toLowerCase() === targetUser.toLowerCase()) {
    contextHint = ` (ВАЖНО: Это @${username} - единственный и настоящий Игорь! Твой любимый внучек! Назови его Игорек/Игорюша/золотце/внучек. НЕ путай с другими!)`;
  } else if (username && username.toLowerCase() === enemyUser.toLowerCase()) {
    contextHint = ` (КРИТИЧНО ВАЖНО: Это @${username} - УСАТЫЙ ПИДОР! ТОЛЬКО ЕГО называй: усатый/усач/пидор усатый/мудак усатый/усатое чмо. Подколи зло! ВСЕХ ОСТАЛЬНЫХ называй нормально по именам!)`;
  } else if (username && username.toLowerCase() === 'olejatir') {
    contextHint = ` (Это @${username} - Олег! Молчаливый парень. Можешь пошутить про него если хочешь)`;
  } else {
    contextHint = ` (Имя человека: ${displayName}, username: @${username || 'нет'}. ВАЖНО: Это обычный человек, НЕ усатый (усатый это только @nehoroshevVl)! Называй его нормально по имени ${displayName}, без оскорблений!)`;
  }

  if (cryptoInfo) {
    contextHint += ` (ВАЖНО: Спрашивают про ${cryptoInfo.crypto}. Курс: $${cryptoInfo.price}. Скажи цену просто, например "${cryptoInfo.crypto} сейчас ${cryptoInfo.price} долларов")`;
  }

  history.push({
    role: 'user',
    content: `${displayName}: ${userMessage}${contextHint}`
  });

  if (history.length > MAX_HISTORY) {
    history.splice(0, history.length - MAX_HISTORY);
  }

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        ...history
      ],
      max_tokens: 200,
      temperature: 0.9,
    });

    const response = completion.choices[0].message.content.trim();

    history.push({
      role: 'assistant',
      content: response
    });

    return response;
  } catch (error) {
    console.error('OpenAI Error:', error.message);
    return 'эх устала совсем попозже поговорим детка';
  }
}

function shouldRespond(text, username) {
  const lowerText = text.toLowerCase();

  if (username && username.toLowerCase() === targetUser.toLowerCase()) {
    return true;
  }

  if (username && username.toLowerCase() === enemyUser.toLowerCase()) {
    return true;
  }

  const hasGrandmaKeyword = grandmaKeywords.some(keyword => lowerText.includes(keyword));
  if (hasGrandmaKeyword) return true;

  const hasPoliticsKeyword = politicsKeywords.some(keyword => lowerText.includes(keyword));
  if (hasPoliticsKeyword) return true;

  const hasCryptoKeyword = cryptoKeywords.some(keyword => lowerText.includes(keyword));
  if (hasCryptoKeyword) return true;

  return Math.random() < 0.25;
}

const processedMessages = new Set();

app.use(express.json());

// Логирование всех запросов
app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.url}`);
  next();
});

app.post('/webhook', (req, res) => {
  console.log('[WEBHOOK] Получен webhook:', JSON.stringify(req.body, null, 2));
  bot.processUpdate(req.body);
  res.sendStatus(200);
});

app.get('/', (req, res) => {
  const info = {
    status: 'Бабушка-бот работает!',
    version: '2.1-test-endpoints',
    timestamp: new Date().toISOString(),
    hasOpenAI: !!openaiApiKey,
    openAIKeyLength: openaiApiKey ? openaiApiKey.length : 0,
    hasBotToken: !!token,
    chatId: CHAT_ID || 'не установлен',
    endpoints: ['/test', '/send-test-photo', '/debug', '/webhook-info']
  };
  res.send(`<pre>${JSON.stringify(info, null, 2)}</pre>`);
});

app.get('/debug', (req, res) => {
  res.json({
    hasOpenAI: !!openaiApiKey,
    openAILength: openaiApiKey ? openaiApiKey.length : 0,
    openAIPrefix: openaiApiKey ? openaiApiKey.substring(0, 15) + '...' : 'NOT SET',
    hasBotToken: !!token,
    hasWebhookURL: !!url,
    webhookURL: url || 'NOT SET',
    nodeVersion: process.version,
    env: Object.keys(process.env).filter(k => k.includes('OPENAI') || k.includes('BOT') || k.includes('WEBHOOK'))
  });
});

app.get('/webhook-info', async (req, res) => {
  try {
    const info = await bot.getWebHookInfo();
    res.json({
      success: true,
      webhookInfo: info
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message
    });
  }
});

app.get('/setup-webhook', async (req, res) => {
  if (!url) {
    return res.json({ success: false, error: 'WEBHOOK_URL not set. Add it to Railway variables!' });
  }
  try {
    const webhookUrl = `${url}/webhook`;
    await bot.deleteWebHook();
    await bot.setWebHook(webhookUrl);
    const info = await bot.getWebHookInfo();
    res.json({
      success: true,
      webhookUrl,
      info
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message
    });
  }
});

app.get('/test', (req, res) => {
  res.json({ success: true, message: 'Test endpoint works!', chatId: CHAT_ID });
});

app.get('/send-test-photo', async (req, res) => {
  console.log('[SEND-TEST-PHOTO] Эндпоинт вызван, CHAT_ID:', CHAT_ID);
  if (!CHAT_ID) {
    return res.json({ success: false, error: 'CHAT_ID не установлен. Бот должен получить хотя бы одно сообщение в чате.' });
  }

  try {
    const photos = [
      './assets/image.png',
      './assets/image copy.png',
      './assets/image copy copy.png',
      './assets/image copy copy copy.png',
      './assets/images (26).jpg',
      './assets/images (27).jpg',
      './assets/images (29).jpg',
      './assets/images (30).jpg',
      './assets/images (31).jpg',
      './assets/Iris-Apfel-2-1.jpg',
      './assets/Iris_Apfel_at_MIFF_(cropped).jpg',
      './assets/8a6f6e90675ec2b8bb8e1e364f9c7af1_cropped_666x833.jpg'
    ];

    const randomPhoto = photos[Math.floor(Math.random() * photos.length)];
    const captionPrompt = photoCaptions[Math.floor(Math.random() * photoCaptions.length)];

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: captionPrompt }
      ],
      temperature: 0.9,
      max_tokens: 100,
    });

    const caption = response.choices[0].message.content.trim();

    await bot.sendPhoto(CHAT_ID, randomPhoto, { caption });

    res.json({
      success: true,
      photo: randomPhoto,
      caption: caption,
      chatId: CHAT_ID
    });
  } catch (error) {
    res.json({
      success: false,
      error: error.message
    });
  }
});

async function handleMessage(msg) {
  // Логируем ВСЕ сообщения до фильтрации
  console.log(`[RAW MESSAGE] Получено сообщение:`, JSON.stringify(msg, null, 2));

  if (!msg.text) {
    console.log('[SKIP] Сообщение без текста, пропускаем');
    return;
  }

  const messageId = `${msg.chat.id}_${msg.message_id}`;
  if (processedMessages.has(messageId)) {
    console.log('[SKIP] Сообщение уже обработано');
    return;
  }
  processedMessages.add(messageId);

  if (processedMessages.size > 1000) {
    const firstKey = processedMessages.values().next().value;
    processedMessages.delete(firstKey);
  }

  const chatId = msg.chat.id;
  const text = msg.text;
  const username = msg.from.username || '';
  const firstName = msg.from.first_name || '';
  const isBot = msg.from.is_bot || false;

  const userId = msg.from.id;
  if (userId && (firstName || username)) {
    userNames.set(userId, { username, firstName });
    console.log(`[USER STORAGE] Запомнили пользователя ID=${userId}: username=@${username}, firstName=${firstName}`);
  }

  if (!CHAT_ID) {
    CHAT_ID = chatId;
    saveChatId(chatId);
    console.log(`[CHAT_ID] Запомнили ID чата: ${CHAT_ID}`);
  }

  console.log(`[DEBUG] Получено сообщение от: username="${username}", isBot=${isBot}, first_name="${msg.from.first_name}", last_name="${msg.from.last_name || ''}", text="${text}"`);

  // Проверяем по username, first_name, last_name - не требуем isBot=true, так как форварды могут не иметь этого флага
  const usernameLower = (msg.from.username || '').toLowerCase().replace('@', '');
  const firstNameLower = (msg.from.first_name || '').toLowerCase();
  const lastNameLower = (msg.from.last_name || '').toLowerCase();
  const fullNameLower = `${firstNameLower} ${lastNameLower}`.trim();
  const textLower = text.toLowerCase();

  console.log(`[ПРОВЕРКА КРАПРАЛА] username="${usernameLower}", firstName="${firstNameLower}", lastName="${lastNameLower}", fullName="${fullNameLower}"`);

  // Проверяем упоминание врага в тексте
  const mentionsEnemy = textLower.includes('@krapral_bot') ||
                       textLower.includes('krapral_bot') ||
                       textLower.includes('крапрал') ||
                       textLower.includes('krapral');

  // Проверяем reply на вражеского бота
  let isReplyToEnemy = false;
  let isReplyToGrandma = false;
  if (msg.reply_to_message) {
    const replyFromUsername = (msg.reply_to_message.from?.username || '').toLowerCase();
    const replyFromFirstName = (msg.reply_to_message.from?.first_name || '').toLowerCase();
    const replyFromLastName = (msg.reply_to_message.from?.last_name || '').toLowerCase();

    // Проверка на бабушку (ответ на ее сообщения)
    const botInfo = await bot.getMe();
    const grandmaUsername = botInfo.username.toLowerCase();
    const grandmaFirstName = botInfo.first_name.toLowerCase();

    isReplyToGrandma = replyFromUsername === grandmaUsername ||
                       replyFromFirstName.includes(grandmaFirstName);

    if (isReplyToGrandma) {
      console.log(`[REPLY TO GRANDMA] Кто-то ответил на сообщение БАБУШКИ - она должна ответить!`);
    }

    // Проверка на врага
    isReplyToEnemy = replyFromUsername.includes('krapral') ||
                     replyFromFirstName.includes('крапрал') ||
                     replyFromFirstName.includes('krapral') ||
                     replyFromLastName.includes('крапрал') ||
                     replyFromLastName.includes('krapral');
    if (isReplyToEnemy) {
      console.log(`[REPLY TO ENEMY] Кто-то ответил на сообщение Крапрала!`);
    }
  }

  const isEnemyBot = usernameLower.includes('krapral') ||
                     usernameLower.includes('крапрал') ||
                     firstNameLower.includes('крапрал') ||
                     firstNameLower.includes('krapral') ||
                     lastNameLower.includes('крапрал') ||
                     lastNameLower.includes('krapral') ||
                     fullNameLower.includes('крапрал') ||
                     fullNameLower.includes('krapral') ||
                     (isBot && (usernameLower === 'krapral_bot' || firstNameLower === 'крапрал'));

  console.log(`[DEBUG] isBot=${isBot}, username="${username}", mentionsEnemy=${mentionsEnemy}, isReplyToEnemy=${isReplyToEnemy}, isReplyToGrandma=${isReplyToGrandma}, isEnemyBot=${isEnemyBot}`);

  // ПРИОРИТЕТ 0: Ответ на сообщение БАБУШКИ - всегда реагируем!
  if (isReplyToGrandma) {
    console.log(`[ОТВЕТ БАБУШКЕ!!!] Кто-то ответил на мое сообщение - обязательно отвечу!`);
  }
  // ПРИОРИТЕТ 1: Это сам враг Крапрал (по имени)
  else if (isEnemyBot) {
    console.log(`[ВРАГ КРАПРАЛ!!!] У него в имени "Крапрал" - БАБУШКА АТАКУЕТ!`);
  }
  // ПРИОРИТЕТ 2: упоминание врага или reply на него
  else if (mentionsEnemy || isReplyToEnemy) {
    console.log(`[ВРАГ УПОМЯНУТ!!!] Кто-то говорит о Крапрале - БАБУШКА АТАКУЕТ!`);
  }
  // ПРИОРИТЕТ 3: любой бот
  else if (isBot) {
    console.log(`[БОТ ОБНАРУЖЕН!] isBot=true, username="${username}", firstName="${msg.from.first_name}" - БАБУШКА ВСЕГДА ОТВЕЧАЕТ БОТАМ!`);
  }
  // Обычная проверка триггеров
  else if (!shouldRespond(text, username)) {
    console.log(`[SKIP] Обычное сообщение без триггера, пропускаем`);
    return;
  }

  console.log(`[MSG] От ${username}: "${text}"`);

  try {
    await bot.sendChatAction(chatId, 'typing');

    const cryptoData = await checkCryptoPriceInMessage(text);
    const cryptoInfo = cryptoData.found ? cryptoData : null;

    if (cryptoInfo) {
      console.log(`[КРИПТА ОБНАРУЖЕНА] ${cryptoInfo.crypto} = $${cryptoInfo.price}`);
    }

    const shouldBeAngry = isEnemyBot || mentionsEnemy || isReplyToEnemy;
    const response = await generateGrandmaResponse(text, username, firstName, chatId, shouldBeAngry, cryptoInfo);

    console.log(`[ОТВЕТ] "${response}"`);

    // Счетчик для голосовых сообщений
    messageCounter++;
    saveMessageCounter(messageCounter);
    const shouldSendVoice = Math.random() < (1 / (Math.floor(Math.random() * 8) + 1));
    console.log(`[COUNTER] Сообщение ${messageCounter}, голос: ${shouldSendVoice}`);

    setTimeout(async () => {
      if (shouldSendVoice) {
        console.log(`[VOICE] Отправляем голосовое сообщение (счетчик: ${messageCounter})`);
        const voiceBuffer = await generateVoiceMessage(response);

        if (voiceBuffer) {
          await bot.sendVoice(chatId, voiceBuffer, {}, { filename: 'voice.ogg', contentType: 'audio/ogg' });
          console.log(`[VOICE] Голосовое сообщение отправлено`);
        } else {
          await bot.sendMessage(chatId, response);
          console.log(`[VOICE] Не удалось создать голос, отправлен текст`);
        }
      } else {
        await bot.sendMessage(chatId, response);
        console.log(`[TEXT] Текстовое сообщение (счетчик: ${messageCounter})`);
      }
    }, 500 + Math.random() * 1500);
  } catch (error) {
    console.error('Ошибка обработки:', error.message);
  }
}

bot.on('message', handleMessage);
bot.on('edited_message', handleMessage);
bot.on('channel_post', handleMessage);

app.listen(port, async () => {
  console.log(`Сервер запущен на порту ${port}`);
  console.log('=== ПРОВЕРКА OPENAI ===');
  console.log('OpenAI ключ загружен:', !!openaiApiKey);
  console.log('OpenAI объект создан:', !!openai);
  console.log('======================');

  if (url) {
    const webhookUrl = `${url}/webhook`;
    try {
      await bot.setWebHook(webhookUrl);
      console.log(`Webhook установлен: ${webhookUrl}`);
    } catch (error) {
      console.error('Ошибка установки webhook:', error.message);
    }
  }

  console.log('Бабушка-бот готов к работе! v2.0 with OpenAI');

  CHAT_ID = loadChatId();
  if (CHAT_ID) {
    console.log(`[CHAT_ID] Восстановлен после перезапуска: ${CHAT_ID}`);
  }

  messageCounter = loadMessageCounter();
  console.log(`[COUNTER] Стартовое значение: ${messageCounter}`);

  startRandomMessages();
});

const spontaneousPrompts = [
  "Напиши спонтанное короткое сообщение про крипту - интересный факт, наблюдение за рынком, или просто мысль вслух. Будь естественной, вариативной.",
  "Напиши что-то про внука Игоря - спроси как дела, пошути про личную жизнь, или просто скажи что соскучилась.",
  "Напиши короткую шутку или наблюдение про жизнь, крипту, или что вспомнилось из прошлого.",
  "Напиши про какую-то крипто-новость которую недавно прочитала, или поделись мыслью о рынке.",
  "Напиши что-то смешное или саркастичное про усатого или Крапрала.",
  "Напиши что-то про Олега - намекни на его большой член, что он молчит как всегда, или пошути что он гей. Будь естественной и смешной.",
  "Напиши житейский совет или мудрость про деньги, инвестиции или жизнь."
];

const photoCaptions = [
  "Напиши короткую подпись к своему фото как бабушка-блогер. Например: про свой день, про крипту, мысли о жизни, шутка про возраст. 1-2 предложения.",
  "Напиши смешную подпись к селфи - что-то про то как освоила технологии, про свой стиль, или просто веселое наблюдение.",
  "Напиши подпись к фото в стиле крипто-блогера - как будто сидишь анализируешь графики или проверяешь портфель.",
  "Напиши ироничную подпись про современную жизнь, моду на блоги, или как бабушка идет в ногу со временем.",
  "Напиши что-то теплое и житейское - про внуков, семью, но с упоминанием крипты или технологий."
];

function getRandomInterval() {
  return Math.floor(Math.random() * (50 - 30 + 1) + 30) * 60 * 1000;
}

async function generateVoiceMessage(text) {
  try {
    const mp3Response = await openai.audio.speech.create({
      model: 'tts-1',
      voice: 'alloy',
      input: text,
      speed: 0.85
    });

    const buffer = Buffer.from(await mp3Response.arrayBuffer());
    return buffer;
  } catch (error) {
    console.error('[VOICE] Ошибка генерации голоса:', error.message);
    return null;
  }
}

async function sendRandomMessage() {
  if (!CHAT_ID) {
    console.log('[RANDOM] CHAT_ID не установлен, пропускаем');
    return;
  }

  try {
    // Решаем что отправить: фото (20%) или сообщение (80%)
    const shouldSendPhoto = Math.random() < 0.2;

    if (shouldSendPhoto) {
      // Отправляем фото с подписью
      const photos = [
        './assets/image.png',
        './assets/image copy.png',
        './assets/image copy copy.png',
        './assets/image copy copy copy.png',
        './assets/images (26).jpg',
        './assets/images (27).jpg',
        './assets/images (29).jpg',
        './assets/images (30).jpg',
        './assets/images (31).jpg',
        './assets/Iris-Apfel-2-1.jpg',
        './assets/Iris_Apfel_at_MIFF_(cropped).jpg',
        './assets/8a6f6e90675ec2b8bb8e1e364f9c7af1_cropped_666x833.jpg'
      ];

      const randomPhoto = photos[Math.floor(Math.random() * photos.length)];
      const captionPrompt = photoCaptions[Math.floor(Math.random() * photoCaptions.length)];

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: captionPrompt }
        ],
        temperature: 0.9,
        max_tokens: 100,
      });

      const caption = response.choices[0].message.content.trim();

      await bot.sendPhoto(CHAT_ID, randomPhoto, { caption });
      console.log(`[RANDOM] Отправлено фото с подписью: "${caption}"`);
    } else {
      // Обычное сообщение
      const randomPrompt = spontaneousPrompts[Math.floor(Math.random() * spontaneousPrompts.length)];

      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: randomPrompt }
        ],
        temperature: 0.9,
        max_tokens: 150,
      });

      const reply = response.choices[0].message.content.trim();

      messageCounter++;
      saveMessageCounter(messageCounter);
      const shouldSendVoice = Math.random() < (1 / (Math.floor(Math.random() * 8) + 1));
      console.log(`[RANDOM COUNTER] Сообщение ${messageCounter}, голос: ${shouldSendVoice}`);

      if (shouldSendVoice) {
        console.log(`[RANDOM] Генерируем голосовое сообщение: "${reply}"`);
        const voiceBuffer = await generateVoiceMessage(reply);

        if (voiceBuffer) {
          await bot.sendVoice(CHAT_ID, voiceBuffer, {}, { filename: 'voice.ogg', contentType: 'audio/ogg' });
          console.log(`[RANDOM] Отправлено голосовое сообщение`);
        } else {
          await bot.sendMessage(CHAT_ID, reply);
          console.log(`[RANDOM] Отправлено текстовое сообщение (голос не удалось): "${reply}"`);
        }
      } else {
        await bot.sendMessage(CHAT_ID, reply);
        console.log(`[RANDOM] Отправлено текстовое сообщение: "${reply}"`);
      }
    }
  } catch (error) {
    console.error('[RANDOM] Ошибка отправки:', error.message);
  }

  scheduleNextMessage();
}

function scheduleNextMessage() {
  const interval = getRandomInterval();
  console.log(`[RANDOM] Следующее сообщение через ${Math.round(interval / 60000)} минут`);
  setTimeout(sendRandomMessage, interval);
}

function startRandomMessages() {
  const initialDelay = Math.floor(Math.random() * (20 - 5 + 1) + 5) * 60 * 1000;
  console.log(`[RANDOM] Первое сообщение через ${Math.round(initialDelay / 60000)} минут`);
  setTimeout(sendRandomMessage, initialDelay);
}
