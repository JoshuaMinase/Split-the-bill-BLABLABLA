# Handoff Instructions

This file is written by one agent to pass context to the next.
Each agent should READ this before starting work, then OVERWRITE it with
their own handoff when they finish.

## Current Handoff
**From**: Kiro (PM)
**To**: All agents
**Date**: 2026-08-03

### Context
Project is SplitReceipt. Backend and frontend are complete.
Orchestration system just built. Ready to accept new tasks.

### What was just done
- Built full backend (FastAPI + MongoDB + Grok OCR + WebSockets)
- Built full frontend (Next.js 14 + Tailwind)
- Created this orchestration system

### What's next
- Add unit tests for calculations.py
- Add error boundary to frontend
- Deploy to Railway (backend) + Vercel (frontend)

### Important notes
- Backend runs on: http://localhost:8000
- Frontend runs on: http://localhost:3000
- MongoDB: local mongod or Atlas M0
- Grok API key required in backend/.env
