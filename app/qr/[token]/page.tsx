'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSupabase } from '@/lib/supabase/singleton';
import { SearchX, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function QRRedirectPage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const { token } = params;
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function redirect() {
      const supabase = getSupabase();

      // Try qr_token first
      let { data } = await supabase
        .from('chemicals')
        .select('id')
        .eq('qr_token', token)
        .maybeSingle();

      // Try by UUID id
      if (!data && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
        ({ data } = await supabase
          .from('chemicals')
          .select('id')
          .eq('id', token)
          .maybeSingle());
      }

      // Try by chemical code (e.g. CHM-001)
      if (!data) {
        ({ data } = await supabase
          .from('chemicals')
          .select('id')
          .eq('code', token)
          .maybeSingle());
      }

      if (data) {
        router.replace(`/chemicals/${data.id}`);
      } else {
        setNotFound(true);
      }
    }
    redirect();
  }, [token, router]);

  if (notFound) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
        <Card className="max-w-md text-center">
          <CardContent className="flex flex-col items-center gap-4 p-8">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <SearchX className="h-8 w-8 text-destructive" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Không tìm thấy hóa chất</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Mã QR không hợp lệ hoặc hóa chất đã bị xóa khỏi hệ thống.
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Mã tra cứu: <span className="font-mono">{token}</span>
              </p>
            </div>
            <Link href="/chemicals">
              <Button variant="outline">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Về danh sách hóa chất
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        <p className="text-sm text-muted-foreground">Đang tra cứu hóa chất...</p>
      </div>
    </div>
  );
}
