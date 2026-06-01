import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const AD_ACCOUNT_ID = 'act_419099082816517';
const META_API_VERSION = 'v21.0';

function getDateRange(range: string): { since: string; until: string } {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  switch (range) {
    case 'yesterday': {
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      return { since: fmt(yesterday), until: fmt(yesterday) };
    }
    case 'today':
      return { since: fmt(now), until: fmt(now) };
    case '30d': {
      const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      return { since: fmt(d30), until: fmt(now) };
    }
    case '90d': {
      const d90 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      return { since: fmt(d90), until: fmt(now) };
    }
    case '7d':
    default: {
      const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return { since: fmt(d7), until: fmt(now) };
    }
  }
}

function getPlaceholderData(dateRange: { since: string; until: string }, reason: string) {
  return {
    totalSpend: 1247.83,
    cpm: 14.52,
    ctr: 2.31,
    cpl: 8.74,
    impressions: 85920,
    clicks: 1985,
    topAds: [
      {
        name: 'AI Agency Blueprint - Hook A (Reel)',
        spend: 412.50,
        cpl: 6.25,
        ctr: 3.12,
        impressions: 28400,
      },
      {
        name: 'Claude Code Demo - Service Business',
        spend: 298.20,
        cpl: 7.80,
        ctr: 2.85,
        impressions: 20530,
      },
      {
        name: 'Stop Hiring VAs - Automate Instead',
        spend: 215.75,
        cpl: 9.15,
        ctr: 2.44,
        impressions: 15200,
      },
      {
        name: 'Free Guide - AI Automation Playbook',
        spend: 178.90,
        cpl: 10.50,
        ctr: 1.95,
        impressions: 12340,
      },
      {
        name: 'Retargeting - Visited Landing Page',
        spend: 142.48,
        cpl: 12.30,
        ctr: 1.68,
        impressions: 9450,
      },
    ],
    dateRange,
    note: `Showing sample data. ${reason}`,
  };
}

interface MetaInsight {
  spend?: string;
  cpm?: string;
  ctr?: string;
  impressions?: string;
  clicks?: string;
  cost_per_action_type?: { action_type: string; value: string }[];
}

interface MetaAdNode {
  name?: string;
  insights?: { data?: MetaInsight[] };
}

interface MetaApiError {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
  };
}

