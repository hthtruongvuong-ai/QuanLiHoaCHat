'use client';

import { useEffect, useState } from 'react';
import { Shield, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/lib/auth-context';
import { ROLE_LABELS, ROLE_COLORS, canManageUsers } from '@/lib/roles';
import { getSupabase } from '@/lib/supabase/singleton';
import { formatDate } from '@/lib/expiry';
import type { Profile, UserRole } from '@/lib/types';

interface UserWithEmail extends Profile {
  email?: string;
}

export default function UsersPage() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [users, setUsers] = useState<UserWithEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [updating, setUpdating] = useState<string | null>(null);

  const isAdmin = profile ? canManageUsers(profile.role) : false;

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    async function loadData() {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        toast({ title: 'Lỗi tải dữ liệu', description: error.message, variant: 'destructive' });
      }
      setUsers((data || []) as UserWithEmail[]);
      setLoading(false);
    }
    loadData();
  }, [isAdmin, toast]);

  const filtered = users.filter((u) =>
    u.full_name.toLowerCase().includes(search.toLowerCase())
  );

  const handleRoleChange = async (userId: string, role: UserRole) => {
    setUpdating(userId);
    const supabase = getSupabase();
    const { error } = await supabase.from('profiles').update({ role }).eq('id', userId);
    if (error) {
      toast({ title: 'Lỗi', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Đã cập nhật vai trò' });
      setUsers(users.map((u) => (u.id === userId ? { ...u, role } : u)));
    }
    setUpdating(null);
  };

  if (!isAdmin) {
    return (
      <div className="flex h-96 flex-col items-center justify-center gap-3">
        <Shield className="h-12 w-12 text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">Bạn không có quyền truy cập trang này</p>
      </div>
    );
  }

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
        <h1 className="text-2xl font-bold tracking-tight">Người dùng</h1>
        <p className="mt-1 text-sm text-muted-foreground">{users.length} người dùng</p>
      </div>

      <Card>
        <CardContent className="p-4">
          <Input
            placeholder="Tìm theo tên..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mb-4"
          />
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Người dùng</TableHead>
                  <TableHead>Vai trò</TableHead>
                  <TableHead>Ngày tạo</TableHead>
                  <TableHead className="w-[180px]">Đổi vai trò</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((user) => {
                  const initials = (user.full_name || 'U')
                    .split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
                  return (
                    <TableRow key={user.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar>
                            <AvatarFallback className="bg-primary text-xs text-primary-foreground">
                              {initials}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{user.full_name || 'Chưa đặt tên'}</p>
                            <p className="text-xs text-muted-foreground font-mono">{user.id.slice(0, 8)}...</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${ROLE_COLORS[user.role]}`}>
                          {ROLE_LABELS[user.role]}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{formatDate(user.created_at)}</TableCell>
                      <TableCell>
                        <Select
                          value={user.role}
                          onValueChange={(v) => handleRoleChange(user.id, v as UserRole)}
                          disabled={updating === user.id || user.id === profile?.id}
                        >
                          <SelectTrigger className="h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="admin">Quản trị viên</SelectItem>
                            <SelectItem value="chemist">Hóa học viên</SelectItem>
                            <SelectItem value="technician">Kỹ thuật viên</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
