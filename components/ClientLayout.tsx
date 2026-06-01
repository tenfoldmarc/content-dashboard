'use client';

import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import { usePageAccess } from '@/lib/usePageAccess';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLoginPage = pathname === '/login';
  const { allowed, loading, role, pageAccess, userName, userEmail } = usePageAccess();

  if (isLoginPage) {
    return <>{children}</>;
  }

  return (
    <>
      <Sidebar role={role} pageAccess={pageAccess} userName={userName} userEmail={userEmail} />
      <main className="ml-[250px] min-h-screen p-8 relative z-[1]">
        {!loading && !allowed ? (
          <div className="flex items-center justify-center min-h-[60vh]">
            <div
              className="text-center rounded-card p-10 max-w-md"
              style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: 'rgba(239, 68, 68, 0.1)' }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-6 h-6" style={{ color: 'var(--red)' }}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                </svg>
              </div>
              <h2
                className="font-heading text-lg font-bold mb-2"
                style={{ color: 'var(--text-primary)' }}
              >
                Access Restricted
              </h2>
              <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
                You don&apos;t have permission to view this page. Contact your admin to request access.
              </p>
            </div>
          </div>
        ) : children}
      </main>
    </>
  );
}
