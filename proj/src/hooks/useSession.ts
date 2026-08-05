'use client';
/**
 * useSession — subscribes to a session via WebSocket.
 * Falls back to a single HTTP fetch if WebSocket fails.
 * Reconnects on unexpected close with exponential backoff, capped at 5 attempts.
 */
import { useEffect, useRef, useState } from 'react';
import { wsUrl, getSession } from '@/lib/api';
import type { Session } from '@/lib/types';

const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY_MS = 2000;
const POLL_INTERVAL_MS = 2000;

export function useSession(token: string | null) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    let attempts = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    function startPolling() {
      if (pollRef.current) return;
      const id = window.setInterval(async () => {
        try {
          const s = await getSession(token!);
          if (!cancelled) {
            setSession(s);
            setLoading(false);
            setError(null);
          }
        } catch (err) {
          if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load session');
        }
      }, POLL_INTERVAL_MS);
      pollRef.current = id;
    }

    function stopPolling() {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    }

    function connect() {
      if (cancelled) return;

      try {
        const ws = new WebSocket(wsUrl(token!));
        wsRef.current = ws;

        ws.onmessage = (e) => {
          try {
            const msg = JSON.parse(e.data);
            if (msg.type === 'state' && msg.session) {
              if (!cancelled) {
                setSession(msg.session as Session);
                setLoading(false);
                setError(null);
                // Reset attempt counter on successful message
                attempts = 0;
              }
            }
          } catch {
            // ignore malformed messages
          }
        };

        ws.onerror = () => {
          // WebSocket failed — stop it and start polling
          try { ws.close(); } catch {};
          stopPolling();
          if (!cancelled) startPolling();
        };

        ws.onclose = () => {
          if (cancelled) return;
          attempts += 1;
          if (attempts > MAX_RECONNECT_ATTEMPTS) {
            // Too many retries — fall back to polling
            stopPolling();
            startPolling();
            return;
          }
          // Exponential backoff
          const delay = BASE_RECONNECT_DELAY_MS * Math.pow(2, attempts - 1);
          timeoutId = setTimeout(connect, delay);
        };

        // If connection succeeds, ensure polling is stopped
        // (onopen may be called after creation)
        ws.onopen = () => {
          stopPolling();
        };
      } catch (err) {
        // If WebSocket constructor throws (e.g., bad URL), fall back to polling
        if (!cancelled) startPolling();
      }
    }

    async function fetchOnce() {
      try {
        const s = await getSession(token!);
        if (!cancelled) {
          setSession(s);
          setLoading(false);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load session');
          setLoading(false);
        }
      }
    }

    // Try websocket first, then polling fallback
    connect();

    // Ensure at least one fetch completes quickly for UX
    fetchOnce();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      wsRef.current?.close();
      stopPolling();
    };
  }, [token]);

  return { session, loading, error, setSession };
}
