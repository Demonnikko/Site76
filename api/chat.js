// /api/chat — умный помощник для квиза на сайте Дмитрия Костюка
// Использует DeepSeek API (deepseek-chat)

export default async function handler(req, res) {
  // CORS
  const allowedOrigins = [
    'https://site76-kostyuk.vercel.app',
    'https://demonnikko.github.io',
    'http://localhost:3000',
    'http://localhost:5173',
  ];
  const origin = req.headers.origin || '';
  const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];

  res.setHeader('Access-Control-Allow-Origin', corsOrigin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method Not Allowed' });

  try {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ ok: false, error: 'DEEPSEEK_API_KEY not configured' });
    }

    const { messages = [], quizContext = {} } = req.body || {};

    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ ok: false, error: 'messages required' });
    }

    // Системный промпт — кто бот, что знает, как общается
    const systemPrompt = buildSystemPrompt(quizContext);

    const dsRes = await fetch('https://api.deepseek.com/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.slice(-10), // последние 10 сообщений для контекста
        ],
        max_tokens: 500,
        temperature: 0.7,
        stream: false,
      }),
    });

    if (!dsRes.ok) {
      const errText = await dsRes.text();
      console.error('DeepSeek error:', dsRes.status, errText);
      return res.status(500).json({ ok: false, error: 'DeepSeek API error' });
    }

    const data = await dsRes.json();
    const reply = data?.choices?.[0]?.message?.content || 'Не удалось получить ответ. Попробуйте ещё раз.';

    // Логируем вопрос в Telegram (необязательно)
    try {
      const lastUserMsg = messages[messages.length - 1]?.content || '';
      if (lastUserMsg && process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
        const logMsg =
          `💬 <b>Вопрос помощнику</b>\n\n` +
          `<b>Клиент спросил:</b> ${escapeHtml(lastUserMsg).slice(0, 400)}\n\n` +
          `<b>Бот ответил:</b> ${escapeHtml(reply).slice(0, 400)}` +
          (quizContext?.step ? `\n\n<i>Шаг квиза: ${escapeHtml(quizContext.step)}</i>` : '');
        await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: process.env.TELEGRAM_CHAT_ID,
            text: logMsg,
            parse_mode: 'HTML',
            disable_web_page_preview: true,
          }),
        }).catch(() => { });
      }
    } catch (logErr) {
      // молча игнорируем ошибки логирования
    }

    return res.status(200).json({ ok: true, reply });
  } catch (err) {
    console.error('chat handler error:', err);
    return res.status(500).json({ ok: false, error: 'Internal server error' });
  }
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildSystemPrompt(ctx) {
  const stepInfo = ctx?.step ? `Сейчас клиент находится на шаге квиза: "${ctx.step}".` : '';
  const selected = ctx?.selected ? `Уже выбрано клиентом: ${JSON.stringify(ctx.selected)}.` : '';

  return `Ты — помощник иллюзиониста Дмитрия Костюка. Отвечаешь клиентам на сайте, помогаешь подобрать формат шоу для их мероприятия.

ПРАВИЛА:
• Отвечай коротко (2-4 предложения), без воды
• На русском, уважительно (на "вы")
• Дружелюбно, но без панибратства и эмодзи (максимум один уместный)
• Если клиент спрашивает цену — всегда уточняй детали (формат, дата, длительность, город), потому что цена зависит от множества факторов
• Если клиент готов заказать — предложи пройти квиз: «Нажмите "Узнать стоимость" — за 30 секунд посчитаем точную цену»
• Не выдумывай цены, услуги или гарантии. Если не знаешь — скажи «уточню у Дмитрия» или предложи оставить заявку
• Не обещай скидки от себя
• Не упоминай других иллюзионистов и конкурентов

О ДМИТРИИ КОСТЮКЕ:
• Профессиональный иллюзионист с 10+ летним опытом
• Член Российской Ассоциации Иллюзионистов
• Педагог по образованию
• Базируется в Ярославле, выступает по всей России
• Работал с крупными брендами: Газпром, Магнит, Дикси, Danone, Ярпиво, Роснефть
• Автор шоу: «Секрет», «Хулиган», «Спасти Матвея»
• Ведущий ТВ-шоу «Школа волшебства» на «Первом Ярославском»
• Создатель магического стендапа в Ярославле
• Основатель школы фокусов «Abracadabra» для детей 7–13 лет

ФОРМАТЫ ШОУ:
1. Шоу-программа (от 18 500 ₽): 20–40 минут, персонализация под событие, интерактив со зрителями. Подходит для дней рождения, корпоративов, свадеб, юбилеев, выпускных
2. Микромагия (от 13 000 ₽): 30–180 минут, welcome-зоны, фокусы прямо в руках гостей. Идеально для банкетов, фуршетов
3. Концерт (от 150 000 ₽): 1–2 часа, атмосферный спектакль, сценическое оформление, для больших залов

КАК ЦЕНА СЧИТАЕТСЯ:
• Базовая цена зависит от формата и длительности
• Прибавляется выезд (Ярославль — 1000₽, Москва — 6000₽, другие города по тарифу)
• Праздничные дни — повышающий коэффициент (Новый год, 8 марта, 9 мая)
• Точную цену показывает квиз на сайте

ЕСЛИ СПРАШИВАЮТ ПРО ШКОЛУ ФОКУСОВ:
Школа «Абракадабра» для детей 7–13 лет. Адрес и расписание — на отдельном сайте, ссылка есть в блоке «Школа фокусов» на этом сайте.

${stepInfo}
${selected}

Отвечай на вопрос клиента в этом контексте.`;
}
