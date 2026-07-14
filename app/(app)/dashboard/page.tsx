'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Beaker,
  AlertTriangle,
  PackageX,
  TrendingDown,
  ArrowRight,
  Clock,
  FlaskRound,
  Droplets,
  Users,
  History,
  BarChart3,
  Trophy,
  CalendarClock,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { getExpiryInfo, formatDate, formatNumber, formatDateTime } from '@/lib/expiry';
import type { Chemical, Lot, StockMovement, PreparedSolution, PreparedSolutionUsage } from '@/lib/types';
import { ExpiryBadge } from '@/components/chemicals/expiry-badge';

interface ChemicalWithStock extends Chemical {
  total_stock?: number;
}

interface DashboardStats {
  totalChemicals: number;
  expiringSoon: number;
  lowStock: number;
  outOfStock: number;
  expiredSolutions: number;
}

interface TopChemical {
  name: string;
  code: string;
  total_used: number;
  unit: string;
  count: number;
}

interface TopSolution {
  name: string;
  batch_code: string;
  total_used: number;
  unit: string;
}

interface UserFrequency {
  user_name: string;
  count: number;
}

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
];

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalChemicals: 0,
    expiringSoon: 0,
    lowStock: 0,
    outOfStock: 0,
    expiredSolutions: 0,
  });
  const [expiryLots, setExpiryLots] = useState<Lot[]>([]);
  const [chemicalNames, setChemicalNames] = useState<Record<string, string>>({});
  const [lowStockList, setLowStockList] = useState<ChemicalWithStock[]>([]);
  const [topChemicals, setTopChemicals] = useState<TopChemical[]>([]);
  const [topSolutions, setTopSolutions] = useState<TopSolution[]>([]);
  const [expiredSolutions, setExpiredSolutions] = useState<PreparedSolution[]>([]);
  const [userFrequency, setUserFrequency] = useState<UserFrequency[]>([]);
  const [recentUsage, setRecentUsage] = useState<StockMovement[]>([]);
  const [monthlyTrend, setMonthlyTrend] = useState<{ month: string; total: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      const supabase = getSupabase();

      const [{ data: chemicals }, { data: lots }, { data: movements }, { data: prepSols }, { data: prepUsages }] = await Promise.all([
        supabase.from('chemicals').select('*'),
        supabase.from('lots').select('*').eq('status', 'active'),
        supabase.from('stock_movements').select('*').eq('movement_type', 'out').order('created_at', { ascending: false }).limit(100),
        supabase.from('prepared_solutions').select('*'),
        supabase.from('prepared_solution_usages').select('*').order('used_at', { ascending: false }).limit(50),
      ]);

      const chemList = (chemicals || []) as Chemical[];
      const lotList = (lots || []) as Lot[];
      const moveList = (movements || []) as StockMovement[];
      const solList = (prepSols || []) as PreparedSolution[];
      const usageList = (prepUsages || []) as PreparedSolutionUsage[];

      const nameMap: Record<string, string> = {};
      chemList.forEach((c) => { nameMap[c.id] = c.name; });
      setChemicalNames(nameMap);

      // Stock calculations
      const totalStockByChem: Record<string, number> = {};
      lotList.forEach((l) => {
        totalStockByChem[l.chemical_id] = (totalStockByChem[l.chemical_id] || 0) + l.quantity;
      });

      let expiringSoon = 0;
      const sortedByExpiry = [...lotList]
        .filter((l) => l.expiry_date)
        .sort((a, b) => new Date(a.expiry_date!).getTime() - new Date(b.expiry_date!).getTime());

      sortedByExpiry.forEach((l) => {
        const info = getExpiryInfo(l.expiry_date);
        if (info.daysLeft !== null && info.daysLeft <= 30 && info.daysLeft >= 0) {
          expiringSoon++;
        }
      });
      setExpiryLots(sortedByExpiry.slice(0, 6));

      let lowStock = 0;
      let outOfStock = 0;
      const lowStockItems: ChemicalWithStock[] = [];
      chemList.forEach((c) => {
        const stock = totalStockByChem[c.id] || 0;
        if (stock <= 0) {
          outOfStock++;
          lowStockItems.push({ ...c, total_stock: stock });
        } else if (stock <= c.min_stock) {
          lowStock++;
          lowStockItems.push({ ...c, total_stock: stock });
        }
      });
      lowStockItems.sort((a, b) => (a.total_stock || 0) - (b.total_stock || 0));
      setLowStockList(lowStockItems.slice(0, 10));

      // Expired solutions
      const now = new Date();
      const expiredSols = solList.filter((s) => s.expiry_date && new Date(s.expiry_date) < now);
      setExpiredSolutions(expiredSols);

      // Top 10 chemicals by usage
      const chemUsageMap: Record<string, TopChemical> = {};
      moveList.forEach((m) => {
        const chemId = m.chemical_id || '';
        const chem = chemList.find((c) => c.id === chemId);
        const key = chemId || 'unknown';
        if (!chemUsageMap[key]) {
          chemUsageMap[key] = {
            name: chem?.name || '—',
            code: chem?.code || '—',
            total_used: 0,
            unit: m.unit || '',
            count: 0,
          };
        }
        chemUsageMap[key].total_used += Math.abs(m.quantity);
        chemUsageMap[key].count += 1;
      });
      setTopChemicals(Object.values(chemUsageMap).sort((a, b) => b.total_used - a.total_used).slice(0, 10));

      // Top 10 prepared solutions by usage
      const solUsageMap: Record<string, TopSolution> = {};
      usageList.forEach((u) => {
        const sol = solList.find((s) => s.id === u.prepared_solution_id);
        const key = u.prepared_solution_id;
        if (!solUsageMap[key]) {
          solUsageMap[key] = {
            name: sol?.solution_name || '—',
            batch_code: sol?.batch_code || '—',
            total_used: 0,
            unit: u.unit || '',
          };
        }
        solUsageMap[key].total_used += u.quantity_used;
      });
      setTopSolutions(Object.values(solUsageMap).sort((a, b) => b.total_used - a.total_used).slice(0, 10));

      // User frequency
      const userMap: Record<string, number> = {};
      moveList.forEach((m) => {
        const name = m.user_name || '—';
        userMap[name] = (userMap[name] || 0) + 1;
      });
      setUserFrequency(Object.entries(userMap).map(([user_name, count]) => ({ user_name, count })).sort((a, b) => b.count - a.count).slice(0, 10));

      // Recent usage
      setRecentUsage(moveList.slice(0, 8));

      // Monthly trend (last 6 months)
      const monthMap: Record<string, number> = {};
      const monthLabels: string[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date();
        d.setMonth(d.getMonth() - i);
        const key = d.toLocaleDateString('vi-VN', { month: 'short', year: 'numeric' });
        monthLabels.push(key);
        monthMap[key] = 0;
      }
      moveList.forEach((m) => {
        const d = new Date(m.created_at);
        const key = d.toLocaleDateString('vi-VN', { month: 'short', year: 'numeric' });
        if (key in monthMap) {
          monthMap[key] += Math.abs(m.quantity);
        }
      });
      setMonthlyTrend(monthLabels.map((month) => ({ month, total: monthMap[month] })));

      setStats({
        totalChemicals: chemList.length,
        expiringSoon,
        lowStock,
        outOfStock,
        expiredSolutions: expiredSols.length,
      });
      setLoading(false);
    }
    loadData();
  }, []);

  const trendChartConfig = useMemo(() => ({
    total: { label: 'Lượng sử dụng', color: 'hsl(217, 91%, 60%)' },
  }), []);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const statCards = [
    { label: 'Tổng số hóa chất', value: stats.totalChemicals, icon: Beaker, color: 'text-primary', bg: 'bg-primary/10', href: '/chemicals' },
    { label: 'Sắp hết hạn (30 ngày)', value: stats.expiringSoon, icon: Clock, color: 'text-warning', bg: 'bg-warning/10', href: '/chemicals' },
    { label: 'Tồn kho thấp', value: stats.lowStock, icon: TrendingDown, color: 'text-orange-600', bg: 'bg-orange-50', href: '/chemicals' },
    { label: 'Hết hàng', value: stats.outOfStock, icon: PackageX, color: 'text-destructive', bg: 'bg-destructive/10', href: '/chemicals' },
    { label: 'Dung dịch hết hạn', value: stats.expiredSolutions, icon: Droplets, color: 'text-red-600', bg: 'bg-red-50', href: '/prepared-solutions' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tổng quan</h1>
        <p className="mt-1 text-sm text-muted-foreground">Thống kê kho hóa chất, cảnh báo và xu hướng sử dụng</p>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <Link key={card.label} href={card.href}>
              <Card className="transition-all hover:shadow-md">
                <CardContent className="flex items-center justify-between p-5">
                  <div>
                    <p className="text-sm text-muted-foreground">{card.label}</p>
                    <p className="mt-1 text-3xl font-bold">{card.value}</p>
                  </div>
                  <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${card.bg}`}>
                    <Icon className={`h-6 w-6 ${card.color}`} />
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* Monthly trend chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <BarChart3 className="h-5 w-5 text-primary" />
            Xu hướng sử dụng theo tháng
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ChartContainer config={trendChartConfig} className="h-[300px] w-full">
            <BarChart data={monthlyTrend}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" fontSize={12} />
              <YAxis fontSize={12} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="total" fill="hsl(217, 91%, 60%)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      {/* Top 10 chemicals & solutions */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Trophy className="h-5 w-5 text-amber-600" />
              Top 10 hóa chất sử dụng nhiều nhất
            </CardTitle>
            <Link href="/usage-stats">
              <Button variant="ghost" size="sm" className="gap-1 text-xs">Xem tất cả <ArrowRight className="h-3 w-3" /></Button>
            </Link>
          </CardHeader>
          <CardContent>
            {topChemicals.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Chưa có dữ liệu</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Hóa chất</TableHead>
                    <TableHead className="text-right">Số lần</TableHead>
                    <TableHead className="text-right">Tổng dùng</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topChemicals.map((c, i) => (
                    <TableRow key={c.code}>
                      <TableCell>
                        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${i < 3 ? 'bg-amber-100 text-amber-700' : 'bg-muted text-muted-foreground'}`}>
                          {i + 1}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">{c.name}</span>
                          <span className="text-xs text-muted-foreground font-mono">{c.code}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{c.count}</TableCell>
                      <TableCell className="text-right font-semibold text-primary">{formatNumber(c.total_used)} {c.unit}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Trophy className="h-5 w-5 text-emerald-600" />
              Top 10 dung dịch pha chế dùng nhiều nhất
            </CardTitle>
            <Link href="/prepared-solutions">
              <Button variant="ghost" size="sm" className="gap-1 text-xs">Xem tất cả <ArrowRight className="h-3 w-3" /></Button>
            </Link>
          </CardHeader>
          <CardContent>
            {topSolutions.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Chưa có dữ liệu</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Dung dịch</TableHead>
                    <TableHead>Mã lô</TableHead>
                    <TableHead className="text-right">Tổng dùng</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topSolutions.map((s, i) => (
                    <TableRow key={s.batch_code}>
                      <TableCell>
                        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${i < 3 ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}>
                          {i + 1}
                        </span>
                      </TableCell>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{s.batch_code}</TableCell>
                      <TableCell className="text-right font-semibold text-emerald-600">{formatNumber(s.total_used)} {s.unit}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* User frequency & recent usage */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5 text-primary" />
              Tần suất sử dụng theo người dùng
            </CardTitle>
          </CardHeader>
          <CardContent>
            {userFrequency.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Chưa có dữ liệu</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Người dùng</TableHead>
                    <TableHead className="text-right">Số lần sử dụng</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {userFrequency.map((u) => (
                    <TableRow key={u.user_name}>
                      <TableCell className="font-medium">{u.user_name}</TableCell>
                      <TableCell className="text-right font-semibold">{u.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <History className="h-5 w-5 text-primary" />
              Lịch sử sử dụng gần nhất
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentUsage.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Chưa có giao dịch nào</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hóa chất</TableHead>
                    <TableHead className="text-right">Số lượng</TableHead>
                    <TableHead>Người dùng</TableHead>
                    <TableHead>Thời gian</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentUsage.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell className="font-medium">{chemicalNames[m.chemical_id || ''] || '—'}</TableCell>
                      <TableCell className="text-right font-semibold text-destructive">{formatNumber(Math.abs(m.quantity))} {m.unit}</TableCell>
                      <TableCell className="text-sm">{m.user_name || '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDateTime(m.created_at)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Expiry & low stock */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <CalendarClock className="h-5 w-5 text-orange-600" />
              Hóa chất sắp hết hạn
            </CardTitle>
            <Link href="/chemicals">
              <Button variant="ghost" size="sm" className="gap-1 text-xs">Xem tất cả <ArrowRight className="h-3 w-3" /></Button>
            </Link>
          </CardHeader>
          <CardContent>
            {expiryLots.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Không có lô nào sắp hết hạn</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hóa chất</TableHead>
                    <TableHead>Lô</TableHead>
                    <TableHead>Hạn sử dụng</TableHead>
                    <TableHead className="text-right">Còn lại</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expiryLots.map((lot) => (
                    <TableRow key={lot.id}>
                      <TableCell className="font-medium">{chemicalNames[lot.chemical_id] || '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{lot.lot_number}</TableCell>
                      <TableCell>{formatDate(lot.expiry_date)}</TableCell>
                      <TableCell className="text-right"><ExpiryBadge expiryDate={lot.expiry_date} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <TrendingDown className="h-5 w-5 text-orange-600" />
              Hóa chất sắp hết (tồn kho thấp)
            </CardTitle>
            <Link href="/chemicals">
              <Button variant="ghost" size="sm" className="gap-1 text-xs">Xem tất cả <ArrowRight className="h-3 w-3" /></Button>
            </Link>
          </CardHeader>
          <CardContent>
            {lowStockList.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Tất cả hóa chất đều đủ tồn kho</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Hóa chất</TableHead>
                    <TableHead>Mã</TableHead>
                    <TableHead className="text-right">Tồn kho</TableHead>
                    <TableHead className="text-right">Tối thiểu</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lowStockList.map((chem) => (
                    <TableRow key={chem.id}>
                      <TableCell className="font-medium">{chem.name}</TableCell>
                      <TableCell><Badge variant="outline" className="font-mono text-xs">{chem.code}</Badge></TableCell>
                      <TableCell className="text-right">
                        <span className={chem.total_stock === 0 ? 'text-destructive font-bold' : 'text-orange-600 font-bold'}>
                          {formatNumber(chem.total_stock || 0)} {chem.unit}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatNumber(chem.min_stock)} {chem.unit}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Expired solutions */}
      {expiredSolutions.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              Dung dịch đã hết hạn ({expiredSolutions.length})
            </CardTitle>
            <Link href="/prepared-solutions">
              <Button variant="ghost" size="sm" className="gap-1 text-xs">Xem tất cả <ArrowRight className="h-3 w-3" /></Button>
            </Link>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tên dung dịch</TableHead>
                  <TableHead>Mã lô</TableHead>
                  <TableHead>Ngày hết hạn</TableHead>
                  <TableHead className="text-right">Còn lại</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {expiredSolutions.slice(0, 5).map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.solution_name}</TableCell>
                    <TableCell className="font-mono text-xs">{s.batch_code}</TableCell>
                    <TableCell className="text-red-600 font-medium">{formatDate(s.expiry_date)}</TableCell>
                    <TableCell className="text-right">{formatNumber(s.remaining_volume)} {s.unit}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
