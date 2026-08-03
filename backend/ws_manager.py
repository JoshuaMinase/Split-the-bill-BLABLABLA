"""
Tracks active WebSocket connections per session token and broadcasts
JSON state updates to every connected client in that session.

Used for real-time claiming: when one person taps an item, everyone
else's screen updates instantly without any polling.
"""
from collections import defaultdict
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self):
        # token -> set of active WebSocket connections
        self.active: dict[str, set[WebSocket]] = defaultdict(set)

    async def connect(self, token: str, ws: WebSocket):
        await ws.accept()
        self.active[token].add(ws)

    def disconnect(self, token: str, ws: WebSocket):
        if token in self.active:
            self.active[token].discard(ws)
            if not self.active[token]:
                del self.active[token]

    async def broadcast(self, token: str, message: dict):
        """Send message to all clients in the session. Silently drops dead connections."""
        dead: list[WebSocket] = []
        for ws in list(self.active.get(token, set())):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(token, ws)


# Singleton — imported by main.py
manager = ConnectionManager()
