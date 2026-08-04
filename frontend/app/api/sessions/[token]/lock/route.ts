import { NextResponse } from 'next/server';
import { prisma } from '../../../../../lib/prisma';
import { calculateSplits } from '../../../../../src/lib/calculations';

export async function POST(_request: Request, { params }: { params: { token: string } }) {
  const token = params.token;
  const sess = await prisma.session.findUnique({ where: { token } });
  if (!sess) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  if (sess.data.status === 'locked') return NextResponse.json({ ok: true, results: sess.data.results });
  if (!sess.data.payer) return NextResponse.json({ error: 'Choose a payer before locking' }, { status: 400 });
  if (!sess.data.participants || sess.data.participants.length === 0) return NextResponse.json({ error: 'No participants' }, { status: 400 });

  const receipt = sess.data.receipt || { items: [], tax: 0, tip: 0 };
  const participantIds = (sess.data.participants || []).map((p: any) => p.id);

  const results = calculateSplits(
    receipt.items || [],
    sess.data.claims || [],
    Number(receipt.tax) || 0,
    Number(receipt.tip) || 0,
    participantIds,
    sess.data.payer.participant_id
  );

  const updated = { ...sess.data, status: 'locked', results };
  await prisma.session.update({ where: { token }, data: { data: updated } });
  return NextResponse.json({ ok: true, results });
}
