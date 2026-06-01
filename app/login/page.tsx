'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { BRAND } from '@/lib/config';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    window.location.href = '/';
  }

  return (
    <div
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ background: '#0a0a0f' }}
    >
      <div className="w-full max-w-[380px] px-6">
        {/* Logo */}
        <div className="flex flex-col items-center mb-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-dark.png" alt={BRAND.name} className="h-12 w-auto mb-5" />
          <p
            className="mt-2 text-sm"
            style={{ color: 'var(--text-muted)' }}
          >
            Sign in to your dashboard
          </p>
        </div>

        {/* Card */}
        <div
          className="rounded-2xl p-6"
          style={{
            background: 'var(--card)',
            border: '1px solid var(--border)',
          }}
        >
          <form onSubmit={handleLogin} className="space-y-3">
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all duration-200"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent)';
                e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-glow)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all duration-200"
              style={{
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
              }}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent)';
                e.currentTarget.style.boxShadow = '0 0 0 3px var(--accent-glow)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.boxShadow = 'none';
              }}
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-white transition-all duration-200 disabled:opacity-50"
              style={{
                background: 'var(--accent)',
                boxShadow: '0 4px 16px rgba(99, 91, 255, 0.3)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'var(--accent-hover)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'var(--accent)';
              }}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          {error && (
            <p
              className="mt-4 text-center text-sm rounded-lg px-3 py-2"
              style={{
                color: 'var(--red)',
                background: 'rgba(239, 68, 68, 0.1)',
              }}
            >
              {error}
            </p>
          )}
        </div>

        <p
          className="mt-6 text-center text-xs"
          style={{ color: 'var(--text-muted)' }}
        >
          Invite-only access. Contact your admin for credentials.
        </p>
      </div>
    </div>
  );
}
