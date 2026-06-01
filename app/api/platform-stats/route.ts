import { NextResponse } from 'next/server';
import { getAllPlatformMetrics } from '@/lib/platform-metrics';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const platforms = await getAllPlatformMetrics();
    return NextResponse.json({ platforms });
  } catch (err) {
    return NextResponse.json({ platforms: [], error: String(err) }, { status: 500 });
  }
}
