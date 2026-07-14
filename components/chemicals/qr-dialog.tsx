'use client';

import { QRCodeSVG } from 'qrcode.react';
import { Download, Printer } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { Chemical } from '@/lib/types';

interface QRDialogProps {
  chemical: Chemical | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QRDialog({ chemical, open, onOpenChange }: QRDialogProps) {
  if (!chemical) return null;

  const qrValue = JSON.stringify({
    code: chemical.code,
    name: chemical.name,
    cas: chemical.cas_number,
    formula: chemical.formula,
  });

  const handleDownload = () => {
    const svg = document.getElementById('qr-svg');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qr-${chemical.code}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const svg = document.getElementById('qr-svg');
    const svgData = svg ? new XMLSerializer().serializeToString(svg) : '';
    printWindow.document.write(`
      <html><head><title>QR - ${chemical.code}</title></head>
      <body style="display:flex;flex-direction:column;align-items:center;padding:40px;font-family:sans-serif">
        <h2>${chemical.name}</h2>
        <p style="color:#666">${chemical.code} | CAS: ${chemical.cas_number || '—'}</p>
        ${svgData}
      </body></html>
    `);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Mã QR - {chemical.code}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="rounded-xl border-2 p-4">
            <QRCodeSVG
              id="qr-svg"
              value={qrValue}
              size={200}
              level="M"
              includeMargin={false}
            />
          </div>
          <div className="text-center">
            <p className="font-semibold">{chemical.name}</p>
            <p className="text-sm text-muted-foreground">
              {chemical.code} · {chemical.formula || '—'}
            </p>
            <p className="text-xs text-muted-foreground">
              CAS: {chemical.cas_number || '—'}
            </p>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" />
            In
          </Button>
          <Button onClick={handleDownload}>
            <Download className="mr-2 h-4 w-4" />
            Tải SVG
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
