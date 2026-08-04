/**
 * Client-side OCR receipt parser using Tesseract.js
 * Works entirely in the browser - no backend API needed
 */
import Tesseract from 'tesseract.js';
import type { ReceiptDraft } from './types';

/**
 * Preprocess image to improve OCR accuracy
 */
async function preprocessImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        // Resize to improve OCR (larger = better text recognition)
        const scale = Math.max(2000 / img.width, 2000 / img.height);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        
        // Draw with high quality
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // Convert to grayscale and increase contrast
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        
        for (let i = 0; i < data.length; i += 4) {
          const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
          // Increase contrast
          const contrast = 1.5;
          const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
          const gray = factor * (avg - 128) + 128;
          data[i] = data[i + 1] = data[i + 2] = Math.min(255, Math.max(0, gray));
        }
        
        ctx.putImageData(imageData, 0, 0);
        
        // Get the data URL
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        resolve(dataUrl);
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Extract text from an image using Tesseract.js OCR
 */
async function extractTextFromImage(file: File): Promise<string> {
  console.log('Starting OCR with file:', file.name, file.type, file.size);
  
  try {
    // Preprocess image for better OCR
    console.log('Preprocessing image...');
    const processedImage = await preprocessImage(file);
    
    const result = await Tesseract.recognize(processedImage, 'eng', {
      logger: (m) => {
        console.log(`OCR Status: ${m.status} - ${Math.round(m.progress * 100)}%`);
      },
    });
    
    console.log('OCR completed successfully');
    console.log('Extracted text length:', result.data.text.length);
    console.log('First 500 chars:', result.data.text.substring(0, 500));
    
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
  console.log('All lines:', lines);
  
  const items: Array<{ name: string; price: number; quantity: number }> = [];
  let subtotal = 0;
  let tax = 0;
  let tip = 0;
  let total = 0;
  let merchantName = '';

  // Ultra-flexible patterns for matching different receipt formats
  const pricePattern = /[$€£₹]?\s*(\d+\.?\d*)/;
  const itemPattern = /^([A-Za-z][A-Za-z0-9\s\.\-\,\&\(\)]+?)\s+[$€£₹]?\s*(\d+\.?\d*)$/;
  const qtyPattern = /(\d+)\s*[xX]/;
  const subtotalPattern = /subtotal|sub\s*total/i;
  const taxPattern = /tax|vat|gst/i;
  const tipPattern = /tip|gratuity/i;
  const totalPattern = /total|amount|grand\s*total/i;

  for (const line of lines) {
    console.log('Processing line:', line);
    
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

  // Aggressive fallback: if we couldn't parse items, try multiple simpler patterns
  if (items.length === 0) {
    console.log('Primary pattern failed, trying aggressive fallback patterns...');
    
    // Pattern 1: Any line with a number that looks like a price
    for (const line of lines) {
      const priceMatch = line.match(/(\d+\.\d{2})$/);
      if (priceMatch) {
        const price = parseFloat(priceMatch[1]);
        const name = line.replace(priceMatch[0], '').trim();
        // Very lenient: any text before a price could be an item name
        if (name.length > 1 && price > 0 && price < 1000) {
          items.push({ name, price, quantity: 1 });
          console.log('Aggressive pattern 1 found item:', name, price);
        }
      }
    }
    
    // Pattern 2: Look for lines with currency symbols
    if (items.length === 0) {
      for (const line of lines) {
        if (line.includes('$') || line.includes('€') || line.includes('£')) {
          const parts = line.split(/[$€£₹]/);
          if (parts.length >= 2) {
            const name = parts[0].trim();
            const priceStr = parts[parts.length - 1].trim();
            const price = parseFloat(priceStr);
            if (name.length > 1 && price > 0 && price < 1000) {
              items.push({ name, price, quantity: 1 });
              console.log('Aggressive pattern 2 found item:', name, price);
            }
          }
        }
      }
    }
    
    // Pattern 3: Any line with digits at the end (very aggressive)
    if (items.length === 0) {
      for (const line of lines) {
        const match = line.match(/([A-Za-z\s]+)\s+(\d+\.?\d*)$/);
        if (match) {
          const name = match[1].trim();
          const price = parseFloat(match[2]);
          if (name.length > 2 && price > 0 && price < 1000) {
            items.push({ name, price, quantity: 1 });
            console.log('Aggressive pattern 3 found item:', name, price);
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
    
    // Always return the result - even if empty, user can add items manually
    return parsed;
  } catch (error) {
    console.error('OCR parsing failed:', error);
    // Return empty draft on error so user can manually enter
    return {
      merchant_name: null,
      items: [],
      subtotal: 0,
      tax: 0,
      tip: 0,
      total: 0,
    };
  }
}
