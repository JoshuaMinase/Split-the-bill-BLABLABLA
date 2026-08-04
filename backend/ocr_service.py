"""
OCR-based receipt parsing using pytesseract
Extracts text from receipt images and parses items, prices, and totals using regex patterns
"""
import re
import io
from PIL import Image
import pytesseract
from dotenv import load_dotenv
import os

load_dotenv()

# Configure Tesseract path if specified in environment variable
TESSERACT_PATH = os.environ.get("TESSERACT_PATH", "")
if TESSERACT_PATH:
    pytesseract.pytesseract.tesseract_cmd = TESSERACT_PATH


def _preprocess_image(image_bytes: bytes) -> Image.Image:
    """
    Preprocess image for better OCR results:
    - Convert to grayscale
    - Resize for better text recognition
    """
    try:
        img = Image.open(io.BytesIO(image_bytes))
        
        # Convert to grayscale
        if img.mode != "L":
            img = img.convert("L")
        
        # Resize if too small (improves OCR accuracy)
        width, height = img.size
        if max(width, height) < 1000:
            scale = 1000 / max(width, height)
            new_width = int(width * scale)
            new_height = int(height * scale)
            img = img.resize((new_width, new_height), Image.LANCZOS)
        
        return img
    except Exception as e:
        print(f"Image preprocessing failed: {e}")
        # Return original if preprocessing fails
        return Image.open(io.BytesIO(image_bytes))


def extract_text_from_image(image_bytes: bytes) -> str:
    """
    Extract text from image using Tesseract OCR
    """
    try:
        img = _preprocess_image(image_bytes)
        
        # Configure Tesseract for better receipt reading
        config = r'--oem 3 --psm 6'  # OEM 3 = default, PSM 6 = assume uniform block of text
        
        text = pytesseract.image_to_string(img, config=config)
        print(f"OCR extracted {len(text)} characters")
        return text
    except Exception as e:
        print(f"OCR failed: {e}")
        raise RuntimeError(f"OCR failed: {str(e)}")


def parse_receipt_text(text: str) -> dict:
    """
    Parse receipt text and extract structured data using regex patterns
    """
    lines = [line.strip() for line in text.split('\n') if line.strip()]
    print(f"Parsing {len(lines)} lines of text")
    
    items = []
    subtotal = 0.0
    tax = 0.0
    tip = 0.0
    total = 0.0
    merchant_name = ''
    
    # Regex patterns
    price_pattern = re.compile(r'[$€£₹]?\s*(\d+\.\d{2})')
    item_pattern = re.compile(r'^([A-Za-z][A-Za-z0-9\s\.\-\,\&]+?)\s+[$€£₹]?\s*(\d+\.\d{2})$')
    qty_pattern = re.compile(r'(\d+)\s*[xX]')
    subtotal_pattern = re.compile(r'subtotal|sub\s*total', re.IGNORECASE)
    tax_pattern = re.compile(r'tax|vat|gst', re.IGNORECASE)
    tip_pattern = re.compile(r'tip|gratuity', re.IGNORECASE)
    total_pattern = re.compile(r'total|amount|grand\s*total', re.IGNORECASE)
    
    for line in lines:
        # Try to extract merchant name (usually first line with letters)
        if not merchant_name and re.match(r'^[A-Za-z\s&\.\-]+$', line) and len(line) > 3:
            merchant_name = line
            print(f"Found merchant: {merchant_name}")
            continue
        
        # Check for subtotal
        if subtotal_pattern.search(line):
            match = price_pattern.search(line)
            if match:
                subtotal = float(match.group(1))
                print(f"Found subtotal: {subtotal}")
                continue
        
        # Check for tax
        if tax_pattern.search(line):
            match = price_pattern.search(line)
            if match:
                tax = float(match.group(1))
                print(f"Found tax: {tax}")
                continue
        
        # Check for tip
        if tip_pattern.search(line):
            match = price_pattern.search(line)
            if match:
                tip = float(match.group(1))
                print(f"Found tip: {tip}")
                continue
        
        # Check for total
        if total_pattern.search(line):
            match = price_pattern.search(line)
            if match:
                total = float(match.group(1))
                print(f"Found total: {total}")
                continue
        
        # Try to parse as item line
        item_match = item_pattern.match(line)
        if item_match:
            name = item_match.group(1).strip()
            price = float(item_match.group(2))
            quantity = 1
            
            # Check for quantity in the name
            qty_match = qty_pattern.search(name)
            if qty_match:
                quantity = int(qty_match.group(1))
                name = name.replace(qty_match.group(0), '').strip()
            
            # Only add if it looks like a valid item
            if len(name) > 1 and price > 0:
                items.append({
                    "name": name,
                    "price": price,
                    "quantity": quantity
                })
                print(f"Found item: {name} - ${price} x{quantity}")
    
    # Fallback: if we couldn't parse items, try simpler patterns
    if len(items) == 0:
        print("Primary pattern failed, trying fallback patterns...")
        
        # Pattern 1: Word followed by price
        for line in lines:
            match = re.search(r'([A-Za-z][A-Za-z\s]+?)\s*(\d+\.\d{2})$', line)
            if match and float(match.group(2)) > 0 and len(match.group(1).strip()) > 2:
                items.append({
                    "name": match.group(1).strip(),
                    "price": float(match.group(2)),
                    "quantity": 1
                })
                print(f"Fallback found item: {match.group(1).strip()} - ${match.group(2)}")
        
        # Pattern 2: Any line with a price at the end
        if len(items) == 0:
            for line in lines:
                match = re.search(r'(\d+\.\d{2})$', line)
                if match:
                    price = float(match.group(1))
                    name = line.replace(match.group(0), '').strip()
                    if len(name) > 2 and price > 0:
                        items.append({
                            "name": name,
                            "price": price,
                            "quantity": 1
                        })
                        print(f"Fallback 2 found item: {name} - ${price}")
    
    print(f"Total items found: {len(items)}")
    
    # Calculate subtotal from items if not found
    if subtotal == 0 and len(items) > 0:
        subtotal = sum(item["price"] * item["quantity"] for item in items)
        print(f"Calculated subtotal from items: {subtotal}")
    
    # Calculate total if not found
    if total == 0:
        total = subtotal + tax + tip
        print(f"Calculated total: {total}")
    
    return {
        "merchant_name": merchant_name if merchant_name else None,
        "items": items,
        "subtotal": subtotal,
        "tax": tax,
        "tip": tip,
        "total": total
    }


def parse_receipt_image(image_bytes: bytes, content_type: str = "image/jpeg") -> dict:
    """
    Main function: parse receipt from image bytes using OCR
    """
    try:
        print("Starting backend OCR...")
        text = extract_text_from_image(image_bytes)
        print(f"OCR complete. Text length: {len(text)}")
        print(f"First 200 chars: {text[:200]}")
        
        parsed = parse_receipt_text(text)
        print(f"Parsed receipt: {parsed}")
        
        # If no items found, still return the result but with empty items
        # This allows the user to manually enter items
        return parsed
    except Exception as e:
        print(f"OCR parsing failed: {e}")
        raise RuntimeError(f"Failed to read receipt: {str(e)}")
