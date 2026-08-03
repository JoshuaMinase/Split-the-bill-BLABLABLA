"""
orchestrator.py — Multi-AI Orchestration Background Service

This is the main loop. Run it once and it stays alive, accepting tasks
from you (via CLI or the task queue file) and dispatching them to the
right agents: Devin, OpenCode, KiloCode, or Gemini.

Kiro acts as the Project Manager — it routes tasks, reviews outputs,
retries failures, and keeps shared memory updated.

Usage:
  python .ai/orchestrator.py                    # interactive mode
  python .ai/orchestrator.py --task "do X"      # one-shot task
  python .ai/orchestrator.py --file task.md     # load task from file
  python .ai/orchestrator.py --watch            # background daemon

Architecture:
  You → orchestrator (PM loop) → agents → output files → PM review → done
"""
import argparse
import logging
import os
import sys
import time
from pathlib import Path
from queue import Queue
from threading import Thread

# ── Path setup ────────────────────────────────────────────────────────────────
AI_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = AI_DIR.parent
sys.path.insert(0, str(AI_DIR))

from agents import GeminiAgent, DevinAgent, OpenCodeAgent, KiloCodeAgent
from kiro_pm import (
    decompose_goal,
    route_task,
    update_task_queue,
    mark_task_complete,
    write_handoff,
    pm_review,
    MEMORY_DIR,
)

# ── Logging ───────────────────────────────────────────────────────────────────
LOGS_DIR = AI_DIR / "logs"
LOGS_DIR.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(LOGS_DIR / "session.log", encoding="utf-8"),
    ],
)
logger = logging.getLogger("orchestrator")

# ── Load .ai/.env if present ──────────────────────────────────────────────────
env_file = AI_DIR / ".env"
if env_file.exists():
    from dotenv import load_dotenv
    load_dotenv(env_file)
    logger.info(f"Loaded environment from {env_file}")


# ─── Agent Registry ───────────────────────────────────────────────────────────

def build_agents() -> dict:
    """Build the agent registry. Each agent is a singleton."""
    return {
        "gemini":   GeminiAgent(api_key=os.environ.get("GEMINI_API_KEY")),
        "devin":    DevinAgent(api_key=os.environ.get("DEVIN_API_KEY")),
        "opencode": OpenCodeAgent(),
        "kilocode": KiloCodeAgent(),
    }


# ─── Task Execution ───────────────────────────────────────────────────────────

MAX_RETRIES = 2


def execute_task(task: dict, agents: dict) -> bool:
    """
    Execute a single task. Returns True on success.
    Handles routing, execution, PM review, and retry logic.
    """
    agent_name = task.get("assigned_to", "opencode")
    agent = agents.get(agent_name)

    if not agent:
        logger.error(f"Unknown agent: {agent_name}. Falling back to opencode.")
        agent = agents["opencode"]
        agent_name = "opencode"

    attempts = 0
    while attempts <= MAX_RETRIES:
        attempts += 1
        logger.info(
            f"▶ [{agent_name.upper()}] Task: {task['title']!r} "
            f"(attempt {attempts}/{MAX_RETRIES + 1})"
        )

        result = agent.run(task)

        logger.info(
            f"{'✅' if result.success else '❌'} [{agent_name.upper()}] "
            f"Task: {task['title']!r} — {'Success' if result.success else 'Failed'}"
        )

        # PM reviews the output
        review = pm_review(task, result.output)
        logger.info(f"🧠 [PM] Review decision: {review['decision']} — {review['reason']}")

        if review["decision"] == "done":
            mark_task_complete(task, result.output[:200])
            write_handoff(
                from_agent=agent_name,
                to_agent="kiro",
                context=f"Completed: {task['title']}",
                next_steps="Review the output and assign next task.",
            )
            _print_summary(task, agent_name, result.output, success=True)
            return True

        elif review["decision"] == "reassign" and attempts <= MAX_RETRIES:
            new_agent_name = review.get("new_agent", "opencode")
            logger.info(f"🔄 [PM] Reassigning to {new_agent_name.upper()}...")
            agent = agents.get(new_agent_name, agents["opencode"])
            agent_name = new_agent_name
            task["assigned_to"] = new_agent_name

        elif review["decision"] == "retry" and attempts <= MAX_RETRIES:
            logger.info(f"🔁 [PM] Retrying with same agent...")
            time.sleep(2)

        else:
            # escalate or max retries hit
            logger.warning(f"⚠️  [PM] Task failed after {attempts} attempts: {task['title']!r}")
            _print_summary(task, agent_name, result.output, success=False)
            return False

    return False


def _print_summary(task: dict, agent: str, output: str, success: bool):
    """Print a clean summary box to the terminal."""
    status = "✅ DONE" if success else "❌ FAILED"
    border = "─" * 60
    print(f"\n{border}")
    print(f"  {status}  [{agent.upper()}]  {task['title']}")
    print(border)
    # Print first 500 chars of output
    preview = output[:500].strip()
    if preview:
        print(preview)
        if len(output) > 500:
            print(f"  ... [{len(output) - 500} more chars — see .ai/outputs/{task['id']}.md]")
    print(border + "\n")


# ─── Orchestrator Loop ─────────────────────────────────────────────────────────

def run_goal(goal: str, agents: dict):
    """Decompose a goal into tasks and execute them sequentially."""
    logger.info(f"🎯 [PM] New goal: {goal!r}")

    tasks = decompose_goal(goal)
    update_task_queue(tasks)

    logger.info(f"📋 [PM] Decomposed into {len(tasks)} task(s):")
    for i, t in enumerate(tasks, 1):
        logger.info(f"   {i}. [{t['assigned_to'].upper()}] {t['title']}")

    successes = 0
    for task in tasks:
        ok = execute_task(task, agents)
        if ok:
            successes += 1
        else:
            # Ask user if we should continue after a failure
            answer = _prompt_user(
                f"\nTask '{task['title']}' failed. Continue with remaining tasks? [y/N]: "
            )
            if answer.lower() not in ("y", "yes"):
                logger.info("[PM] Stopping due to user request.")
                break

    print(f"\n🏁 Completed {successes}/{len(tasks)} tasks.")


