'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft, Building2, Globe, User, Mail, Phone, FileText, Download, Eye,
  Check, X as XIcon, AlertCircle, ShieldAlert, ShieldCheck, PauseCircle, PlayCircle, Clock,
} from 'lucide-react';
import {
  getVerificationCase, approveOrganization, rejectOrganization, requestInformation,
  suspendOrganization, reinstateOrganization, reviewDocument, downloadDocumentBlob,
  downloadLegacyDocumentBlob, VerificationCase, DocumentReviewStatus,
} from '@/lib/adminApi';

const RISK_COLOR: Record<string, string> = { high: '#E06060', review: 'var(--accent-amber)', low: 'var(--accent-emerald)' };
const DOC_STATUS_COLOR: Record<DocumentReviewStatus, string> = {
  pending: 'var(--accent-amber)', verified: 'var(--accent-emerald)', rejected: '#E06060',
};

const REQUEST_INFO_REASONS = [
  'Incorporation certificate missing or unclear',
  'PAN does not match legal name',
  'GST certificate required',
  'Representative details incomplete',
  'Website / domain does not match company email',
  'Document image is unreadable — please re-upload',
];

function isPreviewable(filename: string) {
  const ext = filename.split('.').pop()?.toLowerCase();
  return ext === 'pdf' || ext === 'png' || ext === 'jpg' || ext === 'jpeg';
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: 14 }}>{value ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}</div>
    </div>
  );
}

