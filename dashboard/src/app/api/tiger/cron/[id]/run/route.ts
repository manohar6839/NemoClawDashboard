import { NextRequest, NextResponse } from 'next/server';
import { bridgePost } from '@/lib/bridge';
export const dynamic = 'force-dynamic';
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await bridgePost('/tiger/cron/' + id + '/run', {});
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 502 });
  }
}
