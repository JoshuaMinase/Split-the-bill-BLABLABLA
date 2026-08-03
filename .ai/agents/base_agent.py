"""
Base class for all agent wrappers.
Every agent wrapper must inherit from BaseAgent and implement run().
"""
import abc
import logging
import subprocess
import time
from pathlib import Path

logger = logging.getLogger("orchestrator.agents")

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent  # Reciept/
AI_DIR = PROJECT_ROOT / ".ai"
MEMORY_DIR = AI_DIR / "memory"
OUTPUTS_DIR = AI_DIR / "outputs"
LOGS_DIR = AI_DIR / "logs"


class AgentResult:
    """Returned by every agent.run() call."""
    def __init__(self, success: bool, output: str, agent_name: str, task_id: str):
        self.success = success
        self.output = output
        self.agent_name = agent_name
        self.task_id = task_id
        self.timestamp = time.time()

    def save(self):
        """Write output to .ai/outputs/<task_id>.md"""
        OUTPUTS_DIR.mkdir(parents=True, exist_ok=True)
        out_file = OUTPUTS_DIR / f"{self.task_id}.md"
        content = f"""# Task {self.task_id} — Output from {self.agent_name}
Status: {"SUCCESS" if self.success else "FAILED"}
Timestamp: {time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(self.timestamp))}

## Output
{self.output}
"""
        out_file.write_text(content, encoding="utf-8")
        logger.info(f"[{self.agent_name}] Output saved to {out_file}")
        return out_file


class BaseAgent(abc.ABC):
    name: str = "base"

    def _run_command(self, cmd: list[str], cwd: str | None = None, timeout: int = 300) -> tuple[bool, str]:
        """
        Execute a CLI command and return (success, output).
        Captures both stdout and stderr.
        """
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                cwd=cwd or str(PROJECT_ROOT),
                timeout=timeout,
                encoding="utf-8",
                errors="replace",
            )
            combined = result.stdout + ("\n" + result.stderr if result.stderr else "")
            return result.returncode == 0, combined.strip()
        except subprocess.TimeoutExpired:
            return False, f"Command timed out after {timeout}s"
        except FileNotFoundError as e:
            return False, f"Command not found: {e}. Is the tool installed and in PATH?"
        except Exception as e:
            return False, f"Unexpected error running command: {e}"

    def _build_full_prompt(self, task: dict) -> str:
        """
        Build a context-rich prompt by prepending shared memory files.
        Every agent gets the same project context before its task.
        """
        context = ""
        for fname in ["context.md", "handoff.md"]:
            fpath = MEMORY_DIR / fname
            if fpath.exists():
                context += f"\n\n---\n### {fname}\n{fpath.read_text(encoding='utf-8')}"

        return (
            f"You are working on the SplitReceipt project.\n"
            f"Project root: {PROJECT_ROOT}\n"
            f"{context}\n\n"
            f"---\n"
            f"## Your Task (ID: {task.get('id', 'N/A')})\n"
            f"{task.get('description', task.get('title', ''))}\n\n"
            f"When done, summarize exactly what you changed and why."
        )

    @abc.abstractmethod
    def run(self, task: dict) -> AgentResult:
        """Execute the task and return an AgentResult."""
        ...

    def __repr__(self):
        return f"<Agent:{self.name}>"
