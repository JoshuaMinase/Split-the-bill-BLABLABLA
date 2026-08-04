"""
Receipt parsing with automatic fallback:
  1. Google Gemini 2.0 Flash  (primary — free, 1,500 req/day)
  2. OpenRouter free router   (fallback — activates on Gemini 429 rate limit)

OpenRouter uses the OpenAI-compatible chat completions API and auto-selects
a free vision-capable model via "openrouter/free".
"""
import base64
import json
import os
import re
import httpx
from dotenv import load_dotenv

load_dotenv()

# ─── Gemini ────────────────────────────────────────────────────────────────────

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL   = "gemini-2.0-flash"
GEMINI_API_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    f"{GEMINI_MODEL}:generateContent"
)

# ─── OpenRouter ────────────────────────────────────────────────────────────────

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")
OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions"
OPENROUTER_MODEL   = "openrouter/free"   # auto-picks a free vision model

# ─── Shared prompt ────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """You are a receipt-parsing engine. You will be shown a photo of a restaurant \
receipt. Extract the data and return ONLY valid JSON, no markdown fences, no commentary, \
matching exactly this shape:

{
  "merchant_name": string or null,
  "items": [ { "name": string, "price": number, "quantity": number } ],
  "subtotal": number,
  "tax": number,
  "tip": number,
  "total": number
}

Rules:
- "price" is the line's total price (already multiplied by quantity if the receipt shows it that way).
- If quantity isn't shown, use 1.
- If tip isn't on the receipt, use 0.
- If subtotal isn't printed, compute it as the sum of item prices.
- If tax isn't printed, use 0.
- Numbers only, no currency symbols, no commas.
- If the image is unreadable or not a receipt, return {"error": "description of what went wrong"}.
"""

USER_TEXT = "Parse this receipt into the JSON shape described."


# ─── JSON extraction helpers ──────────────────────────────────────────────────

def _strip_fences(text: str) -> str:
    text = re.sub(r"^```(?:json)?\s*\n?", "", text, flags=re.IGNORECASE)
    text = re.sub(r"\n?```\s*$", "", text).strip()
    return text


def _parse_json(raw: str) -> dict:
    raw = _strip_fences(raw)
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError(f"AI returned non-JSON output: {raw[:300]}") from e
    if "error" in parsed:
        raise ValueError(parsed["error"])
    return parsed


# ─── Gemini provider ──────────────────────────────────────────────────────────

async def _call_gemini(image_bytes: bytes, content_type: str) -> dict:
    """Call Gemini 2.0 Flash. Raises RuntimeError on 429, ValueError on bad response."""
    b64 = base64.b64encode(image_bytes).decode()
    payload = {
        "system_instruction": {"parts": [{"text": SYSTEM_PROMPT}]},
        "contents": [{
            "parts": [
                {"inline_data": {"mime_type": content_type, "data": b64}},
                {"text": USER_TEXT},
            ]
        }],
        "generationConfig": {"temperature": 0, "responseMimeType": "application/json"},
    }
    url = f"{GEMINI_API_URL}?key={GEMINI_API_KEY}"

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(url, json=payload)

    if resp.status_code == 429:
        raise RuntimeError("RATE_LIMITED")           # sentinel for caller
    if resp.status_code in (401, 403):
        raise RuntimeError(
            "Gemini API key is invalid or unauthorized. "
            "Check your GEMINI_API_KEY at https://aistudio.google.com/app/apikey"
        )
    if resp.status_code == 400:
        raise RuntimeError("Gemini rejected the image (400). Try a clearer photo.")
    resp.raise_for_status()

    data = resp.json()
    candidates = data.get("candidates", [])
    if not candidates:
        block = data.get("promptFeedback", {}).get("blockReason", "")
        raise ValueError(f"Gemini returned no candidates. {('Blocked: ' + block) if block else str(data)[:200]}")

    raw = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "").strip()
    if not raw:
        raise ValueError("Gemini returned an empty response.")
    return _parse_json(raw)


# ─── OpenRouter fallback ──────────────────────────────────────────────────────

async def _call_openrouter(image_bytes: bytes, content_type: str) -> dict:
    """Call OpenRouter free vision router. Used when Gemini is rate-limited."""
    if not OPENROUTER_API_KEY:
        raise RuntimeError(
            "OPENROUTER_API_KEY is not set. Add it to backend/.env as a fallback for "
            "when Gemini hits its rate limit. Get a free key at https://openrouter.ai"
        )

    b64 = base64.b64encode(image_bytes).decode()
    data_url = f"data:{content_type};base64,{b64}"

    payload = {
        "model": OPENROUTER_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": data_url}},
                    {"type": "text", "text": USER_TEXT},
                ],
            },
        ],
        "temperature": 0,
    }
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json",
        "HTTP-Referer": "https://splitreceipt.app",
        "X-Title": "SplitReceipt",
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(OPENROUTER_API_URL, json=payload, headers=headers)

    if resp.status_code == 429:
        raise RuntimeError(
            "Both Gemini and OpenRouter are rate-limited right now. "
            "Please wait a minute and try again."
        )
    if resp.status_code in (401, 403):
        raise RuntimeError(
            "OpenRouter API key is invalid. "
            "Check your OPENROUTER_API_KEY at https://openrouter.ai/settings/keys"
        )
    resp.raise_for_status()

    data = resp.json()
    choices = data.get("choices", [])
    if not choices:
        raise ValueError(f"OpenRouter returned no choices. Response: {str(data)[:200]}")

    raw = choices[0].get("message", {}).get("content", "").strip()
    if not raw:
        raise ValueError("OpenRouter returned an empty response.")
    return _parse_json(raw)


# ─── Public entry point ───────────────────────────────────────────────────────

async def parse_receipt_image(image_bytes: bytes, content_type: str = "image/jpeg") -> dict:
    """
    Parse a receipt image. Tries Gemini first; falls back to OpenRouter on 429.
    """
    if not GEMINI_API_KEY and not OPENROUTER_API_KEY:
        raise RuntimeError(
            "No AI API keys configured. Set GEMINI_API_KEY and/or OPENROUTER_API_KEY in backend/.env"
        )

    # ── Primary: Gemini ────────────────────────────────────────────────────────
    if GEMINI_API_KEY:
        try:
            return await _call_gemini(image_bytes, content_type)
        except RuntimeError as e:
            if "RATE_LIMITED" in str(e):
                print("Gemini rate-limited — falling back to OpenRouter.")
                # fall through to OpenRouter below
            else:
                raise   # real error (bad key, bad image) — don't swallow

    # ── Fallback: OpenRouter ───────────────────────────────────────────────────
    return await _call_openrouter(image_bytes, content_type)
