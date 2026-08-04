"""
Sends a receipt photo to the Grok API (x.ai) and returns structured JSON:
  {"merchant_name": ..., "items": [...], "subtotal": ..., "tax": ..., "tip": ..., "total": ...}

Grok's API is OpenAI-compatible, so we use the standard chat completions
endpoint with an image_url content block containing a base64 data URL.
"""
import base64
import json
import os
import httpx
from dotenv import load_dotenv

load_dotenv()

GROK_API_KEY = os.environ.get("GROK_API_KEY", "")
GROK_API_URL = "https://api.x.ai/v1/chat/completions"
GROK_MODEL = "grok-4.5"  # current flagship model with vision support (grok-2-vision-1212 retired)

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


def _to_data_url(image_bytes: bytes, content_type: str) -> str:
    b64 = base64.b64encode(image_bytes).decode("utf-8")
    return f"data:{content_type};base64,{b64}"


async def parse_receipt_image(image_bytes: bytes, content_type: str = "image/jpeg") -> dict:
    if not GROK_API_KEY:
        raise RuntimeError(
            "GROK_API_KEY is not set. Add it to backend/.env before calling this endpoint."
        )

    data_url = _to_data_url(image_bytes, content_type)

    payload = {
        "model": GROK_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": data_url}},
                    {"type": "text", "text": "Parse this receipt into the JSON shape described."},
                ],
            },
        ],
        "temperature": 0,
    }

    headers = {
        "Authorization": f"Bearer {GROK_API_KEY}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(GROK_API_URL, json=payload, headers=headers)
        if resp.status_code == 401:
            raise RuntimeError("Invalid Grok API key. Please check your GROK_API_KEY.")
        if resp.status_code == 403:
            raise RuntimeError(
                "Grok API access denied (403). Your API key may have run out of credits "
                "or lacks permission for this model. Visit console.x.ai to check your balance."
            )
        if resp.status_code == 429:
            raise RuntimeError("Grok API rate limit reached. Please wait a moment and try again.")
        resp.raise_for_status()
        data = resp.json()

    # Validate response structure before accessing
    if "choices" not in data or not data["choices"]:
        raise ValueError(f"Invalid Grok API response: missing 'choices'. Got: {str(data)[:200]}")
    message = data["choices"][0].get("message", {})
    raw_text = message.get("content", "").strip()
    if not raw_text:
        raise ValueError("Grok API returned an empty response")

    # Strip markdown code fences robustly (```json ... ``` or ``` ... ```)
    import re as _re
    raw_text = _re.sub(r"^```(?:json)?\s*\n?", "", raw_text, flags=_re.IGNORECASE)
    raw_text = _re.sub(r"\n?```\s*$", "", raw_text).strip()

    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError as e:
        raise ValueError(f"Grok returned non-JSON output: {raw_text[:300]}") from e

    if "error" in parsed:
        raise ValueError(parsed["error"])

    return parsed
