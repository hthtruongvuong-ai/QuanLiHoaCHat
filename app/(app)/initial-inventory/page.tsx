'use client';

import { useEffect, useState, useCallback } from 'react';
import { Save, Loader2, CheckCircle2, Lock, AlertTriangle, PackagePlus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { formatNumber } from '@/lib/expiry';
import type { Chemical, Lot, StorageLocation } from '@/lib/types';

export default function InitialInventoryPage() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const isAdmin = profile?.role === 'admin';

  const [chemicals, setChemicals] = useState<Chemical[]>([]);
  const [locations, setLocations] = useState<StorageLocation[]>([]);
  const [existingLots, setExistingLots] = useState<Lot[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [lotNumbers, setLotNumbers] = useState<Record<string, string>>({});
  const [expiryDates, setExpiryDates] = useState<Record<string, string>>({});
  const [locationIds, setLocationIds] = useState<Record<string, string>>({});
  const [suppliers, setSuppliers] = useState<Record<string, string>>({});

  const loadData = useCallback(async () => {
    const supabase = getSupabase();
    const [{ data: chemData }, { data: locData }, { data: lotData }, { data: setting }] = await Promise.all([
      supabase.from('chemicals').select('*').order('code'),
      supabase.from('storage_locations').select('*').order('name'),
      supabase.from('lots').select('*'),
      supabase.from('app_settings').select('value').eq('key', 'initial_inventory_done').maybeSingle(),
    ]);
    setChemicals((chemData || []) as Chemical[]);
    setLocations((locData || []) as StorageLocation[]);
    setExistingLots((lotData || []) as Lot[]);
    setInitialized(setting?.value === 'true');
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const lotCountByChem = (chemId: string) => existingLots.filter((l) => l.chemical_id === chemId).length;

  const handleSave = async () => {
    setSaving(true);
    const supabase = getSupabase();
    try {
      const lotInserts: any[] = [];
      for (const chem of chemicals) {
        const qty = parseFloat(quantities[chem.id] || '0');
        if (qty <= 0) continue;
        lotInserts.push({
          chemical_id: chem.id,
          lot_number: lotNumbers[chem.id] || `INIT-${chem.code}`,
          quantity: qty,
          initial_quantity: qty,
          unit: chem.unit,
          received_date: new Date().toISOString().slice(0, 10),
          expiry_date: expiryDates[chem.id] || null,
          storage_location_id: locationIds[chem.id] || null,
          supplier: suppliers[chem.id] || 'Khởi tạo ban đầu',
          status: 'active',
        });
      }

      if (lotInserts.length > 0) {
        const { error: lotError } = await supabase.from('lots').insert(lotInserts);
        if (lotError) throw lotError;

        for (const insert of lotInserts) {
          const chem = chemicals.find((c) => c.id === insert.chemical_id);
          if (chem) {
            await supabase.from('stock_movements').insert({
              movement_type: 'in',
              lot_id: null,
              chemical_id: insert.chemical_id,
              quantity: insert.quantity,
              unit: insert.unit,
              reference: 'INITIAL-INVENTORY',
              user_id: profile?.id,
              user_name: profile?.full_name || '',
              notes: `Khởi tạo tồn kho ban đầu: ${chem.name}`,
            });
          }
        }
      }

      await supabase.from('app_settings').upsert({
        key: 'initial_inventory_done',
        value: 'true',
        updated_by: profile?.id,
        updated_at: new Date().toISOString(),
      });

      toast({ title: 'Đã khởi tạo tồn kho ban đầu', description: `${lotInserts.length} lô hàng đã được tạo` });
      setInitialized(true);
      setConfirmOpen(false);
      await loadData();
    } catch (err) {
      toast({ title: 'Lỗi khởi tạo', description: err instanceof Error ? err.message : 'Đã có lỗi', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-3 text-center">
        <Lock className="h-10 w-10 text-muted-foreground" />
        <p className="text-muted-foreground">Chỉ Admin mới có quyền khởi tạo dữ liệu ban đầu</p>
      </div>
    );
  }

  if (initialized) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Khởi tạo tồn kho ban đầu</h1>
          <p className="mt-1 text-sm text-muted-foreground">Thiết lập số lượng hóa chất khi bắt đầu dùng phần mềm</p>
        </div>
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="flex items-center gap-4 p-6">
            <CheckCircle2 className="h-10 w-10 shrink-0 text-emerald-600" />
            <div>
              <p className="font-semibold text-emerald-900">Đã khởi tạo tồn kho ban đầu</p>
              <p className="mt-1 text-sm text-emerald-700">
                Khởi tạo đã hoàn tất. Để điều chỉnh tồn kho, Admin vui lòng sử dụng chức năng Điều chỉnh tồn kho.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const filledCount = Object.values(quantities).filter((v) => parseFloat(v) > 0).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Khởi tạo tồn kho ban đầu</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Nhập số lượng thực tế của từng hóa chất. Chỉ thực hiện một lần.
          </p>
        </div>
        <Button onClick={() => setConfirmOpen(true)} disabled={saving || filledCount === 0}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Lưu khởi tạo ({filledCount} hóa chất)
        </Button>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
        <div className="text-sm">
          <p className="font-medium text-amber-900">Lưu ý quan trọng</p>
          <p className="mt-1 text-amber-700">
            Sau khi khởi tạo, mọi thống kê Nhập/Xuất/Sử dụng sẽ tính từ số liệu này.
            Chỉ cho phép khởi tạo một lần. Nếu cần sửa, dùng chức năng Điều chỉnh tồn kho.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <PackagePlus className="h-5 w-5 text-primary" />
            Nhập tồn kho ({chemicals.length} hóa chất)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[80px]">Mã</TableHead>
                  <TableHead>Tên hóa chất</TableHead>
                  <TableHead className="w-[120px]">Đơn vị</TableHead>
                  <TableHead className="w-[100px]">Tồn tại</TableHead>
                  <TableHead className="w-[120px]">Số lô</TableHead>
                  <TableHead className="w-[120px]">Số lượng</TableHead>
                  <TableHead className="w-[140px]">Hạn sử dụng</TableHead>
                  <TableHead className="w-[160px]">Vị trí</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {chemicals.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      Chưa có hóa chất nào. Vui lòng thêm hóa chất trước.
                    </TableCell>
                  </TableRow>
                ) : (
                  chemicals.map((chem) => {
                    const existingCount = lotCountByChem(chem.id);
                    return (
                      <TableRow key={chem.id}>
                        <TableCell><Badge variant="outline" className="font-mono text-xs">{chem.code}</Badge></TableCell>
                        <TableCell className="font-medium">{chem.name}</TableCell>
                        <TableCell className="text-muted-foreground">{chem.unit}</TableCell>
                        <TableCell>
                          {existingCount > 0 ? (
                            <Badge variant="secondary" className="text-xs">{existingCount} lô</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Input
                            placeholder="INIT-001"
                            value={lotNumbers[chem.id] || ''}
                            onChange={(e) => setLotNumbers({ ...lotNumbers, [chem.id]: e.target.value })}
                            className="h-8 text-xs"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="any"
                            min="0"
                            placeholder="0"
                            value={quantities[chem.id] || ''}
                            onChange={(e) => setQuantities({ ...quantities, [chem.id]: e.target.value })}
                            className="h-8"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="date"
                            value={expiryDates[chem.id] || ''}
                            onChange={(e) => setExpiryDates({ ...expiryDates, [chem.id]: e.target.value })}
                            className="h-8 text-xs"
                          />
                        </TableCell>
                        <TableCell>
                          <select
                            value={locationIds[chem.id] || ''}
                            onChange={(e) => setLocationIds({ ...locationIds, [chem.id]: e.target.value })}
                            className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <option value="">— Chọn —</option>
                            {locations.map((loc) => (
                              <option key={loc.id} value={loc.id}>{loc.name}</option>
                            ))}
                          </select>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xác nhận khởi tạo tồn kho?</AlertDialogTitle>
            <AlertDialogDescription>
              Hành động này sẽ tạo {filledCount} lô hàng với số lượng bạn đã nhập.
              Chỉ thực hiện được một lần. Sau khi lưu, bạn sẽ phải dùng chức năng Điều chỉnh tồn kho để sửa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Hủy</AlertDialogCancel>
            <AlertDialogAction onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Xác nhận khởi tạo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
