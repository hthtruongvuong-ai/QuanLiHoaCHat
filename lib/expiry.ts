export type ExpiryLevel = 'safe' | 'warn30' | 'warn15' | 'warn7' | 'expired' | 'none';

export interface ExpiryInfo {
  level: ExpiryLevel;
  daysLeft: number | null;
  label: string;
  color: string;
  badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline';
}

export function getExpiryInfo(expiryDate: string | null): ExpiryInfo {
  if (!expiryDate) {
    return {
      level: 'none',
      daysLeft: null,
      label: 'Không có HSD',
      color: 'text-muted-foreground',
      badgeVariant: 'secondary',
    };
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);

  const diffMs = expiry.getTime() - now.getTime();
  const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (daysLeft < 0) {
    return {
      level: 'expired',
      daysLeft,
      label: 'Đã hết hạn',
      color: 'text-red-600',
      badgeVariant: 'destructive',
    };
  }
  if (daysLeft <= 7) {
    return {
      level: 'warn7',
      daysLeft,
      label: `${daysLeft} ngày`,
      color: 'text-red-600',
      badgeVariant: 'destructive',
    };
  }
  if (daysLeft <= 15) {
    return {
      level: 'warn15',
      daysLeft,
      label: `${daysLeft} ngày`,
      color: 'text-orange-600',
      badgeVariant: 'destructive',
    };
  }
  if (daysLeft <= 30) {
    return {
      level: 'warn30',
      daysLeft,
      label: `${daysLeft} ngày`,
      color: 'text-amber-600',
      badgeVariant: 'default',
    };
  }

  return {
    level: 'safe',
    daysLeft,
    label: `${daysLeft} ngày`,
    color: 'text-emerald-600',
    badgeVariant: 'secondary',
  };
}

export function formatDate(date: string | null): string {
  if (!date) return '—';
  const d = new Date(date);
  return d.toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function formatDateTime(date: string | null): string {
  if (!date) return '—';
  const d = new Date(date);
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('vi-VN', {
    maximumFractionDigits: 2,
  }).format(value);
}
