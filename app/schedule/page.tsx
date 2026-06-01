'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import DateTimePicker from '@/components/DateTimePicker';

interface QueueItem {
  id: string;
  title: string;
  caption: string;
  drive_file_id: string;
  drive_file_name: string;
  drive_file_url: string;
  media_url: string;
  thumbnail_url: string;
  status: 'ready' | 'scheduled' | 'published' | 'failed' | 'removed';
  scheduled_for: string | null;
  published_at: string | null;
  platforms: string[];
  suggested_caption: string | null;
  youtube_title: string | null;
  transcript: string | null;
  is_trial_reel: boolean;
  error: string | null;
  created_at: string;
}

const GENERATING_PLACEHOLDER = 'Generating caption…';

const PLATFORM_ICONS: Record<string, { label: string; color: string }> = {
  instagram: { label: 'Instagram', color: '#E4405F' },
  tiktok: { label: 'TikTok', color: '#00f2ea' },
  youtube: { label: 'YouTube', color: '#FF0000' },
  facebook: { label: 'Facebook', color: '#1877F2' },
};

function fmt(n: number) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

// Prefer the stable Drive-file-id thumbnail proxy (always fresh, never expires).
// Fall back to proxying whatever thumbnail_url we have.
function thumbSrc(item: QueueItem): string | null {
  if (item.drive_file_id) return `/api/drive-thumbnail?fileId=${item.drive_file_id}`;
  if (item.thumbnail_url) return `/api/image-proxy?url=${encodeURIComponent(item.thumbnail_url)}`;
  return null;
}

