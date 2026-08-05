'use client';
/**
 * Step 2 — Claiming items
 * Join with name → claim items → see everyone's claims live
 */
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Loader2, Users, Lock, ChevronRight } from 'lucide-react';
import { joinSession, toggleClaim } from '@/lib/api';
import { useSession } from '@/hooks/useSession';
import { getDeviceToken } from '@/lib/device';
import type { ReceiptItem, Participant } from '@/lib/types';

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

function Avatar({ name, size = 'sm', isMe = false }: { name: string; size?: 'sm' | 'md'; isMe?: boolean }) {
  const bg = isMe ? 'bg-sky-500' : avatarColor(name);
  const sz = size === 'md' ? 'w-10 h-10 text-sm' : 'w-7 h-7 text-xs';
  return (
    <div
      className={`${sz} ${bg} rounded-full flex items-center justify-center font-bold text-white shadow-soft ring-2 ${isMe ? 'ring-sky-300' : 'ring-white'} flex-shrink-0`}
      title={name}
    >
      {name.charAt(0).toUpperCase()}
    </div>
  );
}

// ─── Food image ───────────────────────────────────────────────────────────────

function FoodImage({ url, name }: { url?: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    const emojis = ['🍔','🍕','🥗','🍜','🍣','🥩','🍗','🥘','🍱','🌮'];
    let hash = 0;
    for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
    const emoji = emojis[Math.abs(hash) % emojis.length];
    return (
      <div className="w-12 h-12 rounded-xl bg-sky-100 flex items-center justify-center text-xl flex-shrink-0">
        {emoji}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={name}
      onError={() => setFailed(true)}
      className="w-12 h-12 rounded-xl object-cover flex-shrink-0 bg-slate-100"
    />
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
  const iClaimed = claimants.some(p => p.id === myParticipantId);
  const sharedCost = claimants.length > 0 ? item.price * item.quantity / claimants.length : null;

  return (
    <button
      onClick={onToggle}
      disabled={isPending}
      className={`w-full text-left rounded-xl border-2 p-3 transition-all duration-150
        ${iClaimed
          ? 'border-sky-400 bg-sky-50 shadow-md'
          : 'border-slate-200 bg-white hover:border-sky-300 hover:shadow-soft'
        }
        ${isPending ? 'opacity-60 pointer-events-none' : 'active:scale-[0.98]'}
      `}
    >
      <div className="flex items-center gap-3">
        <FoodImage url={item.image_url} name={item.name} />

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1.5">
            <p className="font-semibold text-slate-800 truncate text-sm">{item.name}</p>
            {item.quantity > 1 && (
              <span className="text-xs text-slate-400">×{item.quantity}</span>
            )}
          </div>

          {claimants.length > 0 && (
            <div className="flex items-center gap-1.5 mt-1">
              <div className="flex -space-x-1">
                {claimants.slice(0, 4).map(p => (
                  <Avatar key={p.id} name={p.name} size="sm" isMe={p.id === myParticipantId} />
                ))}
                {claimants.length > 4 && (
                  <div className="w-7 h-7 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-slate-500">
                    +{claimants.length - 4}
                  </div>
                )}
              </div>
              {claimants.length > 1 && sharedCost !== null && (
                <span className="text-xs text-slate-400">{fmt(sharedCost)} each</span>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="text-right">
            <p className={`font-bold text-sm ${iClaimed ? 'text-sky-600' : 'text-slate-700'}`}>
              {fmt(item.price * item.quantity)}
            </p>
          </div>
          <div
            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all
              ${iClaimed ? 'border-sky-500 bg-sky-500' : 'border-slate-300 bg-white'}`}
          >
            {isPending
              ? <Loader2 size={10} className="text-sky-500 animate-spin" />
              : iClaimed && <span className="text-white text-xs font-black">✓</span>
            }
          </div>
        </div>
      </div>
    </button>
  );
}

// ─── Name entry ───────────────────────────────────────────────────────────────

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
    <div className="space-y-5 animate-slide-up">
      <div className="card p-5 text-center">
        <div className="text-4xl mb-2">👋</div>
        <h1 className="text-xl font-extrabold text-slate-800">Join the split</h1>
        {session.receipt.merchant_name && (
          <p className="text-sm text-slate-500 mt-1">{session.receipt.merchant_name}</p>
        )}
      </div>

      {session.participants.length > 0 && (
        <div className="card p-4">
          <p className="label">Already here ({session.participants.length})</p>
          <div className="flex flex-wrap gap-2">
            {session.participants.map((p: Participant) => (
              <div key={p.id} className="flex items-center gap-1.5 pill bg-sky-50 text-sky-600 border border-sky-200">
                <Avatar name={p.name} size="sm" />
                <span className="font-semibold">{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card p-5 space-y-3">
        <label className="label">Your name</label>
        <input
          autoFocus
          className="input"
          placeholder="e.g. Sara, John..."
          value={name}
          maxLength={30}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        {err && <p className="text-xs text-red-600">{err}</p>}
        <button
          onClick={submit}
          disabled={joining || !name.trim()}
          className="btn-primary"
        >
          {joining ? (
            <><Loader2 size={16} className="animate-spin" /> Joining...</>
          ) : (
            <>Join<ChevronRight size={16} /></>
          )}
        </button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SessionPage() {
  const params = useParams() as { token?: string } | null;
  const token = params?.token as string | undefined;
  const router = useRouter();
  const { session, loading, error } = useSession(token ?? null);

  const [participantId, setParticipantId] = useState<string | null>(null);
  const [pendingItemId, setPendingItemId] = useState<string | null>(null);

  useEffect(() => {
    if (session?.status === 'locked') {
      router.replace(`/session/${token}/results`);
    }
  }, [session?.status, token, router]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(`splitreceipt_pid_${token}`);
      if (stored) setParticipantId(stored);
    } catch { /* ignore */ }
  }, [token]);

  // ── Join ──────────────────────────────────────────────────────────────────

  async function handleJoin(name: string) {
    const deviceToken = getDeviceToken();
    const { participant_id } = await joinSession(token, name, deviceToken);
    setParticipantId(participant_id);
    try {
      localStorage.setItem(`splitreceipt_pid_${token}`, participant_id);
    } catch { /* ignore */ }
  }

  // ── Toggle claim ──────────────────────────────────────────────────────────

  async function handleToggle(item: ReceiptItem) {
    if (!participantId || pendingItemId) return;
    const alreadyClaimed = session!.claims.some(
      c => c.item_id === item.id && c.participant_id === participantId
    );
    setPendingItemId(item.id);
    try {
      await toggleClaim(token, item.id, participantId, !alreadyClaimed);
    } finally {
      setPendingItemId(null);
    }
  }

  // ── Guards ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex flex-col items-center gap-4 pt-16">
        <Loader2 size={48} className="text-sky-500 animate-spin" />
        <p className="text-sm text-slate-500">Loading session...</p>
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

  // ── Name gate ─────────────────────────────────────────────────────────────

  if (!participantId) {
    return <JoinScreen session={session} onJoin={handleJoin} />;
  }

  // ── Build data ────────────────────────────────────────────────────────────

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

  const mySubtotal = session.receipt.items.reduce((sum, item) => {
    const cl = claimantsByItem[item.id];
    if (!cl) return sum;
    const mine = cl.find(p => p.id === participantId);
    if (!mine) return sum;
    return sum + (item.price * item.quantity) / cl.length;
  }, 0);

  const isCreator = session.participants[0]?.id === participantId;

  // ── Main view ─────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <h1 className="font-extrabold text-slate-800 text-lg truncate">
            {session.receipt.merchant_name ?? 'Split the bill'}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Tap what <strong>you</strong> ate, {me?.name ?? 'friend'}
          </p>
        </div>
        <div className="flex -space-x-1.5 flex-shrink-0">
          {session.participants.slice(0, 4).map((p: Participant) => (
            <Avatar key={p.id} name={p.name} size="sm" isMe={p.id === participantId} />
          ))}
          {session.participants.length > 4 && (
            <div className="w-7 h-7 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-[10px] font-bold text-slate-500">
              +{session.participants.length - 4}
            </div>
          )}
        </div>
      </div>

      <div className="card p-3 flex items-center gap-2 text-xs">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
        </span>
        <span className="text-slate-500">
          <strong className="text-slate-700">{session.participants.length}</strong> live · <strong className="text-sky-600">{session.claims.length}</strong> claims
        </span>
        <span className="ml-auto text-slate-400 font-medium">
          Total {fmt(session.receipt.total)}
        </span>
      </div>

      <div className="space-y-2">
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

      <div className="card-sky p-4 flex items-center justify-between">
        <div>
          <p className="text-xs text-slate-500 font-medium">Your share so far</p>
          <p className="text-slate-800 font-black text-2xl mt-0.5">{fmt(mySubtotal)}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-400">of {fmt(session.receipt.total)}</p>
          {session.receipt.tax > 0 && (
            <p className="text-[10px] text-slate-400 mt-0.5">+ tax/tip proportional</p>
          )}
        </div>
      </div>

      {isCreator && session.status === 'open' && (
        <div className="card p-4 space-y-3 border-2 border-dashed !border-sky-300 !bg-sky-50">
          <div className="flex items-center gap-2">
            <Lock size={13} className="text-sky-600" />
            <p className="text-xs font-semibold text-sky-700">Ready to lock?</p>
          </div>
          <p className="text-xs text-slate-600">
            Once everyone's claimed their items, lock the bill to see final amounts.
          </p>
          <button
            onClick={() => router.push(`/session/${token}/results`)}
            className="btn-primary !py-3"
          >
            <Lock size={15} />
            <span>Set Payer & Lock</span>
            <ChevronRight size={15} className="ml-auto" />
          </button>
        </div>
      )}

      {!isCreator && session.status === 'open' && (
        <div className="text-center py-2">
          <p className="text-xs text-slate-400 flex items-center justify-center gap-1.5">
            <Users size={11} />
            Waiting for the creator to lock
          </p>
        </div>
      )}
    </div>
  );
}
