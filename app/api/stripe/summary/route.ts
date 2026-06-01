import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get('month') || new Date().toISOString().slice(0, 7); // YYYY-MM

    const stripe = getStripe();

    // Calculate date range for the month
    const [year, mon] = month.split('-').map(Number);
    const from = Math.floor(new Date(year, mon - 1, 1).getTime() / 1000);
    const to = Math.floor(new Date(year, mon, 0, 23, 59, 59).getTime() / 1000);

    // Get all charges for the month
    const allCharges = [];
    let hasMore = true;
    let startingAfter: string | undefined;

    while (hasMore) {
      const params: Record<string, unknown> = {
        limit: 100,
        created: { gte: from, lte: to },
      };
      if (startingAfter) params.starting_after = startingAfter;

      const batch = await stripe.charges.list(params as never);
      allCharges.push(...batch.data);
      hasMore = batch.has_more;
      if (batch.data.length > 0) {
        startingAfter = batch.data[batch.data.length - 1].id;
      }
    }

    // Calculate summary
    const succeeded = allCharges.filter((c) => c.status === 'succeeded');
    const revenue = succeeded.reduce((sum, c) => sum + c.amount, 0) / 100;
    const refundAmount = succeeded.reduce((sum, c) => sum + c.amount_refunded, 0) / 100;
    const refundCount = succeeded.filter((c) => c.refunded).length;

    // Get balance transactions for fees
    let totalFees = 0;
    const btParams: Record<string, unknown> = {
      limit: 100,
      created: { gte: from, lte: to },
      type: 'charge',
    };
    const balanceTxns = await stripe.balanceTransactions.list(btParams as never);
    totalFees = balanceTxns.data.reduce((sum, bt) => sum + bt.fee, 0) / 100;

    // Get disputes
    const disputes = await stripe.disputes.list({ created: { gte: from, lte: to } } as never);
    const chargebackAmount = disputes.data.reduce((sum, d) => sum + d.amount, 0) / 100;
    const chargebackCount = disputes.data.length;

    return NextResponse.json({
      month,
      revenue,
      fees: totalFees,
      refunds: refundAmount,
      refundCount,
      chargebacks: chargebackAmount,
      chargebackCount,
      netRevenue: revenue - totalFees - refundAmount - chargebackAmount,
      transactionCount: succeeded.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
