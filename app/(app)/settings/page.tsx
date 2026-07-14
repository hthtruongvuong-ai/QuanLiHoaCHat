'use client';

import { useState } from 'react';
import { Save, Loader2, User, Bell, Shield, RotateCcw, AlertTriangle, Trash2, Calendar } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { ROLE_LABELS } from '@/lib/roles';

export default function SettingsPage() {
  const { profile, session } = useAuth();
  const { toast } = useToast();
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [saving, setSaving] = useState(false);
  const [notifications, setNotifications] = useState({
    expiryAlerts: true,
    lowStockAlerts: true,
    emailNotifications: false,
  });

  const [resetStep, setResetStep] = useState<0 | 1 | 2>(0);
  const [resetting, setResetting] = useState(false);
  const [resetMode, setResetMode] = useState<'all' | 'month'>('all');
  const [resetMonth, setResetMonth] = useState(new Date().toISOString().slice(0, 7));
  const isAdmin = profile?.role === 'admin';

  const handleSave = async () => {
    setSaving(true);
    const supabase = getSupabase();
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName })
      .eq('id', profile?.id);
    if (error) {
      toast({ title: 'Lỗi', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Đã lưu cài đặt' });
    }
    setSaving(false);
  };

  const handleResetData = async () => {
    setResetting(true);
    const supabase = getSupabase();

    try {
      if (resetMode === 'month') {
        // Delete only data from the selected month
        const monthStart = `${resetMonth}-01T00:00:00Z`;
        const nextMonth = new Date(new Date(`${resetMonth}-01`).getTime() + 32 * 24 * 60 * 60 * 1000);
        const monthEnd = `${nextMonth.toISOString().slice(0, 7)}-01T00:00:00Z`;

        // Delete preparation items for preparations created in that month
        const { data: monthPreps } = await supabase.from('preparations').select('id').gte('created_at', monthStart).lt('created_at', monthEnd);
        if (monthPreps && monthPreps.length > 0) {
          const prepIds = monthPreps.map((p: any) => p.id);
          await supabase.from('preparation_items').delete().in('preparation_id', prepIds);
        }

        // Restore lot quantities for preparation items
        if (monthPreps && monthPreps.length > 0) {
          for (const prep of monthPreps) {
            const { data: items } = await supabase.from('preparation_items').select('lot_id, quantity_used').eq('preparation_id', (prep as any).id);
            if (items) {
              for (const item of items) {
                if (item.lot_id) {
                  const { data: lot } = await supabase.from('lots').select('quantity').eq('id', item.lot_id).maybeSingle();
                  if (lot) {
                    await supabase.from('lots').update({ quantity: (lot as any).quantity + item.quantity_used, status: 'active' }).eq('id', item.lot_id);
                  }
                }
              }
            }
          }
        }

        await supabase.from('preparations').delete().gte('created_at', monthStart).lt('created_at', monthEnd);

        // Restore and delete usage slip items for slips in that month
        const { data: monthSlips } = await supabase.from('usage_slips').select('id').gte('created_at', monthStart).lt('created_at', monthEnd);
        if (monthSlips && monthSlips.length > 0) {
          const slipIds = monthSlips.map((s: any) => s.id);
          const { data: slipItems } = await supabase.from('usage_slip_items').select('lot_id, quantity_used').in('slip_id', slipIds);
          if (slipItems) {
            for (const item of slipItems) {
              if (item.lot_id) {
                const { data: lot } = await supabase.from('lots').select('quantity').eq('id', item.lot_id).maybeSingle();
                if (lot) {
                  await supabase.from('lots').update({ quantity: (lot as any).quantity + item.quantity_used, status: 'active' }).eq('id', item.lot_id);
                }
              }
            }
          }
          await supabase.from('usage_slip_items').delete().in('slip_id', slipIds);
        }
        await supabase.from('usage_slips').delete().gte('created_at', monthStart).lt('created_at', monthEnd);

        // Delete stock movements for that month
        await supabase.from('stock_movements').delete().gte('created_at', monthStart).lt('created_at', monthEnd);

        toast({ title: `Đã xóa dữ liệu tháng ${resetMonth}`, description: 'Phiếu, hồ sơ pha chế và giao dịch trong tháng đã được xóa. Tồn kho đã được hoàn trả.' });
      } else {
        // Full reset
        await supabase.from('preparation_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('preparations').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('usage_slip_items').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('usage_slips').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('stock_movements').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('lots').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('chemicals').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('storage_locations').delete().neq('id', '00000000-0000-0000-0000-000000000000');

        // Re-seed storage locations
        const { data: locs } = await supabase.from('storage_locations').insert([
          { name: 'Kho A - Tủ 1', building: 'Tòa A', room: 'A.101', description: 'Hóa chất vô cơ' },
          { name: 'Kho A - Tủ 2', building: 'Tòa A', room: 'A.101', description: 'Hóa chất hữu cơ' },
          { name: 'Kho B - Tủ đông lạnh', building: 'Tòa B', room: 'B.205', description: 'Hóa chất cần bảo quản lạnh' },
          { name: 'Kho C - Tủ độc hại', building: 'Tòa C', room: 'C.301', description: 'Hóa chất độc hại, cần kiểm soát' },
        ]).select();

        // Re-seed chemicals
        const { data: chems } = await supabase.from('chemicals').insert([
          { code: 'CHM-001', name: 'Acid Sulfuric', cas_number: '7664-93-9', formula: 'H2SO4', unit: 'ml', min_stock: 500, hazard_level: 'high', category: 'acid', description: 'Axít mạnh, ăn mòn' },
          { code: 'CHM-002', name: 'Sodium Hydroxide', cas_number: '1310-73-2', formula: 'NaOH', unit: 'g', min_stock: 200, hazard_level: 'high', category: 'base', description: 'Bazo mạnh' },
          { code: 'CHM-003', name: 'Ethanol', cas_number: '64-17-5', formula: 'C2H5OH', unit: 'ml', min_stock: 1000, hazard_level: 'medium', category: 'solvent', description: 'Dung môi phổ biến' },
          { code: 'CHM-004', name: 'Acid Chlorhydric', cas_number: '7647-01-0', formula: 'HCl', unit: 'ml', min_stock: 300, hazard_level: 'high', category: 'acid', description: 'Axít mạnh, bay hơi' },
          { code: 'CHM-005', name: 'Potassium Permanganate', cas_number: '7722-64-7', formula: 'KMnO4', unit: 'g', min_stock: 100, hazard_level: 'medium', category: 'oxidizer', description: 'Chất oxy hóa mạnh' },
          { code: 'CHM-006', name: 'Acetone', cas_number: '67-64-1', formula: 'C3H6O', unit: 'ml', min_stock: 500, hazard_level: 'medium', category: 'solvent', description: 'Dung môi hữu cơ' },
          { code: 'CHM-007', name: 'Silver Nitrate', cas_number: '7761-88-8', formula: 'AgNO3', unit: 'g', min_stock: 50, hazard_level: 'toxic', category: 'salt', description: 'Độc, nhạy sáng' },
          { code: 'CHM-008', name: 'Hydrogen Peroxide', cas_number: '7722-84-1', formula: 'H2O2', unit: 'ml', min_stock: 250, hazard_level: 'medium', category: 'oxidizer', description: 'Chất oxy hóa' },
        ]).select();

        // Re-seed lots
        if (locs && chems) {
          const locMap: Record<string, string> = {};
          locs.forEach((l: any) => { locMap[l.name] = l.id; });
          const chemMap: Record<string, string> = {};
          chems.forEach((c: any) => { chemMap[c.code] = c.id; });

          const lotData = [
            { chem: 'CHM-001', lot: 'L-2024-001', qty: 1000, unit: 'ml', recv: '2024-01-15', exp: '2026-01-15', loc: 'Kho A - Tủ 1', sup: 'Sigma-Aldrich' },
            { chem: 'CHM-002', lot: 'L-2024-002', qty: 500, unit: 'g', recv: '2024-03-01', exp: '2027-03-01', loc: 'Kho A - Tủ 1', sup: 'Merck' },
            { chem: 'CHM-003', lot: 'L-2024-003', qty: 2500, unit: 'ml', recv: '2024-02-10', exp: '2026-08-10', loc: 'Kho A - Tủ 2', sup: 'Xilab' },
            { chem: 'CHM-004', lot: 'L-2024-004', qty: 500, unit: 'ml', recv: '2023-12-01', exp: '2025-07-01', loc: 'Kho A - Tủ 1', sup: 'Sigma-Aldrich' },
            { chem: 'CHM-005', lot: 'L-2024-005', qty: 200, unit: 'g', recv: '2024-01-20', exp: '2025-08-20', loc: 'Kho A - Tủ 2', sup: 'Xilab' },
            { chem: 'CHM-006', lot: 'L-2024-006', qty: 2000, unit: 'ml', recv: '2024-04-05', exp: '2027-04-05', loc: 'Kho A - Tủ 2', sup: 'Xilab' },
            { chem: 'CHM-007', lot: 'L-2024-007', qty: 100, unit: 'g', recv: '2024-02-15', exp: '2025-02-15', loc: 'Kho C - Tủ độc hại', sup: 'Sigma-Aldrich' },
            { chem: 'CHM-008', lot: 'L-2024-008', qty: 1000, unit: 'ml', recv: '2024-05-01', exp: '2026-05-01', loc: 'Kho B - Tủ đông lạnh', sup: 'Merck' },
          ];

          const lotInserts = lotData.map((l) => ({
            chemical_id: chemMap[l.chem],
            lot_number: l.lot,
            quantity: l.qty,
            initial_quantity: l.qty,
            unit: l.unit,
            received_date: l.recv,
            expiry_date: l.exp,
            storage_location_id: locMap[l.loc],
            supplier: l.sup,
            status: 'active',
          }));

          await supabase.from('lots').insert(lotInserts);
        }

        toast({ title: 'Đã reset toàn bộ dữ liệu', description: 'Dữ liệu hóa chất đã được khôi phục về mặc định' });
      }
      setResetStep(0);
    } catch (err) {
      toast({ title: 'Lỗi reset dữ liệu', description: err instanceof Error ? err.message : 'Đã có lỗi', variant: 'destructive' });
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cài đặt</h1>
        <p className="mt-1 text-sm text-muted-foreground">Quản lý tài khoản và tùy chọn hệ thống</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <User className="h-5 w-5 text-primary" />
              Thông tin tài khoản
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={session?.user?.email || ''} disabled />
            </div>
            <div className="space-y-2">
              <Label>Họ và tên</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="flex items-center gap-2">
              <Label>Vai trò:</Label>
              <Badge variant="secondary">{profile ? ROLE_LABELS[profile.role] : '—'}</Badge>
            </div>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Lưu thay đổi
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Bell className="h-5 w-5 text-primary" />
              Thông báo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Cảnh báo hạn sử dụng</p>
                <p className="text-xs text-muted-foreground">Thông báo khi hóa chất sắp hết hạn</p>
              </div>
              <Switch checked={notifications.expiryAlerts} onCheckedChange={(v) => setNotifications({ ...notifications, expiryAlerts: v })} />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Cảnh báo tồn kho thấp</p>
                <p className="text-xs text-muted-foreground">Thông báo khi tồn kho dưới mức tối thiểu</p>
              </div>
              <Switch checked={notifications.lowStockAlerts} onCheckedChange={(v) => setNotifications({ ...notifications, lowStockAlerts: v })} />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Email thông báo</p>
                <p className="text-xs text-muted-foreground">Gửi thông báo qua email</p>
              </div>
              <Switch checked={notifications.emailNotifications} onCheckedChange={(v) => setNotifications({ ...notifications, emailNotifications: v })} />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="h-5 w-5 text-primary" />
            Thông tin hệ thống
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-sm text-muted-foreground">Phiên bản</p>
              <p className="font-semibold">1.0.0</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Hệ quản trị CSDL</p>
              <p className="font-semibold">Supabase</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Framework</p>
              <p className="font-semibold">Next.js 13</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {isAdmin && (
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-destructive">
              <RotateCcw className="h-5 w-5" />
              Vùng nguy hiểm — Reset dữ liệu
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-destructive" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-destructive">Reset dữ liệu</p>
                  <p className="text-xs text-muted-foreground">
                    Chọn chế độ reset: toàn bộ dữ liệu hoặc theo tháng. Tài khoản người dùng không bị ảnh hưởng.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <input
                    type="radio"
                    name="resetMode"
                    value="all"
                    checked={resetMode === 'all'}
                    onChange={() => setResetMode('all')}
                    className="h-4 w-4"
                  />
                  Reset toàn bộ
                </label>
                <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                  <input
                    type="radio"
                    name="resetMode"
                    value="month"
                    checked={resetMode === 'month'}
                    onChange={() => setResetMode('month')}
                    className="h-4 w-4"
                  />
                  Reset theo tháng
                </label>
              </div>

              {resetMode === 'month' && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4" />
                    Chọn tháng
                  </Label>
                  <Input
                    type="month"
                    value={resetMonth}
                    onChange={(e) => setResetMonth(e.target.value)}
                    className="w-48"
                  />
                  <p className="text-xs text-muted-foreground">
                    Sẽ xóa phiếu sử dụng, hồ sơ pha chế và giao dịch trong tháng {resetMonth}. Tồn kho sẽ được hoàn trả.
                  </p>
                </div>
              )}

              {resetMode === 'all' && (
                <p className="text-xs text-muted-foreground">
                  Sẽ xóa toàn bộ hóa chất, lô hàng, phiếu, hồ sơ pha chế và lịch sử giao dịch, sau đó khôi phục dữ liệu mặc định.
                </p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                className="border-destructive/30 text-destructive hover:bg-destructive/10"
                onClick={() => setResetStep(1)}
                disabled={resetStep !== 0 || resetting}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                {resetMode === 'all' ? 'Reset toàn bộ dữ liệu' : `Reset dữ liệu tháng ${resetMonth}`}
              </Button>
              {resetStep === 1 && (
                <Button
                  variant="outline"
                  className="border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={() => setResetStep(2)}
                  disabled={resetting}
                >
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  Xác nhận lần 1 — Tiếp tục
                </Button>
              )}
              {resetStep === 1 && (
                <Button variant="ghost" onClick={() => setResetStep(0)} disabled={resetting}>
                  Hủy
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <AlertDialog open={resetStep === 2} onOpenChange={(v) => { if (!v) setResetStep(0); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Xác nhận lần 2 — {resetMode === 'all' ? 'Xóa toàn bộ dữ liệu?' : `Xóa dữ liệu tháng ${resetMonth}?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {resetMode === 'all'
                ? 'Toàn bộ dữ liệu hóa chất, lô hàng, phiếu và hồ sơ sẽ bị xóa vĩnh viễn và khôi phục về trạng thái mặc định. Hành động này không thể hoàn tác.'
                : `Toàn bộ phiếu sử dụng, hồ sơ pha chế và giao dịch trong tháng ${resetMonth} sẽ bị xóa. Tồn kho hóa chất sẽ được hoàn trả. Hành động này không thể hoàn tác.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResetData}
              disabled={resetting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {resetting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              {resetMode === 'all' ? 'Xóa và reset dữ liệu' : `Xóa dữ liệu tháng ${resetMonth}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
