"""
Receipt parsing with 3-tier automatic fallback:

  1. Google Gemini 2.0 Flash       (primary  — free, 1,500 req/day)
  2. OpenRouter free vision router  (fallback — activates on Gemini 429/400)
  3. Groq vision  ×3 keys           (last resort — rotates through 3 keys on 429)

Images are pre-processed before sending:
  - HEIC/HEIF converted to JPEG
  - Resized to max 1600px on the long edge
  - Compressed to JPEG quality 85
  - Hard cap at 4 MB after compression

Each tier is tried in order. A 429 or 400 moves to the next tier.
Any other error (bad key, bad JSON) is raised immediately.
"""
import base64
import io
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

# ─── Groq (3 keys, rotated on 429) ────────────────────────────────────────────

_raw_groq = os.environ.get("GROQ_API_KEY", "")
# Support comma-separated list of keys OR a single key
GROQ_API_KEYS: list[str] = [k.strip() for k in _raw_groq.split(",") if k.strip()]
GROQ_API_URL  = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL    = "meta-llama/llama-4-scout-17b-16e-instruct"  # Groq's free vision model

# ─── Shared prompt ─────────────────────────────────────────────────────────────

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

# sentinel raised internally to signal 429/400 to the caller
_RATE_LIMITED = "RATE_LIMITED"

# ─── Image preprocessing ───────────────────────────────────────────────────────

def _preprocess_image(image_bytes: bytes, content_type: str) -> tuple[bytes, str]:
    """
    Normalise the image before sending to any AI API:
      - Convert HEIC/HEIF/PNG/WebP → JPEG
      - Resize to max 1600px on the long edge (keeps aspect ratio)
      - Compress at JPEG quality 85
      - If still > 4 MB, compress harder (quality 60 → 40)
    Returns (processed_bytes, "image/jpeg").
    """
    try:
        from PIL import Image, ExifTags  # type: ignore

        img = Image.open(io.BytesIO(image_bytes))

        # Auto-rotate based on EXIF orientation
        try:
            for tag, val in (img.getexif() or {}).items():
                if ExifTags.TAGS.get(tag) == "Orientation":
                    rotations = {3: 180, 6: 270, 8: 90}
                    if val in rotations:
                        img = img.rotate(rotations[val], expand=True)
                    break
        except Exception:
            pass

        # Convert to RGB (handles RGBA, P, CMYK, HEIC etc.)
        if img.mode != "RGB":
            img = img.convert("RGB")

        # Resize: cap long edge at 1600px
        MAX_PX = 1600
        w, h = img.size
        if max(w, h) > MAX_PX:
            if w >= h:
                img = img.resize((MAX_PX, int(h * MAX_PX / w)), Image.LANCZOS)
            else:
                img = img.resize((int(w * MAX_PX / h), MAX_PX), Image.LANCZOS)

        # Encode to JPEG
        for quality in (85, 60, 40):
            buf = io.BytesIO()
            img.save(buf, format="JPEG", quality=quality, optimize=True)
            data = buf.getvalue()
            if len(data) <= 4 * 1024 * 1024:
                return data, "image/jpeg"

        # Fallback: return whatever we got at quality 40
        return data, "image/jpeg"

    except Exception as e:
        # If Pillow fails for any reason, send the original and let the AI handle it
        print(f"Image preprocessing failed ({e}), sending original.")
        return image_bytes, content_type


# ─── JSON helpers ──────────────────────────────────────────────────────────────

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


# ─── Tier 1: Gemini ────────────────────────────────────────────────────────────

async def _call_gemini(image_bytes: bytes, content_type: str) -> dict:
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
        raise RuntimeError(_RATE_LIMITED)
    if resp.status_code in (401, 403):
        raise RuntimeError(
            "Gemini API key is invalid. Check GEMINI_API_KEY at https://aistudio.google.com/app/apikey"
        )
    if resp.status_code == 400:
        # Bad request from Gemini — image format/size issue. Fall through to next provider.
        print(f"Gemini 400 on image ({content_type}, {len(image_bytes)//1024}KB) — trying next tier.")
        raise RuntimeError(_RATE_LIMITED)
    resp.raise_for_status()

    data = resp.json()
    candidates = data.get("candidates", [])
    if not candidates:
        block = data.get("promptFeedback", {}).get("blockReason", "")
        raise ValueError(
            f"Gemini returned no candidates. {('Blocked: ' + block) if block else str(data)[:200]}"
        )
    raw = candidates[0].get("content", {}).get("parts", [{}])[0].get("text", "").strip()
    if not raw:
        raise ValueError("Gemini returned an empty response.")
    return _parse_json(raw)


# ─── Tier 2: OpenRouter ────────────────────────────────────────────────────────

