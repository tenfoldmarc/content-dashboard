import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const stripe = getStripe();
    const balance = await stripe.balance.retrieve();

    const available = balance.available.reduce((sum, b) => sum + b.amount, 0);
    const pending = balance.pending.reduce((sum, b) => sum + b.amount, 0);

    return NextResponse.json({
      available: available / 100,
      pending: pending / 100,
      total: (available + pending) / 100,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
