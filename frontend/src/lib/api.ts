/**
 * Thin typed wrapper around the FastAPI backend.
 * Base URL defaults to http://localhost:8000 in dev.
 * Set NEXT_PUBLIC_API_URL in .env.local for production.
 */
import type { ReceiptDraft, Session } from './types';

const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '') ?? 'http://localhost:8000';

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  console.log(`API Request: ${BASE_URL}${path}`, init?.method || 'GET');
  console.log('Request body:', init?.body);
  
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    signal: AbortSignal.timeout(120_000),  // 120s timeout to prevent abort errors
    ...init,
  });

  console.log(`API Response: ${res.status} ${res.statusText}`);

  if (!res.ok) {
    let message = `API error ${res.status}`;
    try {
      const body = await res.json();
      message = body?.detail ?? message;
      console.error('API Error body:', body);
    } catch {
      // ignore parse error
    }
    throw new Error(message);
  }

  const data = await res.json() as Promise<T>;
  console.log('API Response data:', data);
  return data;
}

// ─── Receipt ─────────────────────────────────────────────────────────────────

/** Upload a receipt image and get back a draft JSON to review. */
export async function parseReceipt(file: File): Promise<ReceiptDraft> {
  const form = new FormData();
  form.append('file', file);
  // Prefer pages/api upload (Node runtime) which runs the AI parsing chain.
  const endpoint = `${BASE_URL}/api/receipts/upload`;
  const res = await fetch(endpoint, {
    method: 'POST',
    body: form,
    // Don't set Content-Type; browser sets multipart boundary.
    signal: AbortSignal.timeout(90_000), // 90s — AI vision can be slow
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.detail ?? `Upload failed (${res.status})`);
  }
  return res.json();
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export interface CreateSessionResponse {
  token: string;
  session: Session;
}

export async function createSession(draft: ReceiptDraft): Promise<CreateSessionResponse> {
  return apiFetch<CreateSessionResponse>('/api/sessions', {
    method: 'POST',
    body: JSON.stringify(draft),
  });
}

export async function getSession(token: string): Promise<Session> {
  return apiFetch<Session>(`/api/sessions/${token}`);
}

// ─── Participants ─────────────────────────────────────────────────────────────

export interface JoinResponse {
  participant_id: string;
  already_joined: boolean;
}

export async function joinSession(
  token: string,
  name: string,
  deviceToken: string
): Promise<JoinResponse> {
  return apiFetch<JoinResponse>(`/api/sessions/${token}/join`, {
    method: 'POST',
    body: JSON.stringify({ name, device_token: deviceToken }),
  });
}

// ─── Claims ───────────────────────────────────────────────────────────────────

export async function toggleClaim(
  token: string,
  itemId: string,
  participantId: string,
  claimed: boolean
): Promise<void> {
  await apiFetch(`/api/sessions/${token}/claim`, {
    method: 'POST',
    body: JSON.stringify({ item_id: itemId, participant_id: participantId, claimed }),
  });
}

// ─── Payer ────────────────────────────────────────────────────────────────────

export async function setPayer(
  token: string,
  participantId: string,
  accountType: string,
  accountDetails: string
): Promise<void> {
  await apiFetch(`/api/sessions/${token}/payer`, {
    method: 'POST',
    body: JSON.stringify({
      participant_id: participantId,
      account_type: accountType,
      account_details: accountDetails,
    }),
  });
}

// ─── Lock ─────────────────────────────────────────────────────────────────────

export async function lockSession(token: string): Promise<void> {
  await apiFetch(`/api/sessions/${token}/lock`, { method: 'POST' });
}

// ─── WebSocket URL ────────────────────────────────────────────────────────────

export function wsUrl(token: string): string {
  // Correctly handles both http->ws and https->wss
  const base = BASE_URL.replace(/^https/, 'wss').replace(/^http/, 'ws');
  return `${base}/ws/sessions/${token}`;
}
