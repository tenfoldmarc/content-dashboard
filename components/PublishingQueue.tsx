'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import type { ScheduledPost, ContentIdea } from '@/lib/types';

type ViewMode = 'list' | 'calendar';

const STATUS_STYLES: Record<string, string> = {
  queued: 'background: rgba(59,130,246,.15); color: var(--blue)',
  scheduled: 'background: rgba(34,197,94,.15); color: var(--accent)',
  published: 'background: rgba(34,197,94,.1); color: var(--accent)',
  failed: 'background: rgba(239,68,68,.15); color: var(--red)',
};

function formatTime(dateStr: string | null) {
  if (!dateStr) return '--:--';
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function getWeekDays(): Date[] {
  const now = new Date();
  const day = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  monday.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function isToday(d: Date) {
  return isSameDay(d, new Date());
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function PublishingQueue() {
  const [posts, setPosts] = useState<ScheduledPost[]>([]);
  const [ideas, setIdeas] = useState<ContentIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<ViewMode>('list');

  // Add form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [addIdeaId, setAddIdeaId] = useState('');
  const [addPlatform, setAddPlatform] = useState('instagram');
  const [addDate, setAddDate] = useState('');
  const [addTime, setAddTime] = useState('09:00');
  const [adding, setAdding] = useState(false);

  // Calendar add (from day cell)
  const [calendarAddDate, setCalendarAddDate] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [postsRes, ideasRes] = await Promise.all([
        fetch('/api/scheduled').then(r => r.json()),
        fetch('/api/ideas').then(r => r.json()),
      ]);
      setPosts(postsRes.posts || []);
      const allIdeas = ideasRes.ideas || [];
      setIdeas(allIdeas.filter((i: ContentIdea) => i.status === 'approved' || i.status === 'pending'));
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const sortedPosts = useMemo(
    () => [...posts].sort((a, b) => {
      if (!a.scheduled_for) return 1;
      if (!b.scheduled_for) return -1;
      return new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime();
    }),
    [posts]
  );

  const weekDays = useMemo(() => getWeekDays(), []);

  async function handleAdd(prefillDate?: string) {
    const dateVal = prefillDate || addDate;
    if (!dateVal || adding) return;
    setAdding(true);
    try {
      const scheduledFor = new Date(`${dateVal}T${addTime}`).toISOString();
      const res = await fetch('/api/scheduled', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idea_id: addIdeaId || null,
          platform: addPlatform,
          scheduled_for: scheduledFor,
        }),
      });
      const data = await res.json();
      if (data.post) {
        setPosts(prev => [...prev, data.post]);
        setShowAddForm(false);
        setCalendarAddDate(null);
        setAddIdeaId('');
        setAddDate('');
        setAddTime('09:00');
      }
    } catch {
      // silent
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/scheduled/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setPosts(prev => prev.filter(p => p.id !== id));
      }
    } catch {
      // silent
    }
  }

  function getPostTitle(post: ScheduledPost) {
    if (post.content_ideas?.hook) return post.content_ideas.hook;
    if (post.scripts?.title) return post.scripts.title;
    return 'Untitled post';
  }

  // Shared add form content
  function renderAddForm(prefillDate?: string) {
    return (
      <div className="space-y-3">
        <div>
          <label className="block text-[.72rem] font-semibold uppercase tracking-wider text-muted mb-1.5">Idea (optional)</label>
          <select
            value={addIdeaId}
            onChange={e => setAddIdeaId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border text-sm outline-none focus:border-accent"
            style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          >
            <option value="">No linked idea</option>
            {ideas.map(idea => (
              <option key={idea.id} value={idea.id}>{idea.hook.slice(0, 60)}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-[.72rem] font-semibold uppercase tracking-wider text-muted mb-1.5">Platform</label>
            <select
              value={addPlatform}
              onChange={e => setAddPlatform(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none focus:border-accent"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            >
              <option value="instagram">Instagram</option>
              <option value="tiktok">TikTok</option>
              <option value="youtube">YouTube</option>
              <option value="twitter">Twitter</option>
            </select>
          </div>
          <div>
            <label className="block text-[.72rem] font-semibold uppercase tracking-wider text-muted mb-1.5">Time</label>
            <input
              type="time"
              value={addTime}
              onChange={e => setAddTime(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none focus:border-accent"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />
          </div>
        </div>
        {!prefillDate && (
          <div>
            <label className="block text-[.72rem] font-semibold uppercase tracking-wider text-muted mb-1.5">Date</label>
            <input
              type="date"
              value={addDate}
              onChange={e => setAddDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border text-sm outline-none focus:border-accent"
              style={{ background: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />
          </div>
        )}
        <div className="flex gap-2 pt-1">
          <button
            onClick={() => handleAdd(prefillDate)}
            disabled={adding || (!prefillDate && !addDate)}
            className="px-5 py-2 rounded-full text-[.78rem] font-semibold bg-accent text-white hover:bg-accent-hover transition-all disabled:opacity-50"
          >
            {adding ? 'Adding...' : 'Schedule Post'}
          </button>
          <button
            onClick={() => { setShowAddForm(false); setCalendarAddDate(null); }}
            className="px-5 py-2 rounded-full text-[.78rem] font-medium border text-muted hover:text-cream hover:border-accent transition-all"
            style={{ borderColor: 'var(--border)' }}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse rounded-card border border-border bg-card/60 h-16" />
        <div className="animate-pulse rounded-card border border-border bg-card/60 h-48" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-surface p-1 rounded-full w-fit">
          <button
            onClick={() => setViewMode('list')}
            className={`px-4 py-1.5 rounded-full text-[.78rem] font-semibold transition-all ${
              viewMode === 'list' ? 'bg-card text-cream border border-border' : 'text-muted hover:text-cream'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16"/></svg>
              List
            </span>
          </button>
          <button
            onClick={() => setViewMode('calendar')}
            className={`px-4 py-1.5 rounded-full text-[.78rem] font-semibold transition-all ${
              viewMode === 'calendar' ? 'bg-card text-cream border border-border' : 'text-muted hover:text-cream'
            }`}
          >
            <span className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
              Calendar
            </span>
          </button>
        </div>

        <button
          onClick={() => { setShowAddForm(!showAddForm); setCalendarAddDate(null); }}
          className="px-5 py-2 rounded-full text-[.78rem] font-semibold bg-accent text-white hover:bg-accent-hover transition-all flex items-center gap-1.5"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}><path strokeLinecap="round" d="M12 5v14M5 12h14"/></svg>
          Add Post
        </button>
      </div>

      {/* Add form (top-level) */}
      {showAddForm && (
        <div className="rounded-card border bg-card/70 backdrop-blur-sm p-5" style={{ borderColor: 'var(--border)' }}>
          <h3 className="text-[.88rem] font-semibold mb-3">Schedule New Post</h3>
          {renderAddForm()}
        </div>
      )}

      {/* LIST VIEW */}
      {viewMode === 'list' && (
        <div className="space-y-2">
          {sortedPosts.length === 0 ? (
            <div className="rounded-card border border-border bg-card/60 p-12 text-center">
              <p className="text-sm text-muted">No scheduled posts yet — hit &quot;Add Post&quot; to start scheduling.</p>
            </div>
          ) : (
            sortedPosts.map(post => (
              <div
                key={post.id}
                className="rounded-card border bg-card/70 backdrop-blur-sm p-4 flex items-center gap-4 transition-all hover:border-border-hover group"
                style={{ borderColor: 'var(--border)' }}
              >
                {/* Time */}
                <div className="min-w-[80px]">
                  <span className="font-mono text-[.82rem] font-semibold" style={{ color: 'var(--accent)' }}>
                    {formatTime(post.scheduled_for)}
                  </span>
                  <div className="text-[.68rem] text-muted mt-0.5">{formatDate(post.scheduled_for)}</div>
                </div>

                {/* Title */}
                <div className="flex-1 min-w-0">
                  <p className="text-[.85rem] font-medium truncate">{getPostTitle(post)}</p>
                </div>

                {/* Platform badge */}
                <span
                  className="text-[.65rem] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full"
                  style={{ background: 'rgba(148,163,184,.1)', color: 'var(--text-secondary)' }}
                >
                  {post.platform}
                </span>

                {/* Status badge */}
                <span
                  className="text-[.65rem] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full"
                  style={(() => {
                    const s = STATUS_STYLES[post.status] || '';
                    const parts = s.split(';').reduce((acc, p) => {
                      const [k, v] = p.split(':').map(x => x.trim());
                      if (k && v) acc[k] = v;
                      return acc;
                    }, {} as Record<string, string>);
                    return parts;
                  })()}
                >
                  {post.status}
                </span>

                {/* Delete */}
                <button
                  onClick={() => handleDelete(post.id)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-muted hover:text-red hover:bg-red/10 transition-all"
                  title="Delete"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {/* CALENDAR VIEW */}
      {viewMode === 'calendar' && (
        <div className="rounded-card border bg-card/70 backdrop-blur-sm overflow-hidden" style={{ borderColor: 'var(--border)' }}>
          {/* Day headers */}
          <div className="grid grid-cols-7 border-b" style={{ borderColor: 'var(--border)' }}>
            {DAY_LABELS.map(label => (
              <div key={label} className="px-3 py-2.5 text-center">
                <span className="text-[.68rem] font-bold uppercase tracking-wider text-muted">{label}</span>
              </div>
            ))}
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7">
            {weekDays.map((day, idx) => {
              const dayPosts = sortedPosts.filter(p =>
                p.scheduled_for && isSameDay(new Date(p.scheduled_for), day)
              );
              const today = isToday(day);
              const dateStr = day.toISOString().split('T')[0];
              const isAddingHere = calendarAddDate === dateStr;

              return (
                <div
                  key={idx}
                  className="p-3 min-h-[140px] transition-all"
                  style={{
                    borderRight: idx < 6 ? '1px solid var(--border)' : 'none',
                    ...(today
                      ? { borderColor: 'var(--accent)', background: 'rgba(34,197,94,.04)', boxShadow: 'inset 0 0 0 1px var(--accent)' }
                      : {}),
                  }}
                >
                  {/* Day number */}
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-[.82rem] font-semibold ${today ? 'text-accent' : 'text-cream'}`}>
                      {day.getDate()}
                    </span>
                    {today && (
                      <span className="text-[.58rem] font-bold uppercase tracking-wider text-accent">Today</span>
                    )}
                  </div>

                  {/* Posts in this day */}
                  <div className="space-y-1.5">
                    {dayPosts.map(post => (
                      <div
                        key={post.id}
                        className="rounded-md px-2 py-1.5 text-[.7rem] group/card cursor-default"
                        style={{
                          background: 'var(--surface)',
                          borderLeft: '3px solid var(--accent)',
                        }}
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div className="min-w-0 flex-1">
                            <span className="font-mono text-[.62rem] block" style={{ color: 'var(--accent)' }}>
                              {formatTime(post.scheduled_for)}
                            </span>
                            <span className="block truncate font-medium text-[.68rem] mt-0.5">
                              {getPostTitle(post)}
                            </span>
                          </div>
                          <button
                            onClick={() => handleDelete(post.id)}
                            className="opacity-0 group-hover/card:opacity-100 p-0.5 rounded text-muted hover:text-red transition-all flex-shrink-0"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                              <path strokeLinecap="round" d="M6 18L18 6M6 6l12 12"/>
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Calendar inline add form */}
                  {isAddingHere ? (
                    <div className="mt-2">
                      {renderAddForm(dateStr)}
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setCalendarAddDate(dateStr);
                        setShowAddForm(false);
                        setAddDate(dateStr);
                      }}
                      className="mt-2 w-full py-1.5 rounded-md border border-dashed text-[.65rem] text-muted hover:text-accent hover:border-accent transition-all"
                      style={{ borderColor: 'var(--border)' }}
                    >
                      + Add
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
