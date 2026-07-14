'use client';

import Link from 'next/link';
import { SearchX, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

export default function ChemicalNotFound() {
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
