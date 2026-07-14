'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Plus, QrCode, Package, Lock, Unlock, FileText, Upload, Download, Loader2, CheckCircle2 } from 'lucide-react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { QRDialog } from '@/components/chemicals/qr-dialog';
import { ExpiryBadge } from '@/components/chemicals/expiry-badge';
import { SafetyTab } from '@/components/chemicals/safety-tab';
import { getSupabase } from '@/lib/supabase/singleton';
import { useAuth } from '@/lib/auth-context';
import { canManageStock } from '@/lib/roles';
import { formatDate, formatNumber, formatDateTime } from '@/lib/expiry';
import type { Chemical, Lot, StorageLocation, StockMovement, Preparation } from '@/lib/types';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

const HAZARD_LABELS: Record<string, string> = {
  low: 'Thấp',
  medium: 'Trung bình',
  high: 'Cao',
  toxic: 'Độc hại',
};

interface UsageRecord {
  id: string;
  quantity_used: number;
  unit: string;
  created_at: string;
}

export default function ChemicalDetailPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const { profile } = useAuth();
  const canEdit = profile ? canManageStock(profile.role) : false;

  const [chemical, setChemical] = useState<Chemical | null>(null);
  const [lots, setLots] = useState<Lot[]>([]);
  const [locations, setLocations] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [qrOpen, setQrOpen] = useState(false);
  const [usageRecords, setUsageRecords] = useState<UsageRecord[]>([]);
  const [uploadingLotId, setUploadingLotId] = useState<string | null>(null);
  const [preparations, setPreparations] = useState<Preparation[]>([]);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [usageSlips, setUsageSlips] = useState<{ id: string; slip_number: string; slip_date: string; user_name: string; purpose: string; items: { chemical_name: string; quantity_used: number; unit: string }[] }[]>([]);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    async function loadData() {
      const supabase = getSupabase();
      const [{ data: chem }, { data: lotData }, { data: locData }, { data: prepItems }, { data: prepData }, { data: movements }] = await Promise.all([
        supabase.from('chemicals').select('*').eq('id', id).maybeSingle(),
        supabase.from('lots').select('*').eq('chemical_id', id).order('received_date', { ascending: false }),
        supabase.from('storage_locations').select('*'),
        supabase.from('preparation_items').select('id, quantity_used, unit, created_at').eq('chemical_id', id),
        supabase.from('preparations').select('*').order('created_at', { ascending: false }),
        supabase.from('stock_movements').select('*').eq('chemical_id', id).order('created_at', { ascending: false }).limit(50),
      ]);

      setChemical(chem as Chemical | null);
      setLots((lotData || []) as Lot[]);
      setPreparations((prepData || []) as Preparation[]);
      setStockMovements((movements || []) as StockMovement[]);

      const locMap: Record<string, string> = {};
      (locData || []).forEach((l: StorageLocation) => { locMap[l.id] = l.name; });
      setLocations(locMap);

      const lotIds = (lotData || []).map((l: Lot) => l.id);
      let allUsage: UsageRecord[] = [];
      let slipItemsData: any[] = [];
      if (lotIds.length > 0) {
        const [{ data: usageByLot }, { data: slipItems }] = await Promise.all([
          supabase
            .from('usage_slip_items')
            .select('id, quantity_used, unit, created_at')
            .in('lot_id', lotIds),
          supabase
            .from('usage_slip_items')
            .select('id, quantity_used, unit, created_at, usage_slip_id, chemical_name')
            .in('lot_id', lotIds),
        ]);
        allUsage = [...(usageByLot || [])];
        slipItemsData = (slipItems || []) as any[];
      }
      allUsage = [...allUsage, ...(prepItems || [])];
      setUsageRecords(allUsage);

      // Build usage slips list
      if (slipItemsData && (slipItemsData as any[]).length > 0) {
        const slipIds = Array.from(new Set((slipItemsData as any[]).map((s) => s.usage_slip_id).filter(Boolean)));
        if (slipIds.length > 0) {
          const { data: slipsData } = await supabase
            .from('usage_slips')
            .select('id, slip_number, slip_date, user_name, purpose')
            .in('id', slipIds)
            .order('slip_date', { ascending: false });
          const slipMap: Record<string, any> = {};
          (slipsData || []).forEach((s: any) => { slipMap[s.id] = s; });
          const slipItemsMap: Record<string, { chemical_name: string; quantity_used: number; unit: string }[]> = {};
          (slipItemsData as any[]).forEach((item) => {
            const sid = item.usage_slip_id;
            if (!sid) return;
            if (!slipItemsMap[sid]) slipItemsMap[sid] = [];
            slipItemsMap[sid].push({ chemical_name: item.chemical_name, quantity_used: item.quantity_used, unit: item.unit });
          });
          setUsageSlips(Object.entries(slipMap).map(([id, s]) => ({ id, slip_number: s.slip_number, slip_date: s.slip_date, user_name: s.user_name, purpose: s.purpose, items: slipItemsMap[id] || [] })));
        }
      }
      setLoading(false);
    }
    loadData();
  }, [id]);

  const chartData = useMemo(() => {
    const now = new Date();

    const daily: { label: string; value: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const total = usageRecords
        .filter((r) => r.created_at?.slice(0, 10) === dateStr)
        .reduce((sum, r) => sum + (r.quantity_used || 0), 0);
      daily.push({ label: `${d.getDate()}/${d.getMonth() + 1}`, value: total });
    }

    const weekly: { label: string; value: number }[] = [];
    for (let i = 3; i >= 0; i--) {
      const weekStart = new Date(now);
      weekStart.setDate(weekStart.getDate() - i * 7 - weekStart.getDay());
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      const total = usageRecords
        .filter((r) => {
          const d = r.created_at?.slice(0, 10) || '';
          return d >= weekStart.toISOString().slice(0, 10) && d <= weekEnd.toISOString().slice(0, 10);
        })
        .reduce((sum, r) => sum + (r.quantity_used || 0), 0);
      weekly.push({ label: `T${i === 0 ? ' này' : `-${i}`}`, value: total });
    }

    const monthly: { label: string; value: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStr = d.toISOString().slice(0, 7);
      const total = usageRecords
        .filter((r) => r.created_at?.slice(0, 7) === monthStr)
        .reduce((sum, r) => sum + (r.quantity_used || 0), 0);
      const monthNames = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12'];
      monthly.push({ label: monthNames[d.getMonth()], value: total });
    }

    return { daily, weekly, monthly };
  }, [usageRecords]);

  const totalUsage = usageRecords.reduce((sum, r) => sum + (r.quantity_used || 0), 0);

  const handleUploadCOA = async (lot: Lot, file: File) => {
    setUploadingLotId(lot.id);
    const supabase = getSupabase();
    const fileExt = file.name.split('.').pop();
    const fileName = `${lot.lot_number || lot.id}_${Date.now()}.${fileExt}`;
    const filePath = `${lot.id}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('coa_files')
      .upload(filePath, file, { cacheControl: '3600', upsert: true });

    if (uploadError) {
      setUploadingLotId(null);
      return;
    }

    const { data: urlData } = supabase.storage.from('coa_files').getPublicUrl(filePath);
    const publicUrl = urlData.publicUrl;

    const { error: updateError } = await supabase
      .from('lots')
      .update({ coa_url: publicUrl })
      .eq('id', lot.id);

    if (!updateError) {
      setLots(lots.map((l) => (l.id === lot.id ? { ...l, coa_url: publicUrl } : l)));
    }
    setUploadingLotId(null);
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!chemical) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground">Không tìm thấy hóa chất</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push('/chemicals')}>
          Quay lại danh sách
        </Button>
      </div>
    );
  }

  const totalStock = lots.reduce((sum, l) => sum + l.quantity, 0);

  const toggleOpened = async (lot: Lot) => {
    const supabase = getSupabase();
    const { error } = await supabase.from('lots').update({ opened: !lot.opened }).eq('id', lot.id);
    if (error) return;
    setLots(lots.map((l) => (l.id === lot.id ? { ...l, opened: !l.opened } : l)));
  };

  const UsageChart = ({ data, unit }: { data: { label: string; value: number }[]; unit: string }) => (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
        <XAxis dataKey="label" tick={{ fontSize: 12 }} className="text-muted-foreground" />
        <YAxis tick={{ fontSize: 12 }} className="text-muted-foreground" />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
            fontSize: '13px',
          }}
          formatter={(value: number) => [`${formatNumber(value)} ${unit}`, 'Số lượng']}
        />
        <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={48} />
      </BarChart>
    </ResponsiveContainer>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/chemicals"><ArrowLeft className="h-5 w-5" /></Link>
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{chemical.name}</h1>
            <Badge variant="outline" className="font-mono">{chemical.code}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {chemical.formula && `${chemical.formula} · `}
            CAS: {chemical.cas_number || '—'}
          </p>
        </div>
        <Button variant="outline" onClick={() => setQrOpen(true)}>
          <QrCode className="mr-2 h-4 w-4" />
          Mã QR
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Tổng tồn kho</CardTitle></CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{formatNumber(totalStock)} <span className="text-lg text-muted-foreground">{chemical.unit}</span></p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Mức nguy hiểm</CardTitle></CardHeader>
          <CardContent><p className="text-lg font-semibold">{HAZARD_LABELS[chemical.hazard_level]}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Tồn tối thiểu</CardTitle></CardHeader>
          <CardContent><p className="text-lg font-semibold">{formatNumber(chemical.min_stock)} {chemical.unit}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Tổng sử dụng</CardTitle></CardHeader>
          <CardContent><p className="text-lg font-semibold">{formatNumber(totalUsage)} {chemical.unit}</p></CardContent>
        </Card>
      </div>

      <Tabs defaultValue="info" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="info">Thông tin & Lô</TabsTrigger>
          <TabsTrigger value="safety">An toàn & Hồ sơ</TabsTrigger>
          <TabsTrigger value="usage">Thống kê sử dụng</TabsTrigger>
          <TabsTrigger value="preparations">Hồ sơ pha chế</TabsTrigger>
          <TabsTrigger value="slips">Phiếu sử dụng</TabsTrigger>
          <TabsTrigger value="history">Lịch sử nhập/xuất</TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="space-y-6">
          {chemical.description && (
            <Card>
              <CardHeader><CardTitle className="text-base">Mô tả</CardTitle></CardHeader>
              <CardContent><p className="text-sm text-muted-foreground">{chemical.description}</p></CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Thông tin lô ({lots.length})</CardTitle>
              {canEdit && (
                <Button size="sm" variant="outline" onClick={() => router.push('/stock-in')}>
                  <Plus className="mr-2 h-4 w-4" />
                  Nhập lô mới
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {lots.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <Package className="h-12 w-12 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">Chưa có lô nào</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Số lô</TableHead>
                        <TableHead className="text-right">Tồn kho</TableHead>
                        <TableHead>Ngày nhập</TableHead>
                        <TableHead>Hạn sử dụng</TableHead>
                        <TableHead>Vị trí</TableHead>
                        <TableHead>Nhà cung cấp</TableHead>
                        <TableHead>Mở nắp</TableHead>
                        <TableHead>Trạng thái</TableHead>
                        <TableHead>COA</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lots.map((lot) => (
                        <TableRow key={lot.id}>
                          <TableCell className="font-mono text-xs font-medium">{lot.lot_number || '—'}</TableCell>
                          <TableCell className="text-right">
                            <span className="font-semibold">{formatNumber(lot.quantity)}</span>
                            <span className="text-muted-foreground"> / {formatNumber(lot.initial_quantity)} {lot.unit}</span>
                          </TableCell>
                          <TableCell className="text-muted-foreground text-sm">{formatDate(lot.received_date)}</TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-0.5">
                              <span className="text-sm">{formatDate(lot.expiry_date)}</span>
                              <ExpiryBadge expiryDate={lot.expiry_date} />
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">{lot.storage_location_id ? locations[lot.storage_location_id] || '—' : '—'}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{lot.supplier || '—'}</TableCell>
                          <TableCell>
                            {canEdit ? (
                              <button
                                onClick={() => toggleOpened(lot)}
                                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                                  lot.opened
                                    ? 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100'
                                    : 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                }`}
                              >
                                {lot.opened ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                                {lot.opened ? 'Đã mở' : 'Chưa mở'}
                              </button>
                            ) : (
                              <Badge variant="outline" className={lot.opened ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}>
                                {lot.opened ? 'Đã mở nắp' : 'Chưa mở nắp'}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant={lot.status === 'active' ? 'default' : lot.status === 'expired' ? 'destructive' : 'secondary'}>
                              {lot.status === 'active' ? 'Hoạt động' : lot.status === 'expired' ? 'Hết hạn' : 'Đã hết'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              {lot.coa_url ? (
                                <>
                                  <a href={lot.coa_url} target="_blank" rel="noopener noreferrer">
                                    <Button variant="ghost" size="sm" className="h-8 gap-1 text-primary">
                                      <FileText className="h-4 w-4" />
                                      <span className="hidden lg:inline">Xem COA</span>
                                    </Button>
                                  </a>
                                  {canEdit && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8 gap-1"
                                      disabled={uploadingLotId === lot.id}
                                      onClick={() => fileInputRefs.current[lot.id]?.click()}
                                    >
                                      {uploadingLotId === lot.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                                    </Button>
                                  )}
                                </>
                              ) : canEdit ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-8 gap-1"
                                  disabled={uploadingLotId === lot.id}
                                  onClick={() => fileInputRefs.current[lot.id]?.click()}
                                >
                                  {uploadingLotId === lot.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                                  <span className="hidden lg:inline">Tải lên</span>
                                </Button>
                              ) : (
                                <span className="text-xs text-muted-foreground">Chưa có</span>
                              )}
                              <input
                                ref={(el) => { fileInputRefs.current[lot.id] = el; }}
                                type="file"
                                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                                className="hidden"
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handleUploadCOA(lot, file);
                                  e.target.value = '';
                                }}
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="safety">
          <SafetyTab chemicalId={chemical.id} canEdit={canEdit} />
        </TabsContent>

        <TabsContent value="usage">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Thống kê sử dụng {chemical.name}</CardTitle>
            </CardHeader>
            <CardContent>
              {usageRecords.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-12 text-center">
                  <p className="text-sm text-muted-foreground">Chưa có dữ liệu sử dụng cho hóa chất này</p>
                </div>
              ) : (
                <Tabs defaultValue="daily">
                  <TabsList className="mb-4">
                    <TabsTrigger value="daily">Theo ngày (7 ngày)</TabsTrigger>
                    <TabsTrigger value="weekly">Theo tuần (4 tuần)</TabsTrigger>
                    <TabsTrigger value="monthly">Theo tháng (6 tháng)</TabsTrigger>
                  </TabsList>
                  <TabsContent value="daily">
                    <div className="mb-2 text-sm text-muted-foreground">Lượng {chemical.name} sử dụng theo từng ngày (7 ngày gần nhất)</div>
                    <UsageChart data={chartData.daily} unit={chemical.unit} />
                  </TabsContent>
                  <TabsContent value="weekly">
                    <div className="mb-2 text-sm text-muted-foreground">Lượng {chemical.name} sử dụng theo từng tuần (4 tuần gần nhất)</div>
                    <UsageChart data={chartData.weekly} unit={chemical.unit} />
                  </TabsContent>
                  <TabsContent value="monthly">
                    <div className="mb-2 text-sm text-muted-foreground">Lượng {chemical.name} sử dụng theo từng tháng (6 tháng gần nhất)</div>
                    <UsageChart data={chartData.monthly} unit={chemical.unit} />
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="preparations">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Hồ sơ pha chế liên quan ({preparations.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {preparations.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Chưa có hồ sơ pha chế nào sử dụng hóa chất này</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Mã pha chế</TableHead>
                        <TableHead>Người pha</TableHead>
                        <TableHead>Ngày tạo</TableHead>
                        <TableHead>Trạng thái</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preparations.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell>
                            <Link href={`/preparations`} className="font-mono text-xs text-primary hover:underline">
                              {p.prep_number}
                            </Link>
                          </TableCell>
                          <TableCell className="text-sm">{p.user_name || '—'}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{formatDate(p.created_at)}</TableCell>
                          <TableCell>
                            <Badge variant={p.status === 'completed' ? 'default' : p.status === 'draft' ? 'secondary' : 'outline'}>
                              {p.status === 'completed' ? 'Hoàn thành' : p.status === 'draft' ? 'Nháp' : p.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="slips">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Phiếu sử dụng ({usageSlips.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {usageSlips.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Chưa có phiếu sử dụng nào</p>
              ) : (
                <div className="space-y-3">
                  {usageSlips.map((slip) => (
                    <div key={slip.id} className="rounded-lg border p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <Link href={`/usage-slips`} className="font-mono text-sm font-medium text-primary hover:underline">
                            {slip.slip_number}
                          </Link>
                          <p className="text-xs text-muted-foreground">{slip.purpose || '—'}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm">{slip.user_name || '—'}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(slip.slip_date)}</p>
                        </div>
                      </div>
                      {slip.items.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {slip.items.map((item, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {item.chemical_name}: {formatNumber(item.quantity_used)} {item.unit}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Lịch sử nhập/xuất/sử dụng ({stockMovements.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {stockMovements.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Chưa có giao dịch nào</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Loại</TableHead>
                        <TableHead className="text-right">Số lượng</TableHead>
                        <TableHead>Tham chiếu</TableHead>
                        <TableHead>Người thực hiện</TableHead>
                        <TableHead>Thời gian</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {stockMovements.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell>
                            <Badge variant={m.movement_type === 'in' ? 'default' : 'destructive'}>
                              {m.movement_type === 'in' ? 'Nhập' : 'Xuất'}
                            </Badge>
                          </TableCell>
                          <TableCell className={`text-right font-semibold ${m.movement_type === 'in' ? 'text-emerald-600' : 'text-destructive'}`}>
                            {m.movement_type === 'in' ? '+' : '-'}{formatNumber(Math.abs(m.quantity))} {m.unit}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{m.reference || '—'}</TableCell>
                          <TableCell className="text-sm">{m.user_name || '—'}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{formatDateTime(m.created_at)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <QRDialog chemical={chemical} open={qrOpen} onOpenChange={setQrOpen} onRegenerated={(updated) => setChemical(updated)} />
    </div>
  );
}
