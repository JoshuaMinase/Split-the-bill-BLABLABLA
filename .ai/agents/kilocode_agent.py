"""
KiloCode agent wrapper.

KiloCode is primarily a VS Code extension but also has a CLI interface.
CLI: `kilocode run "task"` or invoked via its VS Code extension API.

Since KiloCode is mainly editor-side, this wrapper:
  1. Tries the CLI if available
  2. Falls back to writing a task file that KiloCode can pick up
     (KiloCode can be configured to watch .ai/kilocode_task.md)

Best for:
  - Fast in-editor code completions
  - Inline refactoring
  - Fixing type errors and linter warnings
  - Small, targeted single-file edits
"""
import shutil
import logging
from pathlib import Path
from .base_agent import BaseAgent, AgentResult, AI_DIR

logger = logging.getLogger("orchestrator.agents.kilocode")

KILOCODE_TASK_FILE = AI_DIR / "kilocode_task.md"
KILOCODE_RESULT_FILE = AI_DIR / "kilocode_result.md"


class KiloCodeAgent(BaseAgent):
    name = "kilocode"

    CLI_VARIANTS = [
        ["kilocode", "run"],
        ["kilo", "run"],
        ["kilocode", "--task"],
    ]

    def run(self, task: dict) -> AgentResult:
        task_id = task.get("id", "kilocode-task")
        prompt = self._build_full_prompt(task)

        # Try CLI first
        for variant in self.CLI_VARIANTS:
            if shutil.which(variant[0]):
                logger.info(f"[KiloCode] Running via CLI: {variant[0]}")
                success, output = self._run_command(
                    variant + [prompt],
                    timeout=180,
                )
                result = AgentResult(success=success, output=output, agent_name=self.name, task_id=task_id)
                result.save()
                return result

        # Fallback: write a task file for KiloCode to pick up
        logger.info("[KiloCode] CLI not found — writing task file for VS Code extension pickup")
        success, output = self._write_task_file(task_id, prompt)

        result = AgentResult(success=success, output=output, agent_name=self.name, task_id=task_id)
        result.save()
        return result

    def _write_task_file(self, task_id: str, prompt: str) -> tuple[bool, str]:
        """
        Write the task to .ai/kilocode_task.md.
        KiloCode VS Code extension can be configured to watch this file.
        Then poll for .ai/kilocode_result.md (written by the extension when done).
        """
        import time

        AI_DIR.mkdir(parents=True, exist_ok=True)
        KILOCODE_TASK_FILE.write_text(
            f"# KiloCode Task: {task_id}\n\n{prompt}\n",
            encoding="utf-8",
        )
        logger.info(f"[KiloCode] Task written to {KILOCODE_TASK_FILE}")

        # Poll for result (VS Code extension writes this when done)
        deadline = time.time() + 120  # 2 minutes
        while time.time() < deadline:
            time.sleep(3)
            if KILOCODE_RESULT_FILE.exists():
                result_text = KILOCODE_RESULT_FILE.read_text(encoding="utf-8")
                KILOCODE_RESULT_FILE.unlink()  # consume it
                return True, result_text

        return False, (
            "KiloCode CLI not found in PATH and no result received within 2 minutes.\n\n"
            f"Task was written to: {KILOCODE_TASK_FILE}\n\n"
            "To use KiloCode:\n"
            "  Option A: Install KiloCode CLI (check https://kilocode.ai)\n"
            "  Option B: Open the task file in VS Code and let the extension handle it\n"
            "  Option C: Assign this task to a different agent in kiro_pm.py"
        )
