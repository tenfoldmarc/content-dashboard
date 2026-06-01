'use client';

import { useEffect, useState, useCallback, useRef } from 'react';

interface PipelineItem {
  id: string;
  title: string;
  column: string;
  notes: string | null;
  created_at: string;
}

const COLUMNS = [
  { key: 'Recorded', color: 'var(--amber)' },
  { key: 'With Editor', color: 'var(--blue)' },
  { key: 'Needs Review', color: 'var(--red)' },
  { key: 'Scheduled', color: 'var(--accent)' },
  { key: 'Posted', color: 'var(--violet)' },
] as const;

export default function PipelineKanban() {
  const [items, setItems] = useState<PipelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState('');
  const [openNotes, setOpenNotes] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch('/api/pipeline');
      const data = await res.json();
      setItems(data.items || []);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  useEffect(() => {
    if (addingTo && inputRef.current) {
      inputRef.current.focus();
    }
  }, [addingTo]);

  function columnItems(col: string) {
    return items.filter((i) => i.column === col);
  }

  async function addItem(column: string) {
    if (!newTitle.trim()) {
      setAddingTo(null);
      return;
    }
    const title = newTitle.trim();
    setNewTitle('');
    setAddingTo(null);

    // Optimistic
    const tempId = 'temp-' + Date.now();
    const tempItem: PipelineItem = {
      id: tempId,
      title,
      column,
      notes: null,
      created_at: new Date().toISOString(),
    };
    setItems((prev) => [...prev, tempItem]);

    try {
      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, column }),
      });
      const data = await res.json();
      if (data.item) {
        setItems((prev) => prev.map((i) => (i.id === tempId ? data.item : i)));
      }
    } catch {
      setItems((prev) => prev.filter((i) => i.id !== tempId));
    }
  }

  async function deleteItem(id: string) {
    setItems((prev) => prev.filter((i) => i.id !== id));
    try {
      await fetch(`/api/pipeline/${id}`, { method: 'DELETE' });
    } catch {
      fetchItems();
    }
  }

  async function moveItem(id: string, newColumn: string) {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, column: newColumn } : i))
    );
    try {
      await fetch(`/api/pipeline/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ column: newColumn }),
      });
    } catch {
      fetchItems();
    }
  }

  async function updateNotes(id: string, notes: string) {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, notes } : i))
    );
    try {
      await fetch(`/api/pipeline/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
    } catch {
      fetchItems();
    }
  }

  function handleDragStart(e: React.DragEvent, id: string) {
    setDragId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }

  function handleDragEnd() {
    setDragId(null);
    setDragOver(null);
  }

  function handleDragOver(e: React.DragEvent, col: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(col);
  }

  function handleDragLeave(e: React.DragEvent, col: string) {
    // Only clear if leaving the column entirely
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const { clientX, clientY } = e;
    if (
      clientX < rect.left ||
      clientX > rect.right ||
      clientY < rect.top ||
      clientY > rect.bottom
    ) {
      setDragOver((prev) => (prev === col ? null : prev));
    }
  }

  function handleDrop(e: React.DragEvent, col: string) {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain');
    if (id && id !== dragId) {
      // fallback
    }
    const itemId = dragId || id;
    if (itemId) {
      const item = items.find((i) => i.id === itemId);
      if (item && item.column !== col) {
        moveItem(itemId, col);
      }
    }
    setDragId(null);
    setDragOver(null);
  }

  function fmtDate(d: string) {
    return new Date(d).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }

  if (loading) {
    return (
      <div className="grid grid-cols-5 gap-3.5">
        {COLUMNS.map((col) => (
          <div
            key={col.key}
            className="animate-pulse rounded-card border border-border bg-surface h-48"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-5 gap-3.5">
      {COLUMNS.map((col) => {
        const colItems = columnItems(col.key);
        const isOver = dragOver === col.key;

        return (
          <div
            key={col.key}
            className="rounded-card border bg-surface flex flex-col min-h-[200px] transition-all duration-200"
            style={{
              borderColor: isOver ? 'var(--accent)' : 'var(--border)',
              backgroundColor: isOver
                ? 'rgba(34, 197, 94, 0.04)'
                : 'var(--surface)',
            }}
            onDragOver={(e) => handleDragOver(e, col.key)}
            onDragLeave={(e) => handleDragLeave(e, col.key)}
            onDrop={(e) => handleDrop(e, col.key)}
          >
            {/* Column Header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-2.5 border-b border-border">
              <span className="text-[.78rem] font-bold uppercase tracking-wider">
                {col.key}
              </span>
              <span className="text-[.65rem] px-2 py-0.5 rounded-full bg-accent/15 text-accent font-semibold font-mono">
                {colItems.length}
              </span>
            </div>

            {/* Cards */}
            <div className="flex-1 p-2.5 space-y-2">
              {colItems.map((item) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, item.id)}
                  onDragEnd={handleDragEnd}
                  className="group rounded-[10px] bg-card border border-border p-3 cursor-grab active:cursor-grabbing transition-all duration-200 hover:border-border-hover"
                  style={{
                    borderLeftWidth: '3px',
                    borderLeftColor: col.color,
                    opacity: dragId === item.id ? 0.4 : 1,
                  }}
                >
                  <div className="flex items-start justify-between gap-1.5">
                    <p className="text-[.8rem] font-medium leading-snug flex-1">
                      {item.title}
                    </p>
                    <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      {/* Notes toggle */}
                      <button
                        onClick={() =>
                          setOpenNotes(
                            openNotes === item.id ? null : item.id
                          )
                        }
                        className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-surface transition-colors"
                        title="Notes"
                      >
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"
                          />
                        </svg>
                      </button>
                      {/* Delete */}
                      <button
                        onClick={() => deleteItem(item.id)}
                        className="w-6 h-6 flex items-center justify-center rounded-md hover:bg-red/15 text-muted hover:text-red transition-colors"
                        title="Delete"
                      >
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Date + notes indicator */}
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[.65rem] text-muted font-mono">
                      {fmtDate(item.created_at)}
                    </span>
                    {item.notes && openNotes !== item.id && (
                      <span className="w-1.5 h-1.5 rounded-full bg-accent/60" title="Has notes" />
                    )}
                  </div>

                  {/* Notes textarea */}
                  {openNotes === item.id && (
                    <textarea
                      className="mt-2 w-full text-[.72rem] p-2 rounded-md border border-border bg-surface resize-none outline-none focus:border-accent transition-colors"
                      style={{ color: 'var(--text-primary)' }}
                      rows={3}
                      placeholder="Add notes..."
                      defaultValue={item.notes || ''}
                      onBlur={(e) => updateNotes(item.id, e.target.value)}
                    />
                  )}
                </div>
              ))}

              {/* Add card inline input */}
              {addingTo === col.key ? (
                <div className="rounded-[10px] border border-accent bg-card p-2.5">
                  <input
                    ref={inputRef}
                    type="text"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') addItem(col.key);
                      if (e.key === 'Escape') {
                        setAddingTo(null);
                        setNewTitle('');
                      }
                    }}
                    onBlur={() => addItem(col.key)}
                    placeholder="Card title..."
                    className="w-full text-[.8rem] bg-transparent outline-none px-1 py-1"
                    style={{ color: 'var(--text-primary)' }}
                  />
                </div>
              ) : (
                <button
                  onClick={() => {
                    setAddingTo(col.key);
                    setNewTitle('');
                  }}
                  className="w-full py-2 text-[.72rem] text-muted hover:text-accent rounded-[10px] border border-dashed border-border hover:border-accent transition-all flex items-center justify-center gap-1.5"
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  Add card
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
