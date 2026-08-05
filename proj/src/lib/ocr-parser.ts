/**
 * Receipt parser — delegates to the backend AI vision API (Gemini/OpenRouter/Groq).
 * Tesseract.js client-side OCR has been removed because it fails to detect items
 * reliably. The backend 3-tier fallback chain handles parsing instead.
 *
 * This module is kept so imports in page.tsx continue to work unchanged.
 */
import { parseReceipt } from './api';
import type { ReceiptDraft } from './types';

/**
 * Parse a receipt image by sending it to the backend AI vision endpoint.
 * Falls back to an empty draft (manual entry mode) on any error.
 */
export async function parseReceiptWithOCR(file: File): Promise<ReceiptDraft> {
  return parseReceipt(file);
}
