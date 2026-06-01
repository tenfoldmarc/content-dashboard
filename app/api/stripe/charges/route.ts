import { NextResponse } from 'next/server';
import { getStripe } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '25');
    const from = searchParams.get('from'); // Unix timestamp
    const to = searchParams.get('to');

    const stripe = getStripe();
    const params: Record<string, unknown> = { limit };

    if (from || to) {
      params.created = {};
      if (from) (params.created as Record<string, number>).gte = parseInt(from);
      if (to) (params.created as Record<string, number>).lte = parseInt(to);
    }

    const charges = await stripe.charges.list({ ...params, expand: ['data.customer', 'data.invoice'] } as never);

    /* eslint-disable @typescript-eslint/no-explicit-any */
    const transactions = charges.data.map((charge) => {
      // Build a meaningful description
      let desc = charge.description || '';
      const invoice = (charge as any).invoice as { lines?: { data?: { description?: string; price?: { product?: string | { name?: string } } }[] } } | null;
      const customer = (charge as any).customer as { name?: string; email?: string } | string | null;

      // Try invoice line items for product names
      if (invoice && typeof invoice === 'object' && invoice.lines?.data?.length) {
        const lineDesc = invoice.lines.data[0].description;
        if (lineDesc) desc = lineDesc;
      }

      // If still generic, use customer name
      if (!desc || desc === 'Payment' || desc === 'payment') {
        const custName = customer && typeof customer === 'object' ? customer.name : null;
        const custEmail = charge.billing_details?.email || (customer && typeof customer === 'object' ? customer.email : null);
        if (custName) {
          desc = `Payment from ${custName}`;
        } else if (custEmail) {
          desc = `Payment from ${custEmail.split('@')[0]}`;
        } else {
          desc = 'Stripe Payment';
        }
      }

      return {
        id: charge.id,
        amount: charge.amount / 100,
        currency: charge.currency,
        status: charge.status,
        description: desc,
        created: new Date(charge.created * 1000).toISOString(),
        refunded: charge.refunded,
        amount_refunded: charge.amount_refunded / 100,
        fee: 0,
        customer_email: charge.billing_details?.email || '',
      };
    });

    return NextResponse.json({ transactions });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
