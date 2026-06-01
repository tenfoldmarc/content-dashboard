import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      return NextResponse.json({
        totalSpend: 0,
        inputTokens: 0,
        outputTokens: 0,
        billingPeriod: { start: '', end: '' },
        note: 'ANTHROPIC_API_KEY not configured.',
      });
    }

    // Try the admin/billing usage endpoint
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

    // Try the organizations usage endpoint
    let totalSpend = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let note = '';

    try {
      const res = await fetch('https://api.anthropic.com/v1/organizations/usage', {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
      });

      if (res.ok) {
        const data = await res.json();
        totalSpend = data.total_spend || data.spend || 0;
        inputTokens = data.input_tokens || 0;
        outputTokens = data.output_tokens || 0;
      } else {
        // Endpoint may not be available for all API keys
        note = 'Usage API returned non-200. This endpoint requires an admin API key. Showing placeholder data.';
        totalSpend = 0;
        inputTokens = 0;
        outputTokens = 0;
      }
    } catch {
      note = 'Could not reach Anthropic usage API. Showing placeholder data.';
    }

    return NextResponse.json({
      totalSpend,
      inputTokens,
      outputTokens,
      billingPeriod: {
        start: monthStart,
        end: monthEnd,
      },
      note: note || undefined,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
