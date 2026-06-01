import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET(request: Request) {
  try {
    const stripe = getStripe();
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    const { searchParams } = new URL(request.url);
    const days = Math.min(Math.max(parseInt(searchParams.get('days') || '30', 10) || 30, 1), 90);

    const monthStart = Math.floor(new Date(year, month, 1).getTime() / 1000);
    const monthEnd = Math.floor(new Date(year, month + 1, 0, 23, 59, 59).getTime() / 1000);
    const chartStart = Math.floor(Date.now() / 1000) - days * 86400;

    // Fetch everything in parallel — single page each to stay fast
    const [charges, subscriptions, disputes, balanceTxns] = await Promise.all([
      stripe.charges.list({ limit: 100, created: { gte: monthStart, lte: monthEnd } } as never),
      stripe.subscriptions.list({ status: 'active', limit: 100 } as never),
      stripe.disputes.list({ created: { gte: monthStart, lte: monthEnd } } as never),
      stripe.balanceTransactions.list({ limit: 100, created: { gte: chartStart }, type: 'charge' } as never),
    ]);

    // Revenue
    const succeeded = charges.data.filter((c) => c.status === 'succeeded');
    const totalRevenue = succeeded.reduce((sum, c) => sum + c.amount, 0) / 100;
    const refundAmount = succeeded.reduce((sum, c) => sum + c.amount_refunded, 0) / 100;
    const refundCount = succeeded.filter((c) => c.refunded).length;

    // MRR
    const mrr = subscriptions.data.reduce((sum, sub) => {
      const items = sub.items?.data || [];
      let subTotal = 0;
      for (const item of items) {
        const price = item.price;
        if (!price?.unit_amount) continue;
        const amount = price.unit_amount;
        const interval = price.recurring?.interval;
        if (interval === 'month') subTotal += amount;
        else if (interval === 'year') subTotal += Math.round(amount / 12);
        else if (interval === 'week') subTotal += amount * 4;
        else subTotal += amount;
      }
      return sum + subTotal;
    }, 0) / 100;

    // Fees
    const totalFees = balanceTxns.data.reduce((sum, bt) => sum + bt.fee, 0) / 100;

    // Chargebacks
    const chargebackAmount = disputes.data.reduce((sum, d) => sum + d.amount, 0) / 100;
    const chargebackCount = disputes.data.length;

    // Revenue by day
    const dailyRevenue: Record<string, number> = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(Date.now() - (days - 1 - i) * 86400000);
      dailyRevenue[d.toISOString().slice(0, 10)] = 0;
    }
    balanceTxns.data.forEach((bt) => {
      const key = new Date(bt.created * 1000).toISOString().slice(0, 10);
      if (dailyRevenue[key] !== undefined) dailyRevenue[key] += bt.amount / 100;
    });

    const revenueByDay = Object.entries(dailyRevenue)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, amount]) => ({ date, amount }));

    return NextResponse.json({
      totalRevenue,
      mrr,
      fees: totalFees,
      chargebackAmount,
      chargebackCount,
      refundAmount,
      refundCount,
      revenueByDay,
      netRevenue: totalRevenue - totalFees - refundAmount - chargebackAmount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Stripe overview error:', message);
    // Return zeros instead of crashing
    return NextResponse.json({
      totalRevenue: 0, mrr: 0, fees: 0,
      chargebackAmount: 0, chargebackCount: 0,
      refundAmount: 0, refundCount: 0,
      revenueByDay: [], netRevenue: 0,
      error: message,
    });
  }
}
