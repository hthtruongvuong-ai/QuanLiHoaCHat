'use client';

import { useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Download, Printer, FileImage, Loader2, ExternalLink } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { Chemical } from '@/lib/types';
import { buildQrUrl } from '@/lib/qr';

interface QRDialogProps {
  chemical: Chemical | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QRDialog({ chemical, open, onOpenChange }: QRDialogProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [downloading, setDownloading] = useState(false);

  if (!chemical) return null;

  const token = chemical.qr_token || chemical.id;
  const qrValue = buildQrUrl(token);

  const svgToPngDataUrl = (size: number): Promise<string> => {
    return new Promise((resolve, reject) => {
      const svg = svgRef.current;
      if (!svg) return reject(new Error('SVG not found'));
      const svgData = new XMLSerializer().serializeToString(svg);
      const img = new Image();
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(svgBlob);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas not supported'));
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img, 0, 0, size, size);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Image load failed'));
      };
      img.src = url;
    });
  };

  const handleDownloadPNG = async () => {
    setDownloading(true);
    try {
      const dataUrl = await svgToPngDataUrl(512);
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `QR-${chemical.code}.png`;
      a.click();
    } catch {
      // fallback: download SVG
      const svg = svgRef.current;
      if (svg) {
        const svgData = new XMLSerializer().serializeToString(svg);
        const blob = new Blob([svgData], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `QR-${chemical.code}.svg`;
        a.click();
        URL.revokeObjectURL(url);
      }
    }
    setDownloading(false);
  };

  const handlePrint = async () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    try {
      const pngDataUrl = await svgToPngDataUrl(400);
      printWindow.document.write(`
        <html><head><title>QR - ${chemical.code}</title>
        <style>
          @page { margin: 20px; }
          body { display:flex; flex-direction:column; align-items:center; padding:40px; font-family:system-ui,sans-serif; }
          .label { border:2px solid #333; border-radius:12px; padding:20px; text-align:center; max-width:300px; }
          h2 { margin:0 0 4px; font-size:18px; }
          p { margin:2px 0; color:#555; font-size:13px; }
          img { width:250px; height:250px; }
          .footer { margin-top:8px; font-size:11px; color:#999; }
        </style>
        </head>
        <body>
          <div class="label">
            <h2>${chemical.name}</h2>
            <p>${chemical.code} | CAS: ${chemical.cas_number || '—'}</p>
            <img src="${pngDataUrl}" />
            <div class="footer">Quét mã QR để xem thông tin hóa chất</div>
          </div>
        </body></html>
      `);
    } catch {
      const svg = svgRef.current;
      const svgData = svg ? new XMLSerializer().serializeToString(svg) : '';
      printWindow.document.write(`
        <html><head><title>QR - ${chemical.code}</title></head>
        <body style="display:flex;flex-direction:column;align-items:center;padding:40px;font-family:sans-serif">
          <h2>${chemical.name}</h2>
          <p style="color:#666">${chemical.code} | CAS: ${chemical.cas_number || '—'}</p>
          ${svgData}
        </body></html>
      `);
    }
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Mã QR - {chemical.code}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="rounded-xl border-2 bg-white p-4">
            <QRCodeSVG
              ref={svgRef as any}
              id="qr-svg"
              value={qrValue}
              size={200}
              level="M"
              includeMargin={false}
              bgColor="#ffffff"
              fgColor="#000000"
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
            <p className="mt-2 break-all rounded bg-muted px-2 py-1 text-[10px] font-mono text-muted-foreground">
              {qrValue}
            </p>
            {process.env.NEXT_PUBLIC_APP_URL && (
              <a
                href={qrValue}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" />
                Mở liên kết QR
              </a>
            )}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" />
            In
          </Button>
          <Button onClick={handleDownloadPNG} disabled={downloading}>
            {downloading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileImage className="mr-2 h-4 w-4" />}
            Tải PNG
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
