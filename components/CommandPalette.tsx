'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/components/ThemeProvider';

interface Command {
  label: string;
  shortcut: string;
  action: () => void;
}

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const commands: Command[] = [
    { label: 'Go to Overview', shortcut: '0', action: () => { router.push('/'); onClose(); } },
    { label: 'Go to Revenue', shortcut: '1', action: () => { router.push('/financials'); onClose(); } },
    { label: 'Go to Content Performance', shortcut: '2', action: () => { router.push('/content'); onClose(); } },
    { label: 'Go to Hooks', shortcut: '3', action: () => { router.push('/hooks'); onClose(); } },
    { label: 'Go to Competitors', shortcut: '4', action: () => { router.push('/competitors'); onClose(); } },
    { label: 'Go to Schedule', shortcut: '5', action: () => { router.push('/schedule'); onClose(); } },
    { label: 'Go to Calendar', shortcut: '6', action: () => { router.push('/calendar'); onClose(); } },
    { label: 'Toggle Theme', shortcut: 'D', action: () => { toggleTheme(); onClose(); } },
  ];

  const filtered = query
    ? commands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()))
    : commands;

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % filtered.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length);
      } else if (e.key === 'Enter' && filtered.length > 0) {
        e.preventDefault();
        filtered[selectedIndex]?.action();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    },
    [filtered, selectedIndex, onClose]
  );

  if (!open) return null;

  const isLight = theme === 'light';

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: isLight ? 'rgba(248,250,252,.6)' : 'rgba(2,6,23,.6)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 3000,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '18vh',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        style={{
          background: isLight ? '#fff' : 'var(--card)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          width: 480,
          maxHeight: 400,
          overflow: 'hidden',
          boxShadow: isLight
            ? '0 24px 64px rgba(0,0,0,.12)'
            : '0 24px 64px rgba(0,0,0,.6)',
        }}
      >
        {/* Search input */}
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a command..."
          className="w-full p-4 border-none bg-transparent text-[.92rem] outline-none"
          style={{ borderBottom: '1px solid var(--border)' }}
        />

        {/* Results */}
        <div className="py-2 px-2 overflow-y-auto" style={{ maxHeight: 320 }}>
          {filtered.map((cmd, i) => (
            <div
              key={cmd.label}
              onClick={() => cmd.action()}
              onMouseEnter={() => setSelectedIndex(i)}
              className="px-4 py-2.5 rounded-[10px] text-[.82rem] cursor-pointer flex items-center gap-2.5 transition-all"
              style={{
                color:
                  i === selectedIndex
                    ? 'var(--text-primary)'
                    : 'var(--text-muted)',
                background:
                  i === selectedIndex ? 'rgba(34,197,94,.08)' : 'transparent',
              }}
            >
              <span className="flex-1">{cmd.label}</span>
              <span
                className="text-[.62rem] font-mono px-2 py-0.5 rounded"
                style={{
                  color: 'var(--text-muted)',
                  background: 'var(--surface)',
                }}
              >
                {cmd.shortcut}
              </span>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-[.82rem]" style={{ color: 'var(--text-muted)' }}>
              No results
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
