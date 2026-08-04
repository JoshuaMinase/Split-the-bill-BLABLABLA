/**
 * Client-side OCR receipt parser using Tesseract.js
 * Works entirely in the browser - no backend API needed
 */
import Tesseract from 'tesseract.js';
import type { ReceiptDraft } from './types';

/**
 * Extract text from an image using Tesseract.js OCR
 */
async function extractTextFromImage(file: File): Promise<string> {
  console.log('Starting OCR with file:', file.name, file.type, file.size);
  
  try {
    const result = await Tesseract.recognize(file, 'eng', {
      logger: (m) => {
        console.log(`OCR Status: ${m.status} - ${Math.round(m.progress * 100)}%`);
      },
    });
    
    console.log('OCR completed successfully');
    console.log('Extracted text length:', result.data.text.length);
    console.log('First 200 chars:', result.data.text.substring(0, 200));
    
    return result.data.text;
  } catch (error) {
    console.error('OCR failed:', error);
    throw new Error(`OCR failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Parse receipt text and extract structured data using regex patterns
 */
function parseReceiptText(text: string): ReceiptDraft {
  console.log('Parsing receipt text...');
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
  console.log('Number of lines:', lines.length);
  
  const items: Array<{ name: string; price: number; quantity: number }> = [];
  let subtotal = 0;
  let tax = 0;
  let tip = 0;
  let total = 0;
  let merchantName = '';

  // More flexible patterns for matching different receipt formats
  const pricePattern = /[$€£₹]?\s*(\d+\.\d{2})/;
  const itemPattern = /^([A-Za-z][A-Za-z0-9\s\.\-\,\&]+?)\s+[$€£₹]?\s*(\d+\.\d{2})$/;
  const qtyPattern = /(\d+)\s*[xX]/;
  const subtotalPattern = /subtotal|sub\s*total/i;
  const taxPattern = /tax|vat|gst/i;
  const tipPattern = /tip|gratuity/i;
  const totalPattern = /total|amount|grand\s*total/i;

  for (const line of lines) {
    // Try to extract merchant name (usually first line with letters)
    if (!merchantName && /^[A-Za-z\s&\.\-]+$/.test(line) && line.length > 3) {
      merchantName = line;
      console.log('Found merchant name:', merchantName);
      continue;
    }

    // Check for subtotal
    if (subtotalPattern.test(line)) {
      const match = line.match(pricePattern);
      if (match) {
        subtotal = parseFloat(match[1]);
        console.log('Found subtotal:', subtotal);
        continue;
      }
    }

    // Check for tax
    if (taxPattern.test(line)) {
      const match = line.match(pricePattern);
      if (match) {
        tax = parseFloat(match[1]);
        console.log('Found tax:', tax);
        continue;
      }
    }

    // Check for tip
    if (tipPattern.test(line)) {
      const match = line.match(pricePattern);
      if (match) {
        tip = parseFloat(match[1]);
        console.log('Found tip:', tip);
        continue;
      }
    }

    // Check for total
    if (totalPattern.test(line)) {
      const match = line.match(pricePattern);
      if (match) {
        total = parseFloat(match[1]);
        console.log('Found total:', total);
        continue;
      }
    }

    // Try to parse as item line
    const itemMatch = line.match(itemPattern);
    if (itemMatch) {
      let name = itemMatch[1].trim();
      let price = parseFloat(itemMatch[2]);
      let quantity = 1;

      // Check for quantity in the name
      const qtyMatch = name.match(qtyPattern);
      if (qtyMatch) {
        quantity = parseInt(qtyMatch[1]);
        name = name.replace(qtyMatch[0], '').trim();
      }

      // Only add if it looks like a valid item
      if (name.length > 1 && price > 0) {
        items.push({ name, price, quantity });
        console.log('Found item:', name, price, quantity);
      }
    }
  }

  // Fallback: if we couldn't parse items, try multiple simpler patterns
  if (items.length === 0) {
    console.log('Primary pattern failed, trying fallback patterns...');
    
    // Pattern 1: Word followed by price
    for (const line of lines) {
      const match = line.match(/([A-Za-z][A-Za-z\s]+?)\s*(\d+\.\d{2})$/);
      if (match && parseFloat(match[2]) > 0 && match[1].trim().length > 2) {
        items.push({
          name: match[1].trim(),
          price: parseFloat(match[2]),
          quantity: 1
        });
        console.log('Fallback pattern 1 found item:', match[1].trim(), match[2]);
      }
    }
    
    // Pattern 2: Any line with a price at the end
    if (items.length === 0) {
      for (const line of lines) {
        const match = line.match(/(\d+\.\d{2})$/);
        if (match) {
          const price = parseFloat(match[1]);
          const name = line.replace(match[0], '').trim();
          if (name.length > 2 && price > 0) {
            items.push({ name, price, quantity: 1 });
            console.log('Fallback pattern 2 found item:', name, price);
          }
        }
      }
    }
  }

  console.log('Total items found:', items.length);

  // Calculate subtotal from items if not found
  if (subtotal === 0 && items.length > 0) {
    subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    console.log('Calculated subtotal from items:', subtotal);
  }

  // Calculate total if not found
  if (total === 0) {
    total = subtotal + tax + tip;
    console.log('Calculated total:', total);
  }

  const result = {
    merchant_name: merchantName || null,
    items,
    subtotal,
    tax,
    tip,
    total,
  };
  
  console.log('Final parsed result:', result);
  return result;
}

/**
 * Main function: parse receipt from image file using OCR
 */
export async function parseReceiptWithOCR(file: File): Promise<ReceiptDraft> {
  try {
    console.log('Starting OCR...');
    const text = await extractTextFromImage(file);
    console.log('OCR complete, parsing text...');
    console.log('Extracted text:', text);
    
    const parsed = parseReceiptText(text);
    console.log('Parsed receipt:', parsed);
    
    // If OCR didn't find any items, throw an error to trigger manual entry
    if (parsed.items.length === 0) {
      console.log('No items found, throwing error for manual entry');
      throw new Error('OCR could not detect any items. Please enter items manually.');
    }
    
    return parsed;
  } catch (error) {
    console.error('OCR parsing failed:', error);
    throw new Error(`Failed to read receipt: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}
