'use client';
/**
 * Page 2 — Item claiming (/session/[token])
 *
 * Flow:
 *  1. Enter your name (stored in localStorage so refresh doesn't re-ask).
 *  2. See receipt items as tappable cards — tap to claim / un-claim.
 *  3. Real-time: everyone sees each other's claims via WebSocket.
 *  4. Creator taps "Set Payer →" to proceed. Auto-redirect when locked.
 */
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, Users, Lock, ChevronRight, Sparkles } from 'lucide-react';
import { joinSession, toggleClaim } from '@/lib/api';
import { useSession } from '@/hooks/useSession';
import { getDeviceToken } from '@/lib/device';
import type { ReceiptItem, Participant } from '@/lib/types';

// ─── helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toFixed(2);
}

/** Generate a consistent pastel colour from a string (for avatars) */
function avatarColor(name: string): string {
  const palette = [
    'bg-violet-400', 'bg-pink-400', 'bg-indigo-400', 'bg-sky-400',
    'bg-teal-400',   'bg-emerald-400', 'bg-amber-400', 'bg-orange-400',
  ];
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
  return palette[Math.abs(hash) % palette.length];
}

/** First letter avatar badge */
function Avatar({ name, size = 'sm', isMe = false }: { name: string; size?: 'sm' | 'md'; isMe?: boolean }) {
  const bg = isMe ? 'bg-brand-gradient' : avatarColor(name);
  const sz = size === 'sm' ? 'w-7 h-7 text-xs' : 'w-10 h-10 text-sm';
  return (
    <div
      className={`${sz} ${bg} rounded-full flex items-center justify-center font-bold text-white shadow-sm ring-2 ${isMe ? 'ring-brand-300' : 'ring-white'} flex-shrink-0`}
      title={name}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

// ─── Item card ────────────────────────────────────────────────────────────────

function ItemCard({
  item,
  claimants,
  myParticipantId,
  onToggle,
  isPending,
}: {
  item: ReceiptItem;
  claimants: Participant[];
  myParticipantId: string;
  onToggle: () => void;
  isPending: boolean;
}) {
  const iClaimed = claimants.some((p) => p.id === myParticipantId);
  const sharedCost = claimants.length > 0 ? item.price * item.quantity / claimants.length : null;

  return (
    <button
      onClick={onToggle}
      disabled={isPending}
      aria-pressed={iClaimed}
      className={`w-full text-left rounded-3xl border-2 p-4 transition-all duration-150 select-none
        ${iClaimed
          ? 'border-brand-400 bg-gradient-to-br from-brand-50 to-purple-50 shadow-card'
          : 'border-gray-100 bg-white shadow-sm hover:border-brand-200 hover:shadow-card'
        }
        ${isPending ? 'opacity-60 pointer-events-none' : 'active:scale-[0.97]'}
      `}
    >
      <div className="flex items-start gap-3">
        {/* Check ring */}
        <div
          className={`mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all
            ${iClaimed ? 'border-brand-500 bg-brand-500' : 'border-gray-300 bg-white'}
          `}
        >
          {isPending
            ? <Loader2 size={10} className="text-brand-500 animate-spin" />
            : iClaimed && <span className="text-white text-xs font-black">✓</span>
          }
        </div>

        {/* Item info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <p className="font-semibold text-gray-800 truncate text-sm">{item.name}</p>
            {item.quantity > 1 && (
              <span className="text-xs text-gray-400 flex-shrink-0">×{item.quantity}</span>
            )}
          </div>

          {/* Claimants row */}
          {claimants.length > 0 && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <div className="flex -space-x-1.5">
                {claimants.slice(0, 5).map((p) => (
                  <Avatar key={p.id} name={p.name} size="sm" isMe={p.id === myParticipantId} />
                ))}
                {claimants.length > 5 && (
                  <div className="w-7 h-7 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-gray-500">
                    +{claimants.length - 5}
                  </div>
                )}
              </div>
              {claimants.length > 1 && sharedCost !== null && (
                <span className="text-xs text-gray-400">
                  {fmt(sharedCost)} each
                </span>
              )}
            </div>
          )}
        </div>

        {/* Price */}
        <div className="text-right flex-shrink-0">
          <p className={`font-bold text-sm ${iClaimed ? 'text-brand-700' : 'text-gray-700'}`}>
            {fmt(item.price * item.quantity)}
          </p>
          {iClaimed && sharedCost !== null && claimants.length > 1 && (
            <p className="text-[10px] text-brand-500 mt-0.5">my share</p>
          )}
        </div>
      </div>
    </button>
  );
}

// ─── Name entry screen ────────────────────────────────────────────────────────

function JoinScreen({
  session,
  onJoin,
}: {
  session: NonNullable<ReturnType<typeof useSession>['session']>;
  onJoin: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [joining, setJoining] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) return;
    setJoining(true);
    setErr(null);
    try {
      await onJoin(name.trim());
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to join');
      setJoining(false);
    }
  }

  return (
    <div className="space-y-6 animate-slide-up">
      {/* Hero */}
      <div className="rounded-3xl bg-brand-gradient p-6 text-white text-center shadow-card-lg">
        <div className="text-4xl mb-3">👋</div>
        <h1 className="text-xl font-extrabold">Join the split!</h1>
        {session.receipt.merchant_name && (
          <p className="text-white/80 text-sm mt-1">
            {session.receipt.merchant_name} · {session.participants.length + 1} splitting
          </p>
        )}
      </div>

      {/* Who's already here */}
      {session.participants.length > 0 && (
        <div className="bg-white rounded-3xl border border-gray-100 p-4 shadow-card">
          <p className="section-label">Already joined</p>
          <div className="flex flex-wrap gap-2">
            {session.participants.map((p: Participant) => (
              <div key={p.id} className="flex items-center gap-1.5 bg-brand-50 rounded-full px-3 py-1.5">
                <Avatar name={p.name} size="sm" />
                <span className="text-xs font-semibold text-brand-700">{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Name form */}
      <div className="bg-white rounded-3xl border border-gray-100 p-5 shadow-card space-y-3">
        <label className="section-label">Your name</label>
        <input
          autoFocus
          className="input-field"
          placeholder="e.g. Abebe, Sara…"
          value={name}
          maxLength={30}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        {err && <p className="text-xs text-rose-600">{err}</p>}
        <button
          onClick={submit}
          disabled={joining || !name.trim()}
          className="btn-primary"
        >
          {joining
            ? <><Loader2 size={17} className="animate-spin" /> Joining…</>
            : <><span>Let's go!</span><ChevronRight size={18} /></>
          }
        </button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SessionPage() {
  const { token } = useParams<{ token: string }>();
  const router    = useRouter();
  const { session, loading, error } = useSession(token);

  const [participantId, setParticipantId] = useState<string | null>(null);
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);

  // Auto-redirect when host locks the session
  useEffect(() => {
    if (session?.status === 'locked') {
      router.replace(`/session/${token}/results`);
    }
  }, [session?.status, token, router]);

  // Restore from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(`splitreceipt_pid_${token}`);
      if (stored) setParticipantId(stored);
    } catch { /* ignore */ }
  }, [token]);

  // ── Join ───────────────────────────────────────────────────────────────────

  async function handleJoin(name: string) {
    const deviceToken = getDeviceToken();
    const { participant_id } = await joinSession(token, name, deviceToken);
    setParticipantId(participant_id);
    try {
      localStorage.setItem(`splitreceipt_pid_${token}`, participant_id);
    } catch { /* ignore */ }
  }

  // ── Claim toggle ──────────────────────────────────────────────────────────

  async function handleToggle(item: ReceiptItem) {
    if (!participantId || pendingItemId) return;
    const alreadyClaimed = session!.claims.some(
      (c) => c.item_id === item.id && c.participant_id === participantId
    );
    setPendingItemId(item.id);
    try {
      await toggleClaim(token, item.id, participantId, !alreadyClaimed);
    } finally {
      setPendingItemId(null);
    }
  }

  // ── Loading / error guards ────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-4 pt-20">
        <div className="w-16 h-16 rounded-3xl bg-brand-gradient flex items-center justify-center shadow-glow animate-pulse-slow">
          <Sparkles size={28} className="text-white" />
        </div>
        <p className="text-sm text-gray-500">Loading session…</p>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="bg-rose-50 border border-rose-200 rounded-3xl p-5 text-sm text-rose-700">
        {error ?? 'Session not found. Check the link.'}
      </div>
    );
  }

  // ── Name gate ─────────────────────────────────────────────────────────────

  if (!participantId) {
    return <JoinScreen session={session} onJoin={handleJoin} />;
  }

  // ── Build helpers ─────────────────────────────────────────────────────────

  const me = session.participants.find((p: Participant) => p.id === participantId);
  const participantById = Object.fromEntries(
    session.participants.map((p: Participant) => [p.id, p])
  );

  const claimantsByItem: Record<string, Participant[]> = {};
  for (const c of session.claims) {
    if (!claimantsByItem[c.item_id]) claimantsByItem[c.item_id] = [];
    const p = participantById[c.participant_id];
    if (p) claimantsByItem[c.item_id].push(p);
  }

  // My running subtotal (pre-tax, pre-tip)
  const mySubtotal = session.receipt.items.reduce((sum, item) => {
    const cl = claimantsByItem[item.id];
    if (!cl) return sum;
    const mine = cl.find((p) => p.id === participantId);
    if (!mine) return sum;
    return sum + (item.price * item.quantity) / cl.length;
  }, 0);

  const isCreator = session.participants[0]?.id === participantId;
  const totalClaims = session.claims.length;

  // ── Main claiming view ────────────────────────────────────────────────────

  return (
    <div className="space-y-4 animate-fade-in">

      {/* Restaurant + avatars row */}
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="font-extrabold text-gray-900 text-lg leading-tight truncate">
            {session.receipt.merchant_name ?? 'Split the bill'}
          </h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Tap everything <strong>you</strong> ate, {me?.name ?? 'friend'}
          </p>
        </div>
        {/* Live participant avatars */}
        <div className="flex -space-x-2 flex-shrink-0">
          {session.participants.slice(0, 5).map((p: Participant) => (
            <Avatar key={p.id} name={p.name} size="sm" isMe={p.id === participantId} />
          ))}
          {session.participants.length > 5 && (
            <div className="w-7 h-7 rounded-full bg-gray-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-gray-500">
              +{session.participants.length - 5}
            </div>
          )}
        </div>
      </div>

      {/* Live status bar */}
      <div className="flex items-center gap-2 bg-white rounded-2xl border border-gray-100 px-3 py-2 shadow-sm">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        <span className="text-xs text-gray-500">
          <strong className="text-gray-700">{session.participants.length}</strong> people live
          {totalClaims > 0 && (
            <> · <strong className="text-brand-600">{totalClaims}</strong> claim{totalClaims !== 1 ? 's' : ''}</>
          )}
        </span>
        <span className="ml-auto text-xs text-gray-400 font-medium">
          Total {fmt(session.receipt.total)}
        </span>
      </div>

      {/* Item cards */}
      <div className="space-y-2.5">
        {session.receipt.items.map((item: ReceiptItem) => (
          <ItemCard
            key={item.id}
            item={item}
            claimants={claimantsByItem[item.id] ?? []}
            myParticipantId={participantId}
            onToggle={() => handleToggle(item)}
            isPending={pendingItemId === item.id}
          />
        ))}
      </div>

      {/* My running total */}
      <div className="rounded-3xl bg-brand-gradient p-4 flex items-center justify-between shadow-glow-sm">
        <div>
          <p className="text-white/80 text-xs font-medium">Your share so far</p>
          <p className="text-white font-black text-2xl mt-0.5">{fmt(mySubtotal)}</p>
        </div>
        <div className="text-right">
          <p className="text-white/70 text-xs">of {fmt(session.receipt.total)}</p>
          {session.receipt.tax > 0 && (
            <p className="text-white/60 text-[10px] mt-0.5">+ tax/tip proportional</p>
          )}
        </div>
      </div>

      {/* Creator action */}
      {isCreator && session.status === 'open' && (
        <div className="rounded-3xl border-2 border-dashed border-brand-300 bg-brand-50 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Lock size={14} className="text-brand-500" />
            <p className="text-xs font-semibold text-brand-700">Ready to lock the bill?</p>
          </div>
          <p className="text-xs text-gray-500">
            Once everyone has claimed their items, go to the next step to choose who paid.
          </p>
          <button
            onClick={() => router.push(`/session/${token}/results`)}
            className="btn-primary !py-3"
          >
            <Lock size={16} />
            <span>Set Payer & Lock</span>
            <ChevronRight size={16} className="ml-auto" />
          </button>
        </div>
      )}

      {/* Non-creator nudge */}
      {!isCreator && session.status === 'open' && (
        <div className="text-center py-2">
          <p className="text-xs text-gray-400 flex items-center justify-center gap-1.5">
            <Users size={12} />
            Waiting for the creator to lock the bill
          </p>
        </div>
      )}
    </div>
  );
}
