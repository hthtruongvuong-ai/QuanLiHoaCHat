'use client';

import { useEffect, useState } from 'react';
import { PackageMinus, Loader2, History, Pencil, Trash2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth-context';
import { getSupabase } from '@/lib/supabase/singleton';
import { formatDateTime, formatNumber } from '@/lib/expiry';
import { ExpiryBadge } from '@/components/chemicals/expiry-badge';
import { canEditAnySlip } from '@/lib/roles';
import type { Chemical, Lot, StockMovement } from '@/lib/types';

export default function StockOutPage() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const canEdit = profile ? canEditAnySlip(profile.role) : false;
  const [lots, setLots] = useState<Lot[]>([]);
  const [chemicals, setChemicals] = useState<Record<string, Chemical>>({});
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editTarget, setEditTarget] = useState<StockMovement | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StockMovement | null>(null);
  const [editForm, setEditForm] = useState({ quantity: '', notes: '' });

  const [form, setForm] = useState({
    lot_id: '',
    quantity: '',
    notes: '',
  });

  useEffect(() => {
    async function loadData() {
      const supabase = getSupabase();
      const [{ data: lotData }, { data: chemData }, { data: moves }] = await Promise.all([
        supabase.from('lots').select('*').gt('quantity', 0).order('received_date'),
        supabase.from('chemicals').select('*'),
        supabase.from('stock_movements').select('*').eq('movement_type', 'out').order('created_at', { ascending: false }).limit(20),
      ]);

      const activeLots = (lotData || []).filter((l: Lot) => l.quantity > 0) as Lot[];
      setLots(activeLots);

      const chemMap: Record<string, Chemical> = {};
      (chemData || []).forEach((c: Chemical) => { chemMap[c.id] = c; });
      setChemicals(chemMap);
      setMovements((moves || []) as StockMovement[]);
      setLoading(false);
    }
    loadData();
  }, []);

  const selectedLot = lots.find((l) => l.id === form.lot_id);
  const selectedChem = selectedLot ? chemicals[selectedLot.chemical_id] : null;

  const refreshData = async () => {
    const supabase = getSupabase();
    const { data: newLots } = await supabase.from('lots').select('*').gt('quantity', 0).order('received_date');
    setLots((newLots || []) as Lot[]);
    const { data: newMoves } = await supabase.from('stock_movements').select('*').eq('movement_type', 'out').order('created_at', { ascending: false }).limit(20);
    setMovements((newMoves || []) as StockMovement[]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.lot_id || !form.quantity) {
      toast({ title: 'Vui lòng chọn lô và nhập số lượng', variant: 'destructive' });
      return;
    }
    const qty = parseFloat(form.quantity) || 0;
    if (selectedLot && qty > selectedLot.quantity) {
      toast({ title: 'Số lượng vượt quá tồn kho', description: `Tồn kho: ${selectedLot.quantity} ${selectedLot.unit}`, variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    const supabase = getSupabase();

    try {
      const newQty = selectedLot!.quantity - qty;
      const newStatus = newQty <= 0 ? 'depleted' : selectedLot!.status;

      const { error: lotError } = await supabase
        .from('lots')
        .update({ quantity: newQty, status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', form.lot_id);
      if (lotError) throw lotError;

      const { error: moveError } = await supabase.from('stock_movements').insert({
        movement_type: 'out',
        lot_id: form.lot_id,
        chemical_id: selectedLot!.chemical_id,
        quantity: -qty,
        unit: selectedLot!.unit,
        reference: selectedLot!.lot_number,
        user_id: profile?.id,
        user_name: profile?.full_name || '',
        notes: form.notes,
      });
      if (moveError) throw moveError;

      toast({ title: 'Xuất kho thành công', description: `${qty} ${selectedLot!.unit} đã xuất` });

      setForm({ lot_id: '', quantity: '', notes: '' });
      await refreshData();
    } catch (err) {
      toast({ title: 'Lỗi xuất kho', description: err instanceof Error ? err.message : 'Đã có lỗi', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const openEditMovement = (m: StockMovement) => {
    setEditTarget(m);
    setEditForm({ quantity: String(Math.abs(m.quantity)), notes: m.notes || '' });
  };

  const handleEditSave = async () => {
    if (!editTarget) return;
    setSubmitting(true);
    const supabase = getSupabase();

    try {
      const oldQty = Math.abs(editTarget.quantity);
      const newQty = parseFloat(editForm.quantity) || 0;
      const diff = newQty - oldQty;

      // Adjust lot quantity: if new > old, more was taken out, so subtract diff
      if (editTarget.lot_id) {
        const { data: lot } = await supabase.from('lots').select('*').eq('id', editTarget.lot_id).maybeSingle();
        if (lot) {
          const updatedLotQty = (lot as Lot).quantity - diff;
          if (updatedLotQty < 0) {
            toast({ title: 'Số lượng vượt tồn kho hiện tại', variant: 'destructive' });
            setSubmitting(false);
            return;
          }
          const newStatus = updatedLotQty <= 0 ? 'depleted' : 'active';
          await supabase.from('lots').update({
            quantity: updatedLotQty,
            status: newStatus,
            updated_at: new Date().toISOString(),
          }).eq('id', editTarget.lot_id);
        }
      }

      await supabase.from('stock_movements').update({
        quantity: -newQty,
        notes: editForm.notes,
      }).eq('id', editTarget.id);

      toast({ title: 'Đã cập nhật phiếu xuất' });
      setEditTarget(null);
      await refreshData();
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
      // Restore lot quantity
      if (deleteTarget.lot_id) {
        const restoreQty = Math.abs(deleteTarget.quantity);
        const { data: lot } = await supabase.from('lots').select('*').eq('id', deleteTarget.lot_id).maybeSingle();
        if (lot) {
          const updatedQty = (lot as Lot).quantity + restoreQty;
          const newStatus = updatedQty > 0 ? 'active' : 'depleted';
          await supabase.from('lots').update({
            quantity: updatedQty,
            status: newStatus,
            updated_at: new Date().toISOString(),
          }).eq('id', deleteTarget.lot_id);
        }
      }

      await supabase.from('stock_movements').delete().eq('id', deleteTarget.id);

      toast({ title: 'Đã xóa phiếu xuất' });
      setDeleteTarget(null);
      await refreshData();
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
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Xuất kho</h1>
        <p className="mt-1 text-sm text-muted-foreground">Xuất hóa chất khỏi kho</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <PackageMinus className="h-5 w-5 text-primary" />
              Phiếu xuất kho
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Chọn lô *</Label>
                <Select value={form.lot_id} onValueChange={(v) => setForm({ ...form, lot_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Chọn lô hóa chất" /></SelectTrigger>
                  <SelectContent>
                    {lots.map((l) => {
                      const chem = chemicals[l.chemical_id];
                      return (
                        <SelectItem key={l.id} value={l.id}>
                          {chem?.name || '—'} - Lô {l.lot_number} ({formatNumber(l.quantity)} {l.unit})
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              {selectedLot && selectedChem && (
                <div className="rounded-lg border bg-muted/50 p-3 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Hóa chất:</span><span className="font-medium">{selectedChem.name}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Tồn kho:</span><span className="font-bold">{formatNumber(selectedLot.quantity)} {selectedLot.unit}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Hạn sử dụng:</span><span><ExpiryBadge expiryDate={selectedLot.expiry_date} /></span></div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Số lượng xuất *</Label>
                <Input
                  type="number"
                  step="any"
                  min="0"
                  max={selectedLot?.quantity}
                  value={form.quantity}
                  onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                  required
                />
                {selectedLot && (
                  <p className="text-xs text-muted-foreground">Tối đa: {formatNumber(selectedLot.quantity)} {selectedLot.unit}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label>Lý do xuất</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  rows={3}
                  placeholder="Mô tả lý do xuất kho..."
                />
              </div>

              <Button type="submit" className="w-full" disabled={submitting || !form.lot_id}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Xuất kho
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <History className="h-5 w-5 text-muted-foreground" />
              Lịch sử xuất kho gần đây
            </CardTitle>
          </CardHeader>
          <CardContent>
            {movements.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Chưa có phiếu xuất nào</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tham chiếu</TableHead>
                      <TableHead className="text-right">Số lượng</TableHead>
                      <TableHead>Thời gian</TableHead>
                      <TableHead>Thực hiện</TableHead>
                      {canEdit && <TableHead className="text-right">Thao tác</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {movements.map((m) => (
                      <TableRow key={m.id} className="group">
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-xs">{m.reference}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium text-destructive">
                          {formatNumber(m.quantity)} {m.unit}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDateTime(m.created_at)}</TableCell>
                        <TableCell className="text-sm">{m.user_name || '—'}</TableCell>
                        {canEdit && (
                          <TableCell>
                            <div className="flex items-center justify-end gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditMovement(m)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteTarget(m)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editTarget} onOpenChange={(v) => { if (!v) setEditTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Sửa phiếu xuất {editTarget?.reference}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Số lượng xuất</Label>
              <Input
                type="number"
                step="any"
                min="0"
                value={editForm.quantity}
                onChange={(e) => setEditForm({ ...editForm, quantity: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Lý do xuất</Label>
              <Textarea
                value={editForm.notes}
                onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Hủy</Button>
            <Button onClick={handleEditSave} disabled={submitting}>
              {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa phiếu xuất?</AlertDialogTitle>
            <AlertDialogDescription>
              Hành động này sẽ xóa phiếu xuất "{deleteTarget?.reference}" và hoàn trả số lượng hóa chất về lô.
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
