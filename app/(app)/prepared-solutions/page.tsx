'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { Search, FlaskRound, AlertTriangle, CalendarClock, CheckCircle2, Droplet, Trash2, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth-context';
import { getSupabase } from '@/lib/supabase/singleton';
import { formatDate, formatNumber } from '@/lib/expiry';
import { canDeletePreparedSolution } from '@/lib/roles';
import type { PreparedSolution, PreparedSolutionStatus } from '@/lib/types';

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

export default function PreparedSolutionsPage() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const canDelete = profile ? canDeletePreparedSolution(profile.role) : false;

  const [solutions, setSolutions] = useState<PreparedSolution[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<PreparedSolution | null>(null);
  const [deleting, setDeleting] = useState(false);

  const refresh = useCallback(async () => {
    const supabase = getSupabase();
    const { data } = await supabase
      .from('prepared_solutions')
      .select('*')
      .order('created_at', { ascending: false });
    setSolutions((data || []) as PreparedSolution[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Auto-sync DB status to 'depleted' when remaining_volume <= 0
  useEffect(() => {
    async function syncDepleted() {
      const toDeplete = solutions.filter(
        (s) => s.remaining_volume <= 0 && s.status !== 'depleted'
      );
      if (toDeplete.length === 0) return;
      const supabase = getSupabase();
      for (const sol of toDeplete) {
        await supabase
          .from('prepared_solutions')
          .update({ status: 'depleted', updated_at: new Date().toISOString() })
          .eq('id', sol.id);
      }
      if (toDeplete.length > 0) {
        await refresh();
      }
    }
    syncDepleted();
  }, [solutions, refresh]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return solutions.filter(
      (s) =>
        s.solution_name.toLowerCase().includes(q) ||
        s.batch_code.toLowerCase().includes(q) ||
        s.concentration?.toLowerCase().includes(q) ||
        s.prepared_by?.toLowerCase().includes(q)
    );
  }, [solutions, search]);

  const stats = useMemo(() => {
    let inUse = 0, lowStock = 0, depleted = 0, nearExpiry = 0, expired = 0;
    solutions.forEach((s) => {
      const st = computeStatus(s);
      if (st === 'in_use') inUse++;
      else if (st === 'low_stock') lowStock++;
      else if (st === 'depleted') depleted++;
      else if (st === 'near_expiry') nearExpiry++;
      else if (st === 'expired') expired++;
    });
    return { inUse, lowStock, depleted, nearExpiry, expired };
  }, [solutions]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const supabase = getSupabase();
    try {
      // Delete related usages first
      await supabase.from('prepared_solution_usages').delete().eq('prepared_solution_id', deleteTarget.id);
      const { error } = await supabase.from('prepared_solutions').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      toast({ title: 'Đã xóa dung dịch đã pha', description: deleteTarget.batch_code });
      setDeleteTarget(null);
      await refresh();
    } catch (err) {
      toast({ title: 'Lỗi xóa', description: err instanceof Error ? err.message : 'Đã có lỗi', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Hóa chất đã pha</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {solutions.length} dung dịch đã pha chế
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-50">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.inUse}</p>
              <p className="text-xs text-muted-foreground">Đang sử dụng</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-50">
              <Droplet className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.lowStock}</p>
              <p className="text-xs text-muted-foreground">Sắp hết</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100">
              <FlaskRound className="h-5 w-5 text-zinc-500" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.depleted}</p>
              <p className="text-xs text-muted-foreground">Đã dùng hết</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-50">
              <CalendarClock className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.nearExpiry}</p>
              <p className="text-xs text-muted-foreground">Sắp hết hạn</p>
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-50">
              <AlertTriangle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.expired}</p>
              <p className="text-xs text-muted-foreground">Hết hạn</p>
            </div>
          </div>
        </Card>
      </div>

      {(stats.nearExpiry > 0 || stats.expired > 0 || stats.lowStock > 0) && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="text-sm">
            <p className="font-medium text-amber-900">Cảnh báo</p>
            <p className="mt-1 text-amber-700">
              {stats.expired > 0 && `${stats.expired} dung dịch đã hết hạn. `}
              {stats.nearExpiry > 0 && `${stats.nearExpiry} dung dịch sắp hết hạn (dưới 7 ngày). `}
              {stats.lowStock > 0 && `${stats.lowStock} dung dịch sắp hết (còn dưới 20%).`}
              {' '}Các dung dịch hết hạn hoặc đã dùng hết không thể chọn trong phiếu sử dụng.
            </p>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="p-4">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Tìm theo tên, mã lô, nồng độ, người pha..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã lô pha</TableHead>
                  <TableHead>Tên dung dịch</TableHead>
                  <TableHead>Nồng độ</TableHead>
                  <TableHead className="text-right">Thể tích ban đầu</TableHead>
                  <TableHead className="text-right">Đã sử dụng</TableHead>
                  <TableHead className="text-right">Còn lại</TableHead>
                  <TableHead>Ngày pha</TableHead>
                  <TableHead>Ngày hết hạn</TableHead>
                  <TableHead>Vai trò</TableHead>
                  <TableHead>Người pha</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  {canDelete && <TableHead className="w-[60px] text-right">Thao tác</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canDelete ? 12 : 11} className="h-24 text-center text-muted-foreground">
                      Chưa có dung dịch đã pha nào
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((sol) => {
                    const status = computeStatus(sol);
                    const config = STATUS_CONFIG[status];
                    const canDeleteThis = canDelete && (status === 'depleted' || status === 'expired');
                    return (
                      <TableRow key={sol.id} className="group">
                        <TableCell>
                          <Link href={`/prepared-solutions/${sol.id}`} className="font-mono text-xs text-primary hover:underline">
                            {sol.batch_code}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link href={`/prepared-solutions/${sol.id}`} className="font-medium hover:underline">
                            {sol.solution_name}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">{sol.concentration || '—'}</TableCell>
                        <TableCell className="text-right">{formatNumber(sol.initial_volume)} {sol.unit}</TableCell>
                        <TableCell className="text-right text-amber-600">{formatNumber(sol.used_volume)} {sol.unit}</TableCell>
                        <TableCell className="text-right font-semibold">{formatNumber(sol.remaining_volume)} {sol.unit}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDate(sol.prepared_date)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatDate(sol.expiry_date)}</TableCell>
                        <TableCell className="text-sm">{sol.usage_role || '—'}</TableCell>
                        <TableCell className="text-sm">{sol.prepared_by || '—'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={config.className}>
                            {config.label}
                          </Badge>
                        </TableCell>
                        {canDelete && (
                          <TableCell>
                            <div className="flex items-center justify-end opacity-60 transition-opacity group-hover:opacity-100">
                              {canDeleteThis ? (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                  onClick={() => setDeleteTarget(sol)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground" title="Chỉ xóa khi đã dùng hết hoặc hết hạn">
                                  —
                                </span>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa dung dịch đã pha?</AlertDialogTitle>
            <AlertDialogDescription>
              Hành động này sẽ xóa dung dịch "{deleteTarget?.batch_code} — {deleteTarget?.solution_name}".
              Lịch sử sử dụng liên quan cũng sẽ bị xóa. Không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
