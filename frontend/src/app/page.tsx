'use client';
/**
 * Step 1 — Upload receipt
 * User takes photo → AI parses → review items → create session
 */
import { useState, useRef, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Upload, Trash2, Plus, Loader2, Check, Copy, Share2 } from 'lucide-react';
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

// ─── Step progress ────────────────────────────────────────────────────────────

function StepBar({ step }: { step: Step }) {
  const steps: { id: Step; label: string }[] = [
    { id: 'upload', label: 'Upload' },
    { id: 'review', label: 'Review' },
    { id: 'done',   label: 'Share'  },
  ];
  const idx = steps.findIndex(s => s.id === step);

  return (
    <div className="flex items-center gap-2">
      {steps.map((s, i) => (
        <div key={s.id} className="flex items-center gap-2 flex-1">
          <div
            className={`flex-1 h-1 rounded-full transition-all duration-300
              ${i <= idx ? 'bg-sky-500' : 'bg-slate-200'}`}
          />
          {i === steps.length - 1 && null}
        </div>
      ))}
    </div>
  );
}

// ─── Upload zone ──────────────────────────────────────────────────────────────

function UploadZone({
  preview,
  parsing,
  onFileChange,
  fileInputRef,
}: {
  preview: string | null;
  parsing: boolean;
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
}) {
  return (
    <div
      onClick={() => !parsing && fileInputRef.current?.click()}
      className={`relative card p-6 flex flex-col items-center gap-4 text-center cursor-pointer transition-all
        ${parsing ? 'pointer-events-none' : 'hover:shadow-md active:scale-[0.99]'}`}
    >
      {parsing ? (
        <>
          <Loader2 size={48} className="text-sky-500 animate-spin" />
          <div>
            <p className="font-semibold text-slate-800">Reading your receipt...</p>
            <p className="text-xs text-slate-400 mt-1">AI is working on it</p>
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
          <p className="text-xs text-sky-600 font-medium flex items-center gap-1">
            <Camera size={12} /> Tap to change photo
          </p>
        </>
      ) : (
        <>
          <div className="w-16 h-16 rounded-2xl bg-sky-500 flex items-center justify-center shadow-glow-sm">
            <Camera size={28} className="text-white" />
          </div>
          <div>
            <p className="font-bold text-slate-800">Take or upload a photo</p>
            <p className="text-sm text-slate-500 mt-1">AI will read the items for you</p>
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
  );
}

// ─── Food thumbnail ───────────────────────────────────────────────────────────

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

// ─── Item row ─────────────────────────────────────────────────────────────────

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
        placeholder="Item"
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

// ─── Main page ────────────────────────────────────────────────────────────────

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

  // ── Pick image ────────────────────────────────────────────────────────────

  async function handleFile(file: File) {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(URL.createObjectURL(file));
    setParseError(null);
    setDraft(null);
    setParsing(true);
    try {
      const result = await parseReceipt(file);
      setDraft({ ...result, merchant_name: result.merchant_name ?? '' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not read receipt';
      setParseError(msg);
      // Auto-open manual entry so the user isn't stuck
      setDraft(emptyDraft());
    } finally {
      setParsing(false);
    }
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  // ── Draft editing ─────────────────────────────────────────────────────────

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

  // ── Create session ────────────────────────────────────────────────────────

  async function handleCreate() {
    if (!draft) return;
    setCreating(true);
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

  async function copyLink() {
    if (!shareLink) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* ignore */ }
  }

  function goToSession() {
    if (!shareLink) return;
    const token = shareLink.split('/').pop();
    if (!token) return;
    router.push(`/session/${token}`);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold text-slate-800">Split a bill</h1>
        <div className="text-xs text-slate-400 font-semibold">
          Step {step === 'upload' ? '1' : step === 'review' ? '2' : '3'}/3
        </div>
      </div>

      <StepBar step={step} />

      {/* ── STEP 1: Upload ─────────────────────────────────────────────── */}
      {!shareLink && (
        <UploadZone
          preview={preview}
          parsing={parsing}
          onFileChange={onFileChange}
          fileInputRef={fileInputRef}
        />
      )}

      {parseError && (
        <div className="card !bg-amber-50 !border-amber-200 p-4 flex items-start gap-2">
          <span className="text-amber-500 text-lg flex-shrink-0">⚠️</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-800">Couldn't read the receipt automatically</p>
            <p className="text-xs text-amber-700 mt-0.5">Enter the items manually below — it only takes a minute.</p>
          </div>
        </div>
      )}

      {/* ── STEP 2: Review ──────────────────────────────────────────────── */}
      {draft && !shareLink && (
        <div className="space-y-4 animate-slide-up">
          <div className="flex items-center justify-between">
            <p className="font-semibold text-slate-700">Review items</p>
            {preview && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-xs text-sky-600 font-medium hover:text-sky-700 flex items-center gap-1"
              >
                <Camera size={11} /> Retake
              </button>
            )}
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
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                className="input text-right"
                value={draft.tax || ''}
                placeholder="0.00"
                onChange={(e) => updateTaxTip('tax', e.target.value)}
              />
            </div>
            <div>
              <label className="label">Tip</label>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
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
                <span>Tax</span>
                <span>{fmt(draft.tax)}</span>
              </div>
            )}
            {draft.tip > 0 && (
              <div className="flex justify-between text-slate-600">
                <span>Tip</span>
                <span>{fmt(draft.tip)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-slate-800 border-t border-sky-200 pt-1.5 mt-1">
              <span>Total</span>
              <span className="text-sky-600 text-lg">{fmt(draft.total)}</span>
            </div>
          </div>

          <button
            onClick={handleCreate}
            disabled={creating || draft.items.length === 0}
            className="btn-primary"
          >
            {creating ? (
              <><Loader2 size={16} className="animate-spin" /> Creating...</>
            ) : (
              'Create Group'
            )}
          </button>
        </div>
      )}

      {/* ── STEP 3: Share link ──────────────────────────────────────────── */}
      {shareLink && (
        <div className="space-y-4 animate-slide-up">
          <div className="card p-5 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-green-500 flex items-center justify-center shadow-glow mx-auto">
              <span className="text-2xl">✓</span>
            </div>
            <div>
              <p className="font-extrabold text-slate-800 text-lg">All set!</p>
              <p className="text-sm text-slate-500 mt-0.5">Share this link with everyone</p>
            </div>

            <div className="flex gap-2">
              <input
                readOnly
                value={shareLink}
                className="input flex-1 !text-xs font-mono truncate"
                onFocus={(e) => e.target.select()}
              />
              <button
                onClick={copyLink}
                className={`px-4 py-3 rounded-xl font-semibold text-sm flex items-center gap-1.5 transition-all
                  ${copied ? 'bg-green-500 text-white' : 'bg-sky-500 text-white shadow-glow-sm'}`}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          <button onClick={goToSession} className="btn-primary">
            <Share2 size={16} />
            Open Session
          </button>
        </div>
      )}
    </div>
  );
}
