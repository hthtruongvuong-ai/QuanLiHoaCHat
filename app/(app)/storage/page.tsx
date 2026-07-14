'use client';

import { useEffect, useState } from 'react';
import { Warehouse, Plus, Pencil, Trash2, Loader2, MapPin } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth-context';
import { canManageChemicals } from '@/lib/roles';
import { getSupabase } from '@/lib/supabase/singleton';
import type { StorageLocation, Lot } from '@/lib/types';

export default function StoragePage() {
  const { profile } = useAuth();
  const canEdit = profile ? canManageChemicals(profile.role) : false;
  const { toast } = useToast();

  const [locations, setLocations] = useState<StorageLocation[]>([]);
  const [lots, setLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<StorageLocation | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({ name: '', building: '', room: '', description: '' });

  useEffect(() => {
    async function loadData() {
      const supabase = getSupabase();
      const [{ data: locs }, { data: lotData }] = await Promise.all([
        supabase.from('storage_locations').select('*').order('name'),
        supabase.from('lots').select('*'),
      ]);
      setLocations((locs || []) as StorageLocation[]);
      setLots((lotData || []) as Lot[]);
      setLoading(false);
    }
    loadData();
  }, []);

  const lotCountByLocation = (locId: string) => lots.filter((l) => l.storage_location_id === locId).length;

  const openNew = () => {
    setEditing(null);
    setForm({ name: '', building: '', room: '', description: '' });
    setDialogOpen(true);
  };

  const openEdit = (loc: StorageLocation) => {
    setEditing(loc);
    setForm({ name: loc.name, building: loc.building, room: loc.room, description: loc.description });
    setDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const supabase = getSupabase();
    try {
      if (editing) {
        const { error } = await supabase.from('storage_locations').update(form).eq('id', editing.id);
        if (error) throw error;
        toast({ title: 'Đã cập nhật vị trí' });
      } else {
        const { error } = await supabase.from('storage_locations').insert(form);
        if (error) throw error;
        toast({ title: 'Đã thêm vị trí' });
      }
      setDialogOpen(false);
      const { data } = await supabase.from('storage_locations').select('*').order('name');
      setLocations((data || []) as StorageLocation[]);
    } catch (err) {
      toast({ title: 'Lỗi', description: err instanceof Error ? err.message : 'Đã có lỗi', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    const supabase = getSupabase();
    const { error } = await supabase.from('storage_locations').delete().eq('id', id);
    if (error) {
      toast({ title: 'Lỗi xóa', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Đã xóa vị trí' });
      setLocations(locations.filter((l) => l.id !== id));
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
          <h1 className="text-2xl font-bold tracking-tight">Kho lưu trữ</h1>
          <p className="mt-1 text-sm text-muted-foreground">{locations.length} vị trí lưu trữ</p>
        </div>
        {canEdit && (
          <Button onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Thêm vị trí
          </Button>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {locations.map((loc) => (
          <Card key={loc.id} className="group transition-all hover:shadow-md">
            <CardContent className="p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                    <Warehouse className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{loc.name}</h3>
                    {loc.room && (
                      <p className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3" />
                        {loc.building} · {loc.room}
                      </p>
                    )}
                  </div>
                </div>
                {canEdit && (
                  <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(loc)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(loc.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </div>
              {loc.description && (
                <p className="mt-3 text-sm text-muted-foreground">{loc.description}</p>
              )}
              <div className="mt-4 flex items-center justify-between border-t pt-3">
                <Badge variant="secondary">{lotCountByLocation(loc.id)} lô</Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Sửa vị trí' : 'Thêm vị trí lưu trữ'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Tên *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tòa nhà</Label>
                <Input value={form.building} onChange={(e) => setForm({ ...form, building: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Phòng</Label>
                <Input value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Mô tả</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Hủy</Button>
              <Button type="submit" disabled={submitting}>
                {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editing ? 'Lưu' : 'Thêm'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
