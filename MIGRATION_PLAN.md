Migration plan (high level)

Goal: migrate backend/ FastAPI → Next.js API routes and Postgres (Prisma). Use client-side OCR (tesseract.js) as primary; keep server AI fallback for difficult receipts.

Steps (this commit):
1. Add Prisma schema (Session with JSON payload) and server dependencies to frontend package.json (done).
2. Create a lightweight API layer in Next.js: /app/api/receipts/parse, /app/api/sessions, /app/api/sessions/[token]/join/claim/payer/lock, and a WS endpoint for real-time updates. (next)
3. Implement Postgres session storage (Prisma client) and migration scripts; ensure Railway DATABASE_URL is set and run prisma migrate.
4. Implement client-side OCR flow (tesseract) with quick local parsing UI; add server fallback calling Gemini/OpenRouter via secure env keys.
5. Port calculations.py logic to TypeScript (keep existing unit tests ported to vitest).
6. Implement WebSocket/real-time updates using a small server (ws package) or Supabase/Realtime as alternative.
7. Run full end-to-end tests locally, update Docker/Railway config, and push to main for automatic deploy.

Notes:
- Session stored as JSON initially to reduce schema complexity. Later optimizations can normalize participants/items into tables if needed.
- Railway: ensure DATABASE_URL and any AI keys (GEMINI_API_KEY / OPENROUTER_API_KEY) are configured in project settings.

Next actions: implement the API route skeleton and Prisma client usage, then run prisma generate and attempt a local dev build. Proceeding in small, verifiable commits.