export default function SchedulePage() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [driveConnected, setDriveConnected] = useState(false);
  const [availablePlatforms, setAvailablePlatforms] = useState<string[]>([]);
  const [newFilesFound, setNewFilesFound] = useState(0);

  // Schedule modal
  const [scheduleItem, setScheduleItem] = useState<QueueItem | null>(null);
  const [scheduleCaption, setScheduleCaption] = useState('');
  const [schedulePlatforms, setSchedulePlatforms] = useState<string[]>([]);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [youtubeTitle, setYoutubeTitle] = useState('');
  const [isTrialReel, setIsTrialReel] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    try {
      const res = await fetch('/api/content/queue');
      const data = await res.json();
      setQueue(data.queue || []);
      setDriveConnected(data.driveConnected);
      setAvailablePlatforms(data.platforms || []);
      setNewFilesFound(data.newFilesFound || 0);
    } catch { /* skip */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  // Auto-poll while any item is still generating its caption — no Drive scan, just reads Supabase.
  useEffect(() => {
    const hasPending = queue.some(q => q.caption === GENERATING_PLACEHOLDER);
    if (!hasPending) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/content/queue?scan=0');
        const data = await res.json();
        setQueue(data.queue || []);
      } catch { /* skip */ }
    }, 4000);
    return () => clearInterval(interval);
  }, [queue]);

  // Client-side processor pool. For every row stuck on the placeholder caption,
  // call /api/content/process?id=X (synchronous, runs server-side until done).
  // We kick at most 2 in flight at a time so we don't hammer the API.
  const inFlight = useRef<Set<string>>(new Set());
  useEffect(() => {
    const MAX_CONCURRENCY = 2;
    const pending = queue
      .filter(q => q.caption === GENERATING_PLACEHOLDER && q.drive_file_id && !inFlight.current.has(q.id))
      .map(q => q.id);
    if (pending.length === 0) return;

    let slots = MAX_CONCURRENCY - inFlight.current.size;
    while (slots > 0 && pending.length > 0) {
      const id = pending.shift()!;
      inFlight.current.add(id);
      slots--;
      fetch(`/api/content/process?id=${id}`)
        .catch(() => { /* swallow — server already wrote error to row */ })
        .finally(() => {
          inFlight.current.delete(id);
        });
    }
  }, [queue]);

  async function handleRefresh() {
    setRefreshing(true);
    setNewFilesFound(0);
    try {
      const res = await fetch('/api/content/queue');
      const data = await res.json();
      setQueue(data.queue || []);
      setDriveConnected(data.driveConnected);
      setAvailablePlatforms(data.platforms || []);
      setNewFilesFound(data.newFilesFound || 0);
    } catch { /* skip */ }
    setRefreshing(false);
  }

  function openScheduleModal(item: QueueItem) {
    setScheduleItem(item);
    setScheduleCaption(item.caption || item.suggested_caption || '');
    setSchedulePlatforms(['instagram', 'tiktok', 'youtube', 'facebook']);
    setScheduleDate(new Date().toISOString().split('T')[0]);
    setScheduleTime('12:00');
    setYoutubeTitle(item.youtube_title || item.title || '');
    setIsTrialReel(false);
    setScheduleError(null);
  }

  async function regenerateCaption() {
    if (!scheduleItem) return;
    setRegenerating(true);
    try {
      const res = await fetch('/api/content/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'regenerate-caption', id: scheduleItem.id }),
      });
      const data = await res.json();
      if (data.caption) {
        setScheduleCaption(data.caption);
        if (data.youtubeTitle) setYoutubeTitle(data.youtubeTitle);
      }
    } catch { /* skip */ }
    setRegenerating(false);
  }

  async function handleSchedule() {
    if (!scheduleItem || schedulePlatforms.length === 0 || !scheduleDate || !scheduleTime) {
      setScheduleError('Select at least one platform and a date/time');
      return;
    }

    setScheduling(true);
    setScheduleError(null);

    try {
      const scheduledFor = new Date(`${scheduleDate}T${scheduleTime}:00`).toISOString();
      const res = await fetch('/api/content/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'schedule',
          id: scheduleItem.id,
          caption: scheduleCaption,
          platforms: schedulePlatforms,
          scheduledFor,
          youtubeTitle: youtubeTitle || undefined,
          isTrialReel,
        }),
      });
      const data = await res.json();

      if (data.success) {
        setScheduleItem(null);
        fetchQueue();
      } else {
        setScheduleError(data.error || 'Scheduling failed');
      }
    } catch (err) {
      setScheduleError(err instanceof Error ? err.message : 'Failed');
    }
    setScheduling(false);
  }

  async function handleInlineRegenerate(id: string) {
    // Mark as generating locally so the spinner appears + auto-poll kicks in.
    setQueue(prev => prev.map(q => q.id === id ? { ...q, caption: GENERATING_PLACEHOLDER, error: null } : q));
    try {
      const res = await fetch('/api/content/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'regenerate-caption', id }),
      });
      const data = await res.json();
      if (!data.success) {
        // Surface the real error and stop the spinner.
        setQueue(prev => prev.map(q => q.id === id ? { ...q, caption: '', error: data.error || 'Regeneration failed' } : q));
      } else {
        // Caption arrived synchronously — drop into queue so spinner clears.
        setQueue(prev => prev.map(q => q.id === id ? { ...q, caption: data.caption || '', youtube_title: data.youtubeTitle || q.youtube_title, error: null } : q));
      }
    } catch (err) {
      setQueue(prev => prev.map(q => q.id === id ? { ...q, caption: '', error: err instanceof Error ? err.message : 'Network error' } : q));
    }
  }

  async function handleDelete(id: string) {
    const item = queue.find(q => q.id === id);
    const label = item?.title || item?.drive_file_name || 'this video';
    if (!window.confirm(`Remove "${label}" from the dashboard?\n\nIt won't show up again, even if you click "Check for New Content".`)) return;
    await fetch('/api/content/queue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', id }),
    });
    // Optimistic local removal so the UI updates instantly
    setQueue(prev => prev.filter(q => q.id !== id));
  }

  async function handleSyncZernio() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch('/api/content/queue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync-zernio' }),
      });
      const data = await res.json();
      if (data.success) {
        setSyncResult(data.synced > 0 ? `${data.synced} post${data.synced !== 1 ? 's' : ''} updated` : 'All posts in sync');
        fetchQueue();
      } else {
        setSyncResult(data.error || 'Sync failed');
      }
    } catch {
      setSyncResult('Sync failed');
    }
    setSyncing(false);
    setTimeout(() => setSyncResult(null), 4000);
  }

  function togglePlatform(platform: string) {
    setSchedulePlatforms(prev =>
      prev.includes(platform) ? prev.filter(p => p !== platform) : [...prev, platform]
    );
  }

  const readyItems = queue.filter(q => q.status === 'ready');
  const scheduledItems = queue.filter(q => q.status === 'scheduled');
  const publishedItems = queue.filter(q => q.status === 'published');
  const failedItems = queue.filter(q => q.status === 'failed');
  // Removed items are hidden from the UI but kept in the DB so the Drive scan
  // doesn't re-import them. Filter the entire queue so they don't appear anywhere.
  const visibleQueue = queue.filter(q => q.status !== 'removed');

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-[2rem] tracking-[1.5px]">Schedule</h1>
          <p className="text-[var(--text-secondary)] text-sm mt-1">
            Upload content to Google Drive &rarr; Schedule &rarr; Post to all platforms
          </p>
        </div>
        <div className="flex items-center gap-2">
          {syncResult && (
            <span className="text-[.72rem] text-accent font-medium">{syncResult}</span>
          )}
          <button
            onClick={handleSyncZernio}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-[.78rem] font-medium text-muted hover:text-cream hover:border-accent transition-all disabled:opacity-50"
          >
            <svg className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {syncing ? 'Syncing...' : 'Sync Status'}
          </button>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border text-[.78rem] font-medium text-muted hover:text-cream hover:border-accent transition-all disabled:opacity-50"
          >
            <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {refreshing ? 'Checking Drive...' : 'Check for New Content'}
          </button>
        </div>
      </div>

      {/* Drive connection status */}
      {!driveConnected && !loading && (
        <div className="px-5 py-4 rounded-xl border border-[var(--amber)]/30 bg-[var(--amber)]/5">
          <p className="text-[.85rem] font-semibold text-cream">Connect Google Drive</p>
          <p className="text-[.75rem] text-[var(--text-secondary)] mt-1">
            Create a folder called <span className="text-cream font-mono">&quot;Ready to Post&quot;</span> in your Google Drive. Drop videos and images there, then click &quot;Check for New Content&quot; to see them here.
          </p>
        </div>
      )}

      {newFilesFound > 0 && (
        <div className="px-4 py-2.5 rounded-xl border border-accent/30 bg-accent/5 text-[.78rem]">
          <span className="text-accent font-semibold">{newFilesFound} new file{newFilesFound > 1 ? 's' : ''}</span> found in Google Drive
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-card border border-border bg-card/60 p-4">
          <div className="text-[.68rem] uppercase tracking-wider text-muted mb-1">Ready</div>
          <div className="font-mono text-[1.8rem] text-cream">{fmt(readyItems.length)}</div>
        </div>
        <div className="rounded-card border border-border bg-card/60 p-4">
          <div className="text-[.68rem] uppercase tracking-wider text-muted mb-1">Scheduled</div>
          <div className="font-mono text-[1.8rem] text-accent">{fmt(scheduledItems.length)}</div>
        </div>
        <div className="rounded-card border border-border bg-card/60 p-4">
          <div className="text-[.68rem] uppercase tracking-wider text-muted mb-1">Published</div>
          <div className="font-mono text-[1.8rem]" style={{ color: 'var(--green, #3ecf8e)' }}>{fmt(publishedItems.length)}</div>
        </div>
        <div className="rounded-card border border-border bg-card/60 p-4">
          <div className="text-[.68rem] uppercase tracking-wider text-muted mb-1">Failed</div>
          <div className="font-mono text-[1.8rem] text-red">{fmt(failedItems.length)}</div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="animate-pulse rounded-card border border-border bg-card/60 h-24" />
          ))}
        </div>
      ) : (
        <>
          {/* Ready to Schedule */}
          {readyItems.length > 0 && (
            <div>
              <h2 className="font-heading text-[1.1rem] tracking-[1px] mb-3">READY TO SCHEDULE</h2>
              <div className="space-y-2">
                {readyItems.map(item => {
                  const isGenerating = item.caption === GENERATING_PLACEHOLDER;
                  const hasError = !!item.error && !item.caption;
                  return (
                  <div key={item.id} className="flex items-center gap-4 p-4 rounded-xl border border-border bg-card/60 hover:border-[var(--border-hover)] transition-all">
                    {/* Thumbnail */}
                    <div className="w-16 h-16 rounded-lg bg-surface flex-shrink-0 overflow-hidden">
                      {thumbSrc(item) ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={thumbSrc(item)!} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <svg className="w-6 h-6 text-muted" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-[.88rem] font-semibold text-cream truncate">{item.title || item.drive_file_name}</div>
                      {isGenerating ? (
                        <div className="flex items-center gap-1.5 text-[.7rem] text-accent mt-0.5">
                          <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                          Generating caption…
                        </div>
                      ) : hasError ? (
                        <div className="text-[.7rem] text-red mt-0.5">{item.error}</div>
                      ) : (
                        <div className="text-[.7rem] text-muted mt-0.5">{item.drive_file_name}</div>
                      )}
                    </div>

                    {/* Actions */}
                    {hasError && (
                      <button
                        onClick={() => handleInlineRegenerate(item.id)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-accent/40 text-[.78rem] font-semibold text-accent hover:bg-accent/10 transition-all"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                        Regenerate
                      </button>
                    )}
                    <button
                      onClick={() => openScheduleModal(item)}
                      disabled={isGenerating}
                      className="px-4 py-2 rounded-xl bg-accent text-white text-[.78rem] font-semibold hover:bg-[var(--accent-hover)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Schedule
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
                      className="p-2 rounded-lg text-muted hover:text-red hover:bg-red/10 transition-all"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Scheduled */}
          {scheduledItems.length > 0 && (
            <div>
              <h2 className="font-heading text-[1.1rem] tracking-[1px] mb-3">SCHEDULED</h2>
              <div className="space-y-2">
                {scheduledItems.map(item => (
                  <div key={item.id} className="flex items-center gap-4 p-4 rounded-xl border border-accent/20 bg-accent/5">
                    <div className="w-16 h-16 rounded-lg bg-surface flex-shrink-0 overflow-hidden">
                      {thumbSrc(item) ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={thumbSrc(item)!} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <svg className="w-6 h-6 text-accent" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[.88rem] font-semibold text-cream truncate">{item.title || item.drive_file_name}</div>
                      <div className="flex items-center gap-2 mt-1">
                        {(item.platforms || []).map(p => (
                          <span key={p} className="text-[.6rem] font-bold uppercase px-2 py-0.5 rounded-full" style={{ background: `${PLATFORM_ICONS[p]?.color}20`, color: PLATFORM_ICONS[p]?.color }}>
                            {PLATFORM_ICONS[p]?.label || p}
                          </span>
                        ))}
                        {item.scheduled_for && (
                          <span className="text-[.68rem] text-muted ml-2">
                            {new Date(item.scheduled_for).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at{' '}
                            {new Date(item.scheduled_for).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent/10 border border-accent/20">
                      <span className="w-[6px] h-[6px] rounded-full bg-accent animate-pulse" />
                      <span className="text-[.65rem] font-semibold text-accent">Scheduled</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Published */}
          {publishedItems.length > 0 && (
            <div>
              <h2 className="font-heading text-[1.1rem] tracking-[1px] mb-3">PUBLISHED</h2>
              <div className="space-y-2">
                {publishedItems.map(item => (
                  <div key={item.id} className="flex items-center gap-4 p-4 rounded-xl border border-[var(--green,#3ecf8e)]/20 bg-[var(--green,#3ecf8e)]/5">
                    {/* Thumbnail */}
                    <div className="w-16 h-16 rounded-lg bg-surface flex-shrink-0 overflow-hidden">
                      {thumbSrc(item) ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={thumbSrc(item)!} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <svg className="w-6 h-6" style={{ color: 'var(--green, #3ecf8e)' }} fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        </div>
                      )}
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="text-[.88rem] font-semibold text-cream truncate">{item.title || item.drive_file_name}</div>
                      <div className="flex items-center gap-2 mt-1">
                        {(item.platforms || []).map(p => (
                          <span key={p} className="text-[.6rem] font-bold uppercase px-2 py-0.5 rounded-full" style={{ background: `${PLATFORM_ICONS[p]?.color}20`, color: PLATFORM_ICONS[p]?.color }}>
                            {PLATFORM_ICONS[p]?.label || p}
                          </span>
                        ))}
                      </div>
                      <div className="text-[.68rem] mt-1" style={{ color: 'var(--text-muted)' }}>
                        Published on{' '}
                        {new Date(item.published_at || item.scheduled_for || item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        {' at '}
                        {new Date(item.published_at || item.scheduled_for || item.created_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </div>
                    </div>
                    {/* Green checkmark */}
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-[var(--green,#3ecf8e)]/10 border border-[var(--green,#3ecf8e)]/20">
                      <svg className="w-4 h-4" style={{ color: 'var(--green, #3ecf8e)' }} fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span className="text-[.65rem] font-semibold" style={{ color: 'var(--green, #3ecf8e)' }}>Published</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Failed */}
          {failedItems.length > 0 && (
            <div>
              <h2 className="font-heading text-[1.1rem] tracking-[1px] mb-3">FAILED</h2>
              <div className="space-y-2">
                {failedItems.map(item => (
                  <div key={item.id} className="flex items-center gap-4 p-4 rounded-xl border border-red/20 bg-red/5">
                    {/* Thumbnail */}
                    <div className="w-16 h-16 rounded-lg bg-surface flex-shrink-0 overflow-hidden">
                      {thumbSrc(item) ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img src={thumbSrc(item)!} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <svg className="w-6 h-6 text-red" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[.88rem] font-semibold text-cream truncate">{item.title || item.drive_file_name}</div>
                      <div className="flex items-center gap-2 mt-1">
                        {(item.platforms || []).map(p => (
                          <span key={p} className="text-[.6rem] font-bold uppercase px-2 py-0.5 rounded-full" style={{ background: `${PLATFORM_ICONS[p]?.color}20`, color: PLATFORM_ICONS[p]?.color }}>
                            {PLATFORM_ICONS[p]?.label || p}
                          </span>
                        ))}
                      </div>
                      <div className="text-[.7rem] text-red mt-1">{item.error || 'Unknown error'}</div>
                    </div>
                    <button onClick={() => openScheduleModal(item)} className="px-4 py-2 rounded-xl border border-border text-[.78rem] font-semibold text-muted hover:text-cream hover:border-accent transition-all">
                      Retry
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {visibleQueue.length === 0 && (
            <div className="rounded-card border border-border bg-card/40 p-12 text-center">
              <svg className="w-12 h-12 mx-auto text-muted mb-4" fill="none" stroke="currentColor" strokeWidth="1" viewBox="0 0 24 24">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
              <p className="text-[.9rem] font-semibold text-cream mb-1">No content in queue</p>
              <p className="text-[.78rem] text-muted">
                Drop videos into the <span className="font-mono text-accent">&quot;Ready to Post&quot;</span> folder in Google Drive, then click &quot;Check for New Content&quot;.
              </p>
            </div>
          )}
        </>
      )}

      {/* Schedule Modal */}
      {scheduleItem && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center">
          <div className="w-[520px] max-h-[90vh] overflow-y-auto rounded-2xl border border-border bg-card p-6">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-heading text-[1.2rem]">Schedule Post</h3>
              <button onClick={() => setScheduleItem(null)} className="p-1 text-muted hover:text-cream">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>

            {/* File info */}
            <div className="flex items-center gap-3 p-3 rounded-xl bg-surface mb-4">
              <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              <span className="text-[.82rem] text-cream truncate">{scheduleItem.drive_file_name || scheduleItem.title}</span>
            </div>

            {/* Caption */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[.72rem] font-semibold text-muted uppercase tracking-wider">Caption</label>
                <button
                  onClick={regenerateCaption}
                  disabled={regenerating}
                  className="flex items-center gap-1.5 px-3 py-1 rounded-lg text-[.68rem] font-semibold text-accent border border-accent/30 hover:bg-accent/10 transition-all disabled:opacity-50"
                >
                  {regenerating ? (
                    <>
                      <svg className="w-3 h-3 animate-spin" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                      Regenerating...
                    </>
                  ) : (
                    <>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                      Regenerate
                    </>
                  )}
                </button>
              </div>
              <textarea
                value={scheduleCaption}
                onChange={e => setScheduleCaption(e.target.value)}
                rows={4}
                placeholder="Write your post caption..."
                className="w-full rounded-xl px-4 py-3 text-[.82rem] bg-surface border border-border text-cream outline-none focus:border-accent transition-all resize-none"
              />
            </div>

            {/* Platforms */}
            <div className="mb-4">
              <label className="block text-[.72rem] font-semibold text-muted uppercase tracking-wider mb-1.5">Platforms</label>
              <div className="flex gap-2">
                {availablePlatforms.map(p => (
                  <button
                    key={p}
                    onClick={() => togglePlatform(p)}
                    className={`px-4 py-2 rounded-xl text-[.75rem] font-semibold border transition-all ${
                      schedulePlatforms.includes(p)
                        ? 'border-transparent text-white'
                        : 'border-border text-muted hover:text-cream'
                    }`}
                    style={schedulePlatforms.includes(p) ? { background: PLATFORM_ICONS[p]?.color } : {}}
                  >
                    {PLATFORM_ICONS[p]?.label || p}
                  </button>
                ))}
              </div>
            </div>

            {/* Trial Reel toggle (show when Instagram is selected) */}
            {schedulePlatforms.includes('instagram') && (
              <div className="mb-4 flex items-center gap-3">
                <button
                  onClick={() => setIsTrialReel(!isTrialReel)}
                  className={`relative w-10 h-5 rounded-full transition-all ${isTrialReel ? 'bg-accent' : 'bg-surface border border-border'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${isTrialReel ? 'left-5' : 'left-0.5'}`} />
                </button>
                <div>
                  <span className="text-[.78rem] font-semibold text-cream">Trial Reel</span>
                  <span className="text-[.65rem] text-muted ml-2">Post as trial — only visible to non-followers until you graduate it</span>
                </div>
              </div>
            )}

            {/* YouTube Title (show when YouTube is selected) */}
            {schedulePlatforms.includes('youtube') && (
              <div className="mb-4">
                <label className="block text-[.72rem] font-semibold text-muted uppercase tracking-wider mb-1.5">YouTube Shorts Title</label>
                <input
                  value={youtubeTitle}
                  onChange={e => setYoutubeTitle(e.target.value)}
                  maxLength={100}
                  placeholder="Short title for YouTube (max 100 chars)"
                  className="w-full rounded-xl px-4 py-3 text-[.82rem] bg-surface border border-border text-cream outline-none focus:border-accent transition-all"
                />
                <span className="text-[.6rem] text-muted mt-0.5 block">{youtubeTitle.length}/100</span>
              </div>
            )}

            {/* Date & Time — single button opens a calendar picker */}
            <div className="mb-5">
              <label className="block text-[.72rem] font-semibold text-muted uppercase tracking-wider mb-1.5">When to post</label>
              <button
                onClick={() => setShowPicker(true)}
                className="w-full flex items-center justify-between rounded-xl px-4 py-3 text-[.82rem] bg-surface border border-border text-cream hover:border-accent transition-all"
              >
                <span className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                  {scheduleDate && scheduleTime
                    ? `${new Date(scheduleDate + 'T' + scheduleTime).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at ${new Date(scheduleDate + 'T' + scheduleTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
                    : 'Select date & time'}
                </span>
                <span className="text-[.7rem] text-accent font-semibold">Change</span>
              </button>
            </div>

            {showPicker && (
              <DateTimePicker
                date={scheduleDate}
                time={scheduleTime}
                onApply={(d, t) => { setScheduleDate(d); setScheduleTime(t); setShowPicker(false); }}
                onClose={() => setShowPicker(false)}
              />
            )}

            {scheduleError && (
              <div className="mb-4 px-3 py-2 rounded-lg bg-red/10 text-red text-[.78rem]">{scheduleError}</div>
            )}

            <button
              onClick={handleSchedule}
              disabled={scheduling || schedulePlatforms.length === 0}
              className="w-full py-3 rounded-xl bg-accent text-white text-[.85rem] font-semibold hover:bg-[var(--accent-hover)] transition-all disabled:opacity-50"
            >
              {scheduling ? 'Scheduling...' : `Schedule to ${schedulePlatforms.length} platform${schedulePlatforms.length !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
