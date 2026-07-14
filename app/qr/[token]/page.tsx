'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase/singleton';

export default function QRRedirectPage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const { token } = params;

  useEffect(() => {
    async function redirect() {
      const supabase = getSupabase();
      const { data } = await supabase
        .from('chemicals')
        .select('id')
        .eq('qr_token', token)
        .maybeSingle();

      if (data) {
        router.replace(`/chemicals/${data.id}`);
      } else {
        router.replace(`/chemicals/not-found?token=${encodeURIComponent(token)}`);
      }
    }
    redirect();
  }, [token, router]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Đang tra cứu hóa chất...</p>
      </div>
    </div>
  );
}