def _prompt_user(message: str) -> str:
    """Safe input() that returns 'n' if stdin is not a TTY (daemon mode)."""
    try:
        if sys.stdin.isatty():
            return input(message)
    except Exception:
        pass
    return "n"


# ─── Watch Mode (background daemon) ──────────────────────────────────────────

WATCH_FILE = MEMORY_DIR / "new_task.md"
WATCH_INTERVAL = 5  # seconds


def watch_for_tasks(agents: dict):
    """
    Background daemon mode.
    Watches .ai/memory/new_task.md — when you write a task to that file,
    the orchestrator picks it up, runs it, then deletes the file.

    This is how you talk to the orchestrator from another terminal:
      echo "Add unit tests for calculations.py" > .ai/memory/new_task.md
    """
    MEMORY_DIR.mkdir(parents=True, exist_ok=True)
    logger.info(f"👀 [PM] Watching for tasks in {WATCH_FILE}")
    logger.info("   Write a goal to that file and I'll pick it up automatically.")
    logger.info("   Press Ctrl+C to stop.\n")

    while True:
        if WATCH_FILE.exists():
            goal = WATCH_FILE.read_text(encoding="utf-8").strip()
            if goal:
                logger.info(f"📥 [PM] New task detected: {goal[:80]!r}")
                WATCH_FILE.unlink()  # consume it
                run_goal(goal, agents)
        time.sleep(WATCH_INTERVAL)


# ─── Interactive Mode ─────────────────────────────────────────────────────────

BANNER = """
╔══════════════════════════════════════════════════════════════╗
║      🤖  SplitReceipt Multi-AI Orchestrator                  ║
║      Kiro-CLI acting as Project Manager                       ║
║                                                              ║
║  Agents: Gemini · Devin · OpenCode · KiloCode                ║
║  Type a goal and I'll route it to the right agent.           ║
║  Commands: /status  /queue  /agents  /help  /quit            ║
╚══════════════════════════════════════════════════════════════╝
"""


def show_status():
    """Print current task queue and completed tasks."""
    queue_file = MEMORY_DIR / "task_queue.md"
    completed_file = MEMORY_DIR / "completed.md"

    print("\n─── Task Queue ───────────────────────────────")
    if queue_file.exists():
        print(queue_file.read_text(encoding="utf-8")[:1000])
    else:
        print("  (empty)")

    print("\n─── Completed ────────────────────────────────")
    if completed_file.exists():
        content = completed_file.read_text(encoding="utf-8")
        lines = [l for l in content.splitlines() if l.strip() and not l.startswith("#")]
        print("\n".join(lines[-10:]) or "  (none yet)")
    print()


def show_agents(agents: dict):
    """Print agent status."""
    import shutil
    print("\n─── Agent Status ─────────────────────────────")
    cli_map = {
        "gemini":   ["gemini", "gemini-cli"],
        "devin":    ["devin"],
        "opencode": ["opencode"],
        "kilocode": ["kilocode", "kilo"],
    }
    for name, agent in agents.items():
        clis = cli_map.get(name, [name])
        found = any(shutil.which(c) for c in clis)
        has_key = bool(os.environ.get(f"{name.upper()}_API_KEY", ""))
        if found:
            status = "✅ CLI available"
        elif has_key:
            status = "🔑 API key set (no CLI)"
        else:
            status = "⚠️  not configured"
        print(f"  {name:<12} {status}")
    print()


def interactive_mode(agents: dict):
    """Run the orchestrator in interactive terminal mode."""
    print(BANNER)
    show_agents(agents)

    while True:
        try:
            goal = input("🎯 Goal > ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\nGoodbye!")
            break

        if not goal:
            continue

        if goal.startswith("/"):
            cmd = goal.lower().split()[0]
            if cmd == "/quit" or cmd == "/exit":
                print("Goodbye!")
                break
            elif cmd == "/status":
                show_status()
            elif cmd == "/queue":
                show_status()
            elif cmd == "/agents":
                show_agents(agents)
            elif cmd == "/help":
                print("\nCommands:")
                print("  /status   — show task queue and completed tasks")
                print("  /agents   — show agent availability")
                print("  /queue    — same as /status")
                print("  /quit     — exit\n")
                print("Or just type any goal and I'll route it to the right agent.\n")
            else:
                print(f"Unknown command: {cmd}. Type /help for available commands.")
        else:
            run_goal(goal, agents)


# ─── Entry Point ──────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="SplitReceipt Multi-AI Orchestrator — Kiro as PM"
    )
    parser.add_argument("--task", "-t", help="One-shot task to run immediately")
    parser.add_argument("--file", "-f", help="Load task from a text/markdown file")
    parser.add_argument(
        "--watch", "-w",
        action="store_true",
        help=f"Daemon mode: watch {WATCH_FILE} for tasks",
    )
    args = parser.parse_args()

    agents = build_agents()

    if args.task:
        run_goal(args.task, agents)
    elif args.file:
        task_file = Path(args.file)
        if not task_file.exists():
            print(f"File not found: {task_file}")
            sys.exit(1)
        goal = task_file.read_text(encoding="utf-8").strip()
        run_goal(goal, agents)
    elif args.watch:
        watch_for_tasks(agents)
    else:
        interactive_mode(agents)


if __name__ == "__main__":
    main()
