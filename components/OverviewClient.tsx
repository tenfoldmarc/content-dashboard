'use client';

import { useEffect, useState, useCallback } from 'react';

interface Notification {
  id: string;
  message: string;
  read: boolean;
  created_at: string;
}

export default function OverviewClient() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifs, setShowNotifs] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 60000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  async function markRead(id: string) {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    } catch {}
  }

  async function handleRefresh() {
    setRefreshing(true);
    try {
      // Dispatch a custom event that OverviewDataClient listens for
      window.dispatchEvent(new CustomEvent('overview-refresh'));
      await fetchNotifications();
    } finally {
      // Give OverviewDataClient time to finish its fetches
      setTimeout(() => setRefreshing(false), 1500);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {/* Refresh */}
      <button
        onClick={handleRefresh}
        disabled={refreshing}
        className="p-2.5 rounded-full border border-border text-muted hover:text-cream hover:border-accent transition-all disabled:opacity-50"
      >
        <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>

      {/* Notification bell */}
      <div className="relative">
        <button
          onClick={() => setShowNotifs(!showNotifs)}
          className="p-2.5 rounded-full border border-border text-muted hover:text-cream hover:border-accent transition-all relative"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-[9px] bg-red text-white text-[.6rem] font-bold flex items-center justify-center px-[5px]">
              {unreadCount}
            </span>
          )}
        </button>

        {showNotifs && (
          <div className="absolute right-0 top-full mt-2 w-80 max-h-96 overflow-y-auto rounded-card border border-border bg-card shadow-2xl z-50 animate-fade-in-scale">
            <div className="p-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <span className="text-[.82rem] font-semibold">Notifications</span>
            </div>
            {notifications.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted">No notifications</div>
            ) : (
              notifications.slice(0, 10).map((n) => (
                <div
                  key={n.id}
                  onClick={() => !n.read && markRead(n.id)}
                  className={`p-3 border-b cursor-pointer hover:bg-surface transition-colors ${
                    !n.read ? 'bg-accent/5' : ''
                  }`}
                  style={{ borderColor: 'var(--border)' }}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && <span className="w-2 h-2 rounded-full bg-accent mt-1.5 flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-[.78rem] leading-relaxed">{n.message}</p>
                      <p className="text-[.65rem] text-muted mt-0.5">
                        {new Date(n.created_at).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
