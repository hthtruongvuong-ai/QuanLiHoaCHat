'use client';

import { useEffect, useState, useMemo } from 'react';
import { TrendingDown, Package, Beaker, BarChart3, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
import { getSupabase } from '@/lib/supabase/singleton';
import { formatNumber, formatDateTime } from '@/lib/expiry';
import type { Chemical, StockMovement } from '@/lib/types';

interface UsageRecord {
  id: string;
  chemical_id: string;
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

const CHART_COLORS = [
  'hsl(217, 91%, 60%)',
  'hsl(142, 71%, 45%)',
  'hsl(25, 95%, 53%)',
  'hsl(280, 65%, 60%)',
  'hsl(340, 75%, 55%)',
  'hsl(180, 70%, 45%)',
  'hsl(45, 93%, 47%)',
  'hsl(0, 72%, 51%)',
  'hsl(120, 50%, 50%)',
  'hsl(200, 80%, 50%)',
  'hsl(60, 70%, 50%)',
  'hsl(320, 60%, 55%)',
];

export default function UsageStatsPage() {
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const [records, setRecords] = useState<UsageRecord[]>([]);
  const [chemStats, setChemStats] = useState<ChemicalUsageStat[]>([]);
  const [allChemicals, setAllChemicals] = useState<{ id: string; name: string; code: string }[]>([]);
  const [selectedChem, setSelectedChem] = useState<string>('all');

  useEffect(() => {
    async function loadData() {
      const supabase = getSupabase();
      const [{ data: movements }, { data: chemicals }] = await Promise.all([
        supabase.from('stock_movements').select('*').eq('movement_type', 'out').order('created_at', { ascending: false }),
        supabase.from('chemicals').select('*'),
      ]);

      const chemMap: Record<string, Chemical> = {};
      (chemicals || []).forEach((c: Chemical) => { chemMap[c.id] = c; });
      setAllChemicals((chemicals || []).map((c: Chemical) => ({ id: c.id, name: c.name, code: c.code })));

      const now = new Date();
      const cutoffDate = new Date();
      if (timeRange === '7d') cutoffDate.setDate(now.getDate() - 7);
      else if (timeRange === '30d') cutoffDate.setDate(now.getDate() - 30);
      else if (timeRange === '90d') cutoffDate.setDate(now.getDate() - 90);
      else cutoffDate.setFullYear(2000);

      const usageRecords: UsageRecord[] = [];
      (movements || []).forEach((m: StockMovement) => {
        const moveDate = new Date(m.created_at);
        if (moveDate < cutoffDate) return;
        const chem = m.chemical_id ? chemMap[m.chemical_id] : null;
        usageRecords.push({
          id: m.id,
          chemical_id: m.chemical_id || '',
          chemical_name: chem?.name || m.notes || '—',
          chemical_code: chem?.code || '—',
          quantity: Math.abs(m.quantity),
          unit: m.unit,
          date: m.created_at,
          source: m.reference?.startsWith('US-') ? 'Phiếu sử dụng' : m.reference?.startsWith('PREP-') ? 'Pha chế' : 'Xuất kho',
          user: m.user_name || '—',
        });
      });

      usageRecords.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setRecords(usageRecords);

      const statsMap: Record<string, ChemicalUsageStat> = {};
      usageRecords.forEach((r) => {
        const key = r.chemical_id || r.chemical_code;
        if (!statsMap[key]) {
          statsMap[key] = {
            chemical_id: r.chemical_id,
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
      setLoading(false);
    }
    loadData();
  }, [timeRange]);

  const filteredRecords = useMemo(() => {
    if (selectedChem === 'all') return records;
    return records.filter((r) => r.chemical_id === selectedChem || r.chemical_code === selectedChem);
  }, [records, selectedChem]);

  const filteredStats = useMemo(() => {
    if (selectedChem === 'all') return chemStats;
    return chemStats.filter((s) => s.chemical_id === selectedChem);
  }, [chemStats, selectedChem]);

  const chartData = useMemo(() => {
    const byDateChem: Record<string, Record<string, number>> = {};
    filteredRecords.forEach((r) => {
      const d = new Date(r.date);
      const dateKey = d.toISOString().split('T')[0];
      if (!byDateChem[dateKey]) byDateChem[dateKey] = {};
      const chemKey = r.chemical_name;
      byDateChem[dateKey][chemKey] = (byDateChem[dateKey][chemKey] || 0) + r.quantity;
    });

    return Object.entries(byDateChem)
      .map(([date, chems]) => ({ date, ...chems }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(-30);
  }, [filteredRecords]);

  const chartChemicals = useMemo(() => {
    const set = new Set<string>();
    chartData.forEach((d) => {
      Object.keys(d).forEach((k) => { if (k !== 'date') set.add(k); });
    });
    return Array.from(set);
  }, [chartData]);

  const chartConfig = useMemo(() => {
    const config: Record<string, { label: string; color: string }> = {};
    chartChemicals.forEach((chem, i) => {
      config[chem] = { label: chem, color: CHART_COLORS[i % CHART_COLORS.length] };
    });
    return config;
  }, [chartChemicals]);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const totalUsed = filteredRecords.reduce((sum, r) => sum + r.quantity, 0);
  const totalChemicals = filteredStats.length;
  const totalTransactions = filteredRecords.length;

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
          <p className="mt-1 text-sm text-muted-foreground">Danh sách và thống kê lượng hóa chất sử dụng theo từng loại</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
            <SelectTrigger className="w-[160px]">
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
          <Select value={selectedChem} onValueChange={setSelectedChem}>
            <SelectTrigger className="w-[200px]">
              <Beaker className="mr-2 h-4 w-4" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả hóa chất</SelectItem>
              {allChemicals.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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
              Biểu đồ sử dụng theo ngày (từng hóa chất)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ChartContainer config={chartConfig} className="h-[400px] w-full">
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
                <Legend />
                {chartChemicals.map((chem, i) => (
                  <Bar
                    key={chem}
                    dataKey={chem}
                    fill={CHART_COLORS[i % CHART_COLORS.length]}
                    radius={[4, 4, 0, 0]}
                  />
                ))}
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
          {filteredStats.length === 0 ? (
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
                  {filteredStats.map((s) => (
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
          {filteredRecords.length === 0 ? (
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
                  {filteredRecords.slice(0, 50).map((r) => (
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
