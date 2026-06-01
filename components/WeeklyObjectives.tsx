'use client';

import { useEffect, useState, useCallback } from 'react';

interface Objective {
  id: string;
  title: string;
  target: number;
  current: number;
  week_start: string;
}

function getWeekStart(): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff)).toISOString().split('T')[0];
}

function getDayOfWeek(): number {
  const day = new Date().getDay();
  // Monday = 1, Sunday = 7
  return day === 0 ? 7 : day;
}

function getProgressColor(pct: number): string {
  if (pct >= 60) return 'var(--accent)';
  if (pct >= 30) return 'var(--amber)';
  return 'var(--red)';
}

function getPace(current: number, target: number, dayOfWeek: number): { label: string; classes: string } {
  if (target === 0) return { label: 'No target', classes: 'bg-[rgba(107,114,128,.1)] text-muted' };
  const progressRatio = current / target;
  const timeRatio = dayOfWeek / 7;
  const paceRatio = timeRatio > 0 ? progressRatio / timeRatio : progressRatio > 0 ? 1 : 0;

  if (paceRatio >= 0.9) return { label: 'On pace', classes: 'bg-[rgba(34,197,94,.1)] text-accent' };
  if (paceRatio >= 0.7) return { label: 'Behind', classes: 'bg-[rgba(245,158,11,.1)] text-amber' };
  return { label: 'At risk', classes: 'bg-[rgba(239,68,68,.1)] text-red' };
}

export default function WeeklyObjectives({ compact = false }: { compact?: boolean }) {
  const [objectives, setObjectives] = useState<Objective[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTarget, setNewTarget] = useState('');

  const weekStart = getWeekStart();
  const dayOfWeek = getDayOfWeek();

  const fetchObjectives = useCallback(async () => {
    try {
      const res = await fetch(`/api/objectives?week_start=${weekStart}`);
      const data = await res.json();
      setObjectives(data.objectives || []);
    } catch {}
    setLoading(false);
  }, [weekStart]);

  useEffect(() => { fetchObjectives(); }, [fetchObjectives]);

  async function addObjective() {
    if (!newTitle.trim() || !newTarget.trim()) return;
    await fetch('/api/objectives', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newTitle, target: Number(newTarget), current: 0, week_start: weekStart }),
    });
    setNewTitle('');
    setNewTarget('');
    setAdding(false);
    fetchObjectives();
  }

  async function updateCurrent(id: string, current: number) {
    setObjectives(prev => prev.map(o => o.id === id ? { ...o, current } : o));
    await fetch(`/api/objectives/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ current }),
    });
  }

  async function deleteObjective(id: string) {
    await fetch(`/api/objectives/${id}`, { method: 'DELETE' });
    fetchObjectives();
  }

  // ── Compact mode (Overview page) ──
  if (compact) {
    return (
      <div className="rounded-card border border-border bg-card/70 backdrop-blur-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-heading text-[1.2rem] tracking-[1px]">WEEKLY OBJECTIVES</h2>
          <span className="text-[.65rem] font-mono text-muted">Day {dayOfWeek} of 7</span>
        </div>
        {loading && <p className="text-sm text-muted py-4">Loading...</p>}
        {!loading && objectives.length === 0 && (
          <p className="text-sm text-muted py-4">No objectives set this week.</p>
        )}
        <div className="space-y-3.5">
          {objectives.map(obj => {
            const pct = obj.target > 0 ? Math.min(100, Math.round((obj.current / obj.target) * 100)) : 0;
            const pace = getPace(obj.current, obj.target, dayOfWeek);
            return (
              <div key={obj.id}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[.82rem] font-semibold">{obj.title}</span>
                  <span className={`text-[.6rem] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${pace.classes}`}>
                    {pace.label}
                  </span>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="flex-1 h-[6px] rounded-full bg-surface overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: getProgressColor(pct) }}
                    />
                  </div>
                  <span className="text-[.68rem] font-mono text-muted min-w-[55px] text-right">
                    {obj.current}/{obj.target}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ── Full mode (Tasks page) ──
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h2 className="font-heading text-[1.5rem] tracking-[1px]">Weekly Objectives</h2>
          <span className="text-[.7rem] font-mono text-muted px-2.5 py-1 rounded-full bg-surface">
            Day {dayOfWeek} of 7
          </span>
        </div>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="text-[.78rem] font-semibold text-accent hover:text-accent-hover transition-colors"
          >
            + Add Objective
          </button>
        )}
      </div>

      {loading && <p className="text-sm text-muted py-4">Loading objectives...</p>}

      <div className="grid grid-cols-3 gap-4">
        {objectives.map(obj => {
          const pct = obj.target > 0 ? Math.min(100, Math.round((obj.current / obj.target) * 100)) : 0;
          const pace = getPace(obj.current, obj.target, dayOfWeek);
          return (
            <div key={obj.id} className="rounded-card border border-border bg-card/70 backdrop-blur-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[.88rem] font-semibold">{obj.title}</span>
                <button
                  onClick={() => deleteObjective(obj.id)}
                  className="text-muted hover:text-red text-sm transition-colors"
                  title="Delete objective"
                >
                  ×
                </button>
              </div>

              <div className="mb-2">
                <div className="h-[8px] rounded-full bg-surface overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${pct}%`, backgroundColor: getProgressColor(pct) }}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between mb-3">
                <span className="text-[.72rem] font-mono text-muted">
                  {obj.current} / {obj.target}
                </span>
                <span className={`text-[.6rem] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${pace.classes}`}>
                  {pace.label}
                </span>
              </div>

              <input
                type="range"
                min={0}
                max={obj.target}
                value={obj.current}
                onChange={e => updateCurrent(obj.id, Number(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-accent bg-surface"
              />
            </div>
          );
        })}

        {/* Add Objective inline form */}
        {adding && (
          <div className="rounded-card border border-accent/40 bg-card/70 backdrop-blur-sm p-5">
            <input
              autoFocus
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="Objective title"
              className="w-full mb-2.5 px-3 py-2 rounded-lg border border-border bg-surface text-cream text-[.82rem] outline-none focus:border-accent"
            />
            <input
              type="number"
              value={newTarget}
              onChange={e => setNewTarget(e.target.value)}
              placeholder="Target value"
              className="w-full mb-3 px-3 py-2 rounded-lg border border-border bg-surface text-cream text-[.82rem] outline-none focus:border-accent"
              onKeyDown={e => {
                if (e.key === 'Enter') addObjective();
                if (e.key === 'Escape') { setAdding(false); setNewTitle(''); setNewTarget(''); }
              }}
            />
            <div className="flex gap-2">
              <button
                onClick={addObjective}
                className="flex-1 py-1.5 rounded-lg bg-accent/20 text-accent text-[.78rem] font-semibold hover:bg-accent/30 transition-colors"
              >
                Add
              </button>
              <button
                onClick={() => { setAdding(false); setNewTitle(''); setNewTarget(''); }}
                className="flex-1 py-1.5 rounded-lg bg-surface text-muted text-[.78rem] font-semibold hover:text-cream transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {!loading && objectives.length === 0 && !adding && (
        <p className="text-sm text-muted text-center py-6">No objectives this week. Click &quot;+ Add Objective&quot; to set your weekly targets.</p>
      )}
    </div>
  );
}
