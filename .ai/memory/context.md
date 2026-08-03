# SplitReceipt — Shared Agent Context

## Project Overview
A restaurant bill-splitting app. Users scan a receipt, AI parses it, 
everyone claims what they ate in real-time, and each person sees exactly 
what they owe (proportional tax + tip).

## Tech Stack
- **Backend**: FastAPI (Python 3.11+), Motor (async MongoDB), Grok vision API
- **Frontend**: Next.js 14, TypeScript, Tailwind CSS
- **Database**: MongoDB (local or Atlas M0 free tier)
- **Real-time**: WebSockets

## Project Root
C:\Users\Abity\OneDrive\Desktop\Reciept

## Key Files
- backend/main.py         — All API endpoints + WebSocket
- backend/db.py           — MongoDB session document schema
- backend/grok_service.py — Receipt OCR via Grok vision API
- backend/calculations.py — Split math
- backend/ws_manager.py   — WebSocket broadcaster
- frontend/src/app/page.tsx                        — Upload receipt
- frontend/src/app/session/[token]/page.tsx        — Claim items
- frontend/src/app/session/[token]/results/page.tsx — Final amounts

## APIs
| Method | Endpoint                        | Description            |
|--------|---------------------------------|------------------------|
| POST   | /api/receipts/parse             | Upload image → draft   |
| POST   | /api/sessions                   | Create group           |
| GET    | /api/sessions/{token}           | Get session state      |
| WS     | /ws/sessions/{token}            | Real-time updates      |
| POST   | /api/sessions/{token}/join      | Join session           |
| POST   | /api/sessions/{token}/claim     | Claim/unclaim item     |
| POST   | /api/sessions/{token}/payer     | Set payer info         |
| POST   | /api/sessions/{token}/lock      | Lock & calculate       |

## Current Status
- Backend: COMPLETE
- Frontend: COMPLETE
- Orchestration system: IN PROGRESS

## Agent Assignments
- Kiro-CLI  → PM, architecture, code review, planning
- Gemini    → Research, documentation, design specs
- Devin     → Long-running autonomous tasks, CI/CD, debugging sessions
- OpenCode  → Agentic terminal tasks, file edits, shell automation
- KiloCode  → In-editor fast edits, inline completions
