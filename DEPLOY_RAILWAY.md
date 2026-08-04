Railway deployment checklist — set env and run Prisma migrations

1) Add environment variables in Railway project Settings → Variables
   - DATABASE_URL = postgresql://USER:PASSWORD@HOST:PORT/DATABASE?schema=public
   - NEXT_PUBLIC_API_URL = https://<your-site>.railway.app (optional)
   - GEMINI_API_KEY = <your Gemini API key> (optional)
   - OPENROUTER_API_KEY = <your OpenRouter key> (optional)
   - GROQ_API_KEY = comma-separated keys if you have >1 (optional)
   - ALLOWED_ORIGINS = https://<your-site>.railway.app (or * during testing)

2) Ensure Railway build commands (default Node) run npm install and build.
   In Railway, set the build command (if needed):
     npm install && npm run prisma:generate && npm run build

3) Run Prisma migrations on deploy
   - Preferred: Add a post-deploy command in Railway to run migrations once:
       npx prisma migrate deploy
   - Alternatively, run locally against your Railway Postgres and then deploy.

4) Verify Prisma client generation
   - Ensure `@prisma/client` is installed. The build step runs `prisma generate`.

5) Add AI keys to Railway only when you have them. Keep keys secret.

6) Healthcheck
   - Railway will ping the Next.js app. The app exposes /api/health (or /health if present).

Notes
- This repo stores session data in Postgres (single JSON column). If you prefer Mongo, keep the existing backend instead.
- If using Edge runtime for some API routes, file uploads must use Node runtime pages/api endpoints (we added pages/api/receipts/upload.ts).
- If you want automatic Prisma migrations on each deploy, ensure DATABASE_URL is present and add `npx prisma migrate deploy` as a deploy/post-deploy step.

Commands to run locally for testing

# from frontend/
npm install
npx prisma generate
# create a local Postgres and set DATABASE_URL in frontend/.env
npx prisma migrate dev --name init
npm run dev

If you want assistance performing these steps in your Railway project, say "Do it for me" and provide Railway access or run the commands in your environment and I will guide the next verification steps.
