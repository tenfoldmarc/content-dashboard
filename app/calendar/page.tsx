'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';

interface CalPost {
  id: string;
  title: string;
  date: string; // YYYY-MM-DD
  time: string;
  hour: number;
  minute: number;
  platforms: string[];
  status: string;
  driveFileId: string | null;
}

const PLATFORM_COLORS: Record<string, string> = {
  instagram: '#E4405F',
  tiktok: '#00f2ea',
  youtube: '#FF0000',
  facebook: '#1877F2',
};

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function startOfWeek(d: Date) {
  return addDays(d, -d.getDay()); // Sunday
}

type View = 'month' | 'week';

export default function ContentCalendarPage() {
  const today = new Date();
  const todayStr = ymd(today);
  const [view, setView] = useState<View>('month');
  const [anchor, setAnchor] = useState(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  const [posts, setPosts] = useState<CalPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Fetch the window for the current view.
  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      let url: string;
      if (view === 'month') {
        url = `/api/content-calendar?month=${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, '0')}`;
      } else {
        const ws = startOfWeek(anchor);
        url = `/api/content-calendar?from=${ymd(ws)}&to=${ymd(addDays(ws, 7))}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      setPosts(data.posts || []);
    } catch {
      setPosts([]);
    }
    setLoading(false);
  }, [view, anchor]);

  useEffect(() => { fetchPosts(); }, [fetchPosts]);

  const postsByDay = useMemo(() => {
    const map: Record<string, CalPost[]> = {};
    for (const p of posts) (map[p.date] ||= []).push(p);
    return map;
  }, [posts]);

  const scheduledCount = posts.filter(p => p.status === 'scheduled').length;
  const daysWithContent = Object.keys(postsByDay).length;

  // Navigation
  function navigate(dir: -1 | 1) {
    setSelectedDay(null);
    if (view === 'month') {
      setAnchor(a => new Date(a.getFullYear(), a.getMonth() + dir, 1));
    } else {
      setAnchor(a => addDays(a, dir * 7));
    }
  }
  function goToday() {
    setSelectedDay(null);
    setAnchor(new Date(today.getFullYear(), today.getMonth(), today.getDate()));
  }

  // Period label
  const periodLabel = useMemo(() => {
    if (view === 'month') return `${MONTH_NAMES[anchor.getMonth()]} ${anchor.getFullYear()}`;
    const ws = startOfWeek(anchor);
    const we = addDays(ws, 6);
    const sameMonth = ws.getMonth() === we.getMonth();
    return sameMonth
      ? `${MONTH_ABBR[ws.getMonth()]} ${ws.getDate()} – ${we.getDate()}, ${we.getFullYear()}`
      : `${MONTH_ABBR[ws.getMonth()]} ${ws.getDate()} – ${MONTH_ABBR[we.getMonth()]} ${we.getDate()}, ${we.getFullYear()}`;
  }, [view, anchor]);

  function dayPlatforms(dayPosts: CalPost[]): string[] {
    const set = new Set<string>();
    for (const p of dayPosts) for (const pl of p.platforms) set.add(pl);
    return Array.from(set);
  }

  // Month grid cells
  const monthCells = useMemo(() => {
    const y = anchor.getFullYear();
    const m = anchor.getMonth();
    const firstDow = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const arr: ({ day: number; dateStr: string } | null)[] = [];
    for (let i = 0; i < firstDow; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push({ day: d, dateStr: ymd(new Date(y, m, d)) });
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [anchor]);

  const weekDays = useMemo(() => {
    const ws = startOfWeek(anchor);
    return Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  }, [anchor]);

  const selectedPosts = selectedDay ? (postsByDay[selectedDay] || []) : [];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-heading text-[2.4rem] tracking-[1.5px]">Content Calendar</h1>
          <p className="text-muted text-sm mt-1">
            {scheduledCount} scheduled · {daysWithContent} day{daysWithContent !== 1 ? 's' : ''} with content {view === 'month' ? 'this month' : 'this week'}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex p-1 rounded-xl bg-surface border border-border">
            {(['month', 'week'] as View[]).map(v => (
              <button
                key={v}
                onClick={() => { setView(v); setSelectedDay(null); }}
                className={`px-4 py-1.5 rounded-lg text-[.78rem] font-semibold capitalize transition-all ${
                  view === v ? 'bg-accent text-white shadow-[0_2px_10px_var(--accent-glow)]' : 'text-muted hover:text-cream'
                }`}
              >
                {v}
              </button>
            ))}
          </div>

          {/* Navigation */}
          <button onClick={goToday} className="px-3 py-2 rounded-xl border border-border text-[.78rem] text-muted hover:text-cream hover:border-accent transition-all">Today</button>
          <div className="flex items-center gap-1">
            <button onClick={() => navigate(-1)} className="p-2 rounded-xl border border-border text-muted hover:text-cream hover:border-accent transition-all" aria-label="Previous">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <div className="px-3 min-w-[170px] text-center font-heading text-[1.02rem] tracking-[.5px]">{periodLabel}</div>
            <button onClick={() => navigate(1)} className="p-2 rounded-xl border border-border text-muted hover:text-cream hover:border-accent transition-all" aria-label="Next">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[.7rem] text-muted flex-wrap">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--accent)' }} /> Scheduled</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--green,#3ecf8e)' }} /> Published</span>
        <span className="w-px h-3 bg-border" />
        {Object.entries(PLATFORM_COLORS).map(([k, c]) => (
          <span key={k} className="flex items-center gap-1.5 capitalize"><span className="w-2.5 h-2.5 rounded-full" style={{ background: c }} /> {k}</span>
        ))}
      </div>

      {/* ───────── MONTH VIEW ───────── */}
      {view === 'month' && (
        <div className="rounded-2xl border border-border bg-card/50 overflow-hidden shadow-[0_8px_30px_rgba(0,0,0,.18)]">
          <div className="grid grid-cols-7">
            {WEEKDAYS.map(d => (
              <div key={d} className="px-3 py-2.5 text-[.64rem] uppercase tracking-[1.5px] text-muted font-semibold text-center border-b border-border">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {monthCells.map((cell, i) => {
              if (!cell) return <div key={i} className="min-h-[118px] border-b border-r border-border/40 bg-surface/10" />;
              const dayPosts = postsByDay[cell.dateStr] || [];
              const isToday = cell.dateStr === todayStr;
              const plats = dayPlatforms(dayPosts).slice(0, 4);
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDay(cell.dateStr)}
                  className="group min-h-[118px] border-b border-r border-border/40 p-2 text-left align-top transition-colors hover:bg-card-hover/30"
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[.72rem] font-semibold ${
                      isToday ? 'bg-accent text-white' : dayPosts.length ? 'text-cream' : 'text-muted'
                    }`}>{cell.day}</span>
                    <span className="flex items-center gap-1">
                      {plats.map(pl => <span key={pl} className="w-1.5 h-1.5 rounded-full" style={{ background: PLATFORM_COLORS[pl] || '#888' }} />)}
                      {dayPosts.length > 0 && (
                        <span className="min-w-[16px] h-4 px-1 rounded-full bg-accent/15 text-accent text-[.58rem] font-bold flex items-center justify-center">{dayPosts.length}</span>
                      )}
                    </span>
                  </div>
                  <div className="space-y-1">
                    {dayPosts.slice(0, 3).map(p => (
                      <div
                        key={p.id}
                        className="rounded-md px-1.5 py-1 text-[.6rem] leading-tight truncate border-l-2"
                        style={{
                          background: p.status === 'published' ? 'rgba(62,207,142,.1)' : 'var(--accent-glow)',
                          borderColor: p.status === 'published' ? 'var(--green,#3ecf8e)' : 'var(--accent)',
                        }}
                        title={`${p.time} · ${p.title}`}
                      >
                        <span className="font-mono text-cream/90">{p.time.replace(':00', '')}</span> <span className="text-cream/75">{p.title}</span>
                      </div>
                    ))}
                    {dayPosts.length > 3 && <div className="text-[.56rem] text-muted pl-1">+{dayPosts.length - 3} more</div>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ───────── WEEK VIEW ───────── */}
      {view === 'week' && (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          {weekDays.map((d, i) => {
            const dateStr = ymd(d);
            const dayPosts = postsByDay[dateStr] || [];
            const isToday = dateStr === todayStr;
            return (
              <div
                key={i}
                className={`rounded-2xl border bg-card/50 min-h-[340px] flex flex-col transition-colors ${isToday ? 'border-accent/60' : 'border-border'}`}
              >
                <div className={`px-3 py-2.5 rounded-t-2xl border-b ${isToday ? 'bg-accent/10 border-accent/30' : 'border-border'}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-[.62rem] uppercase tracking-[1.5px] text-muted font-semibold">{WEEKDAYS[d.getDay()]}</span>
                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-[.82rem] font-bold ${isToday ? 'bg-accent text-white' : 'text-cream'}`}>{d.getDate()}</span>
                  </div>
                </div>
                <div className="p-2.5 space-y-2 flex-1 overflow-y-auto">
                  {dayPosts.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-[.66rem] text-muted/70 py-8">No posts</div>
                  ) : (
                    dayPosts.map(p => (
                      <div key={p.id} className="rounded-xl border border-border bg-surface/40 overflow-hidden">
                        {p.driveFileId && (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img src={`/api/drive-thumbnail?fileId=${p.driveFileId}`} alt="" className="w-full h-20 object-cover" />
                        )}
                        <div className="p-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-mono text-[.66rem] text-accent font-semibold">{p.time}</span>
                            <span className={`text-[.52rem] font-semibold capitalize ${p.status === 'published' ? 'text-[var(--green,#3ecf8e)]' : 'text-accent'}`}>{p.status}</span>
                          </div>
                          <div className="text-[.68rem] text-cream/90 leading-tight line-clamp-2 mb-1.5">{p.title}</div>
                          <div className="flex items-center gap-1 flex-wrap">
                            {p.platforms.map(pl => (
                              <span key={pl} className="text-[.5rem] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: `${PLATFORM_COLORS[pl]}22`, color: PLATFORM_COLORS[pl] }}>{pl}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {loading && <p className="text-center text-muted text-sm">Loading…</p>}
      {!loading && daysWithContent === 0 && (
        <p className="text-center text-muted text-sm py-4">No content {view === 'month' ? `in ${MONTH_NAMES[anchor.getMonth()]}` : 'this week'}. Head to <span className="text-accent">Schedule</span> to plan posts.</p>
      )}

      {/* Day detail drawer (month view) */}
      {selectedDay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-sm" onClick={() => setSelectedDay(null)}>
          <div className="rounded-2xl border border-border bg-card p-6 w-full max-w-md animate-fade-in-scale" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-heading text-[1.15rem]">{new Date(selectedDay + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
              <button onClick={() => setSelectedDay(null)} className="p-1 text-muted hover:text-cream">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            {selectedPosts.length === 0 ? (
              <p className="text-muted text-sm py-6 text-center">No content this day — a good slot to schedule something.</p>
            ) : (
              <div className="space-y-2">
                {selectedPosts.map(p => (
                  <div key={p.id} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-surface/40">
                    {p.driveFileId && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={`/api/drive-thumbnail?fileId=${p.driveFileId}`} alt="" className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[.82rem] font-semibold text-cream truncate">{p.title}</div>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="font-mono text-[.66rem] text-muted">{p.time}</span>
                        {p.platforms.map(pl => (
                          <span key={pl} className="text-[.58rem] font-bold uppercase px-1.5 py-0.5 rounded-full" style={{ background: `${PLATFORM_COLORS[pl]}22`, color: PLATFORM_COLORS[pl] }}>{pl}</span>
                        ))}
                      </div>
                    </div>
                    <span className={`text-[.6rem] font-semibold capitalize ${p.status === 'published' ? 'text-[var(--green,#3ecf8e)]' : 'text-accent'}`}>{p.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
