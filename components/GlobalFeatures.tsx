'use client';

import { useState, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import CommandPalette from './CommandPalette';
import QuickActionsFab from './QuickActionsFab';

export default function GlobalFeatures() {
  const [cmdkOpen, setCmdkOpen] = useState(false);
  const pathname = usePathname();

  const openCmdK = useCallback(() => setCmdkOpen(true), []);
  const closeCmdK = useCallback(() => setCmdkOpen(false), []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Cmd+K / Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCmdkOpen((o) => !o);
        return;
      }

      // Number shortcuts (only when palette is NOT open and no input focused)
      if (cmdkOpen) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const NAV_MAP: Record<string, string> = {
        '0': '/',
        '1': '/financials',
        '2': '/content',
        '3': '/hooks',
        '4': '/competitors',
        '5': '/schedule',
        '6': '/calendar',
      };

      if (NAV_MAP[e.key]) {
        e.preventDefault();
        // Use window.location for number shortcuts to avoid needing router in this scope
        const target = NAV_MAP[e.key];
        if (pathname !== target) {
          window.location.href = target;
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [cmdkOpen, pathname]);

  // Hide on login page
  if (pathname === '/login') return null;

  return (
    <>
      <CommandPalette open={cmdkOpen} onClose={closeCmdK} />
      <QuickActionsFab onOpenCmdK={openCmdK} />
    </>
  );
}
