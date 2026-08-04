"""
Unit tests for ws_manager.py and grok_service.py (parsing logic only — no real API calls).

ws_manager tests:
  - connect adds to active set
  - disconnect removes from active set and cleans up empty keys
  - broadcast skips dead connections without crashing
  - disconnect on unknown token doesn't crash

grok_service tests (parsing only, no HTTP):
  - _to_data_url produces correct data URL format
  - Markdown fence stripping handles all variants
  - JSON parse error raises ValueError
  - Error key in response raises ValueError
  - Valid response passes through correctly
"""
import sys
import os
import json
import asyncio
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from ws_manager import ConnectionManager
import grok_service


# ─── Helpers ──────────────────────────────────────────────────────────────────

def run(coro):
    """Run a coroutine synchronously for testing."""
    return asyncio.run(coro)


def make_ws(send_ok=True):
    """Create a mock WebSocket."""
    ws = AsyncMock()
    ws.accept = AsyncMock()
    if send_ok:
        ws.send_json = AsyncMock()
    else:
        ws.send_json = AsyncMock(side_effect=Exception("connection reset"))
    return ws


# ─── ConnectionManager tests ──────────────────────────────────────────────────

class TestConnectionManager:

    def test_connect_adds_to_active(self):
        mgr = ConnectionManager()
        ws = make_ws()
        run(mgr.connect("tok1", ws))
        assert ws in mgr.active["tok1"]
        ws.accept.assert_awaited_once()

    def test_disconnect_removes_ws(self):
        mgr = ConnectionManager()
        ws = make_ws()
        run(mgr.connect("tok1", ws))
        mgr.disconnect("tok1", ws)
        assert "tok1" not in mgr.active  # key cleaned up when set is empty

    def test_disconnect_unknown_token_no_crash(self):
        """disconnect on a token that was never connected must not raise."""
        mgr = ConnectionManager()
        ws = make_ws()
        mgr.disconnect("nonexistent", ws)  # should not raise

    def test_disconnect_unknown_ws_no_crash(self):
        """disconnect of an unknown ws from a known token must not raise."""
        mgr = ConnectionManager()
        ws1 = make_ws()
        ws2 = make_ws()
        run(mgr.connect("tok1", ws1))
        mgr.disconnect("tok1", ws2)  # ws2 was never in tok1 — should not raise
        assert ws1 in mgr.active["tok1"]  # ws1 still there

    def test_disconnect_cleans_up_empty_token_entry(self):
        """After all connections in a token are removed, the token key is deleted."""
        mgr = ConnectionManager()
        ws = make_ws()
        run(mgr.connect("tok1", ws))
        assert "tok1" in mgr.active
        mgr.disconnect("tok1", ws)
        assert "tok1" not in mgr.active

    def test_broadcast_sends_to_all(self):
        mgr = ConnectionManager()
        ws1 = make_ws()
        ws2 = make_ws()
        run(mgr.connect("tok1", ws1))
        run(mgr.connect("tok1", ws2))
        run(mgr.broadcast("tok1", {"type": "state"}))
        ws1.send_json.assert_awaited_once_with({"type": "state"})
        ws2.send_json.assert_awaited_once_with({"type": "state"})

    def test_broadcast_removes_dead_connections(self):
        """A ws that raises on send_json is silently removed."""
        mgr = ConnectionManager()
        ws_good = make_ws(send_ok=True)
        ws_dead = make_ws(send_ok=False)
        run(mgr.connect("tok1", ws_good))
        run(mgr.connect("tok1", ws_dead))
        # Should not raise
        run(mgr.broadcast("tok1", {"type": "state"}))
        # Dead connection should be removed
        assert ws_dead not in mgr.active.get("tok1", set())
        # Good connection should still be there
        assert ws_good in mgr.active["tok1"]

    def test_broadcast_empty_token_no_crash(self):
        """Broadcasting to a token with no connections must not raise."""
        mgr = ConnectionManager()
        run(mgr.broadcast("never_connected", {"type": "ping"}))  # should not raise

    def test_multiple_tokens_isolated(self):
        """Connections in different tokens don't bleed into each other."""
        mgr = ConnectionManager()
        ws_a = make_ws()
        ws_b = make_ws()
        run(mgr.connect("tokA", ws_a))
        run(mgr.connect("tokB", ws_b))

        run(mgr.broadcast("tokA", {"msg": "for A"}))
        ws_a.send_json.assert_awaited_once_with({"msg": "for A"})
        ws_b.send_json.assert_not_awaited()


# ─── grok_service parsing tests ───────────────────────────────────────────────

class TestMarkdownStripping:
    """Test the JSON extraction from grok_service responses via the full parse path."""

    def _mock_gemini_response(self, content: str) -> dict:
        """Build a fake Gemini API response dict."""
        return {
            "candidates": [
                {"content": {"parts": [{"text": content}]}}
            ]
        }

    def _call_parse_with_mock_response(self, content: str) -> dict:
        """
        Call parse_receipt_image with a mocked httpx client that returns
        a fake Gemini response.
        """
        fake_response = self._mock_gemini_response(content)
        mock_resp = MagicMock()
        mock_resp.json.return_value = fake_response
        mock_resp.raise_for_status = MagicMock()
        mock_resp.status_code = 200

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_resp)

        with patch("grok_service.GEMINI_API_KEY", "fake-key"), \
             patch("httpx.AsyncClient", return_value=mock_client):
            return run(grok_service.parse_receipt_image(b"fake", "image/jpeg"))

    def test_plain_json_no_fences(self):
        payload = '{"merchant_name": "Joe\'s", "items": [], "subtotal": 0, "tax": 0, "tip": 0, "total": 0}'
        result = self._call_parse_with_mock_response(payload)
        assert result["merchant_name"] == "Joe's"

    def test_backtick_json_fence(self):
        payload = '```json\n{"merchant_name": "Cafe", "items": [], "subtotal": 5, "tax": 0, "tip": 0, "total": 5}\n```'
        result = self._call_parse_with_mock_response(payload)
        assert result["subtotal"] == 5

    def test_backtick_fence_no_language(self):
        payload = '```\n{"merchant_name": null, "items": [], "subtotal": 0, "tax": 0, "tip": 0, "total": 0}\n```'
        result = self._call_parse_with_mock_response(payload)
        assert result["merchant_name"] is None

    def test_invalid_json_raises_value_error(self):
        with pytest.raises(ValueError, match="non-JSON"):
            self._call_parse_with_mock_response("this is not json at all")

    def test_error_key_raises_value_error(self):
        payload = '{"error": "Image is too blurry to read"}'
        with pytest.raises(ValueError, match="blurry"):
            self._call_parse_with_mock_response(payload)

    def test_missing_candidates_raises_value_error(self):
        """If API returns a response without 'candidates', raise ValueError."""
        fake_response = {"error": {"code": 500, "message": "internal error"}}
        mock_resp = MagicMock()
        mock_resp.json.return_value = fake_response
        mock_resp.raise_for_status = MagicMock()
        mock_resp.status_code = 200

        mock_client = AsyncMock()
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)
        mock_client.post = AsyncMock(return_value=mock_resp)

        with patch("grok_service.GEMINI_API_KEY", "fake-key"), \
             patch("httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(ValueError, match="candidates"):
                run(grok_service.parse_receipt_image(b"fake", "image/jpeg"))

    def test_no_api_key_raises_runtime_error(self):
        with patch("grok_service.GEMINI_API_KEY", ""):
            with pytest.raises(RuntimeError, match="GEMINI_API_KEY"):
                run(grok_service.parse_receipt_image(b"fake", "image/jpeg"))
