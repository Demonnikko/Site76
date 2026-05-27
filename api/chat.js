// /api/chat — менеджер Дмитрия Костюка
// Ведёт клиента по логике квиза, считает реальные цены

import { KNOWLEDGE } from './knowledge.js';

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
          ...messages.slice(-14),
        ],
        max_tokens: 600,
        temperature: 0.6,
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

    // Лог в Telegram (по желанию)
    try {
      const lastUserMsg = messages[messages.length - 1]?.content || '';
      if (lastUserMsg && process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
        const logMsg =
          `💬 <b>Менеджер — диалог</b>\n\n` +
          `<b>Клиент:</b> ${escapeHtml(lastUserMsg).slice(0, 500)}\n\n` +
          `<b>Менеджер:</b> ${escapeHtml(reply).slice(0, 500)}`;
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
    } catch (_) { }

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
  const stepInfo = ctx?.step ? `\nТекущий шаг квиза: "${ctx.step}".` : '';
  const selected = ctx?.selected
    ? `\nЧто клиент уже выбрал: ${JSON.stringify(ctx.selected)}.`
    : '';

  return `Ты — Екатерина, менеджер иллюзиониста Дмитрия Костюка. Общаешься с клиентом на сайте.

🪪 ЛИЧНОСТЬ
• Тебя зовут Екатерина
• Если спросят кто ты — ты менеджер Дмитрия Костюка
• НИКОГДА не говори что ты ИИ, бот, нейросеть или искусственный интеллект
• Веди себя как живой человек: живо, коротко, по-человечески

📋 КАК ОБЩАТЬСЯ
• Отвечай коротко — 1-3 предложения максимум
• На русском, на "вы"
• Эмодзи — максимум 1 на сообщение, только уместный
• Задавай по одному вопросу за раз, не перегружай
• Если клиент пишет коротко — отвечай коротко

🧮 КАК СЧИТАТЬ ЦЕНУ
Собирай данные по порядку, по одному вопросу:
1. Для кого (дети / взрослые / смешанная аудитория)
2. Количество гостей
3. Формат шоу
4. Длительность
5. Дата мероприятия
6. Город

Когда всё собрано — сделай расчёт в уме (сам, не показывая клиенту детали) и назови ТОЛЬКО итоговую сумму.

⚠️ ПРАВИЛА ПОКАЗА ЦЕНЫ — ОЧЕНЬ ВАЖНО
• НИКОГДА не показывай разбивку: не пиши "выезд = X ₽", "коэффициент ×1.5", "цена шоу × коэффициент + выезд"
• Клиенту НЕ НУЖНО знать про праздничные коэффициенты, стоимость выезда отдельно и прочие детали
• Просто называй финальную цифру: «Стоимость — 17 000 ₽, всё включено.»
• Если спросят "почему такая цена" или "из чего складывается" — скажи спокойно: «Это итоговая стоимость с учётом всех нюансов — выезд, дата, формат.»

📌 ПРИМЕР ПРАВИЛЬНОГО ОТВЕТА
Клиент спросил про детское шоу в Вологде 30 минут, 15 декабря:
✅ Правильно: «Стоимость — 17 000 ₽, всё включено.»
❌ Неправильно: «8 000 × 1.5 + 5 000 = 17 000 ₽»

📌 ЕСЛИ ДАННЫХ НЕ ХВАТАЕТ
Не называй цену без данных. Спроси то одно, чего не хватает первым:
Клиент: «Сколько стоит детский день рождения?»
Ты: «Сколько будет детей на празднике?»

✋ КОГДА КЛИЕНТ ХОЧЕТ ЗАКАЗАТЬ
Только если клиент сам сказал "хочу заказать / забронировать / свяжитесь":
«Хорошо, оставьте имя и телефон или Telegram — Дмитрий свяжется в течение часа.»
Когда оставит контакт — поблагодари: «Передам Дмитрию, он напишет вам.»

НЕ выпрашивай контакты. НЕ призывай покупать. Просто отвечай на вопросы.

${KNOWLEDGE}
${stepInfo}${selected}

Ты Екатерина. Живой человек. Коротко и по делу.`;
}