export default function CaseWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const orgId = params.orgId as string;

  const [data, setData] = useState<VerificationCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [requestInfoOpen, setRequestInfoOpen] = useState(false);
  const [requestInfoText, setRequestInfoText] = useState('');
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [suspendText, setSuspendText] = useState('');
  const [selectedReasons, setSelectedReasons] = useState<string[]>([]);
  const [preview, setPreview] = useState<{ url: string; filename: string; isPdf: boolean } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getVerificationCase(orgId));
    } catch (e: any) {
      setError(e?.message || 'Could not load this case.');
    }
    setLoading(false);
  }, [orgId]);

  useEffect(() => { load(); }, [load]);

  const run = async (fn: () => Promise<any>) => {
    setBusy(true);
    try {
      await fn();
      await load();
    } catch (e: any) {
      window.alert(e?.message || 'That action failed.');
    }
    setBusy(false);
  };

  const handleApprove = () => run(() => approveOrganization(orgId));
  const handleReject = () => {
    const reason = window.prompt('Reason for rejection (shown to the company, optional):') || undefined;
    run(() => rejectOrganization(orgId, reason));
  };
  const handleSuspend = () => {
    if (!suspendText.trim()) { window.alert('A reason is required to suspend.'); return; }
    run(async () => { await suspendOrganization(orgId, suspendText); setSuspendOpen(false); setSuspendText(''); });
  };
  const handleReinstate = () => run(() => reinstateOrganization(orgId));
  const toggleReason = (r: string) => {
    setSelectedReasons(prev => prev.includes(r) ? prev.filter(x => x !== r) : [...prev, r]);
  };

  const handleRequestInfo = () => {
    const combined = [...selectedReasons, requestInfoText.trim()].filter(Boolean).join('. ');
    if (!combined) { window.alert('Select a reason or describe what the company needs to provide.'); return; }
    run(async () => {
      await requestInformation(orgId, combined);
      setRequestInfoOpen(false); setRequestInfoText(''); setSelectedReasons([]);
    });
  };

  const handleReviewDoc = (docId: string, status: DocumentReviewStatus) => {
    const notes = status === 'rejected'
      ? window.prompt('Reason this document was rejected (optional):') || undefined
      : undefined;
    run(() => reviewDocument(orgId, docId, status, notes));
  };

  const handleDownload = async (docId: string, filename: string) => {
    try {
      const blob = await downloadDocumentBlob(orgId, docId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      window.alert(e?.message || 'Could not download this document.');
    }
  };

  const handleDownloadLegacy = async (filename: string) => {
    try {
      const blob = await downloadLegacyDocumentBlob(orgId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      window.alert(e?.message || 'Could not download this document.');
    }
  };

  const closePreview = () => {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  };

  const handlePreview = async (filename: string, fetcher: () => Promise<Blob>) => {
    if (!isPreviewable(filename)) {
      window.alert('No inline preview for this file type — use Download instead.');
      return;
    }
    setPreviewLoading(true);
    try {
      const blob = await fetcher();
      const url = URL.createObjectURL(blob);
      setPreview({ url, filename, isPdf: filename.toLowerCase().endsWith('.pdf') });
    } catch (e: any) {
      window.alert(e?.message || 'Could not load this document for preview.');
    }
    setPreviewLoading(false);
  };

  if (loading) {
    return <div className="glass-card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading case…</div>;
  }
  if (error || !data) {
    return (
      <div>
        <Link href="/admin/verification" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 16, color: 'var(--text-muted)', fontSize: 13 }}>
          <ArrowLeft size={14} /> Back to queue
        </Link>
        <div className="glass-card" style={{ padding: 24, color: '#E06060' }}>{error || 'Case not found.'}</div>
      </div>
    );
  }

  const canApproveReject = data.status === 'pending' || data.status === 'action_required';

  return (
    <div>
      <Link href="/admin/verification" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 16, color: 'var(--text-muted)', fontSize: 13, textDecoration: 'none' }}>
        <ArrowLeft size={14} /> Back to queue
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, fontFamily: 'var(--font-serif)' }}>
            {data.identity.legal_name || data.identity.display_name}
          </h1>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 6 }}>
            <span className="badge">{data.status.replace('_', ' ')}</span>
            <span style={{ fontSize: 11, color: RISK_COLOR[data.risk.level], fontFamily: 'var(--font-mono)', textTransform: 'uppercase', fontWeight: 700 }}>
              {data.risk.level} risk
            </span>
          </div>
        </div>
      </div>

      {data.risk.notes && (
        <div className="glass-card" style={{ padding: 14, marginBottom: 16, display: 'flex', gap: 10, alignItems: 'flex-start', borderLeft: `3px solid ${RISK_COLOR[data.risk.level]}` }}>
          <AlertCircle size={16} color={RISK_COLOR[data.risk.level]} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{data.risk.notes}</div>
        </div>
      )}

      {data.action_required_reason && data.status === 'action_required' && (
        <div className="glass-card" style={{ padding: 14, marginBottom: 16, borderLeft: '3px solid var(--accent-amber)' }}>
          <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: 'var(--accent-amber)', marginBottom: 4 }}>Awaiting from company</div>
          <div style={{ fontSize: 13 }}>{data.action_required_reason}</div>
        </div>
      )}

      {data.rejection_reason && data.status === 'rejected' && (
        <div className="glass-card" style={{ padding: 14, marginBottom: 16, borderLeft: '3px solid #E06060' }}>
          <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: '#E06060', marginBottom: 4 }}>Rejection reason</div>
          <div style={{ fontSize: 13 }}>{data.rejection_reason}</div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr 1fr', gap: 20, alignItems: 'start' }}>
        {/* LEFT: Identity */}
        <div className="glass-card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Building2 size={16} /> Identity
          </h3>
          <Field label="Display Name" value={data.identity.display_name} />
          <Field label="Legal Name" value={data.identity.legal_name} />
          <Field label="CIN" value={data.identity.cin} />
          <Field label="PAN" value={data.identity.pan} />
          <Field label="Industry" value={data.identity.industry} />
          <Field label="Website" value={data.identity.official_website ? (
            <a href={data.identity.official_website} target="_blank" rel="noreferrer" style={{ color: 'var(--primary-light)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <Globe size={12} /> {data.identity.official_website}
            </a>
          ) : null} />
          <Field label="Account Email" value={data.identity.account_email} />
          <Field label="Description" value={data.identity.description} />

          <h3 style={{ fontSize: 14, fontWeight: 700, margin: '20px 0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <User size={16} /> Representative
          </h3>
          <Field label="Name" value={data.representative.name} />
          <Field label="Designation" value={data.representative.designation} />
          <Field label="Phone" value={data.representative.phone ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Phone size={12} /> {data.representative.phone}
              {data.representative.phone_verified && <ShieldCheck size={13} color="var(--accent-emerald)" />}
            </span>
          ) : null} />
          <Field label="Email Verified" value={
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {data.representative.email_verified
                ? <><ShieldCheck size={13} color="var(--accent-emerald)" /> Verified</>
                : <><ShieldAlert size={13} color="var(--text-muted)" /> Not verified</>}
            </span>
          } />

          <h3 style={{ fontSize: 14, fontWeight: 700, margin: '20px 0 12px' }}>Activity</h3>
          <Field label="Internships Posted" value={data.activity.internships_posted} />
          <Field label="Applications Received" value={data.activity.applications_received} />
        </div>

        {/* CENTER: Documents */}
        <div className="glass-card" style={{ padding: 20 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={16} /> Documents ({data.documents.length + (data.legacy_document ? 1 : 0)})
          </h3>
          {data.documents.length === 0 && !data.legacy_document && (
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>No documents uploaded yet.</div>
          )}
          <div style={{ display: 'grid', gap: 10 }}>
            {data.documents.map(doc => (
              <div key={doc.id} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{doc.file_name}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', marginTop: 2 }}>
                      {doc.doc_type.replace(/_/g, ' ')}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: DOC_STATUS_COLOR[doc.status], fontWeight: 700 }}>
                    {doc.status}
                  </span>
                </div>
                {doc.review_notes && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, fontStyle: 'italic' }}>“{doc.review_notes}”</div>
                )}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button disabled={previewLoading} onClick={() => handlePreview(doc.file_name, () => downloadDocumentBlob(orgId, doc.id))} className="btn-secondary" style={{ padding: '5px 10px', fontSize: 11 }}>
                    <Eye size={12} /> Preview
                  </button>
                  <button onClick={() => handleDownload(doc.id, doc.file_name)} className="btn-secondary" style={{ padding: '5px 10px', fontSize: 11 }}>
                    <Download size={12} />
                  </button>
                  <button disabled={busy} onClick={() => handleReviewDoc(doc.id, 'verified')} className="btn-secondary" style={{ padding: '5px 10px', fontSize: 11, color: 'var(--accent-emerald)' }}>
                    <Check size={12} /> Verify
                  </button>
                  <button disabled={busy} onClick={() => handleReviewDoc(doc.id, 'rejected')} className="btn-secondary" style={{ padding: '5px 10px', fontSize: 11, color: '#E06060' }}>
                    <XIcon size={12} /> Reject
                  </button>
                </div>
              </div>
            ))}
            {data.legacy_document && (
              <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', padding: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{data.legacy_document.file_name}</div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', marginTop: 2, marginBottom: 8 }}>
                  legacy / primary document
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button disabled={previewLoading} onClick={() => handlePreview(data.legacy_document!.file_name, () => downloadLegacyDocumentBlob(orgId))} className="btn-secondary" style={{ padding: '5px 10px', fontSize: 11 }}>
                    <Eye size={12} /> Preview
                  </button>
                  <button onClick={() => handleDownloadLegacy(data.legacy_document!.file_name)} className="btn-secondary" style={{ padding: '5px 10px', fontSize: 11 }}>
                    <Download size={12} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: Decision panel + audit */}
        <div style={{ display: 'grid', gap: 20 }}>
          <div className="glass-card" style={{ padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Decision</h3>
            <div style={{ display: 'grid', gap: 8 }}>
              {canApproveReject && (
                <>
                  <button disabled={busy} onClick={handleApprove} className="btn-primary" style={{ padding: '10px', fontSize: 13, justifyContent: 'center' }}>
                    <Check size={14} /> Approve
                  </button>
                  <button disabled={busy} onClick={() => setRequestInfoOpen(o => !o)} className="btn-secondary" style={{ padding: '10px', fontSize: 13, justifyContent: 'center', color: 'var(--accent-amber)' }}>
                    <AlertCircle size={14} /> Request Information
                  </button>
                  <button disabled={busy} onClick={handleReject} className="btn-secondary" style={{ padding: '10px', fontSize: 13, justifyContent: 'center', color: '#E06060' }}>
                    <XIcon size={14} /> Reject
                  </button>
                </>
              )}
              {data.status === 'approved' && (
                <button disabled={busy} onClick={() => setSuspendOpen(o => !o)} className="btn-secondary" style={{ padding: '10px', fontSize: 13, justifyContent: 'center', color: '#E06060' }}>
                  <PauseCircle size={14} /> Suspend
                </button>
              )}
              {data.status === 'suspended' && (
                <button disabled={busy} onClick={handleReinstate} className="btn-primary" style={{ padding: '10px', fontSize: 13, justifyContent: 'center' }}>
                  <PlayCircle size={14} /> Reinstate
                </button>
              )}
              {!canApproveReject && data.status !== 'approved' && data.status !== 'suspended' && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No action available for this status.</div>
              )}
            </div>

            {requestInfoOpen && (
              <div style={{ marginTop: 12 }}>
                <div style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
                  {REQUEST_INFO_REASONS.map(r => (
                    <label key={r} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                      <input type="checkbox" checked={selectedReasons.includes(r)} onChange={() => toggleReason(r)} style={{ marginTop: 2 }} />
                      {r}
                    </label>
                  ))}
                </div>
                <textarea
                  value={requestInfoText}
                  onChange={e => setRequestInfoText(e.target.value)}
                  placeholder="Additional detail (optional)"
                  style={{ width: '100%', minHeight: 60, background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', color: 'inherit', padding: 10, fontSize: 12, fontFamily: 'inherit' }}
                />
                <button disabled={busy} onClick={handleRequestInfo} className="btn-primary" style={{ marginTop: 8, padding: '8px 14px', fontSize: 12, width: '100%', justifyContent: 'center' }}>
                  Send Request
                </button>
              </div>
            )}

            {suspendOpen && (
              <div style={{ marginTop: 12 }}>
                <textarea
                  value={suspendText}
                  onChange={e => setSuspendText(e.target.value)}
                  placeholder="Reason for suspension (required)"
                  style={{ width: '100%', minHeight: 80, background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', color: 'inherit', padding: 10, fontSize: 12, fontFamily: 'inherit' }}
                />
                <button disabled={busy} onClick={handleSuspend} className="btn-secondary" style={{ marginTop: 8, padding: '8px 14px', fontSize: 12, width: '100%', justifyContent: 'center', color: '#E06060' }}>
                  Confirm Suspend
                </button>
              </div>
            )}
          </div>

          <div className="glass-card" style={{ padding: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={16} /> Audit History
            </h3>
            {data.audit_history.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No admin actions yet.</div>
            ) : (
              <div style={{ display: 'grid', gap: 10, maxHeight: 340, overflowY: 'auto' }}>
                {data.audit_history.map((e, i) => (
                  <div key={i} style={{ borderLeft: '2px solid var(--glass-border)', paddingLeft: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{e.action.replace(/_/g, ' ')}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{e.admin_email} · {new Date(e.created_at).toLocaleString()}</div>
                    {e.reason && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, fontStyle: 'italic' }}>“{e.reason}”</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {preview && (
        <div
          onClick={closePreview}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}
        >
          <div onClick={e => e.stopPropagation()} className="glass-card" style={{ width: '90%', maxWidth: 900, height: '85vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--glass-border)' }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{preview.filename}</span>
              <button onClick={closePreview} className="btn-secondary" style={{ padding: '4px 10px', fontSize: 11 }}>
                <XIcon size={12} /> Close
              </button>
            </div>
            <div style={{ flex: 1, background: '#1a1a1a' }}>
              {preview.isPdf ? (
                <iframe src={preview.url} style={{ width: '100%', height: '100%', border: 'none' }} title={preview.filename} />
              ) : (
                <img src={preview.url} alt={preview.filename} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
