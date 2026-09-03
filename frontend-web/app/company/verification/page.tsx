'use client';
import { useState, useEffect, useCallback } from 'react';
import { ShieldCheck, Upload, FileText, CheckCircle, AlertCircle, Clock, Loader2 } from 'lucide-react';
import {
  updateVerificationProfile, uploadTypedVerificationDocument, getMyVerificationDocuments,
  VerificationProfileUpdate, MyVerificationDocument, DocumentType,
} from '@/lib/adminApi';
import { getMyOrgVerification, OrgVerificationInfo } from '@/lib/realApi';

const DOC_TYPES: { value: DocumentType; label: string }[] = [
  { value: 'incorporation_certificate', label: 'Certificate of Incorporation' },
  { value: 'pan_card', label: 'PAN Card' },
  { value: 'gst_certificate', label: 'GST Certificate' },
  { value: 'msme_certificate', label: 'MSME Certificate' },
  { value: 'other', label: 'Other' },
];

const DOC_STATUS_COLOR: Record<string, string> = {
  pending: 'var(--accent-amber)', verified: 'var(--accent-emerald)', rejected: '#E06060',
};

function Input({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>{label}</label>
      <input className="input-field" value={value} placeholder={placeholder} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

export default function CompanyVerificationPage() {
  const [status, setStatus] = useState<OrgVerificationInfo | null>(null);
  const [profile, setProfile] = useState<VerificationProfileUpdate>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [docType, setDocType] = useState<DocumentType>('incorporation_certificate');
  const [docFile, setDocFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [documents, setDocuments] = useState<MyVerificationDocument[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [statusData, docs] = await Promise.all([getMyOrgVerification(), getMyVerificationDocuments()]);
      setStatus(statusData);
      setDocuments(docs);
    } catch { /* handled by company layout's own gate */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSaveProfile = async () => {
    setSaving(true);
    setSaveError('');
    try {
      await updateVerificationProfile(profile);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      setSaveError(e?.message || 'Could not save your profile.');
    }
    setSaving(false);
  };

  const handleUpload = async () => {
    if (!docFile) { setUploadError('Choose a file first.'); return; }
    setUploading(true);
    setUploadError('');
    try {
      await uploadTypedVerificationDocument(docFile, docType);
      setDocFile(null);
      await load();
    } catch (e: any) {
      setUploadError(e?.message || 'Could not upload this document.');
    }
    setUploading(false);
  };

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8, fontFamily: 'var(--font-serif)' }}>
          <ShieldCheck size={28} style={{ marginRight: 10, verticalAlign: 'middle', color: 'var(--accent-cyan)' }} />
          Company Verification
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 13, textTransform: 'uppercase' }}>
          Complete your profile and upload documents for admin review
        </p>
      </div>

      {status && (
        <div className="glass-card" style={{ padding: 16, marginBottom: 24, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className={status.status === 'approved' ? 'badge badge-emerald' : status.status === 'rejected' ? 'badge' : 'badge badge-amber'}>
            {status.status.replace('_', ' ')}
          </span>
          {status.rejection_reason && <span style={{ fontSize: 13, color: '#E06060' }}>{status.rejection_reason}</span>}
          {status.status === 'pending' && <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Awaiting admin review.</span>}
        </div>
      )}

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        {/* Identity + representative form */}
        <div className="glass-card" style={{ padding: 24, flex: '1 1 420px' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Company Identity</h3>
          <Input label="Legal Name" value={profile.legal_name ?? ''} onChange={v => setProfile(p => ({ ...p, legal_name: v }))} placeholder="As registered with the government" />
          <Input label="CIN (Corporate Identity Number)" value={profile.cin ?? ''} onChange={v => setProfile(p => ({ ...p, cin: v }))} />
          <Input label="PAN" value={profile.pan ?? ''} onChange={v => setProfile(p => ({ ...p, pan: v }))} />
          <Input label="Official Website" value={profile.official_website ?? ''} onChange={v => setProfile(p => ({ ...p, official_website: v }))} placeholder="https://" />
          <Input label="Industry" value={profile.industry ?? ''} onChange={v => setProfile(p => ({ ...p, industry: v }))} />

          <h3 style={{ fontSize: 16, fontWeight: 700, margin: '24px 0 20px' }}>Representative</h3>
          <Input label="Name" value={profile.representative_name ?? ''} onChange={v => setProfile(p => ({ ...p, representative_name: v }))} />
          <Input label="Designation" value={profile.representative_designation ?? ''} onChange={v => setProfile(p => ({ ...p, representative_designation: v }))} />
          <Input label="Phone" value={profile.representative_phone ?? ''} onChange={v => setProfile(p => ({ ...p, representative_phone: v }))} />

          <button disabled={saving} onClick={handleSaveProfile} className="btn-primary" style={{ fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
            {saved ? <><CheckCircle size={15} style={{ marginRight: 6, verticalAlign: 'middle' }} />Saved</> : saving ? 'Saving…' : 'Save Profile'}
          </button>
          {saveError && (
            <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(192,64,64,0.09)', border: '1px solid rgba(192,64,64,0.2)', fontSize: 12, color: '#E06060' }}>
              <AlertCircle size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />{saveError}
            </div>
          )}
        </div>

        {/* Documents */}
        <div className="glass-card" style={{ padding: 24, flex: '1 1 380px' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>Verification Documents</h3>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Document Type</label>
            <select className="select-field" value={docType} onChange={e => setDocType(e.target.value as DocumentType)}>
              {DOC_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div style={{ marginBottom: 16 }}>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={e => setDocFile(e.target.files?.[0] || null)}
              style={{ fontSize: 12, color: 'var(--text-secondary)' }}
            />
          </div>

          <button disabled={uploading} onClick={handleUpload} className="btn-secondary" style={{ marginBottom: 20 }}>
            {uploading ? <><Loader2 size={14} className="animate-spin" style={{ marginRight: 6 }} />Uploading…</> : <><Upload size={14} style={{ marginRight: 6 }} />Upload Document</>}
          </button>
          {uploadError && (
            <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(192,64,64,0.09)', border: '1px solid rgba(192,64,64,0.2)', fontSize: 12, color: '#E06060' }}>
              <AlertCircle size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />{uploadError}
            </div>
          )}

          <h4 style={{ fontSize: 12, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 12 }}>
            Submitted Documents ({documents.length})
          </h4>
          {loading ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading…</div>
          ) : documents.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No documents uploaded yet.</div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {documents.map(d => (
                <div key={d.id} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <FileText size={14} color="var(--text-muted)" />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>{d.file_name}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
                          {d.doc_type.replace(/_/g, ' ')}
                        </div>
                      </div>
                    </div>
                    <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: DOC_STATUS_COLOR[d.status], fontWeight: 700 }}>
                      {d.status}
                    </span>
                  </div>
                  {d.review_notes && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, fontStyle: 'italic' }}>“{d.review_notes}”</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
