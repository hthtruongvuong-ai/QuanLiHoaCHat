'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { Search, Plus, Pencil, QrCode, ArrowUpDown, Trash2, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { ChemicalForm } from '@/components/chemicals/chemical-form';
import { QRDialog } from '@/components/chemicals/qr-dialog';
import { getSupabase } from '@/lib/supabase/singleton';
import { useAuth } from '@/lib/auth-context';
import { canManageChemicals, canDeleteChemical } from '@/lib/roles';
import { formatNumber } from '@/lib/expiry';
import type { Chemical, Lot } from '@/lib/types';

const HAZARD_STYLES: Record<string, string> = {
  low: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-100 text-amber-700 border-amber-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  toxic: 'bg-red-100 text-red-700 border-red-200',
};

const HAZARD_LABELS: Record<string, string> = {
  low: 'Thấp',
  medium: 'TB',
  high: 'Cao',
  toxic: 'Độc',
};

type SortField = 'name' | 'code' | 'total_stock' | 'category';

export default function ChemicalsPage() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const canEdit = profile ? canManageChemicals(profile.role) : false;
  const canDelete = profile ? canDeleteChemical(profile.role) : false;

  const [chemicals, setChemicals] = useState<Chemical[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingChem, setEditingChem] = useState<Chemical | null>(null);
  const [qrChem, setQrChem] = useState<Chemical | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Chemical | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteBlockReason, setDeleteBlockReason] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      const supabase = getSupabase();
      const [{ data: chems }, { data: lotData }] = await Promise.all([
        supabase.from('chemicals').select('*').order('name'),
        supabase.from('lots').select('*').eq('status', 'active'),
      ]);
      setChemicals((chems || []) as Chemical[]);
      setLots((lotData || []) as Lot[]);
      setLoading(false);
    }
    loadData();
  }, []);

  const stockByChem = useMemo(() => {
    const map: Record<string, number> = {};
    lots.forEach((l) => {
      map[l.chemical_id] = (map[l.chemical_id] || 0) + l.quantity;
    });
    return map;
  }, [lots]);

  const filtered = useMemo(() => {
    let result = chemicals.filter((c) => {
      const q = search.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q) ||
        c.cas_number?.toLowerCase().includes(q) ||
        c.category?.toLowerCase().includes(q)
      );
    });

    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'total_stock') {
        cmp = (stockByChem[a.id] || 0) - (stockByChem[b.id] || 0);
      } else {
        cmp = String(a[sortField] || '').localeCompare(String(b[sortField] || ''));
      }
      return sortAsc ? cmp : -cmp;
    });

    return result;
  }, [chemicals, search, sortField, sortAsc, stockByChem]);

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const handleDeleteClick = async (chem: Chemical) => {
    setDeleteTarget(chem);
    setDeleteBlockReason(null);
    const supabase = getSupabase();
    const stock = stockByChem[chem.id] || 0;
    if (stock > 0) {
      setDeleteBlockReason(`Hóa chất còn tồn kho ${formatNumber(stock)} ${chem.unit}. Không thể xóa.`);
      return;
    }
    const [{ data: prepItems }, { data: slipItems }] = await Promise.all([
      supabase.from('preparation_items').select('id').eq('chemical_id', chem.id).limit(1),
      supabase.from('usage_slip_items').select('id,lot_id').eq('chemical_name', chem.name).limit(1),
    ]);
    if (prepItems && prepItems.length > 0) {
      setDeleteBlockReason('Hóa chất đang được sử dụng trong hồ sơ pha chế. Không thể xóa.');
      return;
    }
    if (slipItems && slipItems.length > 0) {
      setDeleteBlockReason('Hóa chất đang được sử dụng trong phiếu sử dụng. Không thể xóa.');
      return;
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const supabase = getSupabase();
    try {
      const { data: lots } = await supabase.from('lots').select('id').eq('chemical_id', deleteTarget.id);
      if (lots && lots.length > 0) {
        await supabase.from('lots').delete().eq('chemical_id', deleteTarget.id);
      }
      const { error } = await supabase.from('chemicals').delete().eq('id', deleteTarget.id);
      if (error) throw error;
      toast({ title: 'Đã xóa hóa chất', description: `${deleteTarget.code} — ${deleteTarget.name}` });
      setDeleteTarget(null);
      setChemicals(chemicals.filter((c) => c.id !== deleteTarget.id));
    } catch (err) {
      toast({ title: 'Lỗi xóa hóa chất', description: err instanceof Error ? err.message : 'Đã có lỗi', variant: 'destructive' });
    } finally {
      setDeleting(false);
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
          <h1 className="text-2xl font-bold tracking-tight">Hóa chất</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {chemicals.length} hóa chất trong kho
          </p>
        </div>
        {canEdit && (
          <Button
            onClick={() => { setEditingChem(null); setFormOpen(true); }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Thêm hóa chất
          </Button>
        )}
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Tìm theo tên, mã, số CAS, phân loại..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <button className="flex items-center gap-1 font-medium" onClick={() => toggleSort('code')}>
                      Mã <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead>
                    <button className="flex items-center gap-1 font-medium" onClick={() => toggleSort('name')}>
                      Tên <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead>Số CAS</TableHead>
                  <TableHead>
                    <button className="flex items-center gap-1 font-medium" onClick={() => toggleSort('category')}>
                      Phân loại <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead>Nguy hiểm</TableHead>
                  <TableHead className="text-right">
                    <button className="ml-auto flex items-center gap-1 font-medium" onClick={() => toggleSort('total_stock')}>
                      Tồn kho <ArrowUpDown className="h-3 w-3" />
                    </button>
                  </TableHead>
                  <TableHead className="text-right">Tối thiểu</TableHead>
                  <TableHead className="w-[100px] text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                      Không tìm thấy hóa chất
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((chem) => {
                    const stock = stockByChem[chem.id] || 0;
                    const lowStock = stock <= chem.min_stock;
                    return (
                      <TableRow key={chem.id} className="group">
                        <TableCell>
                          <Link href={`/chemicals/${chem.id}`} className="font-mono text-xs text-primary hover:underline">
                            {chem.code}
                          </Link>
                        </TableCell>
                        <TableCell>
                          <Link href={`/chemicals/${chem.id}`} className="font-medium hover:underline">
                            {chem.name}
                          </Link>
                          {chem.formula && (
                            <span className="ml-2 text-xs text-muted-foreground">{chem.formula}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{chem.cas_number || '—'}</TableCell>
                        <TableCell>
                          {chem.category && (
                            <Badge variant="outline" className="text-xs">{chem.category}</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${HAZARD_STYLES[chem.hazard_level]}`}>
                            {HAZARD_LABELS[chem.hazard_level]}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className={`font-semibold ${lowStock ? 'text-destructive' : ''}`}>
                            {formatNumber(stock)} {chem.unit}
                          </span>
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {formatNumber(chem.min_stock)} {chem.unit}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setQrChem(chem)}>
                              <QrCode className="h-4 w-4" />
                            </Button>
                            {canEdit && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => { setEditingChem(chem); setFormOpen(true); }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            )}
                            {canDelete && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                onClick={() => handleDeleteClick(chem)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
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

      <ChemicalForm chemical={editingChem} open={formOpen} onOpenChange={setFormOpen} />
      <QRDialog chemical={qrChem} open={!!qrChem} onOpenChange={(v) => { if (!v) setQrChem(null); }} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) { setDeleteTarget(null); setDeleteBlockReason(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa hóa chất?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteBlockReason ? (
                <span className="text-destructive">{deleteBlockReason}</span>
              ) : (
                <>
                  Hành động này sẽ xóa hóa chất <strong>{deleteTarget?.code} — {deleteTarget?.name}</strong> và toàn bộ lô hàng liên quan. Không thể hoàn tác.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Hủy</AlertDialogCancel>
            {!deleteBlockReason && (
              <AlertDialogAction
                onClick={handleDelete}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Xóa
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
