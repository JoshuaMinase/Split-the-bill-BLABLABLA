'use client';
/**
 * Step 1 — Upload receipt
 * Photo-first: take/upload a photo → AI parses → review/edit → create session → share link
 * Manual entry is available as a fallback after a failed parse, or via "Enter manually" button.
 */
import { useState, useRef, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Upload, Trash2, Plus, Loader2, Check, Copy, Share2, ChevronRight, PenLine } from 'lucide-react';
import { parseReceipt, createSession } from '@/lib/api';
import type { ReceiptDraft } from '@/lib/types';

function fmt(n: number) {
  return n.toFixed(2);
}

function emptyDraft(): ReceiptDraft {
  return {
    merchant_name: '',
    items: [{ name: '', price: 0, quantity: 1 }],
    subtotal: 0,
    tax: 0,
    tip: 0,
    total: 0,
  };
}

type Step = 'upload' | 'review' | 'done';

// ─── Step progress ─────────────────────────────────────────────────────────────

function StepBar({ step }: { step: Step }) {
  const idx = step === 'upload' ? 0 : step === 'review' ? 1 : 2;
  return (
    <div className="flex gap-1.5">
      {[0, 1, 2].map(i => (
        <div
          key={i}
          className={`flex-1 h-1 rounded-full transition-all duration-300
            ${i <= idx ? 'bg-sky-500' : 'bg-slate-200'}`}
        />
      ))}
    </div>
  );
}

// ─── Food thumbnail ────────────────────────────────────────────────────────────

