"""
Agent package — exports all agent wrappers.
Import this in orchestrator.py to get all agents.
"""
from .base_agent import BaseAgent, AgentResult
from .gemini_agent import GeminiAgent
from .devin_agent import DevinAgent
from .opencode_agent import OpenCodeAgent
from .kilocode_agent import KiloCodeAgent

__all__ = [
    "BaseAgent",
    "AgentResult",
    "GeminiAgent",
    "DevinAgent",
    "OpenCodeAgent",
    "KiloCodeAgent",
]