export async function GET(request: Request) {
  try {
    const token = process.env.META_ACCESS_TOKEN;

    const { searchParams } = new URL(request.url);
    const dateRange = searchParams.get('dateRange') || '7d';
    const customSince = searchParams.get('startDate');
    const customUntil = searchParams.get('endDate');
    const sortBy = searchParams.get('sortBy') || 'cpl';

    const { since, until } =
      customSince && customUntil
        ? { since: customSince, until: customUntil }
        : getDateRange(dateRange);

    if (!token) {
      return NextResponse.json(
        getPlaceholderData(
          { since, until },
          'META_ACCESS_TOKEN not configured. Add it to .env.local to see real ad data.'
        )
      );
    }

    const timeRange = JSON.stringify({ since, until });

    // Fetch account-level insights
    const insightsUrl = new URL(
      `https://graph.facebook.com/${META_API_VERSION}/${AD_ACCOUNT_ID}/insights`
    );
    insightsUrl.searchParams.set(
      'fields',
      'spend,cpm,ctr,cost_per_action_type,impressions,clicks'
    );
    insightsUrl.searchParams.set('time_range', timeRange);
    insightsUrl.searchParams.set('access_token', token);

    const insightsRes = await fetch(insightsUrl.toString());
    const insightsJson = await insightsRes.json();

    // Check for API errors
    if (!insightsRes.ok || (insightsJson as MetaApiError).error) {
      const metaError = (insightsJson as MetaApiError).error;
      const errorMsg = metaError?.message || `HTTP ${insightsRes.status}`;
      const errorCode = metaError?.code;

      // Token expired or invalid
      if (errorCode === 190 || insightsRes.status === 401) {
        return NextResponse.json(
          getPlaceholderData(
            { since, until },
            'Meta access token is expired or invalid. Generate a new long-lived token.'
          )
        );
      }

      // Permission issue
      if (errorCode === 10 || errorCode === 200 || insightsRes.status === 403) {
        return NextResponse.json(
          getPlaceholderData(
            { since, until },
            `Insufficient permissions for ad account ${AD_ACCOUNT_ID}. Error: ${errorMsg}`
          )
        );
      }

      // Rate limiting
      if (errorCode === 4 || errorCode === 17 || errorCode === 32 || errorCode === 613) {
        return NextResponse.json(
          getPlaceholderData(
            { since, until },
            'Meta API rate limit reached. Try again in a minute.'
          )
        );
      }

      // Any other error
      return NextResponse.json(
        getPlaceholderData(
          { since, until },
          `Meta API error: ${errorMsg}`
        )
      );
    }

    let totalSpend = 0;
    let cpm = 0;
    let ctr = 0;
    let cpl = 0;
    let impressions = 0;
    let clicks = 0;

    const row: MetaInsight | undefined = insightsJson.data?.[0];

    if (row) {
      totalSpend = parseFloat(row.spend || '0');
      cpm = parseFloat(row.cpm || '0');
      ctr = parseFloat(row.ctr || '0');
      impressions = parseInt(row.impressions || '0', 10);
      clicks = parseInt(row.clicks || '0', 10);

      const leadAction = row.cost_per_action_type?.find(
        (a) =>
          a.action_type === 'lead' ||
          a.action_type === 'offsite_conversion.fb_pixel_lead'
      );
      cpl = leadAction ? parseFloat(leadAction.value) : 0;
    }

    // Fetch top ads - use URL builder to avoid encoding issues with nested fields
    const adsUrl = new URL(
      `https://graph.facebook.com/${META_API_VERSION}/${AD_ACCOUNT_ID}/ads`
    );
    adsUrl.searchParams.set(
      'fields',
      `name,status,insights.time_range(${timeRange}){spend,cpm,ctr,cost_per_action_type,impressions}`
    );
    adsUrl.searchParams.set('limit', '25');
    adsUrl.searchParams.set('filtering', JSON.stringify([{ field: 'effective_status', operator: 'IN', value: ['ACTIVE', 'PAUSED'] }]));
    adsUrl.searchParams.set('access_token', token);

    const adsRes = await fetch(adsUrl.toString());

    let topAds: { name: string; spend: number; cpl: number; ctr: number; impressions: number }[] =
      [];

    if (adsRes.ok) {
      const adsData = await adsRes.json();
      const adNodes: MetaAdNode[] = adsData.data || [];

      topAds = adNodes
        .filter((ad) => ad.insights?.data?.[0])
        .map((ad) => {
          const ins = ad.insights!.data![0];
          const leadAction = ins.cost_per_action_type?.find(
            (a) =>
              a.action_type === 'lead' ||
              a.action_type === 'offsite_conversion.fb_pixel_lead'
          );
          return {
            name: ad.name || 'Unnamed Ad',
            spend: parseFloat(ins.spend || '0'),
            cpl: leadAction ? parseFloat(leadAction.value) : 0,
            ctr: parseFloat(ins.ctr || '0'),
            impressions: parseInt(ins.impressions || '0', 10),
          };
        });

      // Sort
      if (sortBy === 'spend') {
        topAds.sort((a, b) => b.spend - a.spend);
      } else {
        // Sort by CPL: lowest first (filter out 0 CPL to bottom)
        topAds.sort((a, b) => {
          if (a.cpl === 0 && b.cpl === 0) return b.spend - a.spend;
          if (a.cpl === 0) return 1;
          if (b.cpl === 0) return -1;
          return a.cpl - b.cpl;
        });
      }
    }

    // If we got account insights but no ads data, still return the overview
    const hasData = row || topAds.length > 0;

    if (!hasData) {
      return NextResponse.json(
        getPlaceholderData(
          { since, until },
          'No ad data found for this date range. You may not have active campaigns.'
        )
      );
    }

    return NextResponse.json({
      totalSpend,
      cpm,
      ctr,
      cpl,
      impressions,
      clicks,
      topAds,
      dateRange: { since, until },
    });
  } catch (error) {
    console.error('Ads API error:', error);

    const now = new Date();
    const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    return NextResponse.json(
      getPlaceholderData(
        { since: fmt(d7), until: fmt(now) },
        `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    );
  }
}
