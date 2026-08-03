"""
kiro_pm.py — Kiro Project Manager Brain

This is the decision layer. It:
  1. Accepts a high-level goal from the user
  2. Decomposes it into tasks
  3. Routes each task to the right agent
  4. Reviews outputs and decides next steps
  5. Updates the shared memory files

Routing rules (edit these to match your preferences):
  - gemini   → research, specs, docs, large context reading
  - devin    → autonomous long tasks, PRs, deploy, full feature builds
  - opencode → terminal tasks, file edits, shell automation, quick code
  - kilocode → inline edits, type fixes, single-file refactors
  - kiro     → architecture decisions, code review, planning (stays here)
"""
import json
import logging
import re
import time
import uuid
from pathlib import Path

logger = logging.getLogger("orchestrator.pm")

AI_DIR = Path(__file__).resolve().parent
MEMORY_DIR = AI_DIR / "memory"
OUTPUTS_DIR = AI_DIR / "outputs"


# ─── Routing Rules ────────────────────────────────────────────────────────────

# Keywords that suggest which agent should handle a task
ROUTING_RULES: list[tuple[list[str], str]] = [
    # Devin: long-running autonomous, git, deploy, CI
    (["deploy", "production", "vercel", "railway", "ci", "cd", "github actions",
      "pull request", "pr", "merge", "pipeline", "docker"], "devin"),

    # Gemini: research, reading, documentation, analysis
    (["research", "explain", "document", "spec", "design doc", "analyze",
      "summarize", "review docs", "read the", "what is", "how does",
      "find out", "investigate", "explore"], "gemini"),

    # KiloCode: small targeted edits, type fixes, single file
    (["fix type", "rename", "refactor", "lint", "format", "single file",
      "inline", "autocomplete", "quick fix", "typo", "import"], "kilocode"),

    # OpenCode: terminal tasks, multi-file edits, automation
    (["install", "run tests", "fix tests", "create file", "write script",
      "automate", "shell", "terminal", "bash", "generate", "scaffold",
      "implement", "build", "add feature", "create endpoint", "write"], "opencode"),
]

DEFAULT_AGENT = "opencode"  # fallback if no keywords match


def route_task(task: dict) -> str:
    """
    Determine which agent should handle a task based on its description.
    Returns the agent name string.
    """
    # Explicit assignment overrides routing
    if task.get("assigned_to") and task["assigned_to"] != "auto":
        return task["assigned_to"]

    text = (task.get("title", "") + " " + task.get("description", "")).lower()

    for keywords, agent in ROUTING_RULES:
        if any(kw in text for kw in keywords):
            logger.debug(f"Routed '{task.get('title')}' → {agent}")
            return agent

    logger.debug(f"No routing match for '{task.get('title')}', using default: {DEFAULT_AGENT}")
    return DEFAULT_AGENT


# ─── Task Decomposition ───────────────────────────────────────────────────────

def decompose_goal(goal: str) -> list[dict]:
    """
    Break a high-level goal into a list of tasks.
    This is a rule-based decomposer. For smarter decomposition,
    replace with a call to an LLM API.

    Returns a list of task dicts:
      [{"id": str, "title": str, "description": str, "assigned_to": str, "priority": str}]
    """
    tasks = []

    # If the goal contains "and" or newlines, split it into sub-tasks
    raw_parts = re.split(r"\n+|(?:\s+and\s+)", goal, flags=re.IGNORECASE)
    parts = [p.strip() for p in raw_parts if p.strip()]

    if len(parts) == 1:
        # Single task
        task = _make_task(goal, goal, "high")
        task["assigned_to"] = route_task(task)
        tasks.append(task)
    else:
        # Multiple sub-tasks
        for i, part in enumerate(parts):
            priority = "high" if i == 0 else "medium"
            task = _make_task(part, part, priority)
            task["assigned_to"] = route_task(task)
            tasks.append(task)

    return tasks


