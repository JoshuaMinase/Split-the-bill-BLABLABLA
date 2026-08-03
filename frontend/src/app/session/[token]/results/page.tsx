'use client';
/**
 * Page 3 — Payer selection + Final results (/session/[token]/results)
 *
 * Two sub-views controlled by session.status:
 *
 * A) status === "open"  — creator picks the payer, enters their account info,
 *    then taps "Lock & Calculate". Everyone else sees a waiting screen.
 *
 * B) status === "locked" — everyone sees their personal amount with a breakdown
 *    (subtotal, tax share, tip share) and a copy-to-clipboard button for the
 *    payer's account details to send the money manually.
 */
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import {
  Loader2, Copy, Check, Users, Lock, ChevronRight,
  Banknote, Smartphone, CreditCard, Sparkles,
} from 'lucide-react';
import { setPayer, lockSession } from '@/lib/api';
import { useSession } from '@/hooks/useSession';
import type { Participant, ParticipantResult } from '@/lib/types';

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toFixed(2);
}

function avatarColor(name: string): string {
  const palette = [
    'bg-violet-400', 'bg-pink-400', 'bg-indigo-400', 'bg-sky-400',
    'bg-teal-400', 'bg-emerald-400', 'bg-amber-400', 'bg-orange-400',
  ];
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
  return palette[Math.abs(hash) % palette.length];
}

