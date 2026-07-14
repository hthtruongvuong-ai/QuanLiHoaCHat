'use client';

import { useEffect, useState, useRef } from 'react';
import { Upload, Download, FileText, Loader2, Trash2, ShieldAlert, HardHat, Droplet, Thermometer, HeartPulse, AlertTriangle, History } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getSupabase } from '@/lib/supabase/singleton';
import { useAuth } from '@/lib/auth-context';
import { canManageStock } from '@/lib/roles';
import { formatDate } from '@/lib/expiry';
import type { ChemicalSafetyDoc, ChemicalSafetyInfo } from '@/lib/types';

const GHS_PICTOGRAMS: Record<string, { label: string; emoji: string }> = {
  GHS01: { label: 'Chất nổ', emoji: '💥' },
  GHS02: { label: 'Dễ cháy', emoji: '🔥' },
  GHS03: { label: 'Chất oxy hóa', emoji: '⚪' },
  GHS04: { label: 'Khí nén', emoji: '🔋' },
  GHS05: { label: 'Ăn mòn', emoji: '🧪' },
  GHS06: { label: 'Độc tính cấp', emoji: '☠️' },
  GHS07: { label: 'Kích ứng', emoji: '⚠️' },
  GHS08: { label: 'Nguy hại sức khỏe', emoji: '🩺' },
  GHS09: { label: 'Nguy hại môi trường', emoji: '🌍' },
};

interface SafetyTabProps {
  chemicalId: string;
  canEdit: boolean;
}

