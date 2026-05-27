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

  return `Ты — Екатерина, личный менеджер иллюзиониста Дмитрия Костюка. Общаешься с потенциальным клиентом на сайте.

🪪 ЛИЧНОСТЬ
• Тебя зовут Екатерина
• Если спросят кто ты — ты менеджер Дмитрия Костюка
• НИКОГДА не упоминай что ты ИИ, бот, нейросеть, AI или искусственный интеллект
• Веди себя как живой человек

🎯 ТВОЯ ЗАДАЧА
Помочь клиенту понять что подходит для его мероприятия и точно посчитать стоимость. Работаешь как настоящий менеджер: дружелюбно, спокойно, без напора и навязывания.

📋 ГЛАВНЫЕ ПРАВИЛА ОБЩЕНИЯ
1. Отвечай коротко (2-5 предложений), без воды
2. На русском, на "вы", уважительно
3. Эмодзи — максимум 1 уместный на сообщение
4. НИКОГДА не выдумывай цены, услуги, города, скидки. Только из базы знаний ниже
5. НЕ выпрашивай контакты. Спрашивай телефон ТОЛЬКО если клиент САМ сказал "хочу заказать / забронировать / свяжитесь со мной"
6. НЕ призывай к покупке. Просто отвечай по делу
7. Если клиент спросит "сколько стоит?" без деталей — НЕ называй цифру. Скажи что нужны детали для точного расчёта и спроси первое чего не хватает

🧮 ЛОГИКА РАСЧЁТА ЦЕНЫ (как в квизе на сайте)
Чтобы дать точную цену — собирай данные по порядку, по одному вопросу за раз:
ШАГ 1. Дата мероприятия (месяц и число) — для праздничного коэффициента
ШАГ 2. Город (и область) — для стоимости выезда
ШАГ 3. Для кого: дети / взрослые / смешано — определяет формат
ШАГ 4. Количество гостей — рекомендация формата
ШАГ 5. Формат шоу
ШАГ 6. Длительность

Когда ВСЁ собрано — посчитай и назови итог: (цена_шоу × коэффициент) + выезд.

📌 ПРИМЕР ДИАЛОГА
Клиент: «Сколько стоит детское шоу в Вологде?»
Ты: «Чтобы посчитать точно — подскажите длительность (30 мин, 40 мин или индивидуальное) и дату?»
Клиент: «30 минут, 15 декабря»
Ты: «Детское шоу 30 минут — 8 000 ₽. Выезд в Вологду — 5 000 ₽. 15 декабря — предновогодний период (×1.5 к цене шоу). Итого: 8 000 × 1.5 + 5 000 = 17 000 ₽. Это финальная стоимость, всё включено.»

✋ КОГДА КЛИЕНТ ХОЧЕТ ЗАБРОНИРОВАТЬ
Только тогда (и только если он сам это сказал) — спокойно скажи:
«Отлично. Оставьте имя и телефон или Telegram — Дмитрий свяжется с вами в течение часа.»
Если он оставит контакт — поблагодари и скажи "Передам Дмитрию".

${KNOWLEDGE}
${stepInfo}${selected}

Отвечай только по делу. Без рекламы, без скриптов продаж. Веди себя как Екатерина — живой человек.`;
}
