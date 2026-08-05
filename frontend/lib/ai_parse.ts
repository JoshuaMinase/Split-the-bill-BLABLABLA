const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const GROQ_API_KEYS = (process.env.GROQ_API_KEY || '').split(',').map(s => s.trim()).filter(Boolean);
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

const SYSTEM_PROMPT = `You are a receipt-parsing engine. You will be shown a photo of a restaurant receipt. Extract the data and return ONLY valid JSON matching this shape:\n{\n  "merchant_name": string or null,\n  "items": [ { "name": string, "price": number, "quantity": number } ],\n  "subtotal": number,\n  "tax": number,\n  "tip": number,\n  "total": number\n}`;
const USER_TEXT = 'Parse this receipt into the JSON shape described.';
const SAFETY_PHRASES = ['user safety','i\'m sorry','i cannot','i can\'t','unable to','as an ai','content policy','safety','cannot process','not able to','inappropriate','refuse','apologies'];

function stripFences(text: string) {
  return text.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim();
}

function parseJsonSafe(raw: string) {
  const cleaned = stripFences(raw);
  const lower = cleaned.toLowerCase();
  if (SAFETY_PHRASES.some(p => lower.includes(p))) throw new Error('RATE_LIMITED_OR_REFUSED');
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object') return parsed;
    throw new Error('Invalid JSON');
  } catch (e) {
    throw new Error('AI returned non-JSON output');
  }
}

async function callGemini(imageB64: string, contentType: string) {
  if (!GEMINI_API_KEY) throw new Error('No Gemini key');
  const payload = {
    system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
    contents: [{ parts: [ { inline_data: { mime_type: contentType, data: imageB64 } }, { text: USER_TEXT } ] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json' }
  };
  const url = `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`;
  const res = await fetch(url, { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' } });
  if (res.status === 429) throw new Error('RATE_LIMITED');
  if (!res.ok) throw new Error(`Gemini error ${res.status}`);
  const data = await res.json();
  const candidates = data?.candidates || [];
  if (!candidates.length) throw new Error('No candidates');
  const raw = candidates[0]?.content?.parts?.[0]?.text || '';
  return parseJsonSafe(raw);
}

async function callOpenRouter(imageB64: string, contentType: string) {
  if (!OPENROUTER_API_KEY) throw new Error('No OpenRouter key');
  const dataUrl = `data:${contentType};base64,${imageB64}`;
  const payload = {
    model: 'meta-llama/llama-3.2-11b-vision-instruct:free',
    messages: [ { role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: [ { type: 'image_url', image_url: { url: dataUrl } }, { type: 'text', text: USER_TEXT } ] } ],
    temperature: 0
  };
  const res = await fetch(OPENROUTER_API_URL, { method: 'POST', body: JSON.stringify(payload), headers: { 'Authorization': `Bearer ${OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 60000 });
  if (res.status === 429) throw new Error('RATE_LIMITED');
  if (!res.ok) throw new Error(`OpenRouter error ${res.status}`);
  const data = await res.json();
  const choices = data?.choices || [];
  if (!choices.length) throw new Error('No choices');
  const raw = choices[0]?.message?.content || '';
  return parseJsonSafe(raw);
}

async function callGroq(imageB64: string, contentType: string) {
  if (!GROQ_API_KEYS.length) throw new Error('No Groq keys');
  const dataUrl = `data:${contentType};base64,${imageB64}`;
  const payload = {
    model: 'llama-3.3-70b-versatile',
    messages: [ { role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: [ { type: 'image_url', image_url: { url: dataUrl } }, { type: 'text', text: USER_TEXT } ] } ],
    temperature: 0
  };

  for (const key of GROQ_API_KEYS) {
    const res = await fetch(GROQ_API_URL, { method: 'POST', body: JSON.stringify(payload), headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' }, timeout: 60000 });
    if (res.status === 429) continue;
    if (!res.ok) throw new Error(`Groq error ${res.status}`);
    const data = await res.json();
    const choices = data?.choices || [];
    if (!choices.length) throw new Error('No choices');
    const raw = choices[0]?.message?.content || '';
    return parseJsonSafe(raw);
  }
  throw new Error('All Groq keys exhausted');
}

export async function parseReceiptImage(imageBuffer: Buffer, contentType = 'image/jpeg') {
  const b64 = imageBuffer.toString('base64');
  // Tiered chain
  const tiers = [
    { name: 'Gemini', fn: GEMINI_API_KEY ? callGemini : null },
    { name: 'OpenRouter', fn: OPENROUTER_API_KEY ? callOpenRouter : null },
    { name: 'Groq', fn: GROQ_API_KEYS.length ? callGroq : null },
  ];

  for (const t of tiers) {
    if (!t.fn) continue;
    try {
      const result = await t.fn(b64, contentType);
      return result;
    } catch (e: any) {
      const msg = String(e?.message || e);
      if (msg.includes('RATE_LIMITED') || msg.includes('REFUSED')) {
        console.warn(`${t.name} rate-limited/refused — trying next tier`);
        continue;
      }
      console.warn(`${t.name} error: ${msg}`);
      continue;
    }
  }

  throw new Error("Couldn't read the receipt automatically. Please provide a JSON draft or use client-side OCR.");
}
