"""
Gemini agent wrapper.

Calls Gemini CLI: `gemini "prompt"` or `gemini --prompt "..."` depending
on which variant you have installed. Handles both.

Install: https://github.com/google-gemini/gemini-cli
         npm install -g @google/gemini-cli
         or: pip install google-generativeai (Python SDK, used as fallback)

Best for:
  - Research and documentation
  - Large context window analysis (reading many files at once)
  - Writing specs and design docs
  - Explaining complex topics
"""
import os
import logging
from .base_agent import BaseAgent, AgentResult

logger = logging.getLogger("orchestrator.agents.gemini")


class GeminiAgent(BaseAgent):
    name = "gemini"

    # Confirmed CLI flags from gemini --help:
    #   gemini -p "prompt"   → non-interactive (headless) mode
    #   gemini --prompt "prompt"  → same thing
    CLI_VARIANTS = [
        ["gemini", "-p"],           # gemini -p "prompt"  (confirmed working)
        ["gemini", "--prompt"],     # gemini --prompt "prompt"
        ["gemini-cli", "-p"],       # alternative binary name
    ]

    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or os.environ.get("GEMINI_API_KEY", "")

    def _find_cli(self) -> list[str] | None:
        """Return the working CLI command prefix, or None if not found."""
        import shutil
        for variant in self.CLI_VARIANTS:
            if shutil.which(variant[0]):
                return variant
        return None

    def run(self, task: dict) -> AgentResult:
        task_id = task.get("id", "gemini-task")
        prompt = self._build_full_prompt(task)

        cli = self._find_cli()

        if cli:
            logger.info(f"[Gemini] Running via CLI: {' '.join(cli)}")
            # Use -p for non-interactive headless mode (confirmed from gemini --help)
            # --yolo auto-approves any tool calls Gemini wants to make
            success, output = self._run_command(
                cli + [prompt, "--yolo"],
                timeout=120,
            )
        else:
            # Fallback: Python SDK
            logger.info("[Gemini] CLI not found, falling back to Python SDK")
            success, output = self._run_via_sdk(prompt)

        result = AgentResult(success=success, output=output, agent_name=self.name, task_id=task_id)
        result.save()
        return result

    def _run_via_sdk(self, prompt: str) -> tuple[bool, str]:
        """Use google-generativeai Python SDK as a fallback."""
        try:
            import google.generativeai as genai  # type: ignore
        except ImportError:
            return False, (
                "Gemini CLI not found and google-generativeai SDK not installed.\n"
                "Install either:\n"
                "  npm install -g @google/gemini-cli\n"
                "  OR: pip install google-generativeai"
            )

        if not self.api_key:
            return False, "GEMINI_API_KEY not set. Add it to .ai/.env or set as environment variable."

        try:
            genai.configure(api_key=self.api_key)
            model = genai.GenerativeModel("gemini-2.0-flash")
            response = model.generate_content(prompt)
            return True, response.text
        except Exception as e:
            return False, f"Gemini SDK error: {e}"
