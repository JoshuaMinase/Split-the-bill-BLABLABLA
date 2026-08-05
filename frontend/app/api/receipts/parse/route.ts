import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

// Minimal parse endpoint: accepts JSON receipt draft (client-side OCR) and returns same shape with item ids
export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || !body.items) return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  const items = (body.items || []).map((it: any) => ({
    id: it.id ?? randomUUID(),
    name: it.name ?? '',
    price: Number(it.price) || 0,
    quantity: Number(it.quantity) || 1,
    image_url: it.image_url ?? null,
  }));
  const out = { ...body, items };
  return NextResponse.json(out);
}
