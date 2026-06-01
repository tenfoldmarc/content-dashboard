'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from '@/components/ThemeProvider';

const ACTIONS = [
  { label: 'Content Performance', href: '/content' },
  { label: 'Schedule a Post', href: '/schedule' },
  { label: 'Browse Hooks', href: '/hooks' },
  { label: 'Open Cmd+K', href: null },
];

export default function QuickActionsFab({ onOpenCmdK }: { onOpenCmdK: () => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const router = useRouter();
  const { theme } = useTheme();
  const fabRef = useRef<HTMLDivElement>(null);
  const isLight = theme === 'light';

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (fabRef.current && !fabRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  function handleAction(action: (typeof ACTIONS)[number]) {
    setIsOpen(false);
    if (action.href === null) {
      onOpenCmdK();
    } else {
      router.push(action.href);
    }
  }

  return (
    <div ref={fabRef} style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 500 }}>
      {/* Menu */}
      <div
        className="flex flex-col gap-2 mb-3 items-end"
        style={{
          opacity: isOpen ? 1 : 0,
          transform: isOpen ? 'translateY(0)' : 'translateY(8px)',
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'opacity .2s ease, transform .2s ease',
        }}
      >
        {ACTIONS.map((action, i) => (
          <button
            key={action.label}
            onClick={() => handleAction(action)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-full text-[.78rem] font-medium whitespace-nowrap transition-all duration-200"
            style={{
              background: isLight ? 'rgba(255,255,255,.97)' : 'rgba(30,41,59,.95)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid var(--border)',
              boxShadow: isLight
                ? '0 4px 16px rgba(0,0,0,.08)'
                : '0 8px 24px rgba(0,0,0,.4)',
              color: 'var(--text-secondary)',
              transitionDelay: isOpen ? `${i * 40}ms` : '0ms',
              opacity: isOpen ? 1 : 0,
              transform: isOpen ? 'translateY(0)' : 'translateY(6px)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--accent)';
              e.currentTarget.style.color = 'var(--accent)';
              e.currentTarget.style.transform = 'translateX(-4px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)';
              e.currentTarget.style.color = 'var(--text-secondary)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            {action.label}
          </button>
        ))}
      </div>

      {/* FAB button */}
      <button
        onClick={() => setIsOpen((o) => !o)}
        className="flex items-center justify-center transition-all duration-200"
        style={{
          width: 52,
          height: 52,
          borderRadius: 14,
          background: 'var(--accent)',
          color: '#fff',
          fontSize: '1.4rem',
          border: 'none',
          cursor: 'pointer',
          boxShadow: '0 4px 20px rgba(34,197,94,.4)',
          transform: isOpen ? 'rotate(45deg) scale(1.05)' : 'rotate(0deg)',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = isOpen ? 'rotate(45deg) scale(1.1)' : 'scale(1.05)';
          e.currentTarget.style.boxShadow = '0 8px 28px rgba(34,197,94,.5)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = isOpen ? 'rotate(45deg)' : 'scale(1)';
          e.currentTarget.style.boxShadow = '0 4px 20px rgba(34,197,94,.4)';
        }}
      >
        +
      </button>
    </div>
  );
}
