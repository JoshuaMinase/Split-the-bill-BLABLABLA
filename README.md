# SplitReceipt 🧾

Split a restaurant bill with friends — scan the receipt, everyone claims what they ate, and each person sees exactly what they owe (including proportional tax & tip).

---

## How it works

| Step | Who | What happens |
|------|-----|--------------|
| 1 | **You** | Take a photo of the receipt. AI reads it into an item list. Review/edit, then create the group. |
| 2 | **Everyone** | Opens the share link. Enters their name. Taps the items they ate (real-time, everyone sees each other's selections live). |
| 3 | **You** | Choose who paid, enter their account number. Tap **Lock & Calculate**. |
| 4 | **Everyone** | Sees their final amount with a breakdown. Copies the payer's account details and sends the money manually. |

---

## Project structure

```
Reciept/
├── backend/          FastAPI (Python)
│   ├── main.py       All API endpoints + WebSocket
│   ├── db.py         MongoDB (Motor async) connection + session document schema
│   ├── grok_service.py   Receipt OCR via Grok vision API
│   ├── calculations.py   Split math (shared items, proportional tax, rounding)
│   ├── ws_manager.py     Real-time WebSocket broadcaster
│   ├── requirements.txt
│   └── .env.example
│
└── frontend/         Next.js 14 + Tailwind CSS (TypeScript)
    └── src/
        ├── app/
        │   ├── page.tsx                         Step 1: Upload receipt
        │   └── session/[token]/
        │       ├── page.tsx                     Step 2: Claim items
        │       └── results/page.tsx             Step 3: Payer + final amounts
        ├── hooks/useSession.ts                  WebSocket state hook
        └── lib/
            ├── api.ts                           Typed API client
            ├── types.ts                         Shared TypeScript types
            └── device.ts                        Anonymous device identity
```

---

## Prerequisites

- **Python 3.11+**
- **Node.js 18+**
- **MongoDB** — either:
  - Local: [download Community Edition](https://www.mongodb.com/try/download/community) and run `mongod`
  - Cloud (free forever): create an [Atlas M0 cluster](https://www.mongodb.com/cloud/atlas/register) and copy the connection string
- **Grok API key** — get one at [console.x.ai](https://console.x.ai/)

---

## Running locally

### 1 — Backend

```bash
cd backend

# Copy env file and fill in your values
cp .env.example .env
# Edit .env: set GROK_API_KEY and MONGODB_URI

# Install dependencies
pip install -r requirements.txt

# Start the API server (runs on http://localhost:8000)
uvicorn main:app --reload --host 0.0.0.0
```

Test it's running: open http://localhost:8000/health — should return `{"status":"ok"}`

### 2 — Frontend

Open a **new terminal**:

```bash
cd frontend

# Install dependencies
npm install

# Start the dev server (runs on http://localhost:3000)
npm run dev
```

Open http://localhost:3000 in your browser.

---

## Environment variables

### Backend (`backend/.env`)

| Variable | Description | Default |
|----------|-------------|---------|
| `GROK_API_KEY` | Your x.ai Grok API key | *(required)* |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017` |
| `MONGODB_DB` | Database name | `splitreceipt` |

### Frontend (`frontend/.env.local`) — optional

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | Backend URL | `http://localhost:8000` |

Create `frontend/.env.local` and set `NEXT_PUBLIC_API_URL` when deploying to production.

---

## API reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/receipts/parse` | Upload receipt image → returns draft item list |
| `POST` | `/api/sessions` | Confirm draft → create group → returns share token |
| `GET` | `/api/sessions/{token}` | Get full session state |
| `WS` | `/ws/sessions/{token}` | Real-time updates (claim, join, lock) |
| `POST` | `/api/sessions/{token}/join` | Join with a name (idempotent by device token) |
| `POST` | `/api/sessions/{token}/claim` | Claim or un-claim an item |
| `POST` | `/api/sessions/{token}/payer` | Set payer + payment account info |
| `POST` | `/api/sessions/{token}/lock` | Freeze claims + compute final amounts |

---

## Split calculation rules

1. **Shared items** — if multiple people claim the same item, the price is split evenly among them.
2. **Unclaimed items** — if nobody claims an item, it's split evenly among all participants (so the receipt total always reconciles fully).
3. **Tax & tip** — allocated proportionally to each person's share of the subtotal (heavy orderers pay more tax).
4. **Rounding** — any leftover cents are absorbed by the payer so all amounts sum exactly to the receipt total.

---

## Deploying

### Backend
Any Python host works: Railway, Render, Fly.io, or an EC2/VPS.

```bash
# Production start command
uvicorn main:app --host 0.0.0.0 --port 8000
```

Set `GROK_API_KEY`, `MONGODB_URI`, and `MONGODB_DB` as environment variables on your host.

Tighten CORS before going public — edit `allow_origins` in `main.py`:
```python
allow_origins=["https://yourdomain.com"],
```

### Frontend
Deploy to [Vercel](https://vercel.com) (recommended for Next.js):

```bash
cd frontend
npx vercel
```

Set `NEXT_PUBLIC_API_URL` to your deployed backend URL in Vercel's environment variables dashboard.