function FoodThumb({ url, name }: { url?: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  const emojis = ['🍔','🍕','🥗','🍜','🍣','🥩','🍗','🥘','🍱','🌮'];
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
  const emoji = emojis[Math.abs(hash) % emojis.length];

  if (!url || failed) {
    return (
      <div className="w-10 h-10 rounded-lg bg-sky-100 flex items-center justify-center text-lg flex-shrink-0">
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
      className="w-10 h-10 rounded-lg object-cover flex-shrink-0 bg-slate-100"
    />
  );
}

// ─── Item row ──────────────────────────────────────────────────────────────────

function ItemRow({
  item,
  index,
  onUpdate,
  onRemove,
  canRemove,
}: {
  item: { name: string; price: number; quantity: number; image_url?: string | null };
  index: number;
  onUpdate: (i: number, field: string, v: string | number) => void;
  onRemove: (i: number) => void;
  canRemove: boolean;
}) {
  return (
    <div className="flex gap-2 items-center">
      <FoodThumb url={item.image_url} name={item.name} />
      <input
        className="input flex-1 !py-2.5 !text-sm"
        placeholder="Item name"
        value={item.name}
        onChange={(e) => onUpdate(index, 'name', e.target.value)}
      />
      <input
        type="number"
        min="0"
        step="0.01"
        inputMode="decimal"
        className="input !w-20 !py-2.5 !text-sm text-right"
        placeholder="0.00"
        value={item.price || ''}
        onChange={(e) => onUpdate(index, 'price', e.target.value)}
      />
      <input
        type="number"
        min="1"
        inputMode="numeric"
        className="input !w-12 !py-2.5 !text-sm text-center"
        value={item.quantity}
        onChange={(e) => onUpdate(index, 'quantity', e.target.value)}
      />
      {canRemove && (
        <button
          onClick={() => onRemove(index)}
          className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center text-red-400 hover:bg-red-100 hover:text-red-600 transition-colors flex-shrink-0"
        >
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [preview, setPreview]       = useState<string | null>(null);
  const [draft,   setDraft]         = useState<ReceiptDraft | null>(null);
  const [parsing, setParsing]       = useState(false);
  const [creating, setCreating]     = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [shareLink, setShareLink]   = useState<string | null>(null);
  const [copied,  setCopied]        = useState(false);

  const step: Step = shareLink ? 'done' : draft ? 'review' : 'upload';

  // ── Pick image ─────────────────────────────────────────────────────────────

  async function handleFile(file: File) {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    setParseError(null);
    setDraft(null);          // clear previous draft so review panel hides
    setParsing(true);
    try {
      const result = await parseReceipt(file);
      setDraft({ ...result, merchant_name: result.merchant_name ?? '' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not read receipt';
      setParseError(msg);
      // Do NOT auto-open empty draft — show the error with a "Try again / Enter manually" choice
    } finally {
      setParsing(false);
    }
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    // Reset input so the same file can be reselected
    e.target.value = '';
  }

  function retake() {
    setParseError(null);
    fileInputRef.current?.click();
  }

  function enterManually() {
    setParseError(null);
    setDraft(emptyDraft());
  }

  // ── Draft editing ──────────────────────────────────────────────────────────

  function updateItem(index: number, field: string, value: string | number) {
    if (!draft) return;
    const items = draft.items.map((item, i) =>
      i === index ? { ...item, [field]: field === 'name' ? value : Number(value) } : item
    );
    const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
    setDraft({ ...draft, items, subtotal, total: subtotal + draft.tax + draft.tip });
  }

  function addItem() {
    if (!draft) return;
    setDraft({ ...draft, items: [...draft.items, { name: '', price: 0, quantity: 1 }] });
  }

  function removeItem(index: number) {
    if (!draft) return;
    const items = draft.items.filter((_, i) => i !== index);
    const subtotal = items.reduce((s, it) => s + it.price * it.quantity, 0);
    setDraft({ ...draft, items, subtotal, total: subtotal + draft.tax + draft.tip });
  }

  function updateTaxTip(field: 'tax' | 'tip', value: string) {
    if (!draft) return;
    const n = parseFloat(value) || 0;
    const updated = { ...draft, [field]: n };
    updated.total = updated.subtotal + updated.tax + updated.tip;
    setDraft(updated);
  }

  // ── Create session ─────────────────────────────────────────────────────────

  async function handleCreate() {
    if (!draft) return;
    setCreating(true);
    setParseError(null);
    try {
      const { token } = await createSession(draft);
      const link = `${window.location.origin}/session/${token}`;
      setShareLink(link);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed to create session');
    } finally {
      setCreating(false);
    }
  }

  // ── Share ──────────────────────────────────────────────────────────────────

  async function copyLink() {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* ignore */ }
  }

  async function nativeShare() {
    if (!shareLink || !navigator.share) return;
    try {
      await navigator.share({
        title: 'Split the bill',
        text: 'Tap what you ate to split the receipt 🧾',
        url: shareLink,
      });
    } catch { /* user dismissed */ }
  }

  function goToSession() {
    if (!shareLink) return;
    const token = shareLink.split('/').pop();
    if (!token) return;
    router.push(`/session/${token}`);
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-slate-800">Split a bill</h1>
        <div className="text-xs text-slate-400 font-semibold">
          Step {step === 'upload' ? '1' : step === 'review' ? '2' : '3'}/3
        </div>
      </div>

      <StepBar step={step} />

      {/* ── STEP 1 + 2: Photo zone (always visible until done) ─────────── */}
      {!shareLink && (
        <>
          {/* Photo card */}
          <div
            onClick={() => !parsing && !draft && fileInputRef.current?.click()}
            className={`relative card p-6 flex flex-col items-center gap-4 text-center transition-all
              ${parsing ? 'pointer-events-none' : ''}
              ${!draft ? 'cursor-pointer hover:shadow-md active:scale-[0.99]' : ''}`}
          >
            {parsing ? (
              <>
                <Loader2 size={48} className="text-sky-500 animate-spin" />
                <div>
                  <p className="font-semibold text-slate-800">Reading your receipt...</p>
                  <p className="text-xs text-slate-400 mt-1">This can take up to 30 seconds</p>
                </div>
              </>
            ) : preview ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview}
                  alt="Receipt"
                  className="max-h-44 w-auto rounded-xl object-contain shadow-sm"
                />
                {draft && (
                  <button
                    onClick={(e) => { e.stopPropagation(); retake(); }}
                    className="text-xs text-sky-600 font-medium hover:text-sky-700 flex items-center gap-1"
                  >
                    <Camera size={12} /> Retake photo
                  </button>
                )}
              </>
            ) : (
              <>
                <div className="w-16 h-16 rounded-2xl bg-sky-500 flex items-center justify-center shadow-glow-sm">
                  <Camera size={28} className="text-white" />
                </div>
                <div>
                  <p className="font-bold text-slate-800">Take or upload a photo</p>
                  <p className="text-sm text-slate-500 mt-1">AI will read the items automatically</p>
                </div>
                <div className="flex gap-2">
                  <div className="pill bg-sky-50 text-sky-600 border border-sky-200">
                    <Camera size={12} /> Camera
                  </div>
                  <div className="pill bg-sky-50 text-sky-600 border border-sky-200">
                    <Upload size={12} /> Gallery
                  </div>
                </div>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={onFileChange}
            />
          </div>

          {/* Parse error with clear recovery options */}
          {parseError && !draft && (
            <div className="card !bg-red-50 !border-red-200 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <span className="text-red-500 text-lg flex-shrink-0">⚠️</span>
                <div>
                  <p className="text-sm font-semibold text-red-800">Couldn't read the receipt</p>
                  <p className="text-xs text-red-700 mt-0.5 leading-relaxed">{parseError}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={retake}
                  className="flex-1 btn-primary !py-2.5 !text-sm"
                >
                  <Camera size={14} /> Try again
                </button>
                <button
                  onClick={enterManually}
                  className="flex-1 rounded-xl border-2 border-slate-200 bg-white py-2.5 text-sm font-semibold text-slate-700 hover:border-sky-300 transition-colors flex items-center justify-center gap-1.5"
                >
                  <PenLine size={14} /> Enter manually
                </button>
              </div>
            </div>
          )}

          {/* "Enter manually" nudge on the upload screen (no photo yet) */}
          {!preview && !parsing && (
            <button
              onClick={enterManually}
              className="w-full text-center text-xs text-slate-400 hover:text-sky-600 transition-colors py-1 flex items-center justify-center gap-1"
            >
              <PenLine size={11} /> Enter items manually instead
            </button>
          )}
        </>
      )}

      {/* ── STEP 2: Review ──────────────────────────────────────────────── */}
      {draft && !shareLink && (
        <div className="space-y-4 animate-slide-up">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-slate-700">
              {parseError ? 'Enter items' : 'Review items'}
            </p>
            {/* Retake is now shown on the photo card above, not here */}
          </div>

          <div>
            <label className="label">Restaurant (optional)</label>
            <input
              className="input"
              value={draft.merchant_name ?? ''}
              placeholder="Restaurant name"
              onChange={(e) => setDraft({ ...draft, merchant_name: e.target.value })}
            />
          </div>

          <div>
            <label className="label">Items ({draft.items.length})</label>
            <div className="space-y-2">
              {draft.items.map((item, i) => (
                <ItemRow
                  key={i}
                  index={i}
                  item={item}
                  onUpdate={updateItem}
                  onRemove={removeItem}
                  canRemove={draft.items.length > 1}
                />
              ))}
            </div>
            <button
              onClick={addItem}
              className="mt-2 w-full border-2 border-dashed border-sky-200 rounded-xl py-2.5 flex items-center justify-center gap-1.5 text-sm text-sky-600 font-medium hover:border-sky-300 hover:bg-sky-50 transition-colors"
            >
              <Plus size={14} /> Add item
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Tax</label>
              <input
                type="number" min="0" step="0.01" inputMode="decimal"
                className="input text-right"
                value={draft.tax || ''}
                placeholder="0.00"
                onChange={(e) => updateTaxTip('tax', e.target.value)}
              />
            </div>
            <div>
              <label className="label">Tip</label>
              <input
                type="number" min="0" step="0.01" inputMode="decimal"
                className="input text-right"
                value={draft.tip || ''}
                placeholder="0.00"
                onChange={(e) => updateTaxTip('tip', e.target.value)}
              />
            </div>
          </div>

          <div className="card-sky p-4 space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-600">
              <span>Subtotal</span>
              <span className="font-medium">{fmt(draft.subtotal)}</span>
            </div>
            {draft.tax > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Tax</span><span>{fmt(draft.tax)}</span>
              </div>
            )}
            {draft.tip > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Tip</span><span>{fmt(draft.tip)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-slate-800 border-t border-sky-200 pt-1.5 mt-1">
              <span>Total</span>
              <span className="text-sky-600 text-lg">{fmt(draft.total)}</span>
            </div>
          </div>

          {parseError && (
            <div className="card !bg-red-50 !border-red-200 p-3 text-sm text-red-700">
              {parseError}
            </div>
          )}

          <button
            onClick={handleCreate}
            disabled={creating || draft.items.every(it => !it.name.trim())}
            className="btn-primary"
          >
            {creating ? (
              <><Loader2 size={16} className="animate-spin" /> Creating...</>
            ) : (
              <>Create Group <ChevronRight size={16} /></>
            )}
          </button>
        </div>
      )}

      {/* ── STEP 3: Share link ──────────────────────────────────────────── */}
      {shareLink && (
        <div className="space-y-4 animate-slide-up">
          <div className="card p-5 text-center space-y-1">
            <div className="w-14 h-14 rounded-2xl bg-green-500 flex items-center justify-center shadow-glow mx-auto mb-3">
              <span className="text-2xl">✓</span>
            </div>
            <p className="font-extrabold text-slate-800 text-xl">Group created!</p>
            <p className="text-sm text-slate-500">
              Send this link to everyone at the table
            </p>
          </div>

          {/* Big copy button — primary action */}
          <div className="card p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Share link</p>
            <div className="flex gap-2">
              <input
                readOnly
                value={shareLink}
                className="input flex-1 !text-xs font-mono truncate bg-slate-50"
                onFocus={(e) => e.target.select()}
              />
              <button
                onClick={copyLink}
                className={`px-4 py-3 rounded-xl font-semibold text-sm flex items-center gap-1.5 transition-all min-w-[90px] justify-center
                  ${copied
                    ? 'bg-green-500 text-white'
                    : 'bg-sky-500 hover:bg-sky-600 text-white shadow-glow-sm'
                  }`}
              >
                {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy</>}
              </button>
            </div>

            {/* Native share (shows on mobile) */}
            {typeof navigator !== 'undefined' && 'share' in navigator && (
              <button
                onClick={nativeShare}
                className="w-full btn-primary !bg-green-500 hover:!bg-green-600"
              >
                <Share2 size={16} />
                Share via WhatsApp / SMS / ...
              </button>
            )}
          </div>

          <button
            onClick={goToSession}
            className="w-full rounded-xl border-2 border-slate-200 bg-white py-3 text-sm font-semibold text-slate-700 hover:border-sky-300 transition-colors flex items-center justify-center gap-2"
          >
            Open session as creator
            <ChevronRight size={15} />
          </button>

          <p className="text-center text-xs text-slate-400">
            Everyone who opens the link can claim what they ate
          </p>
        </div>
      )}
    </div>
  );
}
