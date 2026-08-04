import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';

export async function POST(request: any, context: any) {
  const params = context?.params || {};
  const token = params.token;
  const body = await request.json().catch(() => ({}));
  const { item_id, participant_id, claimed } = body;
  if (!item_id || !participant_id || typeof claimed !== 'boolean') return NextResponse.json({ error: 'invalid body' }, { status: 400 });

  const sess = await prisma.session.findUnique({ where: { token } });
  if (!sess) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  if (sess.data.status !== 'open') return NextResponse.json({ error: 'Session locked' }, { status: 400 });

  const participantIds = (sess.data.participants || []).map((p: any) => p.id);
  if (!participantIds.includes(participant_id)) return NextResponse.json({ error: 'participant not in session' }, { status: 400 });

  const itemIds = (sess.data.receipt.items || []).map((i: any) => i.id);
  if (!itemIds.includes(item_id)) return NextResponse.json({ error: 'item not found' }, { status: 400 });

  let claims = sess.data.claims || [];
  if (claimed) {
    const already = claims.some((c: any) => c.item_id === item_id && c.participant_id === participant_id);
    if (!already) claims = [...claims, { item_id, participant_id }];
  } else {
    claims = claims.filter((c: any) => !(c.item_id === item_id && c.participant_id === participant_id));
  }

  await prisma.session.update({ where: { token }, data: { data: { ...sess.data, claims } } });
  return NextResponse.json({ ok: true });
}
