"""
SplitReceipt — FastAPI backend

Endpoints:
  POST   /api/receipts/parse          Upload receipt photo -> Grok reads it -> returns draft JSON
  POST   /api/sessions                Confirm draft -> creates group + returns share token
  GET    /api/sessions/{token}        Full live session state
  WS     /ws/sessions/{token}         Real-time push (state updates as people claim items)
  POST   /api/sessions/{token}/join   Person opens share link -> joins group
  POST   /api/sessions/{token}/claim  Toggle "I ate this" on an item
  POST   /api/sessions/{token}/payer  Set who paid + their payment account info
  POST   /api/sessions/{token}/lock   Freeze claims, compute final amounts per person
"""
import asyncio
import os
import time
from contextlib import asynccontextmanager
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from calculations import calculate_splits
from db import ensure_indexes, gen_id, get_sessions_col, new_session_doc
from grok_service import parse_receipt_image
from food_image_service import food_image_url, food_image_url_async
from ws_manager import manager

load_dotenv()

# ─── Lifespan (replaces deprecated @app.on_event) ────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Run index creation in the background so startup never blocks on MongoDB.
    # The /health endpoint returns immediately; indexes are ready within seconds.
    async def _bg_indexes():
        try:
            await ensure_indexes()
            print("MongoDB indexes ready.")
        except Exception as e:
            print(f"Warning: Could not ensure MongoDB indexes: {e}")

    asyncio.create_task(_bg_indexes())
    yield

app = FastAPI(title="SplitReceipt API", version="1.0.0", lifespan=lifespan)

# CORS — tighten allow_origins to your frontend URL before deploying publicly
# Set ALLOWED_ORIGINS env var to comma-separated list: "https://myapp.com,https://www.myapp.com"
_raw_origins = os.environ.get("ALLOWED_ORIGINS", "")
_allowed_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()] or ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Pydantic models ──────────────────────────────────────────────────────────

class ReceiptItemIn(BaseModel):
    name: str
    price: float
    quantity: int = 1


class ReceiptIn(BaseModel):
    merchant_name: Optional[str] = None
    items: list[ReceiptItemIn]
    subtotal: float
    tax: float = 0.0
    tip: float = 0.0
    total: float


class JoinIn(BaseModel):
    name: str
    device_token: str  # random UUID generated client-side, stored in localStorage


class ClaimIn(BaseModel):
    item_id: str
    participant_id: str
    claimed: bool  # True = claiming, False = un-claiming


class PayerIn(BaseModel):
    participant_id: str
    account_type: str        # e.g. "CBE", "Telebirr", "Bank transfer"
    account_details: str     # account number / phone number to copy-paste


# ─── Helpers ─────────────────────────────────────────────────────────────────

async def get_session_or_404(token: str) -> dict:
    session = await get_sessions_col().find_one({"token": token})
    if not session:
        raise HTTPException(status_code=404, detail="Session not found. The link may have expired.")
    return session


def public_view(session: dict) -> dict:
    """Convert internal doc to a clean API-safe dict (rename _id -> id)."""
    s = dict(session)
    s["id"] = str(s.pop("_id"))
    return s


async def broadcast_state(token: str):
    """Fetch the latest session state and push it to all connected WS clients."""
    session = await get_session_or_404(token)
    await manager.broadcast(token, {"type": "state", "session": public_view(session)})


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    # Intentionally simple — no DB call. Railway healthcheck hits this
    # immediately after process start; we must respond before MongoDB connects.
    return {"status": "ok"}


@app.get("/api/food-image")
async def get_food_image(q: str):
    """
    Return a food image URL for a given item name.
    Tries TheMealDB first, then Foodish, then an avatar fallback.
    All free, no API key required.
    """
    if not q or not q.strip():
        return {"url": None}
    url = await food_image_url_async(q.strip())
    return {"url": url}