function Avatar({ name, size = 'sm', isMe = false }: { name: string; size?: 'sm' | 'md' | 'lg'; isMe?: boolean }) {
  const bg = isMe ? 'bg-brand-gradient' : avatarColor(name);
  const sz = size === 'lg' ? 'w-14 h-14 text-xl' : size === 'md' ? 'w-10 h-10 text-sm' : 'w-8 h-8 text-xs';
  return (
    <div className={`${sz} ${bg} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 ring-2 ${isMe ? 'ring-brand-300' : 'ring-white'}`}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

// ─── Confetti burst ───────────────────────────────────────────────────────────

function ConfettiBurst() {
  const pieces = Array.from({ length: 18 }, (_, i) => ({
    id: i,
    color: ['#7c3aed','#a78bfa','#ec4899','#f59e0b','#10b981','#3b82f6'][i % 6],
    left:  `${10 + (i * 5)}%`,
    delay: `${(i % 6) * 0.08}s`,
    size:  `${6 + (i % 3) * 3}px`,
  }));

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-3xl">
      {pieces.map((p) => (
        <div
          key={p.id}
          className="confetti-piece"
          style={{
            backgroundColor: p.color,
            left: p.left,
            top: '10%',
            animationDelay: p.delay,
            width: p.size,
            height: p.size,
          }}
        />
      ))}
    </div>
  );
}

// ─── Payment method icon ──────────────────────────────────────────────────────

function PaymentIcon({ type }: { type: string }) {
  if (/telebirr|m-pesa|hellocash/i.test(type))
    return <Smartphone size={16} className="text-amber-600" />;
  if (/bank|cbe|awash|dashen|abyssinia/i.test(type))
    return <Banknote size={16} className="text-emerald-600" />;
  return <CreditCard size={16} className="text-brand-500" />;
}

// ─── Results locked view ──────────────────────────────────────────────────────

function LockedResults({
  session,
  participantId,
}: {
  session: NonNullable<ReturnType<typeof useSession>['session']>;
  participantId: string | null;
}) {
  const [copiedAccount, setCopiedAccount] = useState(false);
  const [showConfetti, setShowConfetti]   = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const participantById = Object.fromEntries(
    session.participants.map((p: Participant) => [p.id, p])
  );

  const payer      = session.payer ? participantById[session.payer.participant_id] : null;
  const myResult   = participantId ? session.results![participantId] as ParticipantResult | undefined : undefined;
  const amIPayer   = participantId === session.payer?.participant_id;

  // Fire confetti on first render
  useEffect(() => {
    setShowConfetti(true);
    const t = setTimeout(() => setShowConfetti(false), 1800);
    return () => clearTimeout(t);
  }, []);

  async function copyAccount() {
    if (!session.payer?.account_details) return;
    try {
      await navigator.clipboard.writeText(session.payer.account_details);
      setCopiedAccount(true);
      setTimeout(() => setCopiedAccount(false), 2500);
    } catch { /* ignore */ }
  }

  const totalSum = Object.values(session.results!).reduce((s, r) => s + (r as ParticipantResult).total, 0);

  return (
    <div className="space-y-4 animate-slide-up">

      {/* Hero celebration card */}
      <div ref={cardRef} className="relative rounded-3xl bg-brand-gradient p-5 text-white text-center shadow-card-lg overflow-hidden">
        {showConfetti && <ConfettiBurst />}
        <div className="relative z-10">
          <p className="text-3xl mb-1">🎉</p>
          <h1 className="font-extrabold text-xl">All done!</h1>
          <p className="text-white/80 text-sm mt-1">
            {session.receipt.merchant_name ?? 'Receipt'} · Total{' '}
            <strong>{fmt(session.receipt.total)}</strong>
          </p>
        </div>
      </div>

      {/* My personal card */}
      {myResult && (
        <div className={`rounded-3xl border-2 p-5 space-y-3 shadow-card
          ${amIPayer ? 'border-amber-300 bg-amber-50' : 'border-brand-200 bg-white'}`}
        >
          {/* Title row */}
          <div className="flex items-center gap-3">
            <Avatar name={session.participants.find((p: Participant) => p.id === participantId)?.name ?? '?'} size="md" isMe />
            <div>
              <p className="font-extrabold text-gray-800 text-base">
                {amIPayer ? '👑 You paid for everyone' : '🧾 Your share'}
              </p>
              <p className="text-xs text-gray-400">
                {amIPayer ? 'Everyone will send you money' : `Send to ${payer?.name ?? 'the payer'}`}
              </p>
            </div>
          </div>

          {/* Breakdown */}
          <div className="bg-gray-50 rounded-2xl p-3 space-y-1.5 text-sm">
            <div className="flex justify-between text-gray-500">
              <span>Items</span>
              <span>{fmt(myResult.subtotal)}</span>
            </div>
            {myResult.tax_share > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>Tax share</span>
                <span>{fmt(myResult.tax_share)}</span>
              </div>
            )}
            {myResult.tip_share > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>Tip share</span>
                <span>{fmt(myResult.tip_share)}</span>
              </div>
            )}
            <div className="flex justify-between font-extrabold text-gray-900 border-t border-gray-200 pt-1.5 mt-0.5 text-base">
              <span>I owe</span>
              <span className={amIPayer ? 'text-amber-600' : 'text-brand-700'}>
                {fmt(myResult.total)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Payment destination card (shown to non-payers) */}
      {!amIPayer && session.payer && payer && (
        <div className="rounded-3xl border-2 border-amber-200 bg-amber-50 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center">
              <PaymentIcon type={session.payer.account_type} />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-amber-900">
                Send to {payer.name} via {session.payer.account_type}
              </p>
              <p className="text-xs text-amber-700/70">Tap "Copy" then open your banking app</p>
            </div>
          </div>

          {/* Account number */}
          <div className="flex gap-2">
            <input
              readOnly
              value={session.payer.account_details}
              className="flex-1 bg-white border-2 border-amber-200 rounded-2xl px-4 py-3 text-sm font-mono text-gray-800 select-all focus:outline-none focus:border-amber-400"
              onFocus={(e) => e.target.select()}
              aria-label="Account number to copy"
            />
            <button
              onClick={copyAccount}
              className={`flex-shrink-0 px-4 rounded-2xl font-semibold text-sm flex items-center gap-1.5 transition-all
                ${copiedAccount
                  ? 'bg-emerald-500 text-white'
                  : 'bg-amber-500 hover:bg-amber-600 text-white'
                }`}
            >
              {copiedAccount ? <Check size={15} /> : <Copy size={15} />}
              {copiedAccount ? 'Copied!' : 'Copy'}
            </button>
          </div>

          {copiedAccount && (
            <p className="text-xs text-emerald-600 font-medium text-center animate-fade-in">
              ✅ Account copied — open your banking app to send!
            </p>
          )}
        </div>
      )}

      {/* Everyone's share list */}
      <div className="space-y-2">
        <p className="section-label">Everyone's share</p>
        {session.participants.map((p: Participant) => {
          const r = session.results![p.id] as ParticipantResult | undefined;
          if (!r) return null;
          const isPayer = p.id === session.payer?.participant_id;
          const isMe    = p.id === participantId;
          return (
            <div
              key={p.id}
              className={`flex items-center gap-3 rounded-2xl px-4 py-3 transition-all
                ${isMe ? 'bg-brand-50 border-2 border-brand-200' : 'bg-white border border-gray-100 shadow-sm'}`}
            >
              <Avatar name={p.name} size="sm" isMe={isMe} />
              <span className="flex-1 text-sm font-semibold text-gray-700">{p.name}</span>
              {isPayer && (
                <span className="status-pill bg-amber-100 text-amber-700">👑 paid</span>
              )}
              {isMe && !isPayer && (
                <span className="status-pill bg-brand-100 text-brand-700">you</span>
              )}
              <span className={`font-extrabold text-sm ${isMe ? 'text-brand-700' : 'text-gray-800'}`}>
                {fmt(r.total)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Reconciliation check */}
      <div className="text-center text-xs text-gray-400 space-y-0.5 pb-2">
        <p>Receipt total: <strong>{fmt(session.receipt.total)}</strong></p>
        <p>Sum of shares: <strong>{fmt(totalSum)}</strong></p>
        {Math.abs(totalSum - session.receipt.total) < 0.01 && (
          <p className="text-emerald-600 font-semibold">✓ Balanced to the cent</p>
        )}
      </div>
    </div>
  );
}

// ─── Payer selection form (creator, open state) ───────────────────────────────

function PayerForm({
  session,
  participantId,
}: {
  session: NonNullable<ReturnType<typeof useSession>['session']>;
  participantId: string | null;
}) {
  const [selectedPayerId, setSelectedPayerId] = useState(
    session.payer?.participant_id ?? ''
  );
  const [accountType,    setAccountType]    = useState(session.payer?.account_type    ?? '');
  const [accountDetails, setAccountDetails] = useState(session.payer?.account_details ?? '');
  const [submitting,     setSubmitting]     = useState(false);
  const [submitError,    setSubmitError]    = useState<string | null>(null);

  const { token } = useParams<{ token: string }>();

  async function handleSubmit() {
    if (!selectedPayerId || !accountType.trim() || !accountDetails.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await setPayer(token, selectedPayerId, accountType.trim(), accountDetails.trim());
      await lockSession(token);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  const paymentOptions = [
    { value: 'Telebirr',             label: 'Telebirr',              icon: '📱' },
    { value: 'CBE',                  label: 'CBE',                   icon: '🏦' },
    { value: 'Awash Bank',           label: 'Awash Bank',            icon: '🏦' },
    { value: 'Dashen Bank',          label: 'Dashen Bank',           icon: '🏦' },
    { value: 'Bank of Abyssinia',    label: 'Bank of Abyssinia',     icon: '🏦' },
    { value: 'HelloCash',            label: 'HelloCash',             icon: '💰' },
    { value: 'M-Pesa',               label: 'M-Pesa',                icon: '📱' },
    { value: 'Bank Transfer',        label: 'Bank Transfer',         icon: '🏦' },
    { value: 'Other',                label: 'Other',                 icon: '💳' },
  ];

  return (
    <div className="space-y-5 animate-slide-up">
      {/* Hero */}
      <div className="rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 p-5 text-white">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-white/20 flex items-center justify-center">
            <Lock size={20} className="text-white" />
          </div>
          <div>
            <h1 className="font-extrabold text-lg">Lock the split</h1>
            <p className="text-white/70 text-xs mt-0.5">Choose who paid, then freeze it</p>
          </div>
        </div>
      </div>

      {/* Who paid picker */}
      <div>
        <label className="section-label">Who paid the restaurant?</label>
        <div className="grid grid-cols-2 gap-2">
          {session.participants.map((p: Participant) => (
            <button
              key={p.id}
              onClick={() => setSelectedPayerId(p.id)}
              className={`rounded-3xl border-2 py-3.5 px-4 text-sm font-semibold transition-all flex items-center gap-2
                ${selectedPayerId === p.id
                  ? 'border-brand-500 bg-brand-50 text-brand-700 shadow-card'
                  : 'border-gray-100 bg-white text-gray-700 hover:border-brand-200'
                }`}
            >
              <Avatar name={p.name} size="sm" isMe={p.id === participantId} />
              <span className="truncate">
                {p.id === participantId ? `${p.name} (you)` : p.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Payment method */}
      <div>
        <label className="section-label">Payment method</label>
        <div className="grid grid-cols-3 gap-2">
          {paymentOptions.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setAccountType(opt.value)}
              className={`rounded-2xl border-2 py-2.5 px-2 text-xs font-semibold transition-all text-center
                ${accountType === opt.value
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-gray-100 bg-white text-gray-600 hover:border-brand-200'
                }`}
            >
              <div className="text-base mb-0.5">{opt.icon}</div>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Account details */}
      <div>
        <label className="section-label">Account number / phone</label>
        <input
          inputMode="numeric"
          className="input-field font-mono"
          placeholder="e.g. 0911234567 or 1000123456789"
          value={accountDetails}
          onChange={(e) => setAccountDetails(e.target.value)}
        />
        <p className="text-xs text-gray-400 mt-1.5">
          Everyone will copy this to send you money
        </p>
      </div>

      {/* Participants in split */}
      <div className="bg-white rounded-3xl border border-gray-100 p-4 shadow-card">
        <div className="flex items-center gap-1.5 mb-3">
          <Users size={13} className="text-gray-400" />
          <span className="text-xs font-semibold text-gray-500">
            {session.participants.length} people splitting
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {session.participants.map((p: Participant) => (
            <div key={p.id} className="flex items-center gap-1.5 bg-gray-50 rounded-full px-2.5 py-1.5">
              <Avatar name={p.name} size="sm" isMe={p.id === participantId} />
              <span className="text-xs font-medium text-gray-600">{p.name}</span>
            </div>
          ))}
        </div>
      </div>

      {submitError && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3 text-sm text-rose-700">
          {submitError}
        </div>
      )}

      {/* Lock CTA */}
      <button
        onClick={handleSubmit}
        disabled={submitting || !selectedPayerId || !accountType || !accountDetails.trim()}
        className="btn-primary"
      >
        {submitting ? (
          <><Loader2 size={18} className="animate-spin" /> Calculating…</>
        ) : (
          <><Lock size={17} /><span>Lock &amp; Calculate</span><ChevronRight size={17} /></>
        )}
      </button>

      <p className="text-xs text-gray-400 text-center pb-2">
        Claims freeze after locking — everyone sees what they owe
      </p>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ResultsPage() {
  const { token }                         = useParams<{ token: string }>();
  const { session, loading, error }        = useSession(token);
  const [participantId, setParticipantId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(`splitreceipt_pid_${token}`);
      if (stored) setParticipantId(stored);
    } catch { /* ignore */ }
  }, [token]);

  // ── Guards ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-4 pt-20">
        <div className="w-16 h-16 rounded-3xl bg-brand-gradient flex items-center justify-center shadow-glow animate-pulse-slow">
          <Sparkles size={28} className="text-white" />
        </div>
        <p className="text-sm text-gray-500">Loading results…</p>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-3xl p-5 text-sm text-rose-700">
        {error ?? 'Session not found.'}
      </div>
    );
  }

  const isCreator = session.participants[0]?.id === participantId;

  // ── LOCKED — show final results ─────────────────────────────────────────────

  if (session.status === 'locked' && session.results && session.payer) {
    return <LockedResults session={session} participantId={participantId} />;
  }

  // ── OPEN — payer selection (creator) or waiting screen ─────────────────────

  if (!isCreator) {
    return (
      <div className="flex flex-col items-center gap-5 pt-16 text-center animate-fade-in">
        <div className="w-20 h-20 rounded-3xl bg-brand-gradient flex items-center justify-center shadow-glow animate-pulse-slow">
          <Loader2 size={32} className="text-white animate-spin" />
        </div>
        <div>
          <p className="font-bold text-gray-800 text-lg">Almost there…</p>
          <p className="text-sm text-gray-500 mt-1.5 max-w-xs">
            The person who created this group is selecting who paid.
            You'll see the final amounts here when they lock it.
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          <span>Waiting for the creator…</span>
        </div>
      </div>
    );
  }

  return <PayerForm session={session} participantId={participantId} />;
}
