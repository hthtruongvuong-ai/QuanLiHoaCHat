'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  FlaskConical,
  LayoutDashboard,
  Beaker,
  FileText,
  PackagePlus,
  PackageMinus,
  Warehouse,
  BarChart3,
  Users,
  Settings,
  ClipboardList,
  FlaskRound,
  TrendingDown,
  Droplets,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { canManageUsers } from '@/lib/roles';
import type { UserRole } from '@/lib/types';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Tổng quan', icon: LayoutDashboard },
  { href: '/chemicals', label: 'Hóa chất', icon: Beaker },
  { href: '/preparations', label: 'Hồ sơ pha chế', icon: FlaskRound },
  { href: '/prepared-solutions', label: 'Hóa chất đã pha', icon: Droplets },
  { href: '/usage-slips', label: 'Phiếu sử dụng', icon: ClipboardList },
  { href: '/stock-in', label: 'Nhập kho', icon: PackagePlus },
  { href: '/stock-out', label: 'Xuất kho', icon: PackageMinus },
  { href: '/usage-stats', label: 'Thống kê sử dụng', icon: TrendingDown },
  { href: '/storage', label: 'Kho lưu trữ', icon: Warehouse },
  { href: '/reports', label: 'Báo cáo', icon: BarChart3 },
  { href: '/users', label: 'Người dùng', icon: Users, roles: ['admin'] },
  { href: '/settings', label: 'Cài đặt', icon: Settings },
];

export function SidebarContent() {
  const pathname = usePathname();
  const { profile } = useAuth();

  const items = NAV_ITEMS.filter(
    (item) => !item.roles || (profile && item.roles.includes(profile.role))
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center gap-3 border-b px-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
          <FlaskConical className="h-5 w-5 text-primary-foreground" />
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">Quản Lý Hóa Chất</p>
          <p className="truncate text-xs text-muted-foreground">Chemical Inventory</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto scrollbar-thin p-3">
        {items.map((item) => {
          const active =
            item.href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                active
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t p-3">
        <div className="rounded-lg bg-muted/50 px-3 py-2.5 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Phiên bản 1.0.0</p>
          <p>© 2024 Chemical Lab</p>
        </div>
      </div>
    </div>
  );
}
