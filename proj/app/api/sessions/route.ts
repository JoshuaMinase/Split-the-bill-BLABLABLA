import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
import { prisma } from '../../../lib/prisma';
import { randomUUID } from 'crypto';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || !body.items || typeof body.total !== 'number') {
    return NextResponse.json({ error: 'Invalid receipt payload' }, { status: 400 });
  }

  // Ensure each item has an id and quantity
  const items = (body.items || []).map((it: any) => ({
    id: it.id ?? randomUUID(),
    name: it.name ?? '',
    price: Number(it.price) ?? 0,
    quantity: Number(it.quantity) || 1,
    image_url: it.image_url ?? null,
  }));

  const token = randomUUID();
  const data = {
    token,
    receipt: {
      merchant_name: body.merchant_name ?? null,
      items,
      subtotal: Number(body.subtotal) ?? items.reduce((s: number, i: any) => s + (i.price * (i.quantity || 1)), 0),
      tax: Number(body.tax) || 0,
      tip: Number(body.tip) || 0,
      total: Number(body.total) || 0,
    },
    participants: [],
    claims: [],
    payer: null,
    status: 'open',
    results: null,
  };

  const created = await prisma.session.create({ data: { token, data } });
  return NextResponse.json({ token: created.token, session: created.data });
}
