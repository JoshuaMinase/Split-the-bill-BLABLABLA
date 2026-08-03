# 🤖 SplitReceipt — Multi-AI Orchestration System

Kiro-CLI acts as your **Project Manager**. You give it a goal. It decomposes
it into tasks, routes each task to the right agent (Gemini, Devin, OpenCode,
or KiloCode), reviews the output, retries failures, and keeps a shared memory
so every agent knows what's going on.

---

## Quick Start

```bat
:: From the project root:
run_orchestrator.bat
```

That launches the interactive mode. Type any goal:

```
🎯 Goal > Add unit tests for calculations.py
🎯 Goal > Deploy the backend to Railway
🎯 Goal > Research the best way to add dark mode to Next.js
```

---

## Three Modes

### 1. Interactive (default)
```bat
run_orchestrator.bat
```
Type goals in real-time. Best for active development sessions.

### 2. Background Daemon (watch mode)
```bat
run_orchestrator.bat --watch
```
The orchestrator runs silently in a background terminal. To send it tasks from
any other terminal, just write a file:

```bat
echo Add rate limiting to the FastAPI backend > .ai\memory\new_task.md
```
The daemon picks it up within 5 seconds, runs it, and logs the result.

**This is the "I write loops" pattern** — you write the goal, the loop runs.

### 3. One-Shot
```bat
run_orchestrator.bat --task "Fix all TypeScript errors in the frontend"
```
Runs once and exits. Good for CI/CD pipelines or scripting.

---

## How Agent Routing Works

Kiro reads your goal and automatically picks the best agent:

| Keywords in your goal | Agent assigned |
|----------------------|----------------|
| deploy, vercel, railway, PR, CI/CD, docker | **Devin** |
| research, explain, document, spec, analyze | **Gemini** |
| fix type, rename, refactor, lint, single file | **KiloCode** |
| install, run tests, write, implement, build, scaffold | **OpenCode** |
| anything else | **OpenCode** (default) |

You can override routing by adding the agent name to your goal:
```
🎯 Goal > [gemini] Research the best MongoDB indexing strategy for our schema
🎯 Goal > [devin] Open a PR that adds dark mode
```

---

## File Structure

```
.ai/
├── orchestrator.py       ← Main loop (run this)
├── kiro_pm.py            ← PM brain: routing, decomposition, review
├── .env.example          ← API keys template
├── .env                  ← Your actual keys (gitignored)
│
├── agents/
│   ├── __init__.py
│   ├── base_agent.py     ← Base class + shared utilities
│   ├── gemini_agent.py   ← Gemini CLI + Python SDK fallback
│   ├── devin_agent.py    ← Devin CLI + REST API fallback
│   ├── opencode_agent.py ← OpenCode CLI
│   └── kilocode_agent.py ← KiloCode CLI + VS Code file fallback
│
├── memory/
│   ├── context.md        ← Shared project context (all agents read this)
│   ├── task_queue.md     ← Pending tasks
│   ├── completed.md      ← Done tasks log
│   ├── handoff.md        ← Current agent-to-agent handoff note
│   └── new_task.md       ← Drop a goal here → daemon picks it up
│
├── outputs/
│   └── task-XXXXXX.md   ← Each agent's full output, one file per task
│
└── logs/
    └── session.log       ← Full audit trail of everything
```

---

## Setup

### 1. Copy the .env file and add your keys

```bat
copy .ai\.env.example .ai\.env
```

Then edit `.ai\.env`:

```env
GEMINI_API_KEY=your_key_from_aistudio.google.com
DEVIN_API_KEY=your_key_from_app.devin.ai  (optional)
```

### 2. Make sure the CLI tools are installed and in PATH

| Agent | Install command |
|-------|----------------|
| Gemini CLI | `npm install -g @google/gemini-cli` |
| OpenCode | `npm install -g opencode-ai` |
| KiloCode | Install the VS Code extension |
| Devin | Available at app.devin.ai (or use API key) |

To check which agents are active, run the orchestrator and type `/agents`:
```
🎯 Goal > /agents
```

### 3. Install Python dependencies for the orchestrator

```bat
pip install python-dotenv httpx
```

(The orchestrator's own deps — separate from `backend/requirements.txt`)

---

## Interactive Commands

Inside the orchestrator interactive mode:

| Command | What it does |
|---------|-------------|
| `/agents` | Show which agents are available |
| `/status` | Show task queue + completed tasks |
| `/queue` | Same as /status |
| `/help` | Show help |
| `/quit` | Exit |

---

## How to Add a New Agent

1. Create `.ai/agents/my_agent.py` inheriting from `BaseAgent`
2. Implement `run(self, task: dict) -> AgentResult`
3. Add it to `.ai/agents/__init__.py`
4. Register it in `orchestrator.py`'s `build_agents()` dict
5. Add routing keywords in `kiro_pm.py`'s `ROUTING_RULES`

---

## The Loop Pattern (what "I write loops" means)

Instead of manually prompting each AI one by one:

```
Old way:  you → ask Gemini → read output → ask Kiro → read output → ask Devin → ...
New way:  you → write goal → orchestrator handles everything → you get result
```

The orchestrator is your loop. You just write the exit condition (the goal),
and let the agents iterate until it's done.

---

## Troubleshooting

**Agent shows "not configured"**
→ Install the CLI tool or set the API key in `.ai\.env`

**Task fails and gets reassigned**
→ Normal. Kiro PM detects failure signals in output and tries a different agent.
  Check `.ai\logs\session.log` for details.

**KiloCode not running**
→ KiloCode is VS Code-only. The fallback writes `.ai\kilocode_task.md` — open it
  in VS Code and the extension will pick it up.

**Devin API times out**
→ Devin sessions can take up to 30 minutes. The wrapper polls every 15s.
  Check `.ai\outputs\<task-id>.md` for the partial result.
