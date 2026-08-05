import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
import { prisma } from '../../../../lib/prisma';

export async function GET(_req: any, context: any) {
  const params = context?.params || {};
  const token = params.token;
  const session = await prisma.session.findUnique({ where: { token } });
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  return NextResponse.json(session.data);
}
