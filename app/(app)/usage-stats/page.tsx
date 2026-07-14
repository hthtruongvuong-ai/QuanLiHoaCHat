'use client';

import { useEffect, useState, useMemo } from 'react';
import { TrendingDown, Package, Beaker, BarChart3, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { getSupabase } from '@/lib/supabase/singleton';
import { formatNumber, formatDateTime } from '@/lib/expiry';
import type { Chemical, StockMovement, UsageSlipItem, PreparationItem } from '@/lib/types';

interface UsageRecord {
  id: string;
  chemical_name: string;
  chemical_code: string;
  quantity: number;
  unit: string;
  date: string;
  source: string;
  user: string;
}

interface ChemicalUsageStat {
  chemical_id: string;
  name: string;
  code: string;
  unit: string;
  total_used: number;
  usage_count: number;
}

type TimeRange = '7d' | '30d' | '90d' | 'all';

export default function UsageStatsPage() {
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [records, setRecords] = useState<UsageRecord[]>([]);
  const [chemStats, setChemStats] = useState<ChemicalUsageStat[]>([]);
  const [chartData, setChartData] = useState<{ date: string; total: number }[]>([]);

  useEffect(() => {
    async function loadData() {
      const supabase = getSupabase();
      const [{ data: movements }, { data: slipItems }, { data: prepItems }, { data: chemicals }] = await Promise.all([
        supabase.from('stock_movements').select('*').eq('movement_type', 'out').order('created_at', { ascending: false }),
        supabase.from('usage_slip_items').select('*'),
        supabase.from('preparation_items').select('*'),
        supabase.from('chemicals').select('*'),
      ]);

      const chemMap: Record<string, Chemical> = {};
      (chemicals || []).forEach((c: Chemical) => { chemMap[c.id] = c; });

      const now = new Date();
      const cutoffDate = new Date();
      if (timeRange === '7d') cutoffDate.setDate(now.getDate() - 7);
      else if (timeRange === '30d') cutoffDate.setDate(now.getDate() - 30);
      else if (timeRange === '90d') cutoffDate.setDate(now.getDate() - 90);
      else cutoffDate.setFullYear(2000);

      // Build usage records from stock movements
      const usageRecords: UsageRecord[] = [];
      (movements || []).forEach((m: StockMovement) => {
        const moveDate = new Date(m.created_at);
        if (moveDate < cutoffDate) return;
        const chem = m.chemical_id ? chemMap[m.chemical_id] : null;
        usageRecords.push({
          id: m.id,
          chemical_name: chem?.name || m.notes || '—',
          chemical_code: chem?.code || '—',
          quantity: Math.abs(m.quantity),
          unit: m.unit,
          date: m.created_at,
          source: m.reference.startsWith('US-') ? 'Phiếu sử dụng' : m.reference.startsWith('PREP-') ? 'Pha chế' : 'Xuất kho',
          user: m.user_name || '—',
        });
      });

      // Sort by date desc
      usageRecords.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setRecords(usageRecords);

      // Aggregate by chemical
      const statsMap: Record<string, ChemicalUsageStat> = {};
      usageRecords.forEach((r) => {
        const key = r.chemical_code;
        if (!statsMap[key]) {
          statsMap[key] = {
            chemical_id: '',
            name: r.chemical_name,
            code: r.chemical_code,
            unit: r.unit,
            total_used: 0,
            usage_count: 0,
          };
        }
        statsMap[key].total_used += r.quantity;
        statsMap[key].usage_count += 1;
      });

      const statsArray = Object.values(statsMap).sort((a, b) => b.total_used - a.total_used);
      setChemStats(statsArray);

      // Build chart data - usage by day
      const byDate: Record<string, number> = {};
      usageRecords.forEach((r) => {
        const d = new Date(r.date);
        const dateKey = d.toISOString().split('T')[0];
        byDate[dateKey] = (byDate[dateKey] || 0) + r.quantity;
      });

      const chartArr = Object.entries(byDate)
        .map(([date, total]) => ({ date, total }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .slice(-30);
      setChartData(chartArr);

      setLoading(false);
    }
    loadData();
  }, [timeRange]);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const totalUsed = records.reduce((sum, r) => sum + r.quantity, 0);
  const totalChemicals = chemStats.length;
  const totalTransactions = records.length;

  const statCards = [
    {
      label: 'Tổng lượng sử dụng',
      value: formatNumber(totalUsed),
      sub: 'tổng các đơn vị',
      icon: TrendingDown,
      color: 'text-primary',
      bg: 'bg-primary/10',
    },
    {
      label: 'Số hóa chất sử dụng',
      value: String(totalChemicals),
      sub: 'loại hóa chất',
      icon: Beaker,
      color: 'text-emerald-600',
      bg: 'bg-emerald-50',
    },
    {
      label: 'Số lần xuất/sử dụng',
      value: String(totalTransactions),
      sub: 'giao dịch',
      icon: Package,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Thống kê sử dụng hóa chất</h1>
          <p className="mt-1 text-sm text-muted-foreground">Danh sách và thống kê lượng hóa chất sử dụng</p>
        </div>
        <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
          <SelectTrigger className="w-[180px]">
            <Calendar className="mr-2 h-4 w-4" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7d">7 ngày qua</SelectItem>
            <SelectItem value="30d">30 ngày qua</SelectItem>
            <SelectItem value="90d">90 ngày qua</SelectItem>
            <SelectItem value="all">Tất cả</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.label}>
              <CardContent className="flex items-center justify-between p-5">
                <div>
                  <p className="text-sm text-muted-foreground">{card.label}</p>
                  <p className="mt-1 text-2xl font-bold">{card.value}</p>
                  <p className="text-xs text-muted-foreground">{card.sub}</p>
                </div>
                <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${card.bg}`}>
                  <Icon className={`h-5 w-5 ${card.color}`} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {chartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <BarChart3 className="h-5 w-5 text-primary" />
              Biểu đồ sử dụng theo ngày
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer
              config={{ total: { label: 'Lượng sử dụng', color: 'hsl(var(--primary))' } }}
              className="h-[300px] w-full"
            >
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v) => {
                    const d = new Date(v);
                    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
                  }}
                  fontSize={11}
                />
                <YAxis fontSize={11} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="total" fill="var(--color-total)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Thống kê theo hóa chất</CardTitle>
        </CardHeader>
        <CardContent>
          {chemStats.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Chưa có dữ liệu sử dụng</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mã</TableHead>
                    <TableHead>Tên hóa chất</TableHead>
                    <TableHead className="text-right">Số lần sử dụng</TableHead>
                    <TableHead className="text-right">Tổng lượng dùng</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {chemStats.map((s) => (
                    <TableRow key={s.code}>
                      <TableCell><Badge variant="outline" className="font-mono text-xs">{s.code}</Badge></TableCell>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-right">{s.usage_count}</TableCell>
                      <TableCell className="text-right font-semibold text-primary">
                        {formatNumber(s.total_used)} {s.unit}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Chi tiết giao dịch sử dụng</CardTitle>
        </CardHeader>
        <CardContent>
          {records.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Chưa có giao dịch nào</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hóa chất</TableHead>
                    <TableHead className="text-right">Số lượng</TableHead>
                    <TableHead>Nguồn</TableHead>
                    <TableHead>Người thực hiện</TableHead>
                    <TableHead>Thời gian</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.slice(0, 50).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{r.chemical_name}</span>
                          <span className="text-xs text-muted-foreground font-mono">{r.chemical_code}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-destructive">
                        {formatNumber(r.quantity)} {r.unit}
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.source === 'Phiếu sử dụng' ? 'default' : r.source === 'Pha chế' ? 'secondary' : 'outline'}>
                          {r.source}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">{r.user}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDateTime(r.date)}</TableCell>
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
