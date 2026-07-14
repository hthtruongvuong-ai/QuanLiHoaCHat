'use client';

import { Fragment, useEffect, useState, useMemo } from 'react';
import { FlaskConical, Plus, Loader2, Check, Trash2, X, Pencil, ChevronDown, ChevronRight, AlertCircle, CheckCircle2, Link2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { canManagePreparations, canEditAnySlip } from '@/lib/roles';
import type { Chemical, Lot, Preparation, PreparationItem, PreparationWithItems } from '@/lib/types';

interface FormItem {
  lot_id: string;
  chemical_id: string;
  chemical_name: string;
  quantity: string;
  unit: string;
  available: number;
}

export default function PreparationsPage() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const canEdit = profile ? canManagePreparations(profile.role) : false;
  const canDelete = profile ? canEditAnySlip(profile.role) : false;

  const [preparations, setPreparations] = useState<PreparationWithItems[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PreparationWithItems | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [expandedPrep, setExpandedPrep] = useState<string | null>(null);

  const [lots, setLots] = useState<Lot[]>([]);
  const [chemicals, setChemicals] = useState<Record<string, Chemical>>({});

  const [form, setForm] = useState({
    product_name: '',
    product_code: '',
    target_concentration: '',
    target_volume: '',
    unit: 'ml',
    procedure: '',
    notes: '',
  });
  const [items, setItems] = useState<FormItem[]>([]);

  const [editingPrep, setEditingPrep] = useState<PreparationWithItems | null>(null);
  const [editForm, setEditForm] = useState({
    product_name: '',
    product_code: '',
    target_concentration: '',
    target_volume: '',
    unit: 'ml',
    procedure: '',
    notes: '',
    result: 'pending' as 'success' | 'failed' | 'pending',
  });
  const [editItems, setEditItems] = useState<FormItem[]>([]);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [completingPrep, setCompletingPrep] = useState<PreparationWithItems | null>(null);
  const [completeForm, setCompleteForm] = useState({
    product_name: '',
    product_code: '',
    target_concentration: '',
    target_volume: '',
    unit: 'ml',
    procedure: '',
    notes: '',
    result: 'success' as 'success' | 'failed' | 'pending',
  });

  useEffect(() => {
    async function loadData() {
      const supabase = getSupabase();
      const [{ data: prepData }, { data: lotData }, { data: chemData }] = await Promise.all([
        supabase.from('preparations').select('*, preparation_items(*)').order('created_at', { ascending: false }),
        supabase.from('lots').select('*'),
        supabase.from('chemicals').select('*'),
      ]);
      setPreparations((prepData || []) as PreparationWithItems[]);

      const activeLots = (lotData || []).filter((l: Lot) => l.quantity > 0) as Lot[];
      setLots(activeLots);

      const chemMap: Record<string, Chemical> = {};
      (chemData || []).forEach((c: Chemical) => { chemMap[c.id] = c; });
      setChemicals(chemMap);
      setLoading(false);
    }
    loadData();
  }, []);

  // Auto-check: validate all items have sufficient stock
  const stockCheck = useMemo(() => {
    return items.map((item) => {
      if (!item.lot_id || !item.quantity) return { valid: true, message: '' };
      const qty = parseFloat(item.quantity) || 0;
      if (qty > item.available) {
        return { valid: false, message: `Chỉ còn ${formatNumber(item.available)} ${item.unit}` };
      }
      return { valid: true, message: 'Đủ hàng' };
    });
  }, [items]);

  const allValid = stockCheck.every((c) => c.valid);

  const openNewPrep = () => {
    setForm({
      product_name: '',
      product_code: '',
      target_concentration: '',
      target_volume: '',
      unit: 'ml',
      procedure: '',
      notes: '',
    });
    setItems([{ lot_id: '', chemical_id: '', chemical_name: '', quantity: '', unit: '', available: 0 }]);
    setDialogOpen(true);
  };

  const addRow = () => {
    setItems([...items, { lot_id: '', chemical_id: '', chemical_name: '', quantity: '', unit: '', available: 0 }]);
  };

  const removeRow = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  const updateRow = (idx: number, field: keyof FormItem, value: string) => {
    const updated = [...items];
    updated[idx] = { ...updated[idx], [field]: value };
    if (field === 'lot_id') {
      const lot = lots.find((l) => l.id === value);
      const chem = lot ? chemicals[lot.chemical_id] : null;
      updated[idx].chemical_id = lot?.chemical_id || '';
      updated[idx].chemical_name = chem?.name || '';
      updated[idx].unit = lot?.unit || '';
      updated[idx].available = lot?.quantity || 0;
    }
    setItems(updated);
  };

  const refreshPreps = async () => {
    const supabase = getSupabase();
    const { data: newPreps } = await supabase
      .from('preparations').select('*, preparation_items(*)').order('created_at', { ascending: false });
    setPreparations((newPreps || []) as PreparationWithItems[]);
    const { data: newLots } = await supabase.from('lots').select('*');
    const activeLots = (newLots || []).filter((l: Lot) => l.quantity > 0) as Lot[];
    setLots(activeLots);
  };

  const handleCreate = async () => {
    if (!form.product_name.trim()) {
      toast({ title: 'Vui lòng nhập tên sản phẩm', variant: 'destructive' });
      return;
    }
    const validItems = items.filter((i) => i.lot_id && parseFloat(i.quantity) > 0);
    if (validItems.length === 0) {
      toast({ title: 'Vui lòng thêm ít nhất một hóa chất', variant: 'destructive' });
      return;
    }

    // Auto-check stock availability
    for (let i = 0; i < validItems.length; i++) {
      const item = validItems[i];
      const qty = parseFloat(item.quantity);
      if (qty > item.available) {
        toast({
          title: 'Không đủ tồn kho',
          description: `${item.chemical_name}: cần ${formatNumber(qty)} ${item.unit}, chỉ còn ${formatNumber(item.available)} ${item.unit}`,
          variant: 'destructive',
        });
        return;
      }
    }

    setSubmitting(true);
    const supabase = getSupabase();

    try {
      const prepCount = await supabase.from('preparations').select('id', { count: 'exact', head: true });
      const year = new Date().getFullYear();
      const prepNumber = `PREP-${year}-${String((prepCount.count || 0) + 1).padStart(3, '0')}`;

      const { data: prep, error: prepError } = await supabase
        .from('preparations')
        .insert({
          prep_number: prepNumber,
          product_name: form.product_name,
          product_code: form.product_code,
          target_concentration: form.target_concentration,
          target_volume: parseFloat(form.target_volume) || 0,
          unit: form.unit,
          procedure: form.procedure,
          result: 'success',
          notes: form.notes,
          user_id: profile?.id,
          user_name: profile?.full_name || '',
          status: 'completed',
        })
        .select()
        .single();

      if (prepError) throw prepError;

      // Insert items and decrement lots
      for (const item of validItems) {
        const lot = lots.find((l) => l.id === item.lot_id)!;
        const qty = parseFloat(item.quantity);

        await supabase.from('preparation_items').insert({
          preparation_id: prep.id,
          lot_id: item.lot_id,
          chemical_id: item.chemical_id,
          chemical_name: item.chemical_name,
          quantity_used: qty,
          unit: item.unit,
        });

        const newQty = lot.quantity - qty;
        const newStatus = newQty <= 0 ? 'depleted' : 'active';
        await supabase.from('lots').update({
          quantity: newQty,
          status: newStatus,
          updated_at: new Date().toISOString(),
        }).eq('id', lot.id);

        await supabase.from('stock_movements').insert({
          movement_type: 'out',
          lot_id: lot.id,
          chemical_id: lot.chemical_id,
          quantity: -qty,
          unit: lot.unit,
          reference: prepNumber,
          user_id: profile?.id,
          user_name: profile?.full_name || '',
          notes: `Pha chế: ${form.product_name}`,
        });
      }

      // Auto-create a prepared_solution record
      const solCount = await supabase.from('prepared_solutions').select('id', { count: 'exact', head: true });
      const solNumber = `SOL-${year}-${String((solCount.count || 0) + 1).padStart(3, '0')}`;
      const prepDate = new Date();
      const shelfDays = 30;
      const expiryDate = new Date(prepDate);
      expiryDate.setDate(expiryDate.getDate() + shelfDays);

      await supabase.from('prepared_solutions').insert({
        preparation_id: prep.id,
        batch_code: solNumber,
        solution_name: form.product_name,
        concentration: form.target_concentration,
        initial_volume: parseFloat(form.target_volume) || 0,
        used_volume: 0,
        remaining_volume: parseFloat(form.target_volume) || 0,
        unit: form.unit,
        prepared_date: prepDate.toISOString().slice(0, 10),
        shelf_life_days: shelfDays,
        expiry_date: expiryDate.toISOString().slice(0, 10),
        usage_role: form.notes || '',
        prepared_by: profile?.full_name || '',
        status: 'in_use',
      });

      toast({ title: 'Đã ghi nhận hồ sơ pha chế', description: `${prepNumber} — Đã tạo hóa chất đã pha ${solNumber}` });
      setDialogOpen(false);
      await refreshPreps();
    } catch (err) {
      toast({ title: 'Lỗi tạo pha chế', description: err instanceof Error ? err.message : 'Đã có lỗi', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const openEditPrep = (prep: PreparationWithItems) => {
    setEditingPrep(prep);
    setEditForm({
      product_name: prep.product_name,
      product_code: prep.product_code,
      target_concentration: prep.target_concentration,
      target_volume: String(prep.target_volume),
      unit: prep.unit,
      procedure: prep.procedure,
      notes: prep.notes,
      result: prep.result,
    });
    const formItems: FormItem[] = (prep.preparation_items || []).map((item) => {
      const lot = lots.find((l) => l.id === item.lot_id);
      return {
        lot_id: item.lot_id || '',
        chemical_id: item.chemical_id || '',
        chemical_name: item.chemical_name,
        quantity: String(item.quantity_used),
        unit: item.unit,
        available: lot ? lot.quantity + item.quantity_used : 0, // current + what was taken
      };
    });
    if (formItems.length === 0) formItems.push({ lot_id: '', chemical_id: '', chemical_name: '', quantity: '', unit: '', available: 0 });
    setEditItems(formItems);
    setEditDialogOpen(true);
  };

  const updateEditRow = (idx: number, field: keyof FormItem, value: string) => {
    const updated = [...editItems];
    updated[idx] = { ...updated[idx], [field]: value };
    if (field === 'lot_id') {
      const lot = lots.find((l) => l.id === value);
      const chem = lot ? chemicals[lot.chemical_id] : null;
      updated[idx].chemical_id = lot?.chemical_id || '';
      updated[idx].chemical_name = chem?.name || '';
      updated[idx].unit = lot?.unit || '';
      updated[idx].available = lot?.quantity || 0;
    }
    setEditItems(updated);
  };

  const addEditRow = () => {
    setEditItems([...editItems, { lot_id: '', chemical_id: '', chemical_name: '', quantity: '', unit: '', available: 0 }]);
  };

  const removeEditRow = (idx: number) => {
    setEditItems(editItems.filter((_, i) => i !== idx));
  };

  const handleEditSave = async () => {
    if (!editingPrep || !editForm.product_name.trim()) {
      toast({ title: 'Vui lòng nhập tên sản phẩm', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    const supabase = getSupabase();

    try {
      // Restore lot quantities from old items
      const oldItems = editingPrep.preparation_items || [];
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
        await supabase.from('stock_movements').delete().eq('reference', editingPrep.prep_number);
      }

      // Delete old prep items
      await supabase.from('preparation_items').delete().eq('preparation_id', editingPrep.id);

      // Insert new items and decrement lots
      const validItems = editItems.filter((i) => i.lot_id && parseFloat(i.quantity) > 0);
      for (const item of validItems) {
        const lot = lots.find((l) => l.id === item.lot_id);
        if (!lot) continue;
        const qty = parseFloat(item.quantity);

        if (qty > lot.quantity) {
          toast({
            title: 'Không đủ tồn kho',
            description: `${item.chemical_name}: cần ${formatNumber(qty)}, chỉ còn ${formatNumber(lot.quantity)}`,
            variant: 'destructive',
          });
          setSubmitting(false);
          return;
        }

        await supabase.from('preparation_items').insert({
          preparation_id: editingPrep.id,
          lot_id: item.lot_id,
          chemical_id: item.chemical_id,
          chemical_name: item.chemical_name,
          quantity_used: qty,
          unit: item.unit,
        });

        const newQty = lot.quantity - qty;
        const newStatus = newQty <= 0 ? 'depleted' : 'active';
        await supabase.from('lots').update({
          quantity: newQty,
          status: newStatus,
          updated_at: new Date().toISOString(),
        }).eq('id', lot.id);

        await supabase.from('stock_movements').insert({
          movement_type: 'out',
          lot_id: lot.id,
          chemical_id: lot.chemical_id,
          quantity: -qty,
          unit: lot.unit,
          reference: editingPrep.prep_number,
          user_id: profile?.id,
          user_name: profile?.full_name || '',
          notes: `Pha chế (đã sửa): ${editForm.product_name}`,
        });
      }

      await supabase.from('preparations').update({
        product_name: editForm.product_name,
        product_code: editForm.product_code,
        target_concentration: editForm.target_concentration,
        target_volume: parseFloat(editForm.target_volume) || 0,
        unit: editForm.unit,
        procedure: editForm.procedure,
        result: editForm.result,
        notes: editForm.notes,
        updated_at: new Date().toISOString(),
      }).eq('id', editingPrep.id);

      toast({ title: 'Đã cập nhật hồ sơ pha chế', description: editingPrep.prep_number });
      setEditDialogOpen(false);
      setEditingPrep(null);
      await refreshPreps();
    } catch (err) {
      toast({ title: 'Lỗi cập nhật', description: err instanceof Error ? err.message : 'Đã có lỗi', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const openCompleteDraft = (prep: PreparationWithItems) => {
    setCompletingPrep(prep);
    setCompleteForm({
      product_name: prep.product_name || '',
      product_code: prep.product_code || '',
      target_concentration: prep.target_concentration || '',
      target_volume: String(prep.target_volume || ''),
      unit: prep.unit || 'ml',
      procedure: prep.procedure || '',
      notes: prep.notes || '',
      result: 'success',
    });
    setCompleteDialogOpen(true);
  };

  const handleCompleteDraft = async () => {
    if (!completingPrep || !completeForm.product_name.trim()) {
      toast({ title: 'Vui lòng nhập tên sản phẩm', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    const supabase = getSupabase();

    try {
      await supabase.from('preparations').update({
        product_name: completeForm.product_name,
        product_code: completeForm.product_code,
        target_concentration: completeForm.target_concentration,
        target_volume: parseFloat(completeForm.target_volume) || 0,
        unit: completeForm.unit,
        procedure: completeForm.procedure,
        result: completeForm.result,
        notes: completeForm.notes,
        status: 'completed',
        updated_at: new Date().toISOString(),
      }).eq('id', completingPrep.id);

      // Check if a prepared_solution already exists for this preparation
      const { data: existingSol } = await supabase
        .from('prepared_solutions')
        .select('id')
        .eq('preparation_id', completingPrep.id)
        .maybeSingle();

      if (!existingSol) {
        const solCount = await supabase.from('prepared_solutions').select('id', { count: 'exact', head: true });
        const year = new Date().getFullYear();
        const solNumber = `SOL-${year}-${String((solCount.count || 0) + 1).padStart(3, '0')}`;
        const prepDate = new Date();
        const shelfDays = 30;
        const expiryDate = new Date(prepDate);
        expiryDate.setDate(expiryDate.getDate() + shelfDays);

        await supabase.from('prepared_solutions').insert({
          preparation_id: completingPrep.id,
          batch_code: solNumber,
          solution_name: completeForm.product_name,
          concentration: completeForm.target_concentration,
          initial_volume: parseFloat(completeForm.target_volume) || 0,
          used_volume: 0,
          remaining_volume: parseFloat(completeForm.target_volume) || 0,
          unit: completeForm.unit,
          prepared_date: prepDate.toISOString().slice(0, 10),
          shelf_life_days: shelfDays,
          expiry_date: expiryDate.toISOString().slice(0, 10),
          usage_role: completeForm.notes || '',
          prepared_by: profile?.full_name || '',
          status: 'in_use',
        });
      }

      toast({ title: 'Đã hoàn thiện hồ sơ pha chế', description: completingPrep.prep_number });
      setCompleteDialogOpen(false);
      setCompletingPrep(null);
      await refreshPreps();
    } catch (err) {
      toast({ title: 'Lỗi', description: err instanceof Error ? err.message : 'Đã có lỗi', variant: 'destructive' });
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
      const oldItems = deleteTarget.preparation_items || [];
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

      await supabase.from('stock_movements').delete().eq('reference', deleteTarget.prep_number);
      await supabase.from('preparations').delete().eq('id', deleteTarget.id);

      toast({ title: 'Đã xóa hồ sơ pha chế', description: deleteTarget.prep_number });
      setDeleteTarget(null);
      await refreshPreps();
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

  const resultBadge = (result: string, status: string) => {
    if (status === 'draft') return <Badge className="bg-amber-100 text-amber-700 border-amber-200">Chờ hoàn thiện</Badge>;
    if (result === 'success') return <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Thành công</Badge>;
    if (result === 'failed') return <Badge variant="destructive">Thất bại</Badge>;
    return <Badge variant="secondary">Chờ</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Hồ sơ pha chế</h1>
          <p className="mt-1 text-sm text-muted-foreground">{preparations.length} hồ sơ pha chế</p>
        </div>
        {canEdit && (
          <Button onClick={openNewPrep}>
            <Plus className="mr-2 h-4 w-4" />
            Tạo hồ sơ
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead>Số hồ sơ</TableHead>
                  <TableHead>Sản phẩm</TableHead>
                  <TableHead>Nồng độ</TableHead>
                  <TableHead className="text-right">Thể tích</TableHead>
                  <TableHead>Người tạo</TableHead>
                  <TableHead>Thời gian</TableHead>
                  <TableHead>Kết quả</TableHead>
                  {(canEdit || canDelete) && <TableHead className="text-right">Thao tác</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {preparations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={(canEdit || canDelete) ? 9 : 8} className="h-24 text-center text-muted-foreground">
                      Chưa có hồ sơ pha chế nào
                    </TableCell>
                  </TableRow>
                ) : (
                  preparations.map((prep) => (
                    <Fragment key={prep.id}>
                      <TableRow className="group">
                        <TableCell className="p-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setExpandedPrep(expandedPrep === prep.id ? null : prep.id)}
                          >
                            {expandedPrep === prep.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </Button>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className="font-mono text-xs">{prep.prep_number}</Badge>
                            {prep.usage_slip_id && (
                              <Badge variant="secondary" className="text-xs gap-1">
                                <Link2 className="h-3 w-3" />
                                Phiếu
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{prep.product_name || <span className="text-muted-foreground italic">Chưa đặt tên</span>}</TableCell>
                        <TableCell className="text-muted-foreground">{prep.target_concentration || '—'}</TableCell>
                        <TableCell className="text-right">{formatNumber(prep.target_volume)} {prep.unit}</TableCell>
                        <TableCell className="text-sm">{prep.user_name || '—'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDateTime(prep.created_at)}</TableCell>
                        <TableCell>{resultBadge(prep.result, prep.status)}</TableCell>
                        {(canEdit || canDelete) && (
                          <TableCell>
                            <div className="flex items-center justify-end gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                              {prep.status === 'draft' && (
                                <Button variant="ghost" size="sm" className="h-8 gap-1 text-primary" onClick={() => openCompleteDraft(prep)}>
                                  <Check className="h-4 w-4" />
                                  Hoàn thiện
                                </Button>
                              )}
                              {canEdit && prep.status !== 'draft' && (
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditPrep(prep)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              )}
                              {canDelete && (
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteTarget(prep)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                      {expandedPrep === prep.id && (
                        <TableRow>
                          <TableCell colSpan={(canEdit || canDelete) ? 9 : 8} className="bg-muted/30 p-4">
                          <div className="space-y-3">
                            {prep.procedure && (
                              <div>
                                <p className="text-sm font-medium">Quy trình:</p>
                                <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">{prep.procedure}</p>
                              </div>
                            )}
                            {prep.notes && (
                              <div>
                                <p className="text-sm font-medium">Ghi chú:</p>
                                <p className="mt-1 text-sm text-muted-foreground">{prep.notes}</p>
                              </div>
                            )}
                            <div>
                              <p className="text-sm font-medium">Hóa chất sử dụng:</p>
                              <div className="mt-2 rounded-lg border bg-background">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Tên hóa chất</TableHead>
                                      <TableHead className="text-right">Số lượng</TableHead>
                                      <TableHead>Đơn vị</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {(prep.preparation_items || []).map((item) => (
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
            <DialogTitle>Tạo hồ sơ pha chế</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2">
                <Label>Tên sản phẩm *</Label>
                <Input
                  value={form.product_name}
                  onChange={(e) => setForm({ ...form, product_name: e.target.value })}
                  placeholder="VD: Dung dịch NaOH 0.1M"
                />
              </div>
              <div className="space-y-2">
                <Label>Mã sản phẩm</Label>
                <Input
                  value={form.product_code}
                  onChange={(e) => setForm({ ...form, product_code: e.target.value })}
                  placeholder="VD: SOL-001"
                />
              </div>
              <div className="space-y-2">
                <Label>Nồng độ mục tiêu</Label>
                <Input
                  value={form.target_concentration}
                  onChange={(e) => setForm({ ...form, target_concentration: e.target.value })}
                  placeholder="VD: 0.1M, 10%"
                />
              </div>
              <div className="space-y-2">
                <Label>Thể tích</Label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  value={form.target_volume}
                  onChange={(e) => setForm({ ...form, target_volume: e.target.value })}
                  placeholder="0"
                />
              </div>
              <div className="space-y-2">
                <Label>Đơn vị</Label>
                <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ml">ml</SelectItem>
                    <SelectItem value="L">L</SelectItem>
                    <SelectItem value="g">g</SelectItem>
                    <SelectItem value="kg">kg</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Quy trình pha chế</Label>
                <Textarea
                  value={form.procedure}
                  onChange={(e) => setForm({ ...form, procedure: e.target.value })}
                  rows={2}
                  placeholder="Mô tả các bước pha chế..."
                />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Ghi chú</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={2}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Danh sách hóa chất sử dụng</Label>
              {items.map((item, idx) => (
                <div key={idx} className="flex items-end gap-2">
                  <div className="flex-1 space-y-1">
                    {idx === 0 && <Label className="text-xs">Hóa chất / Lô</Label>}
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
              {/* Auto stock check indicator */}
              {items.some((i) => i.lot_id && i.quantity) && (
                <div className="mt-2 space-y-1">
                  {stockCheck.map((check, idx) => {
                    if (!items[idx].lot_id || !items[idx].quantity) return null;
                    return (
                      <div key={idx} className={`flex items-center gap-2 text-xs ${check.valid ? 'text-emerald-600' : 'text-destructive'}`}>
                        {check.valid ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                        {items[idx].chemical_name}: {check.message}
                      </div>
                    );
                  })}
                </div>
              )}
              <Button variant="outline" size="sm" onClick={addRow}>
                <Plus className="mr-2 h-4 w-4" />
                Thêm hóa chất
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Hủy</Button>
            <Button onClick={handleCreate} disabled={submitting || !allValid}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Check className="mr-2 h-4 w-4" />
              Tạo hồ sơ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Sửa hồ sơ {editingPrep?.prep_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2">
                <Label>Tên sản phẩm *</Label>
                <Input
                  value={editForm.product_name}
                  onChange={(e) => setEditForm({ ...editForm, product_name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Mã sản phẩm</Label>
                <Input
                  value={editForm.product_code}
                  onChange={(e) => setEditForm({ ...editForm, product_code: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Nồng độ mục tiêu</Label>
                <Input
                  value={editForm.target_concentration}
                  onChange={(e) => setEditForm({ ...editForm, target_concentration: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Thể tích</Label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  value={editForm.target_volume}
                  onChange={(e) => setEditForm({ ...editForm, target_volume: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Đơn vị</Label>
                <Select value={editForm.unit} onValueChange={(v) => setEditForm({ ...editForm, unit: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ml">ml</SelectItem>
                    <SelectItem value="L">L</SelectItem>
                    <SelectItem value="g">g</SelectItem>
                    <SelectItem value="kg">kg</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Kết quả</Label>
                <Select value={editForm.result} onValueChange={(v) => setEditForm({ ...editForm, result: v as 'success' | 'failed' | 'pending' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="success">Thành công</SelectItem>
                    <SelectItem value="failed">Thất bại</SelectItem>
                    <SelectItem value="pending">Chờ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Quy trình pha chế</Label>
                <Textarea
                  value={editForm.procedure}
                  onChange={(e) => setEditForm({ ...editForm, procedure: e.target.value })}
                  rows={2}
                />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Ghi chú</Label>
                <Textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  rows={2}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Danh sách hóa chất sử dụng</Label>
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

      {/* Complete Draft Dialog */}
      <Dialog open={completeDialogOpen} onOpenChange={setCompleteDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Hoàn thiện hồ sơ pha chế {completingPrep?.prep_number}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {completingPrep?.preparation_items && completingPrep.preparation_items.length > 0 && (
              <div className="rounded-lg border bg-muted/50 p-3">
                <p className="text-sm font-medium mb-2">Hóa chất từ phiếu sử dụng:</p>
                <div className="space-y-1">
                  {completingPrep.preparation_items.map((item) => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <span>{item.chemical_name}</span>
                      <span className="font-medium">{formatNumber(item.quantity_used)} {item.unit}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 space-y-2">
                <Label>Tên sản phẩm *</Label>
                <Input
                  value={completeForm.product_name}
                  onChange={(e) => setCompleteForm({ ...completeForm, product_name: e.target.value })}
                  placeholder="VD: Dung dịch NaOH 0.1M"
                />
              </div>
              <div className="space-y-2">
                <Label>Mã sản phẩm</Label>
                <Input
                  value={completeForm.product_code}
                  onChange={(e) => setCompleteForm({ ...completeForm, product_code: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Nồng độ mục tiêu</Label>
                <Input
                  value={completeForm.target_concentration}
                  onChange={(e) => setCompleteForm({ ...completeForm, target_concentration: e.target.value })}
                  placeholder="VD: 0.1M, 10%"
                />
              </div>
              <div className="space-y-2">
                <Label>Thể tích</Label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  value={completeForm.target_volume}
                  onChange={(e) => setCompleteForm({ ...completeForm, target_volume: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Đơn vị</Label>
                <Select value={completeForm.unit} onValueChange={(v) => setCompleteForm({ ...completeForm, unit: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ml">ml</SelectItem>
                    <SelectItem value="L">L</SelectItem>
                    <SelectItem value="g">g</SelectItem>
                    <SelectItem value="kg">kg</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Kết quả</Label>
                <Select value={completeForm.result} onValueChange={(v) => setCompleteForm({ ...completeForm, result: v as 'success' | 'failed' | 'pending' })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="success">Thành công</SelectItem>
                    <SelectItem value="failed">Thất bại</SelectItem>
                    <SelectItem value="pending">Chờ</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Quy trình pha chế</Label>
                <Textarea
                  value={completeForm.procedure}
                  onChange={(e) => setCompleteForm({ ...completeForm, procedure: e.target.value })}
                  rows={2}
                />
              </div>
              <div className="col-span-2 space-y-2">
                <Label>Ghi chú</Label>
                <Textarea
                  value={completeForm.notes}
                  onChange={(e) => setCompleteForm({ ...completeForm, notes: e.target.value })}
                  rows={2}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleteDialogOpen(false)}>Hủy</Button>
            <Button onClick={handleCompleteDraft} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Check className="mr-2 h-4 w-4" />
              Hoàn thiện
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa hồ sơ pha chế?</AlertDialogTitle>
            <AlertDialogDescription>
              Hành động này sẽ xóa hồ sơ "{deleteTarget?.prep_number}" và hoàn trả số lượng hóa chất về lô tương ứng.
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
              Xóa
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
