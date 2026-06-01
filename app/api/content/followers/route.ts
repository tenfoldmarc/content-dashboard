import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

interface DailyFollower {
  date: string;
  count: number;
}

export async function GET() {
  try {
    const token = process.env.IG_ACCESS_TOKEN;
    const userId = process.env.IG_USER_ID;

    if (!token || !userId) {
      return NextResponse.json(
        { error: 'IG_ACCESS_TOKEN or IG_USER_ID not configured' },
        { status: 500 }
      );
    }

    // Fetch current follower count
    const profileUrl = `https://graph.instagram.com/v21.0/${userId}?fields=followers_count&access_token=${token}`;
    const profileRes = await fetch(profileUrl);

    if (!profileRes.ok) {
      const err = await profileRes.json();
      return NextResponse.json(
        { error: err.error?.message || 'Failed to fetch profile' },
        { status: profileRes.status }
      );
    }

    const profileData = await profileRes.json();
    const current = profileData.followers_count || 0;

    // Fetch follower growth over last 90 days (3 x 30-day windows)
    const now = new Date();

    let daily: DailyFollower[] = [];
    let weeklyGrowth = 0;
    let monthlyGrowth = 0;

    try {
      // IG Insights API limits to 30-day windows, so fetch 3 chunks (days ago)
      const chunks = [
        { sinceDaysAgo: 90, untilDaysAgo: 60 },
        { sinceDaysAgo: 60, untilDaysAgo: 30 },
        { sinceDaysAgo: 30, untilDaysAgo: 0 },
      ];

      for (const chunk of chunks) {
        const sinceTs = Math.floor(new Date(now.getTime() - chunk.sinceDaysAgo * 24 * 60 * 60 * 1000).getTime() / 1000);
        const untilTs = chunk.untilDaysAgo === 0
          ? Math.floor(now.getTime() / 1000)
          : Math.floor(new Date(now.getTime() - chunk.untilDaysAgo * 24 * 60 * 60 * 1000).getTime() / 1000);

        const insightsUrl = `https://graph.instagram.com/v21.0/${userId}/insights?metric=follower_count&period=day&since=${sinceTs}&until=${untilTs}&access_token=${token}`;
        const insightsRes = await fetch(insightsUrl);

        if (insightsRes.ok) {
          const insightsData = await insightsRes.json();
          const values = insightsData.data?.[0]?.values || [];

          const chunkDaily = values.map((v: { end_time: string; value: number }) => ({
            date: v.end_time.split('T')[0],
            count: v.value,
          }));

          daily = daily.concat(chunkDaily);
        }
      }

      // Deduplicate by date (overlapping boundaries) and sort chronologically
      const seen = new Set<string>();
      daily = daily.filter((d) => {
        if (seen.has(d.date)) return false;
        seen.add(d.date);
        return true;
      }).sort((a, b) => a.date.localeCompare(b.date));

      // Calculate growth
      if (daily.length > 0) {
        const last30 = daily.slice(-30);
        monthlyGrowth = last30.reduce((sum: number, d: DailyFollower) => sum + d.count, 0);
        const last7 = daily.slice(-7);
        weeklyGrowth = last7.reduce((sum: number, d: DailyFollower) => sum + d.count, 0);
      }
    } catch {
      // Insights may not be available for all accounts
    }

    return NextResponse.json({
      current,
      daily,
      weeklyGrowth,
      monthlyGrowth,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
