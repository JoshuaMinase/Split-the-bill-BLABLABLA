# 🧾 SplitReceipt

Split a restaurant bill with friends — upload a receipt photo (or enter items manually), everyone claims what they ate, one payer is chosen, and amounts are calculated.

[![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org) [![Prisma](https://img.shields.io/badge/Prisma-ORM-blue?logo=prisma)](https://www.prisma.io) [![Postgres](https://img.shields.io/badge/Postgres-14-blue?logo=postgresql)](https://www.postgresql.org) [![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

What it does

- Upload a receipt photo (or enter items manually)
- AI attempts to parse the receipt (server-side chain: Gemini → OpenRouter → Groq)
- Create a share link for your table; people join and tap items they ate
- Choose a payer, lock the split, and everyone sees their final amount

---

Tech stack

- Frontend: Next.js 16, TypeScript, Tailwind CSS
- Backend (API): Next.js API routes (Node), Prisma + PostgreSQL
- AI: Tiered server-side parsing (Gemini/OpenRouter/Groq) with client-side OCR fallback
- Realtime: polling fallback (short-term); can be swapped to Supabase/WS
- Deploy: Railway (Postgres) — see DEPLOY_RAILWAY.md

---

API endpoints (summary)

- POST /api/receipts/upload — multipart image upload → AI parse (pages API, Node runtime)
- POST /api/receipts/parse — JSON draft parse (simple normalize)
- GET  /api/food-image?q=... — return food image URL (TheMealDB → Unsplash)
- POST /api/sessions — create session from draft
- GET  /api/sessions/[token] — session state
- POST /api/sessions/[token]/join — join with name + device token
- POST /api/sessions/[token]/claim — toggle claim
- POST /api/sessions/[token]/payer — set payer account info
- POST /api/sessions/[token]/lock — compute final results (Prisma + TS calc)
- GET  /api/health-db — DB smoke-check (create/read/delete session)

---

Running locally

1. Copy environment variables: frontend/.env.example → frontend/.env and set values (DATABASE_URL, NEXT_PUBLIC_API_URL, AI keys).
2. Install + generate Prisma client:
   npm install
   npx prisma generate
3. Apply schema (choose one):
   npx prisma db push    # sync schema without migration files
   or
   npx prisma migrate dev --name init
4. Run dev server:
   npm run dev

The pages API endpoint /api/receipts/upload requires a Node runtime (it uses formidable). If AI keys are not set, users can enter items manually.

For deployment on Railway, follow DEPLOY_RAILWAY.md.

---

Contributing & notes

- Sessions are stored as a JSON payload in Postgres (Prisma Session.data). This keeps the schema simple for iteration; normalize later if needed.
- Security: set AI keys and DATABASE_URL as environment variables in Railway; do NOT commit secrets.

---

License: MIT
