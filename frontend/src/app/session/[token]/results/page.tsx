'use client';
/**
 * Step 3 — Payer selection + Final results
 * Creator: pick payer, enter account, lock → results
 * Everyone else: waiting → then see their amount + copy account
 */
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, Copy, Check, Users, Lock, ChevronRight, Smartphone, Banknote, CreditCard } from 'lucide-react';
import { setPayer, lockSession } from '@/lib/api';
import { useSession } from '@/hooks/useSession';
import type { Participant, ParticipantResult } from '@/lib/types';

function fmt(n: number) {
  return n.toFixed(2);
}

function avatarColor(name: string): string {
  const palette = [
    'bg-sky-400', 'bg-blue-400', 'bg-violet-400', 'bg-pink-400',
    'bg-rose-400', 'bg-orange-400', 'bg-amber-400', 'bg-lime-400',
  ];
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
  return palette[Math.abs(hash) % palette.length];
}

function Avatar({ name, size = 'sm', isMe = false }: { name: string; size?: 'sm' | 'md' | 'lg'; isMe?: boolean }) {
  const bg = isMe ? 'bg-sky-500' : avatarColor(name);
  const sz = size === 'lg' ? 'w-12 h-12 text-xl' : size === 'md' ? 'w-10 h-10 text-sm' : 'w-7 h-7 text-xs';
  return (
    <div className={`${sz} ${bg} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 ring-2 ${isMe ? 'ring-sky-300' : 'ring-white'}`}>
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

function PaymentIcon({ type }: { type: string }) {
  if (/telebirr|m-pesa|hellocash/i.test(type))
    return <Smartphone size={16} className="text-amber-600" />;
  if (/bank|cbe|awash|dashen|abyssinia/i.test(type))
    return <Banknote size={16} className="text-green-600" />;
  return <CreditCard size={16} className="text-sky-600" />;
}

// ─── Confetti ─────────────────────────────────────────────────────────────────

function Confetti() {
  const pieces = Array.from({ length: 14 }, (_, i) => ({
    id: i,
    color: ['#0ea5e9','#38bdf8','#7dd3fc','#22c55e','#fbbf24','#f472b6'][i % 6],
    left: `${8 + i * 6}%`,
    delay: `${(i % 5) * 0.1}s`,
    size: `${6 + (i % 3) * 2}px`,
  }));

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
      {pieces.map(p => (
        <div
          key={p.id}
          className="confetti-piece"
          style={{ backgroundColor: p.color, left: p.left, top: '8%', animationDelay: p.delay, width: p.size, height: p.size }}
        />
      ))}
    </div>
  );
}

// ─── Locked results view ──────────────────────────────────────────────────────

function LockedResults({
  session,
  participantId,
}: {
  session: NonNullable<ReturnType<typeof useSession>['session']>;
  participantId: string | null;
}) {
  const [copied, setCopied] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  const participantById = Object.fromEntries(
    session.participants.map((p: Participant) => [p.id, p])
  );
  const payer    = session.payer ? participantById[session.payer.participant_id] : null;
  const myResult = participantId ? session.results![participantId] as ParticipantResult | undefined : undefined;
  const amIPayer = participantId === session.payer?.participant_id;

  useEffect(() => {
    setShowConfetti(true);
    const t = setTimeout(() => setShowConfetti(false), 1600);
    return () => clearTimeout(t);
  }, []);

  async function copyAccount() {
    if (!session.payer?.account_details) return;
    try {
      await navigator.clipboard.writeText(session.payer.account_details);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* ignore */ }
  }

  const totalSum = Object.values(session.results!).reduce(
    (s, r) => s + (r as ParticipantResult).total, 0
  );

  return (
    <div className="space-y-4 animate-slide-up">

      {/* Hero */}
      <div className="relative card p-5 text-center overflow-hidden">
        {showConfetti && <Confetti />}
        <div className="relative z-10">
          <div className="w-14 h-14 rounded-2xl bg-green-500 flex items-center justify-center mx-auto mb-3 shadow-glow">
            <span className="text-2xl">✓</span>
          </div>
          <h1 className="font-extrabold text-slate-800 text-xl">All done!</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {session.receipt.merchant_name ?? 'Receipt'} · {fmt(session.receipt.total)} total
          </p>
        </div>
      </div>

      {/* My share */}
      {myResult && (
        <div className={`card p-4 space-y-3 ${amIPayer ? '!bg-amber-50 !border-amber-200' : '!bg-sky-50 !border-sky-200'}`}>
          <div className="flex items-center gap-3">
            <Avatar name={session.participants.find((p: Participant) => p.id === participantId)?.name ?? '?'} size="md" isMe />
            <div>
              <p className="font-bold text-slate-800">
                {amIPayer ? '👑 You paid for everyone' : '🧾 Your share'}
              </p>
              <p className="text-xs text-slate-500">
                {amIPayer ? 'Everyone will send you money' : `Pay ${payer?.name ?? 'the payer'}`}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl p-3 space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-500">
              <span>Items</span>
              <span>{fmt(myResult.subtotal)}</span>
            </div>
            {myResult.tax_share > 0 && (
              <div className="flex justify-between text-slate-500">
                <span>Tax</span>
                <span>{fmt(myResult.tax_share)}</span>
              </div>
            )}
            {myResult.tip_share > 0 && (
              <div className="flex justify-between text-slate-500">
                <span>Tip</span>
                <span>{fmt(myResult.tip_share)}</span>
              </div>
            )}
            <div className="flex justify-between font-extrabold text-slate-800 border-t border-slate-100 pt-1.5 mt-1 text-base">
              <span>Total</span>
              <span className={amIPayer ? 'text-amber-600' : 'text-sky-600'}>
                {fmt(myResult.total)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Payment account */}
      {!amIPayer && session.payer && payer && (
        <div className="card p-4 space-y-3 !bg-amber-50 !border-amber-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
              <PaymentIcon type={session.payer.account_type} />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-900">
                Send to {payer.name} · {session.payer.account_type}
              </p>
              <p className="text-xs text-amber-700/70">Copy and open your banking app</p>
            </div>
          </div>
          <div className="flex gap-2">
            <input
              readOnly
              value={session.payer.account_details}
              className="input flex-1 !text-sm font-mono"
              onFocus={(e) => e.target.select()}
            />
            <button
              onClick={copyAccount}
              className={`px-4 rounded-xl font-semibold text-sm flex items-center gap-1.5 transition-all
                ${copied ? 'bg-green-500 text-white' : 'bg-amber-500 hover:bg-amber-600 text-white'}`}
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          {copied && (
            <p className="text-xs text-green-600 font-medium text-center">
              ✓ Copied — open your banking app
            </p>
          )}
        </div>
      )}

      {/* Everyone's amounts */}
      <div>
        <p className="label">Everyone's share</p>
        <div className="space-y-2">
          {session.participants.map((p: Participant) => {
            const r = session.results![p.id] as ParticipantResult | undefined;
            if (!r) return null;
            const isPayer = p.id === session.payer?.participant_id;
            const isMe    = p.id === participantId;
            return (
              <div
                key={p.id}
                className={`flex items-center gap-3 rounded-xl px-4 py-3
                  ${isMe ? 'bg-sky-50 border-2 border-sky-200' : 'card'}`}
              >
                <Avatar name={p.name} size="sm" isMe={isMe} />
                <span className="flex-1 text-sm font-semibold text-slate-700 truncate">{p.name}</span>
                {isPayer && (
                  <span className="pill bg-amber-100 text-amber-700">👑 paid</span>
                )}
                {isMe && !isPayer && (
                  <span className="pill bg-sky-100 text-sky-700">you</span>
                )}
                <span className={`font-extrabold text-sm ${isMe ? 'text-sky-600' : 'text-slate-700'}`}>
                  {fmt(r.total)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="text-center text-xs text-slate-400 pb-2">
        {Math.abs(totalSum - session.receipt.total) < 0.01
          ? <span className="text-green-600 font-medium">✓ Balanced to the cent</span>
          : <span>Sum: {fmt(totalSum)} · Receipt: {fmt(session.receipt.total)}</span>
        }
      </div>
    </div>
  );
}

// ─── Payer form (creator) ─────────────────────────────────────────────────────

function PayerForm({
  session,
  participantId,
}: {
  session: NonNullable<ReturnType<typeof useSession>['session']>;
  participantId: string | null;
}) {
  const [selectedPayerId, setSelectedPayerId] = useState(session.payer?.participant_id ?? '');
  const [accountType,    setAccountType]    = useState(session.payer?.account_type    ?? '');
  const [accountDetails, setAccountDetails] = useState(session.payer?.account_details ?? '');
  const [submitting,     setSubmitting]     = useState(false);
  const [submitError,    setSubmitError]    = useState<string | null>(null);

  const params = useParams() as { token?: string } | null;
  const token = params?.token as string | undefined;

  async function handleSubmit() {
    if (!selectedPayerId || !accountType.trim() || !accountDetails.trim()) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await setPayer(token!, selectedPayerId, accountType.trim(), accountDetails.trim());
      await lockSession(token!);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setSubmitting(false);
    }
  }

  const paymentOptions = [
    { value: 'Telebirr',          label: 'Telebirr',       icon: '📱' },
    { value: 'CBE',               label: 'CBE',            icon: '🏦' },
    { value: 'Awash Bank',        label: 'Awash',          icon: '🏦' },
    { value: 'Dashen Bank',       label: 'Dashen',         icon: '🏦' },
    { value: 'Bank of Abyssinia', label: 'Abyssinia',      icon: '🏦' },
    { value: 'HelloCash',         label: 'HelloCash',      icon: '💰' },
    { value: 'M-Pesa',            label: 'M-Pesa',         icon: '📱' },
    { value: 'Bank Transfer',     label: 'Transfer',       icon: '💳' },
    { value: 'Other',             label: 'Other',          icon: '💳' },
  ];

  return (
    <div className="space-y-5 animate-slide-up">

      <div>
        <h1 className="text-xl font-extrabold text-slate-800">Lock the split</h1>
        <p className="text-sm text-slate-500 mt-0.5">Choose who paid and enter their account</p>
      </div>

      {/* Who paid */}
      <div>
        <label className="label">Who paid the restaurant?</label>
        <div className="grid grid-cols-2 gap-2">
          {session.participants.map((p: Participant) => (
            <button
              key={p.id}
              onClick={() => setSelectedPayerId(p.id)}
              className={`rounded-xl border-2 py-3 px-3 text-sm font-semibold transition-all flex items-center gap-2
                ${selectedPayerId === p.id
                  ? 'border-sky-500 bg-sky-50 text-sky-700 shadow-soft'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-sky-300'
                }`}
            >
              <Avatar name={p.name} size="sm" isMe={p.id === participantId} />
              <span className="truncate">
                {p.id === participantId ? `${p.name} (me)` : p.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Payment method */}
      <div>
        <label className="label">Payment method</label>
        <div className="grid grid-cols-3 gap-2">
          {paymentOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => setAccountType(opt.value)}
              className={`rounded-xl border-2 py-2.5 px-2 text-xs font-semibold transition-all text-center
                ${accountType === opt.value
                  ? 'border-sky-500 bg-sky-50 text-sky-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-sky-300'
                }`}
            >
              <div className="text-base mb-0.5">{opt.icon}</div>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Account number */}
      <div>
        <label className="label">Account number / phone</label>
        <input
          inputMode="numeric"
          className="input font-mono"
          placeholder="e.g. 0911 234 567"
          value={accountDetails}
          onChange={(e) => setAccountDetails(e.target.value)}
        />
        <p className="text-xs text-slate-400 mt-1.5">Everyone will copy this to pay you</p>
      </div>

      {/* Who's in */}
      <div className="card p-4">
        <p className="label"><Users size={11} className="inline mr-1" />{session.participants.length} people splitting</p>
        <div className="flex flex-wrap gap-2">
          {session.participants.map((p: Participant) => (
            <div key={p.id} className="flex items-center gap-1.5 pill bg-slate-50 text-slate-600 border border-slate-200">
              <Avatar name={p.name} size="sm" isMe={p.id === participantId} />
              <span className="text-xs font-medium">{p.name}</span>
            </div>
          ))}
        </div>
      </div>

      {submitError && (
        <div className="card !bg-red-50 !border-red-200 p-3 text-sm text-red-700">
          {submitError}
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={submitting || !selectedPayerId || !accountType || !accountDetails.trim()}
        className="btn-primary"
      >
        {submitting ? (
          <><Loader2 size={16} className="animate-spin" /> Calculating...</>
        ) : (
          <><Lock size={15} /> Lock &amp; Calculate <ChevronRight size={15} /></>
        )}
      </button>

      <p className="text-xs text-slate-400 text-center pb-2">
        Claims freeze after locking
      </p>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ResultsPage() {
  const params = useParams() as { token?: string } | null;
  const token = params?.token as string | undefined;
  const { session, loading, error } = useSession(token ?? null);
  const [participantId, setParticipantId] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(`splitreceipt_pid_${token}`);
      if (stored) setParticipantId(stored);
    } catch { /* ignore */ }
  }, [token]);

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-4 pt-16">
        <Loader2 size={48} className="text-sky-500 animate-spin" />
        <p className="text-sm text-slate-500">Loading...</p>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="card !bg-red-50 !border-red-200 p-5 text-sm text-red-700">
        {error ?? 'Session not found.'}
      </div>
    );
  }

  const isCreator = session.participants[0]?.id === participantId;

  if (session.status === 'locked' && session.results && session.payer) {
    return <LockedResults session={session} participantId={participantId} />;
  }

  if (!isCreator) {
    return (
      <div className="flex flex-col items-center gap-5 pt-16 text-center animate-fade-in">
        <Loader2 size={48} className="text-sky-500 animate-spin" />
        <div>
          <p className="font-bold text-slate-800 text-lg">Almost there</p>
          <p className="text-sm text-slate-500 mt-1 max-w-xs">
            Waiting for the creator to lock the bill. You'll see your amount here.
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-ping" />
          Live
        </div>
      </div>
    );
  }

  return <PayerForm session={session} participantId={participantId} />;
}
