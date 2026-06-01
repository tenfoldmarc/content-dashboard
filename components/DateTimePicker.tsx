'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

const PLATFORM_COLORS: Record<string, string> = {
  instagram: '#E4405F',
  tiktok: '#00f2ea',
  youtube: '#FF0000',
  facebook: '#1877F2',
};

interface CalPost {
  id: string;
  title: string;
  date: string;
  time: string;
  hour: number;
  minute: number;
  platforms: string[];
  status: string;
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface Props {
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  onApply: (date: string, time: string) => void;
  onClose: () => void;
}

// Split-panel scheduling calendar. Left: month grid showing how many posts are
// already scheduled each day (count badge) and which platforms (colored dots).
// Right: what's already on the selected day + the time picker for this post.
export default function DateTimePicker({ date, time, onApply, onClose }: Props) {
  const initial = date ? new Date(date + 'T00:00:00') : new Date();
  const [year, setYear] = useState(initial.getFullYear());
  const [month, setMonth] = useState(initial.getMonth());
  const [selDate, setSelDate] = useState(date || ymd(new Date()));
  const [selTime, setSelTime] = useState(time || '12:00');
  const [posts, setPosts] = useState<CalPost[]>([]);

  const todayStr = ymd(new Date());

  const fetchMonth = useCallback(async () => {
    try {
      const m = `${year}-${String(month + 1).padStart(2, '0')}`;
      const res = await fetch(`/api/content-calendar?month=${m}`);
      const data = await res.json();
      setPosts(data.posts || []);
    } catch {
      setPosts([]);
    }
  }, [year, month]);

  useEffect(() => { fetchMonth(); }, [fetchMonth]);

  const postsByDay = useMemo(() => {
    const map: Record<string, CalPost[]> = {};
    for (const p of posts) (map[p.date] ||= []).push(p);
    return map;
  }, [posts]);

  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function prev() { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }
  function next() { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }

  const selectedPosts = postsByDay[selDate] || [];

  function dayPlatforms(dayPosts: CalPost[]): string[] {
    const set = new Set<string>();
    for (const p of dayPosts) for (const pl of p.platforms) set.add(pl);
    return Array.from(set);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 backdrop-blur-sm" onClick={onClose}>
      <div
        className="rounded-2xl border border-border bg-card w-[720px] max-w-[94vw] max-h-[92vh] overflow-hidden animate-fade-in-scale flex flex-col sm:flex-row"
        onClick={e => e.stopPropagation()}
      >
        {/* Calendar */}
        <div className="flex-1 p-5">
          <div className="flex items-center justify-between mb-4">
            <button onClick={prev} className="p-2 rounded-lg border border-border text-muted hover:text-cream hover:border-accent transition-all" aria-label="Previous month">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <span className="font-heading text-[1.05rem] tracking-[.5px]">{MONTH_NAMES[month]} {year}</span>
            <button onClick={next} className="p-2 rounded-lg border border-border text-muted hover:text-cream hover:border-accent transition-all" aria-label="Next month">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>

          <div className="grid grid-cols-7 mb-1.5">
            {WEEKDAYS.map(d => <div key={d} className="text-center text-[.6rem] text-muted font-semibold py-1">{d}</div>)}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (d === null) return <div key={i} />;
              const dateStr = ymd(new Date(year, month, d));
              const dayPosts = postsByDay[dateStr] || [];
              const isSel = dateStr === selDate;
              const isToday = dateStr === todayStr;
              const isPast = dateStr < todayStr;
              const plats = dayPlatforms(dayPosts).slice(0, 4);
              return (
                <button
                  key={i}
                  onClick={() => setSelDate(dateStr)}
                  disabled={isPast}
                  className={`relative h-12 rounded-xl text-[.78rem] font-medium transition-all flex flex-col items-center justify-center gap-0.5 ${
                    isSel ? 'bg-accent text-white shadow-[0_4px_14px_var(--accent-glow)]'
                    : isPast ? 'text-muted/35 cursor-not-allowed'
                    : 'text-cream hover:bg-card-hover'
                  }`}
                  style={isToday && !isSel ? { boxShadow: 'inset 0 0 0 1.5px var(--accent)' } : undefined}
                >
                  <span>{d}</span>
                  {/* count badge */}
                  {dayPosts.length > 0 && (
                    <span
                      className={`absolute top-0.5 right-0.5 min-w-[15px] h-[15px] px-1 rounded-full text-[.55rem] font-bold flex items-center justify-center ${
                        isSel ? 'bg-white/25 text-white' : 'bg-accent text-white'
                      }`}
                    >
                      {dayPosts.length}
                    </span>
                  )}
                  {/* platform dots */}
                  {plats.length > 0 && (
                    <span className="flex gap-0.5">
                      {plats.map(pl => (
                        <span key={pl} className="w-1.5 h-1.5 rounded-full" style={{ background: PLATFORM_COLORS[pl] || '#888', outline: isSel ? '1px solid rgba(255,255,255,.5)' : 'none' }} />
                      ))}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-3 mt-4 text-[.6rem] text-muted flex-wrap">
            {Object.entries(PLATFORM_COLORS).map(([k, c]) => (
              <span key={k} className="flex items-center gap-1 capitalize"><span className="w-2 h-2 rounded-full" style={{ background: c }} />{k}</span>
            ))}
          </div>
        </div>

        {/* Side panel: selected day */}
        <div className="w-full sm:w-[260px] border-t sm:border-t-0 sm:border-l border-border bg-surface/30 p-5 flex flex-col">
          <div className="text-[.7rem] uppercase tracking-wider text-muted">Selected day</div>
          <div className="font-heading text-[1.05rem] tracking-[.5px] mb-3">
            {new Date(selDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </div>

          <div className="text-[.66rem] uppercase tracking-wider text-muted mb-2">Already scheduled</div>
          <div className="flex-1 min-h-[80px] max-h-[220px] overflow-y-auto space-y-1.5 mb-4">
            {selectedPosts.length === 0 ? (
              <div className="text-[.74rem] text-muted py-3 rounded-lg border border-dashed border-border/70 text-center">
                Open day — nothing scheduled yet.
              </div>
            ) : (
              selectedPosts.map(p => (
                <div key={p.id} className="rounded-lg border border-border bg-card/60 px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[.68rem] text-cream">{p.time}</span>
                    <span className={`text-[.55rem] font-semibold capitalize ${p.status === 'published' ? 'text-[var(--green,#3ecf8e)]' : 'text-accent'}`}>{p.status}</span>
                  </div>
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    {p.platforms.map(pl => (
                      <span key={pl} className="text-[.5rem] font-bold uppercase px-1.5 py-0.5 rounded" style={{ background: `${PLATFORM_COLORS[pl]}22`, color: PLATFORM_COLORS[pl] }}>{pl}</span>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          <label className="text-[.66rem] uppercase tracking-wider text-muted mb-1.5 block">Post this one at</label>
          <input
            type="time"
            value={selTime}
            onChange={e => setSelTime(e.target.value)}
            className="w-full rounded-xl px-3 py-2.5 text-[.85rem] bg-card border border-border text-cream outline-none focus:border-accent mb-3"
          />

          <div className="flex gap-2 mt-auto">
            <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-border text-[.78rem] font-medium text-muted hover:text-cream transition-all">Cancel</button>
            <button onClick={() => onApply(selDate, selTime)} className="flex-1 py-2.5 rounded-xl bg-accent text-white text-[.78rem] font-semibold hover:bg-[var(--accent-hover)] transition-all">Apply</button>
          </div>
        </div>
      </div>
    </div>
  );
}
