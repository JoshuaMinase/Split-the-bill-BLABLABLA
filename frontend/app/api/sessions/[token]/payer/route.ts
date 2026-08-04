import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';

export async function POST(request: Request, { params }: { params: { token: string } }) {
  const token = params.token;
  const body = await request.json().catch(() => ({}));
  const { participant_id, account_type, account_details } = body;
  if (!participant_id || !account_type || !account_details) return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  const sess = await prisma.session.findUnique({ where: { token } });
  if (!sess) return NextResponse.json({ error: 'Session not found' }, { status: 404 });

  const participantIds = (sess.data.participants || []).map((p: any) => p.id);
  if (!participantIds.includes(participant_id)) return NextResponse.json({ error: 'participant not in session' }, { status: 400 });

  const payer = { participant_id, account_type, account_details };
  await prisma.session.update({ where: { token }, data: { data: { ...sess.data, payer } } });
  return NextResponse.json({ ok: true });
}
