import { NextResponse } from 'next/server';
import { foodImageUrlAsync } from '@/src/lib/foodImage';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get('q') || '';
    if (!q) return NextResponse.json({ url: null });
    const image = await foodImageUrlAsync(q);
    return NextResponse.json({ url: image });
  } catch (e) {
    return NextResponse.json({ url: null }, { status: 500 });
  }
}
