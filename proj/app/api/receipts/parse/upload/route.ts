import { NextResponse } from 'next/server';

// Parse multipart/form-data (image upload) and store temp file. Server-side AI fallback requires configuring AI keys.

export async function POST(_req: Request) {
  // Using Node runtime is required for parsing file uploads with formidable.
  return NextResponse.json({
    error:
      'Server-side image upload parsing is not available in this runtime on the current deployment. Use client-side OCR (tesseract.js) or configure a Node runtime API route for file uploads and AI integration.',
  }, { status: 501 });
}
