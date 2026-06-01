'use client';

interface PostCardProps {
  id: string;
  url: string;
  thumbnail: string | null;
  mediaType?: string;
  views: number;
  likes: number;
  comments?: number;
  shares: number;
  handle?: string;
  saves?: number;
  median: number;
  index?: number;
}

type Tier = 'viral' | 'hot' | 'strong' | 'mid' | 'low';

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toLocaleString();
}

function computeTier(views: number, median: number): { tier: Tier; score: number; ratio: number } {
  const safeMedian = median > 0 ? median : 1;
  const ratio = views / safeMedian;
  let score: number;
  if (ratio >= 10) score = 100;
  else if (ratio >= 1) score = Math.min(89, 50 + (ratio - 1) * 5);
  else score = Math.max(0, Math.floor(ratio * 50));

  let tier: Tier;
  if (ratio >= 10) tier = 'viral';
  else if (score >= 70) tier = 'hot';
  else if (score >= 50) tier = 'strong';
  else if (score >= 30) tier = 'mid';
  else tier = 'low';

  return { tier, score: Math.round(score), ratio };
}

const TIER_COLOR: Record<Tier, string> = {
  viral: '#F43F5E',
  hot: '#F59E0B',
  strong: '#635bff',
  mid: '#6a6a80',
  low: '#3d3d52',
};

const RING_CIRC = 97.39; // 2π × 15.5

export default function PostCard({
  url,
  thumbnail,
  mediaType,
  views,
  likes,
  comments,
  shares,
  handle,
  saves,
  median,
  index = 0,
}: PostCardProps) {
  const { tier, score, ratio } = computeTier(views, median);
  const tierColor = TIER_COLOR[tier];
  const isOutlier = median > 0 && views >= 3 * median;
  const isVideo = mediaType === 'VIDEO' || mediaType === 'REEL' || !mediaType;
  const dashOffset = RING_CIRC - (RING_CIRC * score) / 100;

  const deltaText =
    tier === 'viral'
      ? `+${Math.round((ratio - 1) * 100)}% VS MEDIAN`
      : score >= 50
      ? `+${Math.round((ratio - 1) * 100)}% VS MEDIAN`
      : null;

  const likesF = Math.max(likes, 0);
  const commF = Math.max(comments ?? 0, 0);
  const sharesF = Math.max(shares, 0);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="post-card"
      data-tier={tier}
      data-outlier={isOutlier ? 'true' : undefined}
      style={{
        ['--tier' as string]: tierColor,
        animationDelay: `${Math.min(index, 9) * 0.06}s`,
        ...(isOutlier
          ? { outline: '2px solid #F43F5E', outlineOffset: '1px', boxShadow: '0 0 24px rgba(244,63,94,.35)' }
          : {}),
      }}
    >
      <div className="pc-thumb">
        {isOutlier && (
          <div
            style={{
              position: 'absolute',
              top: 8,
              left: 8,
              zIndex: 5,
              background: '#F43F5E',
              color: '#fff',
              fontSize: '.58rem',
              fontWeight: 800,
              letterSpacing: '.5px',
              padding: '3px 7px',
              borderRadius: 999,
              boxShadow: '0 2px 8px rgba(0,0,0,.4)',
            }}
          >
            {ratio >= 10 ? '10X+' : `${Math.floor(ratio)}X`} OUTLIER
          </div>
        )}
        {saves != null && saves > 0 && (
          <div
            style={{
              position: 'absolute',
              bottom: 8,
              left: 8,
              zIndex: 5,
              background: 'rgba(0,0,0,.6)',
              color: '#fff',
              fontSize: '.58rem',
              fontWeight: 700,
              padding: '2px 6px',
              borderRadius: 6,
              backdropFilter: 'blur(4px)',
            }}
          >
            {fmt(saves)} saves
          </div>
        )}
        {thumbnail ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={`/api/image-proxy?url=${encodeURIComponent(thumbnail)}`}
            alt=""
            loading="lazy"
            className="pc-img"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        ) : (
          <div className="pc-placeholder" />
        )}

        {handle && (
          <div className="pc-handle">
            <span className="pc-avatar">{handle.slice(0, 2).toUpperCase()}</span>
            @{handle}
          </div>
        )}

        <div className="pc-heat">
          {tier === 'viral' ? (
            <div className="pc-heat-inner pc-heat-viral">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M13.5 0.75l-3 11.25h6l-3 11.25 10.5-15h-6.75l1.5-7.5h-5.25z" />
              </svg>
              VIRAL
            </div>
          ) : (
            <>
              <svg className="pc-ring" viewBox="0 0 36 36" aria-hidden="true">
                <circle className="pc-track" cx="18" cy="18" r="15.5" />
                <circle
                  className="pc-bar"
                  cx="18"
                  cy="18"
                  r="15.5"
                  strokeDasharray={RING_CIRC}
                  strokeDashoffset={dashOffset}
                />
              </svg>
              <div className="pc-heat-inner">{score}</div>
            </>
          )}
        </div>

        {isVideo && (
          <div className="pc-play" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        )}

        {deltaText && (
          <div className="pc-delta">
            <svg viewBox="0 0 10 10" aria-hidden="true">
              <path d="M5 1l4 5H6v3H4V6H1z" />
            </svg>
            {deltaText}
          </div>
        )}

        <div className="pc-views">
          <span className="pc-views-num">{fmt(views)}</span>
          <span className="pc-views-label">Views</span>
        </div>
      </div>

      <div className="pc-meta">
        <div className="pc-ratio">
          <span className="pc-ratio-likes" style={{ flex: likesF }} />
          <span className="pc-ratio-comm" style={{ flex: commF }} />
          <span className="pc-ratio-shares" style={{ flex: sharesF }} />
        </div>
        <div className="pc-stats">
          <div className="pc-stat pc-stat-likes">
            <span className="pc-stat-lbl">Likes</span>
            <span className="pc-stat-val">{fmt(likes)}</span>
          </div>
          <div className="pc-stat pc-stat-comm">
            <span className="pc-stat-lbl">Comm</span>
            <span className="pc-stat-val">{comments == null ? '—' : fmt(comments)}</span>
          </div>
          <div className="pc-stat pc-stat-shares">
            <span className="pc-stat-lbl">Shares</span>
            <span className="pc-stat-val">{fmt(shares)}</span>
          </div>
        </div>
      </div>
    </a>
  );
}
