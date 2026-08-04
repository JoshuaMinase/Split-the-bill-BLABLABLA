import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { randomUUID } from 'crypto';

export async function GET() {
  try {
    // Create a short-lived session to test write/read/delete
    const token = `health-${randomUUID().slice(0, 8)}`;
    const data = {
      token,
      receipt: { merchant_name: 'healthcheck', items: [], subtotal: 0, tax: 0, tip: 0, total: 0 },
      participants: [],
      claims: [],
      payer: null,
      status: 'open',
      results: null,
    };

    const created = await prisma.session.create({ data: { token, data } });
    const fetched = await prisma.session.findUnique({ where: { token: created.token } });
    // Clean up
    await prisma.session.delete({ where: { token: created.token } });

    if (!fetched) return NextResponse.json({ ok: false, error: 'read failed' }, { status: 500 });
    return NextResponse.json({ ok: true, message: 'db read/write ok' });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 });
  }
}
