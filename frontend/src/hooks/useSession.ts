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

export function useSession(token: string | null) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    let attempts = 0;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (cancelled) return;

      const ws = new WebSocket(wsUrl(token!));
      wsRef.current = ws;

      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'state' && msg.session) {
            if (!cancelled) {
              setSession(msg.session as Session);
              setLoading(false);
              // Reset attempt counter on successful message
              attempts = 0;
            }
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onerror = () => {
        // WebSocket failed entirely — fall back to a single HTTP fetch
        ws.close();
        if (!cancelled) fetchOnce();
      };

      ws.onclose = () => {
        if (cancelled) return;
        attempts += 1;
        if (attempts > MAX_RECONNECT_ATTEMPTS) {
          // Too many retries — fall back to HTTP rather than hammering the server
          fetchOnce();
          return;
        }
        // Exponential backoff: 2s, 4s, 8s, 16s, 32s
        const delay = BASE_RECONNECT_DELAY_MS * Math.pow(2, attempts - 1);
        timeoutId = setTimeout(connect, delay);
      };
    }

    async function fetchOnce() {
      try {
        const s = await getSession(token!);
        if (!cancelled) {
          setSession(s);
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load session');
          setLoading(false);
        }
      }
    }

    connect();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      wsRef.current?.close();
    };
  }, [token]);

  return { session, loading, error, setSession };
}
