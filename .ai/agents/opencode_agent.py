"""
OpenCode agent wrapper.

OpenCode CLI: `opencode run "task"` or `opencode -p "prompt"`
Install: https://opencode.ai  |  npm install -g opencode-ai

Best for:
  - Agentic terminal tasks (read/write/run in sequence)
  - File editing + shell execution loops
  - Quick multi-step automation
  - Code generation with immediate file writes
"""
import shutil
import logging
from .base_agent import BaseAgent, AgentResult

logger = logging.getLogger("orchestrator.agents.opencode")


class OpenCodeAgent(BaseAgent):
    name = "opencode"

    # Confirmed CLI flags from opencode --help:
    #   opencode run "message"   → run with a message (non-interactive)
    #   opencode -p "message"    → not confirmed; run is the correct subcommand
    CLI_VARIANTS = [
        ["opencode", "run"],         # opencode run "prompt"  (confirmed from --help)
        ["opencode", "--print"],     # fallback variant
    ]

    def run(self, task: dict) -> AgentResult:
        task_id = task.get("id", "opencode-task")
        prompt = self._build_full_prompt(task)

        if not shutil.which("opencode"):
            output = (
                "OpenCode CLI not found in PATH.\n"
                "Install: npm install -g opencode-ai\n"
                "Or visit: https://opencode.ai"
            )
            result = AgentResult(success=False, output=output, agent_name=self.name, task_id=task_id)
            result.save()
            return result

        # Try each CLI variant until one works
        success, output = False, ""
        for variant in self.CLI_VARIANTS:
            cmd = variant + [prompt]
            logger.info(f"[OpenCode] Trying: {' '.join(cmd[:3])}...")
            success, output = self._run_command(cmd, timeout=300)
            if success or ("unknown" not in output.lower() and "error" not in output[:50].lower()):
                break

        result = AgentResult(success=success, output=output, agent_name=self.name, task_id=task_id)
        result.save()
        return result
