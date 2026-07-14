'use client';

import { useEffect, useState, useMemo } from 'react';
import { Download, Printer, FileText, PackagePlus, PackageMinus, Beaker } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
import { ExpiryBadge } from '@/components/chemicals/expiry-badge';
import { getSupabase } from '@/lib/supabase/singleton';
import { formatDate, formatNumber, formatDateTime } from '@/lib/expiry';
import type { Chemical, Lot, StockMovement, StorageLocation } from '@/lib/types';

type ReportType = 'inventory' | 'expiry' | 'movements';

export default function ReportsPage() {
  const [reportType, setReportType] = useState<ReportType>('inventory');
  const [chemicals, setChemicals] = useState<Chemical[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [locations, setLocations] = useState<Record<string, string>>({});
  const [chemMap, setChemMap] = useState<Record<string, Chemical>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      const supabase = getSupabase();
      const [{ data: chems }, { data: lotData }, { data: moveData }, { data: locData }] = await Promise.all([
        supabase.from('chemicals').select('*').order('name'),
        supabase.from('lots').select('*'),
        supabase.from('stock_movements').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('storage_locations').select('*'),
      ]);
      setChemicals((chems || []) as Chemical[]);
      setLots((lotData || []) as Lot[]);
      setMovements((moveData || []) as StockMovement[]);

      const cMap: Record<string, Chemical> = {};
      (chems || []).forEach((c: Chemical) => { cMap[c.id] = c; });
      setChemMap(cMap);

      const lMap: Record<string, string> = {};
      (locData || []).forEach((l: StorageLocation) => { lMap[l.id] = l.name; });
      setLocations(lMap);
      setLoading(false);
    }
    loadData();
  }, []);

  const stockByChem = useMemo(() => {
    const map: Record<string, number> = {};
    lots.forEach((l) => { map[l.chemical_id] = (map[l.chemical_id] || 0) + l.quantity; });
    return map;
  }, [lots]);

  const inventoryData = useMemo(() => chemicals.map((c) => ({
    code: c.code,
    name: c.name,
    cas: c.cas_number,
    unit: c.unit,
    stock: stockByChem[c.id] || 0,
    min_stock: c.min_stock,
    status: (stockByChem[c.id] || 0) <= 0 ? 'Hết hàng' : (stockByChem[c.id] || 0) <= c.min_stock ? 'Tồn thấp' : 'Đủ',
  })), [chemicals, stockByChem]);

  const expiryData = useMemo(() => lots
    .filter((l) => l.expiry_date)
    .sort((a, b) => new Date(a.expiry_date!).getTime() - new Date(b.expiry_date!).getTime())
    .map((l) => ({
      lot_number: l.lot_number,
      chemical_name: chemMap[l.chemical_id]?.name || '—',
      code: chemMap[l.chemical_id]?.code || '—',
      quantity: l.quantity,
      unit: l.unit,
      expiry_date: l.expiry_date,
      location: l.storage_location_id ? locations[l.storage_location_id] : '—',
    })), [lots, chemMap, locations]);

  const movementsData = useMemo(() => movements.map((m) => ({
    type: m.movement_type,
    chemical: chemMap[m.chemical_id || '']?.name || '—',
    quantity: m.quantity,
    unit: m.unit,
    reference: m.reference,
    user: m.user_name,
    date: m.created_at,
  })), [movements, chemMap]);

  const exportCSV = () => {
    let rows: string[][] = [];
    let filename = '';

    if (reportType === 'inventory') {
      rows = [['Mã', 'Tên', 'Số CAS', 'Đơn vị', 'Tồn kho', 'Tối thiểu', 'Trạng thái']];
      inventoryData.forEach((r) => rows.push([r.code, r.name, r.cas, r.unit, String(r.stock), String(r.min_stock), r.status]));
      filename = 'bao-cao-ton-kho';
    } else if (reportType === 'expiry') {
      rows = [['Số lô', 'Hóa chất', 'Mã', 'Số lượng', 'Đơn vị', 'Hạn sử dụng', 'Vị trí']];
      expiryData.forEach((r) => rows.push([r.lot_number, r.chemical_name, r.code, String(r.quantity), r.unit, r.expiry_date || '', r.location]));
      filename = 'bao-cao-han-su-dung';
    } else {
      rows = [['Loại', 'Hóa chất', 'Số lượng', 'Đơn vị', 'Tham chiếu', 'Người thực hiện', 'Thời gian']];
      movementsData.forEach((r) => rows.push([r.type, r.chemical, String(r.quantity), r.unit, r.reference, r.user, r.date]));
      filename = 'bao-cao-nhap-xuat';
    }

    const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
    const bom = '\uFEFF' + csv;
    const blob = new Blob([bom], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const reportTabs = [
    { value: 'inventory' as ReportType, label: 'Tồn kho', icon: Beaker },
    { value: 'expiry' as ReportType, label: 'Hạn sử dụng', icon: FileText },
    { value: 'movements' as ReportType, label: 'Nhập/xuất', icon: PackagePlus },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Báo cáo</h1>
          <p className="mt-1 text-sm text-muted-foreground">Xuất báo cáo kho hóa chất</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV}>
            <Download className="mr-2 h-4 w-4" />
            Xuất CSV
          </Button>
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" />
            In
          </Button>
        </div>
      </div>

      <div className="flex gap-1 rounded-lg bg-muted p-1 print:hidden">
        {reportTabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.value}
              onClick={() => setReportType(tab.value)}
              className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                reportType === tab.value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <Card className="print:border-0 print:shadow-none">
        <CardHeader className="print:block">
          <CardTitle className="text-lg">
            {reportType === 'inventory' && 'Báo cáo tồn kho'}
            {reportType === 'expiry' && 'Báo cáo hạn sử dụng'}
            {reportType === 'movements' && 'Báo cáo nhập xuất kho'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {reportType === 'inventory' && (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mã</TableHead>
                    <TableHead>Tên</TableHead>
                    <TableHead>Số CAS</TableHead>
                    <TableHead className="text-right">Tồn kho</TableHead>
                    <TableHead className="text-right">Tối thiểu</TableHead>
                    <TableHead>Trạng thái</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inventoryData.map((r) => (
                    <TableRow key={r.code}>
                      <TableCell className="font-mono text-xs">{r.code}</TableCell>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-muted-foreground">{r.cas || '—'}</TableCell>
                      <TableCell className="text-right font-semibold">{formatNumber(r.stock)} {r.unit}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatNumber(r.min_stock)} {r.unit}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === 'Đủ' ? 'default' : r.status === 'Tồn thấp' ? 'secondary' : 'destructive'}>
                          {r.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {reportType === 'expiry' && (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Số lô</TableHead>
                    <TableHead>Hóa chất</TableHead>
                    <TableHead className="text-right">Số lượng</TableHead>
                    <TableHead>Hạn sử dụng</TableHead>
                    <TableHead>Vị trí</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expiryData.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-xs">{r.lot_number}</TableCell>
                      <TableCell className="font-medium">{r.chemical_name}</TableCell>
                      <TableCell className="text-right">{formatNumber(r.quantity)} {r.unit}</TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-sm">{formatDate(r.expiry_date)}</span>
                          <ExpiryBadge expiryDate={r.expiry_date} />
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{r.location}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {reportType === 'movements' && (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Loại</TableHead>
                    <TableHead>Hóa chất</TableHead>
                    <TableHead className="text-right">Số lượng</TableHead>
                    <TableHead>Tham chiếu</TableHead>
                    <TableHead>Người thực hiện</TableHead>
                    <TableHead>Thời gian</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {movementsData.map((r, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Badge variant={r.type === 'in' ? 'default' : r.type === 'out' ? 'destructive' : 'secondary'}>
                          {r.type === 'in' ? <PackagePlus className="mr-1 h-3 w-3" /> : r.type === 'out' ? <PackageMinus className="mr-1 h-3 w-3" /> : null}
                          {r.type === 'in' ? 'Nhập' : r.type === 'out' ? 'Xuất' : 'Điều chỉnh'}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{r.chemical}</TableCell>
                      <TableCell className={`text-right font-semibold ${r.type === 'in' ? 'text-success' : 'text-destructive'}`}>
                        {r.type === 'in' ? '+' : ''}{formatNumber(r.quantity)} {r.unit}
                      </TableCell>
                      <TableCell><Badge variant="outline" className="font-mono text-xs">{r.reference}</Badge></TableCell>
                      <TableCell className="text-sm">{r.user || '—'}</TableCell>
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
