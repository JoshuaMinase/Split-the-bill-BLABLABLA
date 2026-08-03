'use client';
/**
 * Page 1 — Upload receipt
 * 1. Take a photo or choose an image.
 * 2. Grok reads it and returns a draft list of items.
 * 3. User reviews / edits items, tax, tip.
 * 4. Confirm → creates the session → copies the share link.
 */
import { useState, useRef, ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import {
  Camera, Upload, Trash2, Plus, Loader2, Check, Copy,
  ReceiptText, ChevronRight, Sparkles, Share2,
} from 'lucide-react';
import { parseReceipt, createSession } from '@/lib/api';
import type { ReceiptDraft } from '@/lib/types';

// ─── helpers ──────────────────────────────────────────────────────────────────

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

// Which "step" we're in so we can show progress
type Step = 'upload' | 'review' | 'done';

// ─── Step progress bar ────────────────────────────────────────────────────────

function StepBar({ step }: { step: Step }) {
  const steps: { id: Step; label: string; emoji: string }[] = [
    { id: 'upload', label: 'Scan',    emoji: '📸' },
    { id: 'review', label: 'Review',  emoji: '✏️' },
    { id: 'done',   label: 'Share',   emoji: '🎉' },
  ];
  const idx = steps.findIndex((s) => s.id === step);

  return (
    <div className="flex items-center gap-1 mb-6">
      {steps.map((s, i) => (
        <div key={s.id} className="flex items-center flex-1">
          <div className="flex flex-col items-center flex-1">
            <div
              className={`w-9 h-9 rounded-2xl flex items-center justify-center text-sm font-bold transition-all duration-300
                ${i < idx  ? 'bg-emerald-500 text-white shadow-md' :
                  i === idx ? 'bg-brand-gradient text-white shadow-glow-sm' :
                              'bg-gray-100 text-gray-400'}`}
            >
              {i < idx ? '✓' : s.emoji}
            </div>
            <span
              className={`text-[10px] font-semibold mt-1 transition-colors
                ${i === idx ? 'text-brand-600' : i < idx ? 'text-emerald-500' : 'text-gray-300'}`}
            >
              {s.label}
            </span>
          </div>
          {i < steps.length - 1 && (
            <div
              className={`h-0.5 w-full mx-1 rounded-full transition-colors duration-500
                ${i < idx ? 'bg-emerald-400' : 'bg-gray-200'}`}
            />
          )}
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
  const [dragging, setDragging] = useState(false);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      // Synthetic file-input change for handleFile
      const dt = new DataTransfer();
      dt.items.add(file);
      const inp = fileInputRef.current;
      if (inp) {
        Object.defineProperty(inp, 'files', { value: dt.files, writable: false });
        inp.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }

  return (
    <div
      onClick={() => !parsing && fileInputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={`relative overflow-hidden rounded-3xl border-2 border-dashed transition-all duration-200 cursor-pointer
        ${dragging
          ? 'border-brand-500 bg-brand-50 scale-[1.01]'
          : preview
            ? 'border-brand-300 bg-white'
            : 'border-brand-300 bg-gradient-to-br from-brand-50 to-purple-50 hover:border-brand-500 hover:shadow-card-lg'
        }
        ${parsing ? 'pointer-events-none' : ''}
      `}
    >
      {/* Decorative blobs */}
      {!preview && !parsing && (
        <>
          <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-brand-200/30 blur-xl" />
          <div className="absolute -bottom-4 -left-4 w-16 h-16 rounded-full bg-purple-200/40 blur-xl" />
        </>
      )}

      <div className="relative p-7 flex flex-col items-center gap-4">
        {parsing ? (
          /* AI parsing state */
          <div className="flex flex-col items-center gap-3 py-4">
            <div className="relative">
              <div className="w-16 h-16 rounded-3xl bg-brand-gradient flex items-center justify-center shadow-glow">
                <Sparkles size={28} className="text-white animate-pulse" />
              </div>
              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-400 border-2 border-white flex items-center justify-center">
                <Loader2 size={10} className="text-white animate-spin" />
              </div>
            </div>
            <div className="text-center">
              <p className="font-semibold text-brand-700 text-sm">AI is reading your receipt…</p>
              <p className="text-xs text-gray-400 mt-0.5">This takes just a moment</p>
            </div>
          </div>
        ) : preview ? (
          /* Preview state */
          <div className="w-full flex flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={preview}
              alt="Receipt preview"
              className="max-h-52 w-auto rounded-2xl object-contain shadow-card"
            />
            <p className="text-xs text-brand-600 font-medium flex items-center gap-1">
              <Camera size={12} /> Tap to change photo
            </p>
          </div>
        ) : (
          /* Empty / idle state */
          <>
            <div className="w-16 h-16 rounded-3xl bg-brand-gradient flex items-center justify-center shadow-glow-sm">
              <Camera size={28} className="text-white" />
            </div>
            <div className="text-center">
              <p className="font-bold text-gray-800 text-base">Take or upload a photo</p>
              <p className="text-sm text-gray-500 mt-1">Point at the receipt — AI reads it for you</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 bg-white rounded-2xl px-3 py-2 shadow-sm border border-gray-100">
                <Camera size={14} className="text-brand-500" />
                <span className="text-xs font-medium text-gray-600">Camera</span>
              </div>
              <div className="flex items-center gap-1.5 bg-white rounded-2xl px-3 py-2 shadow-sm border border-gray-100">
                <Upload size={14} className="text-brand-500" />
                <span className="text-xs font-medium text-gray-600">Gallery</span>
              </div>
            </div>
          </>
        )}
      </div>

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

// ─── Food image thumbnail ─────────────────────────────────────────────────────

function FoodThumb({ url, name }: { url?: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  const emojis = ['🍔','🍕','🥗','🍜','🍣','🥩','🍗','🥘','🍱','🌮','🥙','🍛','🫕','🥪'];
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffffffff;
  const emoji = emojis[Math.abs(hash) % emojis.length];

  if (!url || failed) {
    return (
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-100 to-purple-100 flex items-center justify-center text-lg flex-shrink-0">
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
      className="w-10 h-10 rounded-xl object-cover flex-shrink-0 bg-gray-100"
    />
  );
}

// ─── Item row editor ──────────────────────────────────────────────────────────

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
    <div className="flex gap-2 items-center animate-fade-in">
      {/* Food thumbnail */}
      <FoodThumb url={item.image_url} name={item.name} />
      {/* Name */}
      <input
        className="input-field flex-1 !py-2.5 !text-sm"
        placeholder="Item name"
        value={item.name}
        onChange={(e) => onUpdate(index, 'name', e.target.value)}
      />
      {/* Price */}
      <input
        type="number"
        min="0"
        step="0.01"
        inputMode="decimal"
        className="input-field !w-20 !py-2.5 !text-sm text-right"
        placeholder="0.00"
        value={item.price || ''}
        onChange={(e) => onUpdate(index, 'price', e.target.value)}
      />
      {/* Qty */}
      <input
        type="number"
        min="1"
        inputMode="numeric"
        className="input-field !w-12 !py-2.5 !text-sm text-center"
        title="Quantity"
        value={item.quantity}
        onChange={(e) => onUpdate(index, 'quantity', e.target.value)}
      />
      {/* Remove */}
      {canRemove && (
        <button
          onClick={() => onRemove(index)}
          className="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center text-rose-400 hover:bg-rose-100 hover:text-rose-600 transition-colors flex-shrink-0"
          aria-label="Remove item"
        >
          <Trash2 size={15} />
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

  // ── Image pick ──────────────────────────────────────────────────────────────

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
      setParseError(err instanceof Error ? err.message : 'Could not read receipt');
    } finally {
      setParsing(false);
    }
  }

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  // ── Draft editing ───────────────────────────────────────────────────────────

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

  // ── Confirm & create session ─────────────────────────────────────────────────

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
    } catch {
      // Clipboard API not available — user can manually copy
    }
  }

  function goToSession() {
    if (!shareLink) return;
    const token = shareLink.split('/').pop();
    if (!token) return;
    router.push(`/session/${token}`);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-5">
      {/* Step progress */}
      <StepBar step={step} />

      {/* ── STEP 1: Upload zone ───────────────────────────────────── */}
      {!shareLink && (
        <UploadZone
          preview={preview}
          parsing={parsing}
          onFileChange={onFileChange}
          fileInputRef={fileInputRef}
        />
      )}

      {/* Parse error */}
      {parseError && (
        <div className="flex items-start gap-3 bg-rose-50 border border-rose-200 rounded-2xl p-4">
          <span className="text-rose-400 text-lg leading-none mt-0.5">⚠️</span>
          <p className="text-sm text-rose-700 flex-1">{parseError}</p>
        </div>
      )}

      {/* ── STEP 2: Draft editor ──────────────────────────────────── */}
      {draft && !shareLink && (
        <div className="space-y-5 animate-slide-up">

          {/* Section header */}
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-2xl bg-brand-100 flex items-center justify-center">
              <ReceiptText size={16} className="text-brand-600" />
            </div>
            <div>
              <p className="font-bold text-gray-800 text-sm">Review & fix items</p>
              <p className="text-xs text-gray-400">AI may miss things — check it!</p>
            </div>
            {preview && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="ml-auto text-xs text-brand-500 font-medium hover:text-brand-700 flex items-center gap-1"
              >
                <Camera size={12} /> Retake
              </button>
            )}
          </div>

          {/* Merchant name */}
          <div>
            <label className="section-label">Restaurant</label>
            <input
              className="input-field"
              value={draft.merchant_name ?? ''}
              placeholder="Restaurant name (optional)"
              onChange={(e) => setDraft({ ...draft, merchant_name: e.target.value })}
            />
          </div>

          {/* Items list */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="section-label mb-0">Items</label>
              <span className="text-xs text-gray-400">{draft.items.length} item{draft.items.length !== 1 ? 's' : ''}</span>
            </div>

            {/* Column headers */}
            <div className="flex gap-2 mb-1 px-1">
              <span className="text-[10px] text-gray-400 flex-1">Name</span>
              <span className="text-[10px] text-gray-400 w-20 text-right">Price</span>
              <span className="text-[10px] text-gray-400 w-12 text-center">Qty</span>
              <span className="w-9" />
            </div>

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
              className="mt-3 w-full border-2 border-dashed border-brand-200 rounded-2xl py-2.5 flex items-center justify-center gap-1.5 text-sm text-brand-500 font-medium hover:border-brand-400 hover:bg-brand-50 transition-colors"
            >
              <Plus size={15} /> Add item
            </button>
          </div>

          {/* Tax & Tip */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="section-label">Tax</label>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                className="input-field text-right"
                value={draft.tax || ''}
                placeholder="0.00"
                onChange={(e) => updateTaxTip('tax', e.target.value)}
              />
            </div>
            <div>
              <label className="section-label">Tip</label>
              <input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                className="input-field text-right"
                value={draft.tip || ''}
                placeholder="0.00"
                onChange={(e) => updateTaxTip('tip', e.target.value)}
              />
            </div>
          </div>

          {/* Totals card */}
          <div className="rounded-3xl bg-gradient-to-br from-brand-50 to-purple-50 border border-brand-100 p-4 space-y-2">
            <div className="flex justify-between text-sm text-gray-500">
              <span>Subtotal</span>
              <span className="font-medium text-gray-700">{fmt(draft.subtotal)}</span>
            </div>
            {draft.tax > 0 && (
              <div className="flex justify-between text-sm text-gray-500">
                <span>Tax</span>
                <span>{fmt(draft.tax)}</span>
              </div>
            )}
            {draft.tip > 0 && (
              <div className="flex justify-between text-sm text-gray-500">
                <span>Tip</span>
                <span>{fmt(draft.tip)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold border-t border-brand-200 pt-2 mt-1">
              <span className="text-gray-800">Total</span>
              <span className="text-brand-700 text-lg">{fmt(draft.total)}</span>
            </div>
          </div>

          {/* CTA */}
          <button
            onClick={handleCreate}
            disabled={creating || draft.items.length === 0}
            className="btn-primary"
          >
            {creating ? (
              <><Loader2 size={18} className="animate-spin" /> Creating group…</>
            ) : (
              <><span>Create Group</span><ChevronRight size={18} /></>
            )}
          </button>
        </div>
      )}

      {/* ── STEP 3: Share link ────────────────────────────────────── */}
      {shareLink && (
        <div className="space-y-4 animate-slide-up">
          {/* Success card */}
          <div className="rounded-3xl bg-gradient-to-br from-emerald-50 to-brand-50 border border-emerald-200 p-5 text-center space-y-3">
            <div className="w-14 h-14 rounded-3xl bg-success-gradient flex items-center justify-center shadow-md mx-auto">
              <span className="text-2xl">🎉</span>
            </div>
            <div>
              <p className="font-extrabold text-gray-800 text-lg">Group created!</p>
              <p className="text-sm text-gray-500 mt-0.5">Share this link with everyone at the table</p>
            </div>

            {/* Link + copy */}
            <div className="flex gap-2 text-left">
              <input
                readOnly
                value={shareLink}
                className="input-field flex-1 !text-xs !py-3 font-mono truncate bg-white/80"
                onFocus={(e) => e.target.select()}
              />
              <button
                onClick={copyLink}
                className={`flex-shrink-0 px-4 py-3 rounded-2xl font-semibold text-sm flex items-center gap-1.5 transition-all
                  ${copied
                    ? 'bg-emerald-500 text-white'
                    : 'bg-brand-gradient text-white shadow-glow-sm'
                  }`}
              >
                {copied ? <Check size={15} /> : <Copy size={15} />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <button onClick={goToSession} className="btn-primary">
              <Share2 size={17} />
              <span>Open My Session</span>
            </button>
            <p className="text-xs text-gray-400 text-center">
              You can also send the link via WhatsApp, Telegram, or any messaging app
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
