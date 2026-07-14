'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Trash2, Plus, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { getSupabase } from '@/lib/supabase/singleton';
import type { Chemical, HazardLevel } from '@/lib/types';

interface ChemicalFormProps {
  chemical: Chemical | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChemicalForm({ chemical, open, onOpenChange }: ChemicalFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    name: chemical?.name || '',
    cas_number: chemical?.cas_number || '',
    formula: chemical?.formula || '',
    unit: chemical?.unit || 'g',
    min_stock: chemical?.min_stock?.toString() || '0',
    hazard_level: chemical?.hazard_level || 'low',
    category: chemical?.category || '',
    description: chemical?.description || '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const supabase = getSupabase();

    try {
      const payload = {
        name: form.name,
        cas_number: form.cas_number,
        formula: form.formula,
        unit: form.unit,
        min_stock: parseFloat(form.min_stock) || 0,
        hazard_level: form.hazard_level,
        category: form.category,
        description: form.description,
        updated_at: new Date().toISOString(),
      };

      if (chemical) {
        const { error } = await supabase
          .from('chemicals')
          .update(payload)
          .eq('id', chemical.id);
        if (error) throw error;
        toast({ title: 'Đã cập nhật hóa chất' });
      } else {
        const count = await supabase
          .from('chemicals')
          .select('id', { count: 'exact', head: true });
        const nextNum = (count.count || 0) + 1;
        const code = `CHM-${String(nextNum).padStart(3, '0')}`;
        const qr_token = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 6);
        const { error } = await supabase
          .from('chemicals')
          .insert({ ...payload, code, qr_token });
        if (error) throw error;
        toast({ title: 'Đã thêm hóa chất mới' });
      }

      onOpenChange(false);
      router.refresh();
    } catch (err) {
      toast({
        title: 'Lỗi',
        description: err instanceof Error ? err.message : 'Đã có lỗi',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!chemical) return;
    setLoading(true);
    const supabase = getSupabase();
    const { error } = await supabase.from('chemicals').delete().eq('id', chemical.id);
    if (error) {
      toast({ title: 'Lỗi xóa', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Đã xóa hóa chất' });
      onOpenChange(false);
      router.refresh();
    }
    setLoading(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{chemical ? 'Sửa hóa chất' : 'Thêm hóa chất mới'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-2">
              <Label htmlFor="name">Tên hóa chất *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cas">Số CAS</Label>
              <Input
                id="cas"
                value={form.cas_number}
                onChange={(e) => setForm({ ...form, cas_number: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="formula">Công thức</Label>
              <Input
                id="formula"
                value={form.formula}
                onChange={(e) => setForm({ ...form, formula: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="unit">Đơn vị</Label>
              <Select value={form.unit} onValueChange={(v) => setForm({ ...form, unit: v })}>
                <SelectTrigger id="unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="g">g</SelectItem>
                  <SelectItem value="kg">kg</SelectItem>
                  <SelectItem value="ml">ml</SelectItem>
                  <SelectItem value="L">L</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="min_stock">Tồn kho tối thiểu</Label>
              <Input
                id="min_stock"
                type="number"
                step="any"
                min="0"
                value={form.min_stock}
                onChange={(e) => setForm({ ...form, min_stock: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hazard">Mức nguy hiểm</Label>
              <Select value={form.hazard_level} onValueChange={(v) => setForm({ ...form, hazard_level: v as HazardLevel })}>
                <SelectTrigger id="hazard">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Thấp</SelectItem>
                  <SelectItem value="medium">Trung bình</SelectItem>
                  <SelectItem value="high">Cao</SelectItem>
                  <SelectItem value="toxic">Độc hại</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="category">Phân loại</Label>
              <Input
                id="category"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                placeholder="axit, bazo, dung môi..."
              />
            </div>
            <div className="col-span-2 space-y-2">
              <Label htmlFor="desc">Mô tả</Label>
              <Textarea
                id="desc"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            {chemical && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={loading}
                className="mr-auto"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Xóa
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {chemical ? 'Lưu' : 'Thêm'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
