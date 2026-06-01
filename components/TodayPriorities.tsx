'use client';

import { useEffect, useState, useCallback } from 'react';

interface Task {
  id: string;
  text: string;
  quadrant: string;
  due: string;
  recurring: string;
  completed_at: string | null;
}

export default function TodayPriorities() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks');
      const data = await res.json();
      // Show urgent+important tasks as today's priorities
      setTasks((data.tasks || []).filter((t: Task) => t.quadrant === 'ui').slice(0, 5));
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  async function completeTask(id: string) {
    await fetch(`/api/tasks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed_at: new Date().toISOString() }),
    });
    fetchTasks();
  }

  return (
    <div className="rounded-card border border-border bg-card/70 backdrop-blur-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-heading text-[1.2rem] tracking-[1px]">TODAY&apos;S PRIORITIES</h2>
        <span className="text-[.65rem] font-mono text-muted">
          {tasks.length} task{tasks.length !== 1 ? 's' : ''}
        </span>
      </div>
      {loading && <p className="text-sm text-muted py-4">Loading...</p>}
      {!loading && tasks.length === 0 && (
        <p className="text-sm text-muted py-4">No urgent tasks right now.</p>
      )}
      <div className="space-y-1.5">
        {tasks.map(task => (
          <div key={task.id} className="flex items-center gap-2.5 py-2 px-1 group">
            <input
              type="checkbox"
              className="w-4 h-4 accent-accent cursor-pointer flex-shrink-0"
              onChange={() => completeTask(task.id)}
            />
            <span className="text-[.82rem] flex-1">{task.text}</span>
            {task.recurring && <span className="text-[.65rem] text-muted">↻</span>}
            {task.due && <span className="text-[.65rem] text-muted">{task.due}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
