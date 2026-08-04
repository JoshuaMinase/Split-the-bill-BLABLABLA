import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { randomUUID } from 'crypto';

export async function POST(request: any, context: any) {
  const params = context?.params || {};
  const token = params.token;
  const body = await request.json().catch(() => ({}));
  const { name, device_token } = body;
  if (!name || !device_token) return NextResponse.json({ error: 'name and device_token required' }, { status: 400 });

  const sess = await prisma.session.findUnique({ where: { token } });
  if (!sess) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  if (sess.data.status !== 'open') return NextResponse.json({ error: 'Session locked' }, { status: 400 });

  const existing = (sess.data.participants || []).find((p: any) => p.device_token === device_token);
  if (existing) return NextResponse.json({ participant_id: existing.id, already_joined: true });

  const participant = { id: randomUUID(), name, device_token, joined_at: Date.now() };
  const updated = await prisma.session.update({ where: { token }, data: { data: { ...sess.data, participants: [...(sess.data.participants || []), participant] } } });
  return NextResponse.json({ participant_id: participant.id, already_joined: false });
}
