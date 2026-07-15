'use client';

import { Fragment, useEffect, useState } from 'react';
import { ClipboardList, Plus, Loader2, Check, Trash2, X, Pencil, Eye, ChevronDown, ChevronRight, FlaskRound, Link2, FlaskConical } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth-context';
import { getSupabase } from '@/lib/supabase/singleton';
import { formatDateTime, formatNumber } from '@/lib/expiry';
import { canEditAnySlip } from '@/lib/roles';
import type { Chemical, Lot, UsageSlip, UsageSlipItem, PreparedSolution } from '@/lib/types';

interface SlipWithItems extends UsageSlip {
  usage_slip_items?: UsageSlipItem[];
}

interface FormItem {
  lot_id: string;
  chemical_name: string;
  quantity: string;
  unit: string;
  prepared_solution_id: string;
  is_prepared: boolean;
}

export default function UsageSlipsPage() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [slips, setSlips] = useState<SlipWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<SlipWithItems | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [expandedSlip, setExpandedSlip] = useState<string | null>(null);

  const [lots, setLots] = useState<Lot[]>([]);
  const [chemicals, setChemicals] = useState<Record<string, Chemical>>({});
  const [preparedSolutions, setPreparedSolutions] = useState<PreparedSolution[]>([]);

  const [purpose, setPurpose] = useState('');
  const [items, setItems] = useState<FormItem[]>([]);
  const [editingSlip, setEditingSlip] = useState<SlipWithItems | null>(null);
  const [editPurpose, setEditPurpose] = useState('');
  const [editItems, setEditItems] = useState<FormItem[]>([]);

  const canEdit = profile ? canEditAnySlip(profile.role) : false;

  useEffect(() => {
    async function loadData() {
      const supabase = getSupabase();
      const [{ data: slipData }, { data: lotData }, { data: chemData }] = await Promise.all([
        supabase.from('usage_slips').select('*, usage_slip_items(*)').order('created_at', { ascending: false }),
        supabase.from('lots').select('*'),
        supabase.from('chemicals').select('*'),
      ]);
      setSlips((slipData || []) as SlipWithItems[]);

      const activeLots = (lotData || []).filter((l: Lot) => l.quantity > 0) as Lot[];
      setLots(activeLots);

      const chemMap: Record<string, Chemical> = {};
      (chemData || []).forEach((c: Chemical) => { chemMap[c.id] = c; });
      setChemicals(chemMap);

      const { data: prepSols } = await supabase
        .from('prepared_solutions')
        .select('*')
        .order('created_at', { ascending: false });
      setPreparedSolutions((prepSols || []) as PreparedSolution[]);

      setLoading(false);
    }
    loadData();
  }, []);

  const openNewSlip = () => {
    setPurpose('');
    setItems([{ lot_id: '', chemical_name: '', quantity: '', unit: '', prepared_solution_id: '', is_prepared: false }]);
    setDialogOpen(true);
  };

  const addRow = () => {
    setItems([...items, { lot_id: '', chemical_name: '', quantity: '', unit: '', prepared_solution_id: '', is_prepared: false }]);
  };

  const removeRow = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  const updateRow = (idx: number, field: keyof FormItem, value: string) => {
    const updated = [...items];
    updated[idx] = { ...updated[idx], [field]: value };
    if (field === 'lot_id' && !updated[idx].is_prepared) {
      const lot = lots.find((l) => l.id === value);
      const chem = lot ? chemicals[lot.chemical_id] : null;
      updated[idx].chemical_name = chem?.name || '';
      updated[idx].unit = lot?.unit || '';
    }
    if (field === 'prepared_solution_id') {
      const sol = preparedSolutions.find((s) => s.id === value);
      if (sol) {
        updated[idx].chemical_name = sol.solution_name;
        updated[idx].unit = sol.unit;
      }
    }
    if (field === 'is_prepared') {
      updated[idx].is_prepared = value === 'true';
      updated[idx].lot_id = '';
      updated[idx].prepared_solution_id = '';
      updated[idx].chemical_name = '';
      updated[idx].quantity = '';
      updated[idx].unit = '';
    }
    setItems(updated);
  };

  const refreshSlips = async () => {
    const supabase = getSupabase();
    const { data: newSlips } = await supabase
      .from('usage_slips').select('*, usage_slip_items(*)').order('created_at', { ascending: false });
    setSlips((newSlips || []) as SlipWithItems[]);
    const { data: newLots } = await supabase.from('lots').select('*');
    const activeLots = (newLots || []).filter((l: Lot) => l.quantity > 0) as Lot[];
    setLots(activeLots);
  };

  const handleCreate = async () => {
    if (!purpose.trim()) {
      toast({ title: 'Vui lòng nhập mục đích sử dụng', variant: 'destructive' });
      return;
    }
    const validItems = items.filter((i) =>
      (i.lot_id || i.prepared_solution_id) && parseFloat(i.quantity) > 0
    );
    if (validItems.length === 0) {
      toast({ title: 'Vui lòng thêm ít nhất một hóa chất', variant: 'destructive' });
      return;
    }

    for (const item of validItems) {
      if (item.is_prepared) {
        const sol = preparedSolutions.find((s) => s.id === item.prepared_solution_id);
        if (!sol) {
          toast({ title: 'Dung dịch không hợp lệ', variant: 'destructive' });
          return;
        }
        if (sol.remaining_volume <= 0) {
          toast({ title: `Dung dịch ${sol.solution_name} đã dùng hết`, variant: 'destructive' });
          return;
        }
        if (sol.expiry_date && new Date(sol.expiry_date) < new Date()) {
          toast({ title: `Dung dịch ${sol.solution_name} đã hết hạn`, variant: 'destructive' });
          return;
        }
        if (parseFloat(item.quantity) > sol.remaining_volume) {
          toast({ title: `Số lượng vượt quá phần còn lại của ${sol.solution_name} (còn ${sol.remaining_volume} ${sol.unit})`, variant: 'destructive' });
          return;
        }
      } else {
        const lot = lots.find((l) => l.id === item.lot_id);
        if (lot && parseFloat(item.quantity) > lot.quantity) {
          toast({ title: `Số lượng vượt tồn kho cho ${item.chemical_name}`, variant: 'destructive' });
          return;
        }
      }
    }

    setSubmitting(true);
    const supabase = getSupabase();

    try {
      const slipCount = await supabase.from('usage_slips').select('id', { count: 'exact', head: true });
      const year = new Date().getFullYear();
      const slipNumber = `US-${year}-${String((slipCount.count || 0) + 1).padStart(3, '0')}`;

      const { data: slip, error: slipError } = await supabase
        .from('usage_slips')
        .insert({
          slip_number: slipNumber,
          user_id: profile?.id,
          user_name: profile?.full_name || '',
          purpose,
          status: 'confirmed',
        })
        .select()
        .single();

      if (slipError) throw slipError;

      for (const item of validItems) {
        const qty = parseFloat(item.quantity);

        if (item.is_prepared && item.prepared_solution_id) {
          const sol = preparedSolutions.find((s) => s.id === item.prepared_solution_id)!;
          const newUsed = sol.used_volume + qty;
          const newRemaining = sol.remaining_volume - qty;
          await supabase.from('prepared_solutions').update({
            used_volume: newUsed,
            remaining_volume: newRemaining,
            status: newRemaining <= 0 ? 'depleted' : (sol.initial_volume > 0 && newRemaining / sol.initial_volume < 0.2 ? 'low_stock' : 'in_use'),
            updated_at: new Date().toISOString(),
          }).eq('id', sol.id);

          await supabase.from('prepared_solution_usages').insert({
            prepared_solution_id: sol.id,
            usage_slip_id: slip.id,
            slip_number: slipNumber,
            user_id: profile?.id,
            user_name: profile?.full_name || '',
            quantity_used: qty,
            unit: item.unit,
            used_at: new Date().toISOString(),
          });
          continue;
        }

        const lot = lots.find((l) => l.id === item.lot_id);
        if (!lot) continue;

        await supabase.from('usage_slip_items').insert({
          slip_id: slip.id,
          lot_id: item.lot_id,
          chemical_name: item.chemical_name,
          quantity_used: qty,
          unit: item.unit,
        });

        const newQty = lot.quantity - qty;
        const newStatus = newQty <= 0 ? 'depleted' : 'active';
        await supabase.from('lots').update({ quantity: newQty, status: newStatus, updated_at: new Date().toISOString() }).eq('id', lot.id);

        await supabase.from('stock_movements').insert({
          movement_type: 'out',
          lot_id: lot.id,
          chemical_id: lot.chemical_id,
          quantity: -qty,
          unit: lot.unit,
          reference: slipNumber,
          user_id: profile?.id,
          user_name: profile?.full_name || '',
          notes: `Phiếu sử dụng: ${purpose}`,
        });
      }

      // Only auto-create a draft preparation when the slip uses original chemicals (not prepared solutions)
      const hasOriginalItems = validItems.some((i) => !i.is_prepared && i.lot_id);
      if (hasOriginalItems) {
        const prepCount = await supabase.from('preparations').select('id', { count: 'exact', head: true });
        const prepNumber = `PREP-${year}-${String((prepCount.count || 0) + 1).padStart(3, '0')}`;

        const { data: prep, error: prepError } = await supabase.from('preparations').insert({
          prep_number: prepNumber,
          product_name: '',
          product_code: '',
          target_concentration: '',
          target_volume: 0,
          unit: 'ml',
          procedure: '',
          result: 'pending',
          notes: '',
          user_id: profile?.id,
          user_name: profile?.full_name || '',
          status: 'draft',
          usage_slip_id: slip.id,
        }).select().single();

        if (!prepError && prep) {
          for (const item of validItems) {
            if (item.is_prepared) continue;
            const lot = lots.find((l) => l.id === item.lot_id);
            if (!lot) continue;
            await supabase.from('preparation_items').insert({
              preparation_id: prep.id,
              lot_id: item.lot_id,
              chemical_id: lot.chemical_id,
              chemical_name: item.chemical_name,
              quantity_used: parseFloat(item.quantity),
              unit: item.unit,
            });
          }
          toast({ title: 'Tạo phiếu thành công', description: `${slipNumber} — Đã tự động tạo hồ sơ pha chế ${prepNumber}` });
        } else {
          toast({ title: 'Tạo phiếu thành công', description: `${slipNumber} — Lỗi tạo hồ sơ pha chế, vui lòng tạo thủ công` });
        }
      } else {
        toast({ title: 'Tạo phiếu thành công', description: `${slipNumber}` });
      }
      setDialogOpen(false);
      await refreshSlips();
    } catch (err) {
      toast({ title: 'Lỗi tạo phiếu', description: err instanceof Error ? err.message : 'Đã có lỗi', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const openEditSlip = (slip: SlipWithItems) => {
    setEditingSlip(slip);
    setEditPurpose(slip.purpose);
    const formItems: FormItem[] = (slip.usage_slip_items || []).map((item) => ({
      lot_id: item.lot_id || '',
      chemical_name: item.chemical_name,
      quantity: String(item.quantity_used),
      unit: item.unit,
      prepared_solution_id: '',
      is_prepared: false,
    }));
    if (formItems.length === 0) formItems.push({ lot_id: '', chemical_name: '', quantity: '', unit: '', prepared_solution_id: '', is_prepared: false });
    setEditItems(formItems);
    setEditDialogOpen(true);
  };

  const updateEditRow = (idx: number, field: keyof FormItem, value: string) => {
    const updated = [...editItems];
    updated[idx] = { ...updated[idx], [field]: value };
    if (field === 'lot_id') {
      const lot = lots.find((l) => l.id === value);
      const chem = lot ? chemicals[lot.chemical_id] : null;
      updated[idx].chemical_name = chem?.name || '';
      updated[idx].unit = lot?.unit || '';
    }
    setEditItems(updated);
  };

  const addEditRow = () => {
    setEditItems([...editItems, { lot_id: '', chemical_name: '', quantity: '', unit: '', prepared_solution_id: '', is_prepared: false }]);
  };

  const removeEditRow = (idx: number) => {
    setEditItems(editItems.filter((_, i) => i !== idx));
  };

  const handleEditSave = async () => {
    if (!editingSlip || !editPurpose.trim()) {
      toast({ title: 'Vui lòng nhập mục đích', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    const supabase = getSupabase();

    try {
      // Restore lot quantities from old items
      const oldItems = editingSlip.usage_slip_items || [];
      for (const oldItem of oldItems) {
        if (oldItem.lot_id) {
          const { data: lot } = await supabase.from('lots').select('*').eq('id', oldItem.lot_id).maybeSingle();
          if (lot) {
            const restoredQty = (lot as Lot).quantity + oldItem.quantity_used;
            const restoredStatus = restoredQty > 0 ? 'active' : 'depleted';
            await supabase.from('lots').update({
              quantity: restoredQty,
              status: restoredStatus,
              updated_at: new Date().toISOString(),
            }).eq('id', oldItem.lot_id);
          }
        }
        // Delete old stock movements for this slip
        await supabase.from('stock_movements').delete().eq('reference', editingSlip.slip_number);
      }

      // Delete old slip items
      await supabase.from('usage_slip_items').delete().eq('slip_id', editingSlip.id);

      // Insert new items and decrement lots
      const validItems = editItems.filter((i) => i.lot_id && parseFloat(i.quantity) > 0);
      for (const item of validItems) {
        const lot = lots.find((l) => l.id === item.lot_id);
        if (!lot) continue;
        const qty = parseFloat(item.quantity);

        await supabase.from('usage_slip_items').insert({
          slip_id: editingSlip.id,
          lot_id: item.lot_id,
          chemical_name: item.chemical_name,
          quantity_used: qty,
          unit: item.unit,
        });

        const newQty = lot.quantity - qty;
        const newStatus = newQty <= 0 ? 'depleted' : 'active';
        await supabase.from('lots').update({ quantity: newQty, status: newStatus, updated_at: new Date().toISOString() }).eq('id', lot.id);

        await supabase.from('stock_movements').insert({
          movement_type: 'out',
          lot_id: lot.id,
          chemical_id: lot.chemical_id,
          quantity: -qty,
          unit: lot.unit,
          reference: editingSlip.slip_number,
          user_id: profile?.id,
          user_name: profile?.full_name || '',
          notes: `Phiếu sử dụng (đã sửa): ${editPurpose}`,
        });
      }

      // Update slip
      await supabase.from('usage_slips').update({
        purpose: editPurpose,
        updated_at: new Date().toISOString(),
      }).eq('id', editingSlip.id);

      toast({ title: 'Đã cập nhật phiếu', description: editingSlip.slip_number });
      setEditDialogOpen(false);
      setEditingSlip(null);
      await refreshSlips();
    } catch (err) {
      toast({ title: 'Lỗi cập nhật', description: err instanceof Error ? err.message : 'Đã có lỗi', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSubmitting(true);
    const supabase = getSupabase();

    try {
      // Restore lot quantities
      const oldItems = deleteTarget.usage_slip_items || [];
      for (const item of oldItems) {
        if (item.lot_id) {
          const { data: lot } = await supabase.from('lots').select('*').eq('id', item.lot_id).maybeSingle();
          if (lot) {
            const restoredQty = (lot as Lot).quantity + item.quantity_used;
            const restoredStatus = restoredQty > 0 ? 'active' : 'depleted';
            await supabase.from('lots').update({
              quantity: restoredQty,
              status: restoredStatus,
              updated_at: new Date().toISOString(),
            }).eq('id', item.lot_id);
          }
        }
      }

      // Delete stock movements
      await supabase.from('stock_movements').delete().eq('reference', deleteTarget.slip_number);
      // Delete slip items and slip (cascade handles items)
      await supabase.from('usage_slips').delete().eq('id', deleteTarget.id);

      toast({ title: 'Đã xóa phiếu', description: deleteTarget.slip_number });
      setDeleteTarget(null);
      await refreshSlips();
    } catch (err) {
      toast({ title: 'Lỗi xóa', description: err instanceof Error ? err.message : 'Đã có lỗi', variant: 'destructive' });
    } finally {
      setSubmitting(false);
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Phiếu sử dụng</h1>
          <p className="mt-1 text-sm text-muted-foreground">{slips.length} phiếu đã tạo</p>
        </div>
        <Button onClick={openNewSlip}>
          <Plus className="mr-2 h-4 w-4" />
          Tạo phiếu
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead>Số phiếu</TableHead>
                  <TableHead>Mục đích</TableHead>
                  <TableHead>Người tạo</TableHead>
                  <TableHead className="text-right">Số mặt hàng</TableHead>
                  <TableHead>Thời gian</TableHead>
                  <TableHead>Trạng thái</TableHead>
                  {canEdit && <TableHead className="text-right">Thao tác</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {slips.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canEdit ? 8 : 7} className="h-24 text-center text-muted-foreground">
                      Chưa có phiếu nào
                    </TableCell>
                  </TableRow>
                ) : (
                  slips.map((slip) => (
                    <Fragment key={slip.id}>
                      <TableRow className="group">
                        <TableCell className="p-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setExpandedSlip(expandedSlip === slip.id ? null : slip.id)}
                          >
                            {expandedSlip === slip.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </Button>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">{slip.slip_number}</Badge>
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate font-medium">{slip.purpose}</TableCell>
                        <TableCell className="text-sm">{slip.user_name || '—'}</TableCell>
                        <TableCell className="text-right">{slip.usage_slip_items?.length || 0}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDateTime(slip.created_at)}</TableCell>
                        <TableCell>
                          <Badge variant={slip.status === 'confirmed' ? 'default' : 'secondary'}>
                            {slip.status === 'confirmed' ? 'Đã xác nhận' : 'Nháp'}
                          </Badge>
                        </TableCell>
                        {canEdit && (
                          <TableCell>
                            <div className="flex items-center justify-end gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditSlip(slip)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteTarget(slip)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                      {expandedSlip === slip.id && (
                        <TableRow>
                          <TableCell colSpan={canEdit ? 8 : 7} className="bg-muted/30 p-4">
                            <div className="space-y-2">
                              <p className="text-sm font-medium">Chi tiết hóa chất:</p>
                              <div className="rounded-lg border bg-background">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Tên hóa chất</TableHead>
                                      <TableHead className="text-right">Số lượng</TableHead>
                                      <TableHead>Đơn vị</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {(slip.usage_slip_items || []).map((item) => (
                                      <TableRow key={item.id}>
                                        <TableCell className="font-medium">{item.chemical_name}</TableCell>
                                        <TableCell className="text-right">{formatNumber(item.quantity_used)}</TableCell>
                                        <TableCell className="text-muted-foreground">{item.unit}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Tạo phiếu sử dụng</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Mục đích sử dụng *</Label>
              <Input
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                placeholder="VD: Thí nghiệm hóa hữu cơ, Pha chế dung dịch..."
              />
            </div>

            <div className="flex items-center gap-2 rounded-lg border bg-primary/5 p-3">
              <FlaskConical className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium text-primary">
                Hệ thống sẽ tự động tạo hồ sơ pha chế khi xác nhận phiếu
              </span>
            </div>

            <div className="space-y-2">
              <Label>Danh sách hóa chất</Label>
              {items.map((item, idx) => (
                <div key={idx} className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    {idx === 0 && <Label className="text-xs">Hóa chất / Lô</Label>}
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant={item.is_prepared ? 'outline' : 'secondary'}
                        size="sm"
                        className="h-9 text-xs"
                        onClick={() => updateRow(idx, 'is_prepared', 'false')}
                      >
                        Hóa chất gốc
                      </Button>
                      <Button
                        type="button"
                        variant={item.is_prepared ? 'secondary' : 'outline'}
                        size="sm"
                        className="h-9 text-xs"
                        onClick={() => updateRow(idx, 'is_prepared', 'true')}
                      >
                        Đã pha
                      </Button>
                    </div>
                    {item.is_prepared ? (
                      <Select value={item.prepared_solution_id} onValueChange={(v) => updateRow(idx, 'prepared_solution_id', v)}>
                        <SelectTrigger><SelectValue placeholder="Chọn dung dịch đã pha" /></SelectTrigger>
                        <SelectContent>
                          {preparedSolutions
                            .filter((s) => s.remaining_volume > 0 && (!s.expiry_date || new Date(s.expiry_date) >= new Date()))
                            .map((s) => (
                              <SelectItem key={s.id} value={s.id}>
                                {s.solution_name} - {s.batch_code} ({formatNumber(s.remaining_volume)} {s.unit})
                              </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Select value={item.lot_id} onValueChange={(v) => updateRow(idx, 'lot_id', v)}>
                        <SelectTrigger><SelectValue placeholder="Chọn lô" /></SelectTrigger>
                        <SelectContent>
                          {lots.map((l) => {
                            const chem = chemicals[l.chemical_id];
                            return (
                              <SelectItem key={l.id} value={l.id}>
                                {chem?.name} - Lô {l.lot_number} ({formatNumber(l.quantity)} {l.unit})
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div className="w-28 space-y-1">
                    {idx === 0 && <Label className="text-xs">Số lượng</Label>}
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      value={item.quantity}
                      onChange={(e) => updateRow(idx, 'quantity', e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => removeRow(idx)} disabled={items.length === 1}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addRow}>
                <Plus className="mr-2 h-4 w-4" />
                Thêm hóa chất
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Hủy</Button>
            <Button onClick={handleCreate} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Check className="mr-2 h-4 w-4" />
              Xác nhận phiếu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Sửa phiếu {editingSlip?.slip_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Mục đích sử dụng *</Label>
              <Input
                value={editPurpose}
                onChange={(e) => setEditPurpose(e.target.value)}
                placeholder="VD: Thí nghiệm hóa hữu cơ..."
              />
            </div>

            <div className="space-y-2">
              <Label>Danh sách hóa chất</Label>
              {editItems.map((item, idx) => (
                <div key={idx} className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    {idx === 0 && <Label className="text-xs">Hóa chất / Lô</Label>}
                    <Select value={item.lot_id} onValueChange={(v) => updateEditRow(idx, 'lot_id', v)}>
                      <SelectTrigger><SelectValue placeholder="Chọn lô" /></SelectTrigger>
                      <SelectContent>
                        {lots.map((l) => {
                          const chem = chemicals[l.chemical_id];
                          return (
                            <SelectItem key={l.id} value={l.id}>
                              {chem?.name} - Lô {l.lot_number} ({formatNumber(l.quantity)} {l.unit})
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-28 space-y-1">
                    {idx === 0 && <Label className="text-xs">Số lượng</Label>}
                    <Input
                      type="number"
                      step="any"
                      min="0"
                      value={item.quantity}
                      onChange={(e) => updateEditRow(idx, 'quantity', e.target.value)}
                      placeholder="0"
                    />
                  </div>
                  <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => removeEditRow(idx)} disabled={editItems.length === 1}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addEditRow}>
                <Plus className="mr-2 h-4 w-4" />
                Thêm hóa chất
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Hủy</Button>
            <Button onClick={handleEditSave} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Lưu thay đổi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa phiếu sử dụng?</AlertDialogTitle>
            <AlertDialogDescription>
              Hành động này sẽ xóa phiếu "{deleteTarget?.slip_number}" và hoàn trả số lượng hóa chất về lô tương ứng.
              Không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={submitting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Xóa phiếu
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
