import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
import { prisma } from '../../../../../lib/prisma';
import { calculateSplits } from '../../../../../src/lib/calculations';

export async function POST(_request: any, context: any) {
  const params = context?.params || {};
  const token = params.token;
  const sess = await prisma.session.findUnique({ where: { token } });
  if (!sess) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  const sdata: any = sess.data || {};
  if (sdata.status === 'locked') return NextResponse.json({ ok: true, results: sdata.results });
  if (!sdata.payer) return NextResponse.json({ error: 'Choose a payer before locking' }, { status: 400 });
  if (!sdata.participants || sdata.participants.length === 0) return NextResponse.json({ error: 'No participants' }, { status: 400 });

  const receipt = sdata.receipt || { items: [], tax: 0, tip: 0 };
  const participantIds = (sdata.participants || []).map((p: any) => p.id);

  const results = calculateSplits(
    receipt.items || [],
    sdata.claims || [],
    Number(receipt.tax) || 0,
    Number(receipt.tip) || 0,
    participantIds,
    sdata.payer.participant_id
  );

  const updated = { ...sdata, status: 'locked', results };
  await prisma.session.update({ where: { token }, data: { data: updated } });
  return NextResponse.json({ ok: true, results });
}