def _make_task(title: str, description: str, priority: str = "medium") -> dict:
    return {
        "id": f"task-{uuid.uuid4().hex[:6]}",
        "title": title[:80],
        "description": description,
        "assigned_to": "auto",
        "priority": priority,
        "status": "pending",
        "created_at": time.strftime("%Y-%m-%d %H:%M"),
    }


# ─── Memory Management ────────────────────────────────────────────────────────

def update_task_queue(tasks: list[dict]):
    """Append tasks to .ai/memory/task_queue.md"""
    MEMORY_DIR.mkdir(parents=True, exist_ok=True)
    queue_file = MEMORY_DIR / "task_queue.md"

    existing = queue_file.read_text(encoding="utf-8") if queue_file.exists() else ""
    new_entries = ""
    for t in tasks:
        new_entries += f"""
[{t['id']}] {t['title']}
status: {t['status']}
assigned_to: {t['assigned_to']}
priority: {t['priority']}
description: {t['description']}
output_file: .ai/outputs/{t['id']}.md
created_at: {t['created_at']}
updated_at: {t['created_at']}

---
"""
    queue_file.write_text(existing.rstrip() + "\n" + new_entries, encoding="utf-8")


def mark_task_complete(task: dict, output_summary: str):
    """Move a task from task_queue.md to completed.md"""
    completed_file = MEMORY_DIR / "completed.md"
    entry = (
        f"[{task['id']}] {task['title']} — {task['assigned_to']} — "
        f"{time.strftime('%Y-%m-%d %H:%M')}\n"
        f"  Summary: {output_summary[:200]}\n\n"
    )
    with open(completed_file, "a", encoding="utf-8") as f:
        f.write(entry)


def write_handoff(from_agent: str, to_agent: str, context: str, next_steps: str):
    """Update handoff.md so the next agent knows what to do."""
    handoff_file = MEMORY_DIR / "handoff.md"
    content = f"""# Handoff Instructions

## Current Handoff
**From**: {from_agent}
**To**: {to_agent}
**Date**: {time.strftime("%Y-%m-%d %H:%M")}

### Context
{context}

### Next Steps
{next_steps}
"""
    handoff_file.write_text(content, encoding="utf-8")


# ─── PM Decision Loop (single round) ─────────────────────────────────────────

def pm_review(task: dict, agent_output: str) -> dict:
    """
    After an agent completes a task, Kiro reviews the output and decides:
      - "done"   → task succeeded, move on
      - "retry"  → output is incomplete, try again with same agent
      - "reassign" → try a different agent
      - "escalate" → needs human input

    This is currently rule-based. For smarter review, call Kiro CLI API here.
    Returns {"decision": str, "reason": str, "new_agent": str | None}
    """
    output_lower = agent_output.lower()

    # Signals of failure
    failure_signals = [
        "not found", "command not found", "error:", "failed", "exception",
        "traceback", "timed out", "not installed", "not available",
        "cannot", "could not", "unable to",
    ]

    success_signals = [
        "done", "complete", "created", "updated", "fixed", "passed",
        "success", "implemented", "added", "wrote", "finished",
    ]

    failure_count = sum(1 for s in failure_signals if s in output_lower)
    success_count = sum(1 for s in success_signals if s in output_lower)

    if failure_count > success_count:
        # Try a different agent
        current = task.get("assigned_to", DEFAULT_AGENT)
        fallback_map = {
            "opencode": "kilocode",
            "kilocode": "opencode",
            "gemini": "opencode",
            "devin": "opencode",
        }
        new_agent = fallback_map.get(current, DEFAULT_AGENT)
        return {
            "decision": "reassign",
            "reason": f"Output suggests failure (failure signals: {failure_count})",
            "new_agent": new_agent,
        }

    return {
        "decision": "done",
        "reason": "Output looks successful",
        "new_agent": None,
    }
