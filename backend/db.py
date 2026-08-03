"""
MongoDB setup using Motor (async driver, matches FastAPI's async style).

Design: ONE document per session, embedding the receipt, its items,
the participants who joined, and their claims. This is the idiomatic
Mongo shape here because all of that data is always read and written
together (open a session -> see items, participants, and claims at once).

Free hosting options:
  - Local: install mongod from https://www.mongodb.com/try/download/community
  - Cloud: free forever Atlas M0 cluster at https://www.mongodb.com/cloud/atlas/register
            grab the connection string and set as MONGODB_URI in .env
"""
import os
import time
import uuid
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorCollection

load_dotenv()

MONGODB_URI = os.environ.get("MONGODB_URI", "mongodb://localhost:27017")
DB_NAME = os.environ.get("MONGODB_DB", "splitreceipt")

# Lazy initialization — client is NOT created at import time so that
# missing env vars don't crash the process before Railway can reach /health.
_client: AsyncIOMotorClient | None = None


def get_client() -> AsyncIOMotorClient:
    """Return (creating if needed) the shared Motor client."""
    global _client
    if _client is None:
        _client = AsyncIOMotorClient(MONGODB_URI)
    return _client


def get_db():
    """Return the Motor database handle."""
    return get_client()[DB_NAME]


def get_sessions_col() -> AsyncIOMotorCollection:
    """Return the 'sessions' collection handle."""
    return get_db()["sessions"]


def gen_id() -> str:
    return uuid.uuid4().hex


def gen_token() -> str:
    """Short 8-char URL-friendly token used as the share link identifier."""
    return uuid.uuid4().hex[:8]


async def ensure_indexes():
    """Create required indexes. Called from lifespan; failure is non-fatal."""
    await get_sessions_col().create_index("token", unique=True)


def new_session_doc(receipt: dict) -> dict:
    """
    receipt: {"merchant_name": str|None, "items": [...], "subtotal": float,
              "tax": float, "tip": float, "total": float}
    Each item gets a stable id so claims can reference it.
    """
    items = []
    for item in receipt.get("items", []):
        items.append({
            "id": gen_id(),
            "name": item["name"],
            "price": float(item["price"]),
            "quantity": item.get("quantity", 1),
            "image_url": item.get("image_url"),  # carry through from parse/create
        })

    return {
        "_id": gen_id(),
        "token": gen_token(),
        "status": "open",   # open -> locked -> settled
        "receipt": {
            "merchant_name": receipt.get("merchant_name"),
            "items": items,
            "subtotal": float(receipt.get("subtotal", 0)),
            "tax": float(receipt.get("tax", 0)),
            "tip": float(receipt.get("tip", 0)),
            "total": float(receipt.get("total", 0)),
        },
        "participants": [],  # [{id, name, device_token, joined_at}]
        "claims": [],        # [{item_id, participant_id}]
        "payer": None,       # {participant_id, account_type, account_details}
        "results": None,     # filled in once locked: {participant_id: {...}}
        "created_at": time.time(),
    }