async def _call_openrouter(image_bytes: bytes, content_type: str) -> dict:
    if not OPENROUTER_API_KEY:
        raise RuntimeError(_RATE_LIMITED)   # skip to next tier if not configured

    b64      = base64.b64encode(image_bytes).decode()
    data_url = f"data:{content_type};base64,{b64}"
    payload  = {
        "model": OPENROUTER_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": [
                {"type": "image_url", "image_url": {"url": data_url}},
                {"type": "text",      "text": USER_TEXT},
            ]},
        ],
        "temperature": 0,
    }
    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type":  "application/json",
        "HTTP-Referer":  "https://splitreceipt.app",
        "X-Title":       "SplitReceipt",
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(OPENROUTER_API_URL, json=payload, headers=headers)

    if resp.status_code == 429:
        raise RuntimeError(_RATE_LIMITED)
    if resp.status_code in (401, 403):
        raise RuntimeError(
            "OpenRouter API key is invalid. Check OPENROUTER_API_KEY at https://openrouter.ai/settings/keys"
        )
    resp.raise_for_status()

    data    = resp.json()
    choices = data.get("choices", [])
    if not choices:
        raise ValueError(f"OpenRouter returned no choices. Response: {str(data)[:200]}")
    raw = choices[0].get("message", {}).get("content", "").strip()
    if not raw:
        raise ValueError("OpenRouter returned an empty response.")
    return _parse_json(raw)


# ─── Tier 3: Groq (rotates through multiple keys) ─────────────────────────────

async def _call_groq_with_key(api_key: str, image_bytes: bytes, content_type: str) -> dict:
    """Try one Groq key. Raises RuntimeError(_RATE_LIMITED) on 429."""
    b64      = base64.b64encode(image_bytes).decode()
    data_url = f"data:{content_type};base64,{b64}"
    payload  = {
        "model": GROQ_MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": [
                {"type": "image_url", "image_url": {"url": data_url}},
                {"type": "text",      "text": USER_TEXT},
            ]},
        ],
        "temperature": 0,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type":  "application/json",
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(GROQ_API_URL, json=payload, headers=headers)

    if resp.status_code == 429:
        raise RuntimeError(_RATE_LIMITED)
    if resp.status_code in (401, 403):
        # Bad key — skip to next key rather than crashing
        raise RuntimeError(_RATE_LIMITED)
    resp.raise_for_status()

    data    = resp.json()
    choices = data.get("choices", [])
    if not choices:
        raise ValueError(f"Groq returned no choices. Response: {str(data)[:200]}")
    raw = choices[0].get("message", {}).get("content", "").strip()
    if not raw:
        raise ValueError("Groq returned an empty response.")
    return _parse_json(raw)


async def _call_groq(image_bytes: bytes, content_type: str) -> dict:
    """Try each Groq key in order, moving on after each 429."""
    if not GROQ_API_KEYS:
        raise RuntimeError(_RATE_LIMITED)   # not configured — skip tier

    for key in GROQ_API_KEYS:
        try:
            return await _call_groq_with_key(key, image_bytes, content_type)
        except RuntimeError as e:
            if _RATE_LIMITED in str(e):
                print(f"Groq key ...{key[-6:]} rate-limited or invalid, trying next.")
                continue
            raise

    # All keys exhausted
    raise RuntimeError(_RATE_LIMITED)


# ─── Public entry point ────────────────────────────────────────────────────────

async def parse_receipt_image(image_bytes: bytes, content_type: str = "image/jpeg") -> dict:
    """
    Parse a receipt image using a 3-tier fallback chain:
      Gemini → OpenRouter → Groq (×3 keys)
    Each tier is attempted only if the previous one is rate-limited or rejects the image.
    The image is preprocessed (resized + JPEG-normalised) before any API call.
    """
    if not GEMINI_API_KEY and not OPENROUTER_API_KEY and not GROQ_API_KEYS:
        raise RuntimeError(
            "No AI API keys configured. Set GEMINI_API_KEY, OPENROUTER_API_KEY, "
            "and/or GROQ_API_KEY in backend/.env"
        )

    # Preprocess once — all tiers receive the same normalised image
    image_bytes, content_type = _preprocess_image(image_bytes, content_type)

    tiers = [
        ("Gemini",      _call_gemini      if GEMINI_API_KEY      else None),
        ("OpenRouter",  _call_openrouter  if OPENROUTER_API_KEY  else None),
        ("Groq",        _call_groq        if GROQ_API_KEYS       else None),
    ]

    for name, fn in tiers:
        if fn is None:
            continue
        try:
            result = await fn(image_bytes, content_type)
            if name != "Gemini":
                print(f"Receipt parsed via {name} (fallback).")
            return result
        except RuntimeError as e:
            if _RATE_LIMITED in str(e):
                print(f"{name} rate-limited — trying next tier.")
                continue
            raise   # real error (bad key, bad image) — surface it

    raise RuntimeError(
        "All AI providers are currently rate-limited. Please wait a minute and try again."
    )
