'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Beaker,
  AlertTriangle,
  PackageX,
  TrendingDown,
  ArrowRight,
  Clock,
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
import { getSupabase } from '@/lib/supabase/singleton';
import { getExpiryInfo, formatDate, formatNumber } from '@/lib/expiry';
import type { Chemical, Lot } from '@/lib/types';
import { ExpiryBadge } from '@/components/chemicals/expiry-badge';

interface ChemicalWithStock extends Chemical {
  total_stock?: number;
}

interface DashboardStats {
  totalChemicals: number;
  expiringSoon: number;
  lowStock: number;
  outOfStock: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalChemicals: 0,
    expiringSoon: 0,
    lowStock: 0,
    outOfStock: 0,
  });
  const [expiryLots, setExpiryLots] = useState<Lot[]>([]);
  const [chemicalNames, setChemicalNames] = useState<Record<string, string>>({});
  const [lowStockList, setLowStockList] = useState<ChemicalWithStock[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      const supabase = getSupabase();

      const [{ data: chemicals }, { data: lots }] = await Promise.all([
        supabase.from('chemicals').select('*'),
        supabase.from('lots').select('*').eq('status', 'active'),
      ]);

      const chemList = (chemicals || []) as Chemical[];
      const lotList = (lots || []) as Lot[];

      const nameMap: Record<string, string> = {};
      chemList.forEach((c) => { nameMap[c.id] = c.name; });
      setChemicalNames(nameMap);

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
      setLowStockList(lowStockItems.slice(0, 8));

      setStats({
        totalChemicals: chemList.length,
        expiringSoon,
        lowStock,
        outOfStock,
      });
      setLoading(false);
    }
    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const statCards = [
    {
      label: 'Tổng số hóa chất',
      value: stats.totalChemicals,
      icon: Beaker,
      color: 'text-primary',
      bg: 'bg-primary/10',
      href: '/chemicals',
    },
    {
      label: 'Sắp hết hạn (30 ngày)',
      value: stats.expiringSoon,
      icon: Clock,
      color: 'text-warning',
      bg: 'bg-warning/10',
      href: '/chemicals',
    },
    {
      label: 'Tồn kho thấp',
      value: stats.lowStock,
      icon: TrendingDown,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
      href: '/chemicals',
    },
    {
      label: 'Hết hàng',
      value: stats.outOfStock,
      icon: PackageX,
      color: 'text-destructive',
      bg: 'bg-destructive/10',
      href: '/chemicals',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Tổng quan</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Thống kê kho hóa chất và cảnh báo tồn kho
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Sắp hết hạn</CardTitle>
            <Link href="/chemicals">
              <Button variant="ghost" size="sm" className="gap-1 text-xs">
                Xem tất cả <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {expiryLots.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Không có lô nào sắp hết hạn
              </p>
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
                      <TableCell className="font-medium">
                        {chemicalNames[lot.chemical_id] || '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{lot.lot_number}</TableCell>
                      <TableCell>{formatDate(lot.expiry_date)}</TableCell>
                      <TableCell className="text-right">
                        <ExpiryBadge expiryDate={lot.expiry_date} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-lg">Tồn kho thấp</CardTitle>
            <Link href="/chemicals">
              <Button variant="ghost" size="sm" className="gap-1 text-xs">
                Xem tất cả <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {lowStockList.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Tất cả hóa chất đều đủ tồn kho
              </p>
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
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">
                          {chem.code}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={chem.total_stock === 0 ? 'text-destructive font-bold' : 'text-orange-600 font-bold'}>
                          {formatNumber(chem.total_stock || 0)} {chem.unit}
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {formatNumber(chem.min_stock)} {chem.unit}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
