# SplitReceipt — Deployment Guide 🚀

End-to-end instructions for going live:
- **Backend** → [Railway](https://railway.app) (free tier works)
- **Frontend** → [Vercel](https://vercel.com) (free tier works)
- **Database** → [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) (M0 free forever)

Total cost for a hobby project: **$0/month** on all three free tiers.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Git  | any     | [git-scm.com](https://git-scm.com/) |
| Node.js | 18+ | [nodejs.org](https://nodejs.org/) |
| Python | 3.11+ | [python.org](https://www.python.org/) |
| Railway CLI | latest | `npm i -g @railway/cli` |
| Vercel CLI  | latest | `npm i -g vercel` |

---

## Step 1 — MongoDB Atlas (database)

1. Go to [mongodb.com/cloud/atlas/register](https://www.mongodb.com/cloud/atlas/register) and create a free account.
2. Click **"Build a Cluster"** → choose **M0 Free** → pick any region.
3. Under **Security → Database Access**: add a user with a strong password, note it down.
4. Under **Security → Network Access**: click **"Add IP Address"** → **"Allow Access from Anywhere"** (0.0.0.0/0).  
   _(For production you'd restrict this, but Railway IPs change so we allow all.)_
5. In your cluster dashboard, click **"Connect"** → **"Connect your application"** → copy the connection string.  
   It looks like:
   ```
   mongodb+srv://myuser:mypassword@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
6. Keep this string — you'll use it as `MONGODB_URI` in step 2.

---

## Step 2 — Get a Grok API key

1. Go to [console.x.ai](https://console.x.ai/) and sign in.
2. Create an API key and copy it.
3. Keep it — you'll use it as `GROK_API_KEY` in step 3.

---

## Step 3 — Deploy the backend to Railway

### Option A: Railway CLI (recommended)

```bash
# 1. Login to Railway
railway login

# 2. Move into the backend folder
cd backend

# 3. Initialize a new Railway project
railway init
# → choose "Create new project" when prompted
# → give it a name like "splitreceipt-backend"

# 4. Set environment variables
railway variables set GROK_API_KEY="your_grok_key_here"
railway variables set MONGODB_URI="mongodb+srv://user:pass@cluster.mongodb.net/..."
railway variables set MONGODB_DB="splitreceipt"
railway variables set ALLOWED_ORIGINS="https://YOUR_VERCEL_APP.vercel.app"
# (you'll get the Vercel URL in step 4 — you can come back and set it)

# 5. Deploy
railway up
```

After deploying, Railway shows you a URL like:
```
https://splitreceipt-backend-production.up.railway.app
```
Copy it. You'll set it as `NEXT_PUBLIC_API_URL` in step 4.

### Option B: Railway dashboard (no CLI)

1. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**.
2. Connect your GitHub account, select your `Reciept` repo.
3. In **Settings → Root Directory**: set it to `backend`.
4. In **Variables**, add:
   - `GROK_API_KEY` = your Grok key
   - `MONGODB_URI`  = your Atlas connection string
   - `MONGODB_DB`   = `splitreceipt`
   - `ALLOWED_ORIGINS` = your Vercel URL (add after step 4)
5. In **Settings → Start Command**:
   ```
   uvicorn main:app --host 0.0.0.0 --port $PORT
   ```
6. Click **Deploy**. Watch the logs — should see `Application startup complete`.

### Verify the backend

Open your Railway URL + `/health`:
```
https://YOUR_BACKEND.up.railway.app/health
```
Should return:
```json
{"status": "ok"}
```

---

## Step 4 — Deploy the frontend to Vercel

### Option A: Vercel CLI

```bash
# 1. Move into the frontend folder
cd frontend

# 2. Login to Vercel
vercel login

# 3. Deploy
vercel

# When prompted:
#   Set up and deploy? → Y
#   Which scope? → your account
#   Link to existing project? → N
#   Project name? → splitreceipt-frontend (or whatever)
#   Which directory is your code in? → ./  (you're already in frontend/)
#   Override build settings? → N

# 4. After first deploy, set the backend URL
vercel env add NEXT_PUBLIC_API_URL
# → when prompted, paste: https://YOUR_BACKEND.up.railway.app
# → select: Production, Preview, Development

# 5. Redeploy to pick up the env var
vercel --prod
```

### Option B: Vercel dashboard

1. Push your project to GitHub (see Git section below first).
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → import your repo.
3. **Root Directory**: set to `frontend`.
4. **Framework Preset**: Vercel auto-detects Next.js.
5. Under **Environment Variables**, add:
   - `NEXT_PUBLIC_API_URL` = `https://YOUR_BACKEND.up.railway.app`
6. Click **Deploy**.

After deploying, Vercel gives you a URL like:
```
https://splitreceipt-frontend.vercel.app
```

---

## Step 5 — Connect them (CORS)

Go back to Railway and update `ALLOWED_ORIGINS`:

```bash
railway variables set ALLOWED_ORIGINS="https://splitreceipt-frontend.vercel.app"
```

Or in the Railway dashboard → Variables → edit `ALLOWED_ORIGINS`.

Then redeploy the backend:
```bash
railway up
```

Or in the dashboard, trigger a new deploy.

---

## Step 6 — Test end-to-end

1. Open your Vercel URL on your phone.
2. Take a photo of a receipt (or any photo for testing).
3. Review the items, create a group.
4. Copy the share link and open it in a second tab / send to a friend.
5. Both people claim items.
6. Lock and see the final split.

---

## Push to GitHub (for dashboard deploys)

If you haven't pushed to GitHub yet:

```bash
# In the project root (Reciept/)
git init
git add .
git commit -m "Initial commit"

# Create a repo on github.com, then:
git remote add origin https://github.com/YOUR_USERNAME/splitreceipt.git
git push -u origin main
```

The `.gitignore` already excludes `.env`, `.env.local`, and other secrets.

---

## Custom domain (optional)

### Railway
- In your project → **Settings → Domains** → **Generate Domain** or add your own.

### Vercel
- In your project → **Settings → Domains** → add your domain, follow DNS instructions.

---

## Environment variables reference

### Backend (`backend/.env` / Railway Variables)

| Variable | Required | Description |
|----------|----------|-------------|
| `GROK_API_KEY` | ✅ | Your x.ai Grok API key |
| `MONGODB_URI` | ✅ | MongoDB connection string |
| `MONGODB_DB` | ✅ | Database name (default: `splitreceipt`) |
| `ALLOWED_ORIGINS` | ✅ (prod) | Comma-separated frontend URL(s) |

### Frontend (`frontend/.env.local` / Vercel Variables)

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_API_URL` | ✅ (prod) | Full Railway backend URL, no trailing slash |

---

## Troubleshooting

**"GROK_API_KEY not set" error**  
→ Railway Variables tab, make sure the key is there and redeploy.

**"Session not found" after creating a group**  
→ Usually a CORS issue. Check `ALLOWED_ORIGINS` exactly matches your Vercel URL (include `https://`).

**WebSocket doesn't connect (no real-time updates)**  
→ Railway supports WebSocket natively. Check that your `NEXT_PUBLIC_API_URL` uses `https://` (the frontend automatically converts it to `wss://`). Don't use `http://` for production.

**"MongoDB connection refused"**  
→ Atlas Network Access — make sure 0.0.0.0/0 is whitelisted. Also double-check the URI has the correct user/password.

**Frontend shows a blank page**  
→ Check Vercel build logs. Usually a TypeScript error or missing env var. Run `npm run build` locally first to catch it.

**"Image too large" error**  
→ Receipt photos must be under 10 MB. If using HEIC from iPhone, enable "Most Compatible" in Camera settings (Settings → Camera → Format → Most Compatible) to get JPEG.

---

## Keeping it running

- **Railway** free tier: 500 hours/month compute. For a side project this is plenty.  
  If you exceed it, the $5/month Hobby plan is the next tier.
- **Vercel** free tier: 100 GB bandwidth + unlimited personal projects.
- **Atlas M0**: Free forever, 512 MB storage. Sessions are small — you'd need tens of thousands before hitting the limit.

Old sessions are never deleted automatically. To clean up:
```python
# Run once from the backend/ directory
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
client = AsyncIOMotorClient("YOUR_MONGODB_URI")
db = client["splitreceipt"]
asyncio.run(db.sessions.delete_many({}))  # nuclear option
```
Or add a TTL index in Atlas: Sessions collection → Indexes → Add TTL on `created_at` field (e.g. 7 days = 604800 seconds).