export function SafetyTab({ chemicalId, canEdit }: SafetyTabProps) {
  const { profile } = useAuth();
  const [docs, setDocs] = useState<ChemicalSafetyDoc[]>([]);
  const [safetyInfo, setSafetyInfo] = useState<ChemicalSafetyInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [savingInfo, setSavingInfo] = useState(false);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [infoForm, setInfoForm] = useState({
    ghs_classification: '',
    ghs_symbols: '',
    storage_conditions: '',
    ppe: '',
    spill_handling: '',
    first_aid: '',
  });

  useEffect(() => {
    async function loadData() {
      const supabase = getSupabase();
      const [{ data: docData }, { data: infoData }] = await Promise.all([
        supabase.from('chemical_safety_docs').select('*').eq('chemical_id', chemicalId).order('created_at', { ascending: false }),
        supabase.from('chemical_safety_info').select('*').eq('chemical_id', chemicalId).maybeSingle(),
      ]);
      setDocs((docData || []) as ChemicalSafetyDoc[]);
      const info = (infoData || null) as ChemicalSafetyInfo | null;
      setSafetyInfo(info);
      if (info) {
        setInfoForm({
          ghs_classification: info.ghs_classification || '',
          ghs_symbols: info.ghs_symbols || '',
          storage_conditions: info.storage_conditions || '',
          ppe: info.ppe || '',
          spill_handling: info.spill_handling || '',
          first_aid: info.first_aid || '',
        });
      }
      setLoading(false);
    }
    loadData();
  }, [chemicalId]);

  const handleUpload = async (docType: string, file: File) => {
    setUploadingType(docType);
    const supabase = getSupabase();
    const fileExt = file.name.split('.').pop();
    const fileName = `${chemicalId}_${docType}_${Date.now()}.${fileExt}`;
    const filePath = `${chemicalId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('safety_docs')
      .upload(filePath, file, { cacheControl: '3600', upsert: true });

    if (uploadError) {
      setUploadingType(null);
      return;
    }

    const { data: urlData } = supabase.storage.from('safety_docs').getPublicUrl(filePath);

    const { data: newDoc } = await supabase
      .from('chemical_safety_docs')
      .insert({
        chemical_id: chemicalId,
        doc_type: docType,
        doc_name: file.name,
        doc_url: urlData.publicUrl,
        uploaded_by: profile?.full_name || '',
        version: 1,
      })
      .select()
      .single();

    if (newDoc) {
      setDocs([newDoc as ChemicalSafetyDoc, ...docs]);
    }
    setUploadingType(null);
  };

  const handleDeleteDoc = async (docId: string) => {
    const supabase = getSupabase();
    await supabase.from('chemical_safety_docs').delete().eq('id', docId);
    setDocs(docs.filter((d) => d.id !== docId));
  };

  const handleSaveInfo = async () => {
    setSavingInfo(true);
    const supabase = getSupabase();
    if (safetyInfo) {
      const { data } = await supabase
        .from('chemical_safety_info')
        .update({ ...infoForm, updated_at: new Date().toISOString() })
        .eq('id', safetyInfo.id)
        .select()
        .single();
      if (data) setSafetyInfo(data as ChemicalSafetyInfo);
    } else {
      const { data } = await supabase
        .from('chemical_safety_info')
        .insert({ chemical_id: chemicalId, ...infoForm })
        .select()
        .single();
      if (data) setSafetyInfo(data as ChemicalSafetyInfo);
    }
    setSavingInfo(false);
  };

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  const sdsDocs = docs.filter((d) => d.doc_type === 'sds');
  const coaDocs = docs.filter((d) => d.doc_type === 'coa');
  const otherDocs = docs.filter((d) => d.doc_type === 'other');
  const ghsSymbols = infoForm.ghs_symbols.split(',').map((s) => s.trim()).filter(Boolean);

  return (
    <div className="space-y-6">
      {/* GHS Classification */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldAlert className="h-5 w-5 text-orange-600" />
            Phân loại nguy hiểm GHS
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {ghsSymbols.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {ghsSymbols.map((sym) => {
                const ghs = GHS_PICTOGRAMS[sym];
                if (!ghs) return null;
                return (
                  <div key={sym} className="flex flex-col items-center gap-1 rounded-lg border p-3">
                    <span className="text-3xl">{ghs.emoji}</span>
                    <span className="text-xs font-medium">{sym}</span>
                    <span className="text-xs text-muted-foreground">{ghs.label}</span>
                  </div>
                );
              })}
            </div>
          )}
          {canEdit && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Mã GHS (phân cách bằng dấu phẩy)</Label>
                  <Input
                    value={infoForm.ghs_symbols}
                    onChange={(e) => setInfoForm({ ...infoForm, ghs_symbols: e.target.value })}
                    placeholder="VD: GHS02,GHS07,GHS08"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Phân loại nguy hiểm</Label>
                  <Input
                    value={infoForm.ghs_classification}
                    onChange={(e) => setInfoForm({ ...infoForm, ghs_classification: e.target.value })}
                    placeholder="VD: Cháy, Kích ứng, Độc hại"
                  />
                </div>
              </div>
            </>
          )}
          {!canEdit && safetyInfo && (
            <p className="text-sm">{safetyInfo.ghs_classification || 'Chưa có thông tin'}</p>
          )}
        </CardContent>
      </Card>

      {/* Safety info grid */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Thermometer className="h-4 w-4 text-blue-600" />
              Điều kiện bảo quản
            </CardTitle>
          </CardHeader>
          <CardContent>
            {canEdit ? (
              <Textarea
                value={infoForm.storage_conditions}
                onChange={(e) => setInfoForm({ ...infoForm, storage_conditions: e.target.value })}
                placeholder="VD: Nơi khô ráo, tránh ánh nắng, 2-8°C..."
                rows={3}
              />
            ) : (
              <p className="text-sm">{safetyInfo?.storage_conditions || '—'}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <HardHat className="h-4 w-4 text-emerald-600" />
              Trang bị bảo hộ (PPE)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {canEdit ? (
              <Textarea
                value={infoForm.ppe}
                onChange={(e) => setInfoForm({ ...infoForm, ppe: e.target.value })}
                placeholder="VD: Găng tay nitrile, kính bảo hộ, tạp đề..."
                rows={3}
              />
            ) : (
              <p className="text-sm">{safetyInfo?.ppe || '—'}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Droplet className="h-4 w-4 text-cyan-600" />
              Hướng dẫn xử lý khi tràn đổ
            </CardTitle>
          </CardHeader>
          <CardContent>
            {canEdit ? (
              <Textarea
                value={infoForm.spill_handling}
                onChange={(e) => setInfoForm({ ...infoForm, spill_handling: e.target.value })}
                placeholder="VD: Dùng vải thấm hút, không đổ trực tiếp vào cống..."
                rows={3}
              />
            ) : (
              <p className="text-sm">{safetyInfo?.spill_handling || '—'}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <HeartPulse className="h-4 w-4 text-red-600" />
              Sơ cứu
            </CardTitle>
          </CardHeader>
          <CardContent>
            {canEdit ? (
              <Textarea
                value={infoForm.first_aid}
                onChange={(e) => setInfoForm({ ...infoForm, first_aid: e.target.value })}
                placeholder="VD: Rửa bằng nước sạch ít nhất 15 phút..."
                rows={3}
              />
            ) : (
              <p className="text-sm">{safetyInfo?.first_aid || '—'}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {canEdit && (
        <Button onClick={handleSaveInfo} disabled={savingInfo}>
          {savingInfo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Lưu thông tin an toàn
        </Button>
      )}

      {/* SDS Documents */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5 text-primary" />
            SDS (Safety Data Sheet)
          </CardTitle>
          {canEdit && (
            <Button size="sm" variant="outline" disabled={uploadingType === 'sds'} onClick={() => fileInputRefs.current['sds']?.click()}>
              {uploadingType === 'sds' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Tải lên SDS
            </Button>
          )}
          <input
            ref={(el) => { fileInputRefs.current['sds'] = el; }}
            type="file"
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload('sds', file);
              e.target.value = '';
            }}
          />
        </CardHeader>
        <CardContent>
          {sdsDocs.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Chưa có tài liệu SDS</p>
          ) : (
            <DocTable docs={sdsDocs} canEdit={canEdit} onDelete={handleDeleteDoc} />
          )}
        </CardContent>
      </Card>

      {/* COA Documents */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5 text-emerald-600" />
            COA (Certificate of Analysis)
          </CardTitle>
          {canEdit && (
            <Button size="sm" variant="outline" disabled={uploadingType === 'coa'} onClick={() => fileInputRefs.current['coa']?.click()}>
              {uploadingType === 'coa' ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Tải lên COA
            </Button>
          )}
          <input
            ref={(el) => { fileInputRefs.current['coa'] = el; }}
            type="file"
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload('coa', file);
              e.target.value = '';
            }}
          />
        </CardHeader>
        <CardContent>
          {coaDocs.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Chưa có tài liệu COA</p>
          ) : (
            <DocTable docs={coaDocs} canEdit={canEdit} onDelete={handleDeleteDoc} />
          )}
        </CardContent>
      </Card>

      {/* Other documents */}
      {otherDocs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-5 w-5 text-muted-foreground" />
              Tài liệu khác
            </CardTitle>
          </CardHeader>
          <CardContent>
            <DocTable docs={otherDocs} canEdit={canEdit} onDelete={handleDeleteDoc} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function DocTable({ docs, canEdit, onDelete }: { docs: ChemicalSafetyDoc[]; canEdit: boolean; onDelete: (id: string) => void }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tên tài liệu</TableHead>
            <TableHead>Phiên bản</TableHead>
            <TableHead>Người tải lên</TableHead>
            <TableHead>Ngày tải</TableHead>
            <TableHead>Hạn tài liệu</TableHead>
            <TableHead className="text-right">Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {docs.map((doc) => (
            <TableRow key={doc.id}>
              <TableCell className="font-medium">{doc.doc_name}</TableCell>
              <TableCell><Badge variant="outline">v{doc.version}</Badge></TableCell>
              <TableCell className="text-sm">{doc.uploaded_by || '—'}</TableCell>
              <TableCell className="text-sm text-muted-foreground">{formatDate(doc.created_at)}</TableCell>
              <TableCell className="text-sm">{formatDate(doc.doc_expiry)}</TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <a href={doc.doc_url} target="_blank" rel="noopener noreferrer">
                    <Button variant="ghost" size="sm" className="h-8 gap-1">
                      <Download className="h-4 w-4" />
                    </Button>
                  </a>
                  {canEdit && (
                    <Button variant="ghost" size="sm" className="h-8 text-destructive" onClick={() => onDelete(doc.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
