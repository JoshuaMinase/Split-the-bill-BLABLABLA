<div align="center">

# 🧾 SplitReceipt

**Split a restaurant bill with friends — scan the receipt, everyone claims what they ate, done.**

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi)](https://fastapi.tiangolo.com)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb)](https://www.mongodb.com/cloud/atlas)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

</div>

---

## What it does

| Step | Who | What happens |
|------|-----|--------------|
| **1** | You | Take a photo of the receipt. AI reads it into an item list. Review/edit, then create the group. |
| **2** | Everyone | Opens the share link. Enters their name. Taps the items they ate — real-time, everyone sees each other's selections live. |
| **3** | You | Choose who paid, enter their account number. Tap **Lock & Calculate**. |
| **4** | Everyone | Sees their final amount with a full breakdown. Copies the payer's account details and sends the money. |

No app install required. Works entirely in the browser. Optimised for phones.

---

## Features

- 📸 **AI receipt scanning** — powered by Grok vision, reads any receipt photo
- ⚡ **Real-time** — WebSocket push so everyone sees claims update instantly
- 🧮 **Correct math** — shared items split evenly, tax & tip proportional to your share, rounding absorbed by the payer
- 📱 **Phone-first UI** — designed for mobile, works on desktop too
- 🔗 **Zero friction** — share a link, no account needed to join
- 🇪🇹 **Ethiopian payment methods** — Telebirr, CBE, Awash, Dashen, HelloCash built-in

---

## Tech stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 16, TypeScript, Tailwind CSS |
| Backend | FastAPI (Python 3.11), async via Motor |
| Database | MongoDB (Motor async driver) |
| AI | Grok vision API (x.ai) |
| Real-time | WebSockets (FastAPI native) |
| Deploy | Vercel (frontend) + Railway (backend) |

---

## Project structure

```
splitreceipt/
├── backend/
│   ├── main.py              # All API endpoints + WebSocket
│   ├── db.py                # MongoDB connection + session schema
│   ├── grok_service.py      # Receipt OCR via Grok vision API
│   ├── calculations.py      # Split math (shared items, proportional tax, rounding)
│   ├── ws_manager.py        # Real-time WebSocket broadcaster
│   ├── tests/               # pytest unit tests (37 tests, 100% pass)
│   └── requirements.txt
│
└── frontend/
    └── src/
        ├── app/
        │   ├── page.tsx                      # Step 1: Upload receipt
        │   └── session/[token]/
        │       ├── page.tsx                  # Step 2: Claim items (live)
        │       └── results/page.tsx          # Step 3: Payer + final amounts
        ├── hooks/useSession.ts               # WebSocket state hook with reconnect
        └── lib/
            ├── api.ts                        # Typed API client
            ├── types.ts                      # Shared TypeScript types
            └── device.ts                     # Anonymous device identity
```

---

## Running locally

### Prerequisites

- Python 3.11+
- Node.js 18+
- MongoDB — [local](https://www.mongodb.com/try/download/community) **or** free [Atlas M0](https://www.mongodb.com/cloud/atlas/register)
- Grok API key — [console.x.ai](https://console.x.ai/)

### Backend

```bash
cd backend
cp .env.example .env
# Edit .env — set GROK_API_KEY and MONGODB_URI

pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0
```

Check it's running: `http://localhost:8000/health` → `{"status":"ok"}`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`

---

## Environment variables

### Backend (`backend/.env`)

| Variable | Description |
|----------|-------------|
| `GROK_API_KEY` | Your x.ai Grok API key |
| `MONGODB_URI` | MongoDB connection string (local or Atlas) |
| `MONGODB_DB` | Database name — default `splitreceipt` |
| `ALLOWED_ORIGINS` | Comma-separated frontend URL(s) for CORS |

### Frontend (`frontend/.env.local`)

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_API_URL` | Backend URL — default `http://localhost:8000` |

---

## Split calculation rules

1. **Shared items** — if multiple people claim the same item, the price is split evenly among them.
2. **Unclaimed items** — split evenly among all participants (receipt total always reconciles).
3. **Tax & tip** — allocated proportionally to each person's share of the subtotal.
4. **Rounding** — leftover cents absorbed by the payer so all amounts sum exactly to the receipt total.

---

## API reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/receipts/parse` | Upload receipt image → AI reads it → returns draft item list |
| `POST` | `/api/sessions` | Confirm draft → create group → returns share token |
| `GET` | `/api/sessions/{token}` | Get full session state |
| `WS` | `/ws/sessions/{token}` | Real-time updates (claim, join, lock) |
| `POST` | `/api/sessions/{token}/join` | Join with a name (idempotent by device token) |
| `POST` | `/api/sessions/{token}/claim` | Claim or un-claim an item |
| `POST` | `/api/sessions/{token}/payer` | Set payer + payment account info |
| `POST` | `/api/sessions/{token}/lock` | Freeze claims + compute final amounts |

---

## Tests

```bash
cd backend
pytest tests/ -v
# 37 passed in ~2s
```

Covers: split math, rounding edge cases, WebSocket connect/disconnect/broadcast, Grok response parsing.

---

## License

MIT
