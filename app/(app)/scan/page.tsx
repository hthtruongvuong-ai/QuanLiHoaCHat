'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ScanLine, Camera, CameraOff, Keyboard, Loader2, AlertCircle, Search, SearchX } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { getSupabase } from '@/lib/supabase/singleton';

export default function ScanPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [lookingUp, setLookingUp] = useState(false);
  const [mode, setMode] = useState<'camera' | 'manual'>('camera');
  const [cameraSupported, setCameraSupported] = useState(true);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setScanning(false);
  }, []);

  const resolveCode = useCallback(async (raw: string) => {
    setLookingUp(true);
    setError(null);
    setNotFound(null);

    const code = raw.trim();
    if (!code) {
      setLookingUp(false);
      return;
    }

    const supabase = getSupabase();

    // Try by chemical code first (e.g. CHM-001)
    let { data } = await supabase
      .from('chemicals')
      .select('id')
      .eq('code', code)
      .maybeSingle();

    // Try by UUID id
    if (!data && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code)) {
      ({ data } = await supabase
        .from('chemicals')
        .select('id')
        .eq('id', code)
        .maybeSingle());
    }

    // Try by qr_token
    if (!data) {
      ({ data } = await supabase
        .from('chemicals')
        .select('id')
        .eq('qr_token', code)
        .maybeSingle());
    }

    if (data) {
      router.push(`/chemicals/${data.id}`);
    } else {
      setNotFound(code);
      setLookingUp(false);
    }
  }, [router]);

  const startCamera = useCallback(async () => {
    setError(null);
    setNotFound(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setScanning(true);
      startDetection();
    } catch {
      setCameraSupported(false);
      setError('Không thể truy cập camera. Vui lòng sử dụng nhập thủ công.');
      setMode('manual');
    }
  }, []);

  const startDetection = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const BarcodeDetector = (window as any).BarcodeDetector;
    if (!BarcodeDetector) {
      setError('Trình duyệt không hỗ trợ quét QR tự động. Vui lòng nhập mã thủ công.');
      setMode('manual');
      stopCamera();
      return;
    }

    let detector: any;
    try {
      detector = new BarcodeDetector({ formats: ['qr_code'] });
    } catch {
      setError('Trình duyệt không hỗ trợ quét QR. Vui lòng nhập mã thủ công.');
      setMode('manual');
      stopCamera();
      return;
    }

    let active = true;
    const detect = async () => {
      if (!active || !videoRef.current) return;
      try {
        const codes = await detector.detect(videoRef.current);
        if (codes && codes.length > 0) {
          const raw = codes[0].rawValue as string;
          if (raw) {
            active = false;
            stopCamera();
            resolveCode(raw);
            return;
          }
        }
      } catch {
        // ignore frame errors
      }
      requestAnimationFrame(detect);
    };
    detect();

    return () => { active = false; };
  }, [stopCamera, resolveCode]);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  useEffect(() => {
    if (mode === 'camera' && !scanning && cameraSupported) {
      startCamera();
    } else if (mode === 'manual') {
      stopCamera();
    }
  }, [mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (manualCode.trim()) {
      resolveCode(manualCode);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Quét mã QR</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Quét mã QR trên nhãn hóa chất để mở hồ sơ chi tiết
        </p>
      </div>

      <div className="flex gap-2">
        <Button
          variant={mode === 'camera' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setMode('camera')}
        >
          <Camera className="mr-2 h-4 w-4" />
          Quét bằng camera
        </Button>
        <Button
          variant={mode === 'manual' ? 'default' : 'outline'}
          size="sm"
          onClick={() => setMode('manual')}
        >
          <Keyboard className="mr-2 h-4 w-4" />
          Nhập mã thủ công
        </Button>
      </div>

      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex items-center gap-3 p-4">
            <AlertCircle className="h-5 w-5 shrink-0 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {notFound && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
              <SearchX className="h-7 w-7 text-destructive" />
            </div>
            <div>
              <p className="text-lg font-semibold text-destructive">Không tìm thấy hóa chất</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Mã hóa chất <span className="font-mono font-medium">{notFound}</span> không tồn tại trong hệ thống.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => { setNotFound(null); setMode('manual'); }}>
              Thử lại với mã khác
            </Button>
          </CardContent>
        </Card>
      )}

      {mode === 'camera' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <ScanLine className="h-5 w-5 text-primary" />
              Camera scanner
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-4">
            <div className="relative w-full max-w-md overflow-hidden rounded-xl border-2 bg-black">
              <video
                ref={videoRef}
                className="h-full w-full object-cover"
                playsInline
                muted
              />
              {!scanning && !lookingUp && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                  <Button onClick={startCamera}>
                    <Camera className="mr-2 h-4 w-4" />
                    Bật camera
                  </Button>
                </div>
              )}
              {lookingUp && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                  <div className="flex flex-col items-center gap-2 text-white">
                    <Loader2 className="h-8 w-8 animate-spin" />
                    <p className="text-sm">Đang tra cứu...</p>
                  </div>
                </div>
              )}
              {scanning && (
                <>
                  <div className="pointer-events-none absolute inset-0">
                    <div className="absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-xl border-2 border-white/70" />
                  </div>
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2">
                    <Button size="sm" variant="secondary" onClick={stopCamera}>
                      <CameraOff className="mr-2 h-4 w-4" />
                      Dừng
                    </Button>
                  </div>
                </>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Đặt mã QR trong khung để quét tự động
            </p>
          </CardContent>
        </Card>
      )}

      {mode === 'manual' && (
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Keyboard className="h-5 w-5 text-primary" />
              Nhập mã hóa chất
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Input
                  placeholder="Nhập mã hóa chất (VD: CHM-001)"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  disabled={lookingUp}
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Nhập mã hóa chất in trên nhãn chai
                </p>
              </div>
              <Button type="submit" className="w-full" disabled={lookingUp || !manualCode.trim()}>
                {lookingUp ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                Tra cứu
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card className="bg-muted/30">
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            <Badge variant="outline" className="mr-2">Lưu ý</Badge>
            Mã QR chỉ sử dụng được trong hệ thống. Bạn cần đăng nhập trước khi quét. Mã QR chứa mã hóa chất (VD: CHM-001), không chứa URL.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
