"""
Sends a receipt photo to the Google Gemini API and returns structured JSON:
  {"merchant_name": ..., "items": [...], "subtotal": ..., "tax": ..., "tip": ..., "total": ...}

Uses the Gemini 2.0 Flash model which supports image input and is free
(15 req/min, 1,500 req/day on the free tier).
"""
import base64
import json
import os
import re
import httpx
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = "gemini-2.0-flash"
GEMINI_API_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    f"{GEMINI_MODEL}:generateContent"
)

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


async def parse_receipt_image(image_bytes: bytes, content_type: str = "image/jpeg") -> dict:
    if not GEMINI_API_KEY:
        raise RuntimeError(
            "GEMINI_API_KEY is not set. Add it to backend/.env before calling this endpoint."
        )

    b64_image = base64.b64encode(image_bytes).decode("utf-8")

    payload = {
        "system_instruction": {
            "parts": [{"text": SYSTEM_PROMPT}]
        },
        "contents": [
            {
                "parts": [
                    {
                        "inline_data": {
                            "mime_type": content_type,
                            "data": b64_image,
                        }
                    },
                    {"text": "Parse this receipt into the JSON shape described."},
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0,
            "responseMimeType": "application/json",
        },
    }

    url = f"{GEMINI_API_URL}?key={GEMINI_API_KEY}"

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(url, json=payload)
        if resp.status_code == 400:
            raise RuntimeError(
                "Gemini API bad request (400). The image may be too large or in an unsupported format."
            )
        if resp.status_code == 401 or resp.status_code == 403:
            raise RuntimeError(
                "Invalid or unauthorized Gemini API key. Check your GEMINI_API_KEY at "
                "https://aistudio.google.com/app/apikey"
            )
        if resp.status_code == 429:
            raise RuntimeError(
                "Gemini API rate limit reached (free tier: 15 req/min). "
                "Please wait a moment and try again."
            )
        resp.raise_for_status()
        data = resp.json()

    # Validate response structure
    candidates = data.get("candidates", [])
    if not candidates:
        # Check for prompt feedback / blocking
        feedback = data.get("promptFeedback", {})
        block_reason = feedback.get("blockReason", "")
        if block_reason:
            raise ValueError(f"Gemini blocked the request: {block_reason}")
        raise ValueError(f"Gemini API returned no candidates. Response: {str(data)[:200]}")

    content = candidates[0].get("content", {})
    parts = content.get("parts", [])
    if not parts:
        raise ValueError("Gemini API returned an empty response")

    raw_text = parts[0].get("text", "").strip()
    if not raw_text:
        raise ValueError("Gemini API returned an empty response")

    # Strip markdown code fences just in case (```json ... ``` or ``` ... ```)
    raw_text = re.sub(r"^```(?:json)?\s*\n?", "", raw_text, flags=re.IGNORECASE)
    raw_text = re.sub(r"\n?```\s*$", "", raw_text).strip()

    try:
        parsed = json.loads(raw_text)
    except json.JSONDecodeError as e:
        raise ValueError(f"Gemini returned non-JSON output: {raw_text[:300]}") from e

    if "error" in parsed:
        raise ValueError(parsed["error"])

    return parsed
