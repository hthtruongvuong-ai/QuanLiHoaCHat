'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Droplet, Calendar, CalendarClock, User, Tag, FlaskRound, History } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getSupabase } from '@/lib/supabase/singleton';
import { formatDate, formatNumber } from '@/lib/expiry';
import type { PreparedSolution, PreparedSolutionUsage, PreparedSolutionStatus } from '@/lib/types';

const STATUS_CONFIG: Record<PreparedSolutionStatus, { label: string; className: string }> = {
  in_use: { label: 'Đang sử dụng', className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  low_stock: { label: 'Sắp hết', className: 'bg-amber-100 text-amber-700 border-amber-200' },
  depleted: { label: 'Đã dùng hết', className: 'bg-zinc-200 text-zinc-600 border-zinc-300' },
  near_expiry: { label: 'Sắp hết hạn', className: 'bg-orange-100 text-orange-700 border-orange-200' },
  expired: { label: 'Hết hạn', className: 'bg-red-100 text-red-700 border-red-200' },
};

function computeStatus(sol: PreparedSolution): PreparedSolutionStatus {
  const now = new Date();
  const expiry = sol.expiry_date ? new Date(sol.expiry_date) : null;
  if (expiry && expiry < now) return 'expired';
  if (sol.remaining_volume <= 0) return 'depleted';
  if (expiry) {
    const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (daysLeft <= 7) return 'near_expiry';
  }
  if (sol.initial_volume > 0 && sol.remaining_volume / sol.initial_volume < 0.2) return 'low_stock';
  return 'in_use';
}

export default function PreparedSolutionDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();

  const [solution, setSolution] = useState<PreparedSolution | null>(null);
  const [usages, setUsages] = useState<PreparedSolutionUsage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      const supabase = getSupabase();
      const [{ data: sol }, { data: usageData }] = await Promise.all([
        supabase.from('prepared_solutions').select('*').eq('id', id).maybeSingle(),
        supabase.from('prepared_solution_usages').select('*').eq('prepared_solution_id', id).order('used_at', { ascending: false }),
      ]);
      setSolution((sol || null) as PreparedSolution | null);
      setUsages((usageData || []) as PreparedSolutionUsage[]);
      setLoading(false);
    }
    loadData();
  }, [id]);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!solution) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground">Không tìm thấy dung dịch</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/prepared-solutions')}>
          Quay lại danh sách
        </Button>
      </div>
    );
  }

  const status = computeStatus(solution);
  const statusConfig = STATUS_CONFIG[status];
  const usedPercent = solution.initial_volume > 0 ? (solution.used_volume / solution.initial_volume) * 100 : 0;

  const infoItems = [
    { icon: FlaskRound, label: 'Tên dung dịch', value: solution.solution_name },
    { icon: Tag, label: 'Mã lô pha', value: solution.batch_code },
    { icon: Droplet, label: 'Nồng độ', value: solution.concentration || '—' },
    { icon: Droplet, label: 'Thể tích ban đầu', value: `${formatNumber(solution.initial_volume)} ${solution.unit}` },
    { icon: Droplet, label: 'Đã sử dụng', value: `${formatNumber(solution.used_volume)} ${solution.unit}` },
    { icon: Droplet, label: 'Còn lại', value: `${formatNumber(solution.remaining_volume)} ${solution.unit}` },
    { icon: Tag, label: 'Vai trò sử dụng', value: solution.usage_role || '—' },
    { icon: Calendar, label: 'Ngày pha', value: formatDate(solution.prepared_date) },
    { icon: CalendarClock, label: 'Hạn bảo quản', value: `${solution.shelf_life_days} ngày` },
    { icon: CalendarClock, label: 'Ngày hết hạn', value: formatDate(solution.expiry_date) },
    { icon: User, label: 'Người pha', value: solution.prepared_by || '—' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/prepared-solutions"><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{solution.solution_name}</h1>
            <Badge variant="outline" className="font-mono">{solution.batch_code}</Badge>
            <Badge variant="outline" className={statusConfig.className}>
              {statusConfig.label}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {solution.concentration && `${solution.concentration} · `}
            Pha ngày {formatDate(solution.prepared_date)} bởi {solution.prepared_by || '—'}
          </p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Thể tích ban đầu</CardTitle></CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{formatNumber(solution.initial_volume)} <span className="text-lg text-muted-foreground">{solution.unit}</span></p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Đã sử dụng</CardTitle></CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-amber-600">{formatNumber(solution.used_volume)} <span className="text-lg text-muted-foreground">{solution.unit}</span></p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${Math.min(usedPercent, 100)}%` }} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Còn lại</CardTitle></CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-emerald-600">{formatNumber(solution.remaining_volume)} <span className="text-lg text-muted-foreground">{solution.unit}</span></p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Thông tin dung dịch</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {infoItems.map((item, idx) => {
              const Icon = item.icon;
              return (
                <div key={idx} className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                    <p className="mt-0.5 text-sm font-medium">{item.value}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <History className="h-5 w-5" />
            Lịch sử sử dụng ({usages.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {usages.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <History className="h-10 w-10 text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground">Chưa có lịch sử sử dụng</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mã phiếu</TableHead>
                    <TableHead>Người sử dụng</TableHead>
                    <TableHead>Ngày sử dụng</TableHead>
                    <TableHead className="text-right">Số lượng</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usages.map((usage) => (
                    <TableRow key={usage.id} className="group">
                      <TableCell>
                        {usage.usage_slip_id ? (
                          <Link href={`/usage-slips`} className="font-mono text-xs text-primary hover:underline">
                            {usage.slip_number}
                          </Link>
                        ) : (
                          <Badge variant="outline" className="font-mono text-xs">{usage.slip_number}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">{usage.user_name || '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(usage.used_at)}</TableCell>
                      <TableCell className="text-right font-medium">{formatNumber(usage.quantity_used)} {usage.unit}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