@app.post("/api/receipts/parse")
async def parse_receipt(file: UploadFile = File(...)):
    """
    Step 1a: Upload the receipt photo.
    Note: OCR is now handled client-side for better performance and reliability.
    This endpoint is kept for backward compatibility and can be used as a fallback.
    """
    allowed = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}
    ct = file.content_type or "image/jpeg"
    if ct not in allowed:
        raise HTTPException(status_code=415, detail=f"Unsupported image type: {ct}")

    if file.size and file.size > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image too large. Please use a photo under 10 MB.")

    image_bytes = await file.read()
    if len(image_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image too large. Please use a photo under 10 MB.")

    try:
        parsed = await parse_receipt_image(image_bytes, ct)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Couldn't read that receipt: {e}")

    # Fetch food images for all items concurrently
    items = parsed.get("items", [])
    if items:
        image_urls = await asyncio.gather(
            *[food_image_url_async(item.get("name", "")) for item in items]
        )
        for item, url in zip(items, image_urls):
            item["image_url"] = url

    return parsed


@app.post("/api/sessions", status_code=201)
async def create_session(receipt: ReceiptIn):
    """
    Step 1b: Uploader confirms/edits the draft and creates the group.
    Returns the session token used as the share link identifier.
    """
    data = receipt.model_dump()
    # Fetch images for items that don't already have one (concurrently)
    items_needing_images = [i for i in data.get("items", []) if not i.get("image_url")]
    if items_needing_images:
        image_urls = await asyncio.gather(
            *[food_image_url_async(item.get("name", "")) for item in items_needing_images]
        )
        for item, url in zip(items_needing_images, image_urls):
            item["image_url"] = url
    doc = new_session_doc(data)
    await get_sessions_col().insert_one(doc)
    return {"token": doc["token"], "session": public_view(doc)}


@app.get("/api/sessions/{token}")
async def get_session(token: str):
    """Fetch current session state (items, participants, claims, results)."""
    session = await get_session_or_404(token)
    return public_view(session)


@app.post("/api/sessions/{token}/join")
async def join_session(token: str, body: JoinIn):
    """
    Step 2: Someone opens the share link and enters their name.
    Uses device_token (localStorage UUID) for idempotency — refreshing
    the page returns the same participant_id, not a duplicate entry.
    """
    session = await get_session_or_404(token)
    if session["status"] != "open":
        raise HTTPException(status_code=400, detail="This session is locked; claiming is closed.")

    # Idempotency: same device rejoining gets the same participant back
    existing = next(
        (p for p in session["participants"] if p["device_token"] == body.device_token),
        None,
    )
    if existing:
        return {"participant_id": existing["id"], "already_joined": True}

    participant = {
        "id": gen_id(),
        "name": body.name,
        "device_token": body.device_token,
        "joined_at": time.time(),
    }
    await get_sessions_col().update_one({"token": token}, {"$push": {"participants": participant}})
    await broadcast_state(token)
    return {"participant_id": participant["id"], "already_joined": False}


@app.post("/api/sessions/{token}/claim")
async def claim_item(token: str, body: ClaimIn):
    """
    Step 2: Toggle a claim. claimed=true adds, claimed=false removes.
    Broadcasts updated state to everyone in the session via WebSocket.
    """
    session = await get_session_or_404(token)
    if session["status"] != "open":
        raise HTTPException(status_code=400, detail="Session is locked; claims are frozen.")

    # Validate participant and item exist in this session
    participant_ids = [p["id"] for p in session["participants"]]
    if body.participant_id not in participant_ids:
        raise HTTPException(status_code=400, detail="Participant not found in this session.")

    item_ids = [i["id"] for i in session["receipt"]["items"]]
    if body.item_id not in item_ids:
        raise HTTPException(status_code=400, detail="Item not found in this session.")

    if body.claimed:
        already = any(
            c["item_id"] == body.item_id and c["participant_id"] == body.participant_id
            for c in session["claims"]
        )
        if not already:
            await get_sessions_col().update_one(
                {"token": token},
                {"$push": {"claims": {"item_id": body.item_id, "participant_id": body.participant_id}}},
            )
    else:
        await get_sessions_col().update_one(
            {"token": token},
            {"$pull": {"claims": {"item_id": body.item_id, "participant_id": body.participant_id}}},
        )

    await broadcast_state(token)
    return {"ok": True}


@app.post("/api/sessions/{token}/payer")
async def set_payer(token: str, body: PayerIn):
    """
    Step 3a: Designate who paid the restaurant and enter their payment account info.
    The account_details string is what everyone else will copy-paste to send money.
    """
    session = await get_session_or_404(token)
    participant_ids = [p["id"] for p in session["participants"]]
    if body.participant_id not in participant_ids:
        raise HTTPException(status_code=400, detail="That participant isn't in this session.")

    payer = {
        "participant_id": body.participant_id,
        "account_type": body.account_type,
        "account_details": body.account_details,
    }
    await get_sessions_col().update_one({"token": token}, {"$set": {"payer": payer}})
    await broadcast_state(token)
    return {"ok": True}


@app.post("/api/sessions/{token}/lock")
async def lock_session(token: str):
    """
    Step 3b: Freeze the session. Calculates final amounts, transitions status to 'locked'.
    After this, claims can't change. Everyone can see what they owe the payer.
    """
    session = await get_session_or_404(token)
    if session["status"] == "locked":
        return {"ok": True, "results": session["results"]}  # idempotent

    if not session["payer"]:
        raise HTTPException(status_code=400, detail="Choose a payer before locking the split.")
    if not session["participants"]:
        raise HTTPException(status_code=400, detail="No participants have joined yet.")

    receipt = session["receipt"]
    participant_ids = [p["id"] for p in session["participants"]]

    results = calculate_splits(
        items=receipt["items"],
        claims=session["claims"],
        tax=receipt["tax"],
        tip=receipt["tip"],
        participants=participant_ids,
        payer_participant_id=session["payer"]["participant_id"],
    )

    await get_sessions_col().update_one(
        {"token": token},
        {"$set": {"status": "locked", "results": results}},
    )
    await broadcast_state(token)
    return {"ok": True, "results": results}


# ─── WebSocket ────────────────────────────────────────────────────────────────

@app.websocket("/ws/sessions/{token}")
async def session_socket(websocket: WebSocket, token: str):
    """
    Real-time channel for a session. On connect: sends full current state.
    After that, state is pushed whenever anything changes (claim, join, lock).
    Client pings (any text frame) are ignored — this is server-push only.
    """
    session = await get_sessions_col().find_one({"token": token})
    if not session:
        await websocket.close(code=4004)
        return

    await manager.connect(token, websocket)
    try:
        # Send current state immediately on connect
        await websocket.send_json({"type": "state", "session": public_view(session)})
        # Keep connection alive; ignore any incoming messages (server-push only)
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(token, websocket)
    except Exception:
        # Catch any other transport error (network drop, etc.) and clean up
        manager.disconnect(token, websocket)
