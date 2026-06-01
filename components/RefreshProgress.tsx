'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { BRAND } from '@/lib/config';

interface JobState {
  id: string;
  status: 'running' | 'complete' | 'failed';
  phase: string | null;
  message: string | null;
  completed_steps: number;
  total_steps: number;
  started_at: string;
  completed_at: string | null;
  error: string | null;
}

const STORAGE_KEY = 'dashboard:active-refresh-job';
const POLL_INTERVAL_MS = 3000;

interface RefreshProgressProps {
  onComplete?: () => void;
}

export default function RefreshProgress({ onComplete }: RefreshProgressProps) {
  const [job, setJob] = useState<JobState | null>(null);
  const [visible, setVisible] = useState(false);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const notifiedRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const fetchStatus = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/content/refresh-status?id=${id}`, { cache: 'no-store' });
      if (!res.ok) return null;
      const data = await res.json();
      return data.job as JobState | null;
    } catch {
      return null;
    }
  }, []);

  const fireBrowserNotification = useCallback((title: string, body: string) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/favicon.ico' });
    }
  }, []);

  const handleJobUpdate = useCallback((next: JobState) => {
    setJob(next);
    setVisible(true);

    if ((next.status === 'complete' || next.status === 'failed') && !notifiedRef.current) {
      notifiedRef.current = true;
      stopPolling();
      localStorage.removeItem(STORAGE_KEY);

      if (next.status === 'complete') {
        fireBrowserNotification(BRAND.name, 'Content data refreshed');
        onComplete?.();
      } else {
        fireBrowserNotification(BRAND.name, `Refresh failed: ${next.error ?? 'unknown'}`);
      }

      // Auto-hide after 6s on success, keep visible on failure
      if (next.status === 'complete') {
        setTimeout(() => setVisible(false), 6000);
      }
    }
  }, [stopPolling, fireBrowserNotification, onComplete]);

  const startPolling = useCallback((jobId: string) => {
    stopPolling();
    notifiedRef.current = false;

    // Immediate fetch
    fetchStatus(jobId).then((j) => { if (j) handleJobUpdate(j); });

    pollRef.current = setInterval(async () => {
      const j = await fetchStatus(jobId);
      if (!j) return;
      handleJobUpdate(j);
    }, POLL_INTERVAL_MS);
  }, [fetchStatus, handleJobUpdate, stopPolling]);

  // On mount: resume any in-flight job from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) startPolling(saved);

    // Listen for new jobs kicked off elsewhere
    const onJobStart = (e: Event) => {
      const detail = (e as CustomEvent<{ jobId: string }>).detail;
      if (detail?.jobId) {
        localStorage.setItem(STORAGE_KEY, detail.jobId);
        startPolling(detail.jobId);
      }
    };
    window.addEventListener('dashboard:refresh-started', onJobStart);

    return () => {
      stopPolling();
      window.removeEventListener('dashboard:refresh-started', onJobStart);
    };
  }, [startPolling, stopPolling]);

  if (!visible || !job) return null;

  const pct = job.total_steps > 0
    ? Math.round((job.completed_steps / job.total_steps) * 100)
    : 0;
  const elapsed = Math.round((Date.now() - new Date(job.started_at).getTime()) / 1000);
  const elapsedStr = elapsed < 60 ? `${elapsed}s` : `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;
  const isDone = job.status === 'complete';
  const isFailed = job.status === 'failed';

  return (
    <div className="refresh-strip" data-status={job.status}>
      <div className="refresh-strip-inner">
        <div className="refresh-strip-icon">
          {isDone ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          ) : isFailed ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          ) : (
            <svg className="spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 11-3-6.7L21 8"/><path d="M21 3v5h-5"/></svg>
          )}
        </div>
        <div className="refresh-strip-text">
          <div className="refresh-strip-title">
            {isDone ? 'Refresh complete' : isFailed ? 'Refresh failed' : (job.message ?? 'Refreshing…')}
          </div>
          <div className="refresh-strip-meta">
            {isFailed
              ? job.error ?? 'Unknown error'
              : `Step ${Math.min(job.completed_steps + (isDone ? 0 : 1), job.total_steps)} of ${job.total_steps} · ${elapsedStr}`}
          </div>
        </div>
        <div className="refresh-strip-bar">
          <div className="refresh-strip-bar-fill" style={{ width: `${isDone ? 100 : Math.max(pct, 8)}%` }} />
        </div>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="refresh-strip-close"
          aria-label="Dismiss"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
    </div>
  );
}

export async function startRefresh(): Promise<{ jobId: string; reused: boolean } | null> {
  // Request browser notification permission on first refresh click
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => {});
  }
  try {
    const res = await fetch('/api/content/refresh-now', { method: 'POST' });
    const data = await res.json();
    if (!res.ok || !data.jobId) return null;
    window.dispatchEvent(new CustomEvent('dashboard:refresh-started', { detail: { jobId: data.jobId } }));
    return { jobId: data.jobId, reused: !!data.reused };
  } catch {
    return null;
  }
}
