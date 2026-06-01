import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { chargeId, amount } = body;

    if (!chargeId || typeof chargeId !== 'string') {
      return NextResponse.json({ error: 'chargeId is required' }, { status: 400 });
    }

    const stripe = getStripe();

    const params: Record<string, unknown> = {
      charge: chargeId,
    };

    // If amount is provided, do a partial refund (amount in cents)
    if (amount !== undefined && amount !== null) {
      if (typeof amount !== 'number' || amount <= 0) {
        return NextResponse.json({ error: 'amount must be a positive number (in dollars)' }, { status: 400 });
      }
      params.amount = Math.round(amount * 100);
    }

    const refund = await stripe.refunds.create(params as never);

    return NextResponse.json({
      id: refund.id,
      amount: refund.amount / 100,
      currency: refund.currency,
      status: refund.status,
      charge: refund.charge,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const status = message.includes('already been refunded') ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
