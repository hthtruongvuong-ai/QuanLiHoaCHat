'use client';

import { Badge } from '@/components/ui/badge';
import { getExpiryInfo } from '@/lib/expiry';

interface ExpiryBadgeProps {
  expiryDate: string | null;
  showLabel?: boolean;
}

export function ExpiryBadge({ expiryDate, showLabel = true }: ExpiryBadgeProps) {
  const info = getExpiryInfo(expiryDate);

  if (info.level === 'none') {
    return <span className="text-sm text-muted-foreground">—</span>;
  }

  if (info.level === 'safe') {
    return (
      <span className="text-sm text-emerald-600">
        {showLabel ? info.label : ''}
      </span>
    );
  }

  return (
    <Badge variant={info.badgeVariant} className="whitespace-nowrap">
      {info.label}
    </Badge>
  );
}
