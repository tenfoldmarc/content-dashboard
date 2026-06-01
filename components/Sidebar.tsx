'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import { useTheme } from './ThemeProvider';
import { createClient } from '@/lib/supabase/client';
import { BRAND } from '@/lib/config';

interface BadgeCounts {
  tasks: number;
  email: number;
}

const NAV_SECTIONS = [
  {
    label: 'MAIN',
    items: [
      {
        href: '/',
        label: 'Overview',
        badgeKey: null as keyof BadgeCounts | null,
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-[18px] h-[18px]">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="3" y1="9" x2="21" y2="9" />
            <line x1="9" y1="21" x2="9" y2="9" />
          </svg>
        ),
      },
      {
        href: '/financials',
        label: 'Revenue',
        badgeKey: null as keyof BadgeCounts | null,
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-[18px] h-[18px]">
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'CONTENT',
    items: [
      {
        href: '/content',
        label: 'Performance',
        badgeKey: null as keyof BadgeCounts | null,
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-[18px] h-[18px]">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
        ),
      },
      {
        href: '/hooks',
        label: 'Hooks',
        badgeKey: null as keyof BadgeCounts | null,
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-[18px] h-[18px]">
            <path d="M15.5 5.5C15.5 7.43 13.93 9 12 9S8.5 7.43 8.5 5.5 10.07 2 12 2s3.5 1.57 3.5 3.5z" />
            <path d="M8.5 5.5C8.5 5.5 4 8 4 13c0 3.5 2.5 6 5 7" />
            <path d="M15.5 5.5C15.5 5.5 20 8 20 13c0 3.5-2.5 6-5 7" />
            <path d="M12 9v13" />
          </svg>
        ),
      },
      {
        href: '/competitors',
        label: 'Competitors',
        badgeKey: null as keyof BadgeCounts | null,
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-[18px] h-[18px]">
            <circle cx="9" cy="7" r="3" />
            <circle cx="17" cy="9" r="2.5" />
            <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
            <path d="M15.5 14.5c2.6.5 4.5 2.8 4.5 5.5" />
          </svg>
        ),
      },
    ],
  },
  {
    label: 'PUBLISHING',
    items: [
      {
        href: '/schedule',
        label: 'Schedule',
        badgeKey: null as keyof BadgeCounts | null,
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-[18px] h-[18px]">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        ),
      },
      {
        href: '/calendar',
        label: 'Content Calendar',
        badgeKey: null as keyof BadgeCounts | null,
        icon: (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-[18px] h-[18px]">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        ),
      },
    ],
  },
];

// Map href paths to page_access slugs
const HREF_TO_SLUG: Record<string, string> = {
  '/': 'overview',
  '/financials': 'financials',
  '/content': 'content',
  '/hooks': 'hooks',
  '/competitors': 'competitors',
  '/schedule': 'schedule',
  '/calendar': 'calendar',
};

interface SidebarProps {
  role?: 'admin' | 'member';
  pageAccess?: string[];
  userName?: string;
  userEmail?: string;
}

export default function Sidebar({ role = 'admin', pageAccess = [], userName = '', userEmail = '' }: SidebarProps) {
  const pathname = usePathname();
  const { theme, toggleTheme } = useTheme();
  const [badges, setBadges] = useState<BadgeCounts>({ tasks: 0, email: 0 });

  const fetchBadges = useCallback(async () => {
    try {
      const res = await fetch('/api/badges');
      if (res.ok) {
        const data = await res.json();
        setBadges(data);
      }
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    if (pathname === '/login') return;
    fetchBadges();
    const interval = setInterval(fetchBadges, 60000);
    return () => clearInterval(interval);
  }, [fetchBadges, pathname]);

  if (pathname === '/login') return null;

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  return (
    <nav
      className="sidebar fixed left-0 top-0 bottom-0 w-[250px] flex flex-col z-50 border-r transition-colors duration-300"
      style={{
        background: 'var(--sidebar-bg)',
        borderColor: 'var(--sidebar-border)',
      }}
    >
      {/* Brand */}
      <div className="px-5 pt-5 pb-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={theme === 'dark' ? '/logo-dark.png' : '/logo-light.png'}
          alt={BRAND.name}
          className="h-9 w-auto"
        />
      </div>

      {/* Nav sections */}
      <div className="flex-1 overflow-y-auto px-3 space-y-6">
        {NAV_SECTIONS.map((section) => {
          const visibleItems = role === 'admin'
            ? section.items
            : section.items.filter((item) => {
                const slug = HREF_TO_SLUG[item.href] || item.href.replace('/', '');
                return pageAccess.includes(slug);
              });
          if (visibleItems.length === 0) return null;
          return (
          <div key={section.label}>
            <div
              className="px-3 mb-2 text-[10px] font-semibold tracking-[1.5px] uppercase"
              style={{ color: 'var(--text-muted)' }}
            >
              {section.label}
            </div>
            <div className="flex flex-col gap-0.5">
              {visibleItems.map((item) => {
                const isActive =
                  pathname === item.href ||
                  (item.href !== '/' && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`relative flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-all duration-200 group ${
                      isActive
                        ? 'text-[var(--accent)]'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                    style={{
                      background: isActive
                        ? 'var(--accent-glow)'
                        : undefined,
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive)
                        e.currentTarget.style.background = 'var(--card-hover)';
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) e.currentTarget.style.background = '';
                    }}
                  >
                    {isActive && (
                      <span
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r-sm animate-slide-in-left"
                        style={{
                          background: 'var(--accent)',
                          boxShadow: '0 0 8px var(--accent-glow)',
                        }}
                      />
                    )}
                    <span className={isActive ? 'text-[var(--accent)]' : 'text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]'}>
                      {item.icon}
                    </span>
                    {item.label}
                    {item.badgeKey && badges[item.badgeKey] > 0 && (
                      <span className="ml-auto min-w-[18px] h-[18px] rounded-full bg-red text-white text-[10px] font-bold flex items-center justify-center px-1.5">
                        {badges[item.badgeKey]}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-3 pb-4 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center gap-3 px-3 py-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0"
            style={{ background: 'var(--accent)' }}
          >
            {(userName || userEmail || '?').split(' ').map(w => w[0]?.toUpperCase()).join('').slice(0, 2) || '?'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
              {userName || userEmail?.split('@')[0] || 'User'}
            </div>
            <div className="text-[11px] capitalize" style={{ color: 'var(--text-muted)' }}>
              {role === 'admin' ? 'Admin' : 'Member'}
            </div>
          </div>
          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors duration-200 flex-shrink-0"
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
            }}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? (
              <svg className="w-[14px] h-[14px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--amber)' }}>
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg className="w-[14px] h-[14px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--text-muted)' }}>
                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
              </svg>
            )}
          </button>
        </div>
        <button
          onClick={handleLogout}
          className="w-full text-left px-3 py-1.5 text-[11px] rounded-md transition-colors duration-200"
          style={{ color: 'var(--text-muted)' }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = 'var(--red)';
            e.currentTarget.style.background = 'var(--card-hover)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = 'var(--text-muted)';
            e.currentTarget.style.background = '';
          }}
        >
          Sign out
        </button>
      </div>
    </nav>
  );
}
