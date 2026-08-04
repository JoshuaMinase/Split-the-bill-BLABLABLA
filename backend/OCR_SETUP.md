# OCR Setup Instructions

To use the OCR-based receipt parsing, you need to install Tesseract OCR on your system.

## Windows Installation

1. Download the Tesseract installer from: https://github.com/UB-Mannheim/tesseract/wiki
2. Run the installer and follow the setup wizard
3. Make sure to note the installation path (default: `C:\Program Files\Tesseract-OCR`)
4. Add the Tesseract installation directory to your system PATH:
   - Search for "Environment Variables" in Windows
   - Click "Edit the system environment variables"
   - Click "Environment Variables"
   - Under "System variables", find "Path" and click "Edit"
   - Click "New" and add the Tesseract installation path (e.g., `C:\Program Files\Tesseract-OCR`)
   - Click OK on all dialogs
5. Restart your terminal/command prompt

## Verify Installation

Run this command to verify Tesseract is installed correctly:

```bash
tesseract --version
```

You should see version information printed.

## Mac Installation

```bash
brew install tesseract
```

## Linux Installation

```bash
sudo apt-get install tesseract-ocr
```

## Troubleshooting

If you get a "Tesseract not found" error:
1. Make sure Tesseract is installed
2. Make sure the installation directory is in your system PATH
3. Restart your terminal after modifying PATH
4. On Windows, you may need to specify the path in the code if it's not in a standard location
