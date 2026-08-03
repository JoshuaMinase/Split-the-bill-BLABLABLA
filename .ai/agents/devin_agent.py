"""
Devin agent wrapper.

Devin's CLI is invoked as: `devin run "task description"` or via their API.
Since Devin is primarily a web/API-based tool, this wrapper supports:
  1. Devin CLI (if installed: `devin`)
  2. Devin API via HTTP (set DEVIN_API_KEY + DEVIN_SESSION_ID in .ai/.env)

Best for:
  - Long-running autonomous tasks (30+ min)
  - Full feature implementation end-to-end
  - Opening PRs and managing git workflows
  - Running test suites and fixing failures
  - CI/CD pipeline tasks
"""
import os
import logging
import time
import shutil
from .base_agent import BaseAgent, AgentResult

logger = logging.getLogger("orchestrator.agents.devin")

DEVIN_API_BASE = "https://api.cognition.ai/v1"


class DevinAgent(BaseAgent):
    name = "devin"

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or os.environ.get("DEVIN_API_KEY", "")

    def run(self, task: dict) -> AgentResult:
        task_id = task.get("id", "devin-task")
        prompt = self._build_full_prompt(task)

        if shutil.which("devin"):
            logger.info("[Devin] Running via CLI")
            success, output = self._run_cli(prompt)
        elif self.api_key:
            logger.info("[Devin] Running via API")
            success, output = self._run_via_api(task.get("title", task.get("description", "")), prompt)
        else:
            success = False
            output = self._not_available_message()

        result = AgentResult(success=success, output=output, agent_name=self.name, task_id=task_id)
        result.save()
        return result

    def _run_cli(self, prompt: str) -> tuple[bool, str]:
        """Run Devin via its CLI tool.
        Confirmed flags from devin --help:
          devin -p "prompt"           → non-interactive, print and exit
          --permission-mode auto      → auto-approves read-only tools
        """
        return self._run_command(
            ["devin", "-p", prompt, "--permission-mode", "auto"],
            timeout=600,
        )

    def _run_via_api(self, title: str, prompt: str) -> tuple[bool, str]:
        """
        Start a Devin session via API, poll until done, return result.
        Devin API docs: https://docs.devin.ai/api
        """
        try:
            import httpx
        except ImportError:
            return False, "httpx not installed. Run: pip install httpx"

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        # 1. Create session
        try:
            with httpx.Client(timeout=30) as client:
                resp = client.post(
                    f"{DEVIN_API_BASE}/sessions",
                    headers=headers,
                    json={"prompt": prompt},
                )
                resp.raise_for_status()
                session_data = resp.json()
                session_id = session_data.get("session_id") or session_data.get("id")
        except Exception as e:
            return False, f"Failed to create Devin session: {e}"

        logger.info(f"[Devin] Session created: {session_id}")

        # 2. Poll until done (max 30 min)
        deadline = time.time() + 1800
        while time.time() < deadline:
            time.sleep(15)
            try:
                with httpx.Client(timeout=30) as client:
                    resp = client.get(
                        f"{DEVIN_API_BASE}/sessions/{session_id}",
                        headers=headers,
                    )
                    resp.raise_for_status()
                    data = resp.json()

                status = data.get("status", "running")
                logger.info(f"[Devin] Session {session_id} status: {status}")

                if status in ("finished", "completed", "done"):
                    output = data.get("output") or data.get("result") or str(data)
                    return True, output
                elif status in ("failed", "error", "stopped"):
                    return False, f"Devin session failed: {data.get('error', str(data))}"
                # still running — keep polling

            except Exception as e:
                logger.warning(f"[Devin] Poll error (will retry): {e}")

        return False, f"Devin session {session_id} timed out after 30 minutes."

    def _not_available_message(self) -> str:
        return (
            "Devin is not available:\n"
            "  - CLI 'devin' not found in PATH\n"
            "  - DEVIN_API_KEY not set\n\n"
            "To use Devin:\n"
            "  Option A: Install Devin CLI (if you have access)\n"
            "  Option B: Set DEVIN_API_KEY in .ai/.env\n"
            "            Get a key at: https://app.devin.ai/settings/api"
        )
