import OverviewClient from '@/components/OverviewClient';
import HomeMetrics from '@/components/HomeMetrics';
import TrendingNow from '@/components/TrendingNow';
import { BRAND } from '@/lib/config';

export const dynamic = 'force-dynamic';

export default function OverviewPage() {
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const dateStr = now.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <div className="space-y-7 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-4">
            <h1 className="font-heading text-[2.4rem] tracking-[1.5px]">{greeting}, {BRAND.ownerFirstName}</h1>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent/10 border border-accent/20">
              <span className="w-[7px] h-[7px] rounded-full bg-accent animate-live-pulse" />
              <span className="text-[.65rem] font-semibold text-accent tracking-[.5px]">LIVE</span>
            </div>
          </div>
          <p className="text-muted text-sm mt-1">{dateStr}</p>
        </div>
        <OverviewClient />
      </div>

      <HomeMetrics />
      <TrendingNow />
    </div>
  );
}
