import { NextResponse } from 'next/server';
import { getTodayIdeas, getScheduledToday } from '@/lib/queries';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const [ideas, scheduled] = await Promise.all([
      getTodayIdeas(),
      getScheduledToday(),
    ]);

    return NextResponse.json({ ideas, scheduled });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { ideas: [], scheduled: [], error: message },
      { status: 500 }
    );
  }
}
