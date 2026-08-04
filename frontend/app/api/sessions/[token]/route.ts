import { NextResponse } from 'next/server';
import { prisma } from '../../../../lib/prisma';

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const token = params.token;
  const session = await prisma.session.findUnique({ where: { token } });
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  return NextResponse.json(session.data);
}
