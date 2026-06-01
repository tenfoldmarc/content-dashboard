'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function usePageAccess() {
  const [allowed, setAllowed] = useState(true);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<'admin' | 'member'>('admin');
  const [pageAccess, setPageAccess] = useState<string[]>([]);
  const [userName, setUserName] = useState<string>('');
  const [userEmail, setUserEmail] = useState<string>('');
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    async function checkAccess() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }

      setUserEmail(user.email || '');

      // Check user_roles table
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role, page_access, display_name')
        .eq('user_id', user.id)
        .single();

      if (!roleData) {
        // No role entry = first user = admin = full access
        setRole('admin');
        setPageAccess([]);
        setUserName(user.user_metadata?.full_name || user.email?.split('@')[0] || '');
        setAllowed(true);
        setLoading(false);
        return;
      }

      setRole(roleData.role);
      setPageAccess(roleData.page_access || []);
      setUserName(roleData.display_name || user.user_metadata?.full_name || user.email?.split('@')[0] || '');

      if (roleData.role === 'admin') {
        setAllowed(true);
        setLoading(false);
        return;
      }

      // Check page access for members
      const pageSlug = pathname.split('/')[1] || 'overview';
      const mappedSlug = pageSlug === '' ? 'overview' : pageSlug;
      const hasAccess = (roleData.page_access || []).includes(mappedSlug);

      if (!hasAccess && pathname !== '/') {
        router.push('/');
      }

      setAllowed(hasAccess || pathname === '/');
      setLoading(false);
    }

    checkAccess();
  }, [pathname, router]);

  return { allowed, loading, role, pageAccess, userName, userEmail };
}
