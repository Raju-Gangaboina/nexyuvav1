'use client';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Shield, AlertTriangle, Clock, FileText, ChevronRight, RefreshCw } from 'lucide-react';
import { getVerificationQueue, QueueItem, VerificationStatus, RiskLevel } from '@/lib/adminApi';

const STATUS_FILTERS: { label: string; value: VerificationStatus | undefined }[] = [
  { label: 'Needs Review', value: undefined }, // backend default: pending + action_required
  { label: 'Approved', value: 'approved' },
  { label: 'Rejected', value: 'rejected' },
  { label: 'Suspended', value: 'suspended' },
];

const RISK_FILTERS: { label: string; value: RiskLevel | undefined; color: string }[] = [
  { label: 'All Risk', value: undefined, color: 'var(--text-muted)' },
  { label: 'High', value: 'high', color: '#E06060' },
  { label: 'Review', value: 'review', color: 'var(--accent-amber)' },
  { label: 'Low', value: 'low', color: 'var(--accent-emerald)' },
];

const STATUS_BADGE: Record<VerificationStatus, { label: string; className: string }> = {
  unsubmitted: { label: 'Unsubmitted', className: 'badge' },
  pending: { label: 'Pending', className: 'badge badge-amber' },
  action_required: { label: 'Action Required', className: 'badge badge-amber' },
  approved: { label: 'Approved', className: 'badge badge-emerald' },
  rejected: { label: 'Rejected', className: 'badge' },
  suspended: { label: 'Suspended', className: 'badge' },
};

function riskColor(level: RiskLevel) {
  if (level === 'high') return '#E06060';
  if (level === 'review') return 'var(--accent-amber)';
  return 'var(--accent-emerald)';
}

export default function VerificationQueuePage() {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<VerificationStatus | undefined>(undefined);
  const [riskFilter, setRiskFilter] = useState<RiskLevel | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await getVerificationQueue({ status: statusFilter, risk: riskFilter }));
    } catch (e: any) {
      setError(e?.message || 'Could not load the verification queue.');
    }
    setLoading(false);
  }, [statusFilter, riskFilter]);

  useEffect(() => { load(); }, [load]);

  const highRiskCount = items.filter(i => i.risk_level === 'high').length;

  return (
    <div>
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4, fontFamily: 'var(--font-serif)' }}>
            Verification Queue
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 13, textTransform: 'uppercase' }}>
            Trust &amp; Safety Control Center
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {highRiskCount > 0 && (
            <div className="badge" style={{ padding: '8px 14px', fontSize: 11, color: '#E06060', border: '1px solid rgba(192,64,64,0.3)' }}>
              <AlertTriangle size={14} /> {highRiskCount} high risk
            </div>
          )}
          <button onClick={load} className="btn-secondary" style={{ padding: '8px 14px', fontSize: 12 }}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      <div className="glass-card" style={{ padding: 20, marginBottom: 20 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {STATUS_FILTERS.map(f => (
              <button
                key={f.label}
                onClick={() => setStatusFilter(f.value)}
                className={statusFilter === f.value ? 'btn-primary' : 'btn-secondary'}
                style={{ padding: '6px 14px', fontSize: 12 }}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {RISK_FILTERS.map(f => (
              <button
                key={f.label}
                onClick={() => setRiskFilter(f.value)}
                style={{
                  padding: '6px 14px', fontSize: 12, cursor: 'pointer',
                  background: riskFilter === f.value ? `${f.color}15` : 'transparent',
                  border: `1px solid ${riskFilter === f.value ? f.color : 'var(--glass-border)'}`,
                  color: riskFilter === f.value ? f.color : 'var(--text-muted)',
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="glass-card" style={{ padding: 16, marginBottom: 16, color: '#E06060', fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="glass-card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          Loading queue…
        </div>
      ) : items.length === 0 ? (
        <div className="glass-card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          <Shield size={28} style={{ marginBottom: 8, opacity: 0.5 }} />
          <div>Nothing matches these filters.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {items.map(org => {
            const statusInfo = STATUS_BADGE[org.status];
            return (
              <Link
                key={org.id}
                href={`/admin/verification/${org.id}`}
                className="glass-card"
                style={{
                  padding: 20, display: 'flex', alignItems: 'center', gap: 16,
                  textDecoration: 'none', color: 'inherit', flexWrap: 'wrap',
                }}
              >
                <div
                  style={{
                    width: 4, alignSelf: 'stretch', minHeight: 40,
                    background: riskColor(org.risk_level),
                  }}
                />
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>
                    {org.legal_name || org.name}
                  </div>
                  {org.legal_name && org.legal_name !== org.name && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Display name: {org.name}</div>
                  )}
                  {org.description && (
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{org.description}</div>
                  )}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 130 }}>
                  <FileText size={14} color="var(--text-muted)" />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {org.verification_doc_name ? 'Docs on file' : 'No documents'}
                  </span>
                </div>

                <div style={{ minWidth: 130, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
                  <span style={{ color: riskColor(org.risk_level), fontWeight: 700 }}>{org.risk_level}</span>
                  {' risk'}
                  {org.submitted_at && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4, textTransform: 'none' }}>
                      <Clock size={11} /> {new Date(org.submitted_at).toLocaleDateString()}
                    </div>
                  )}
                </div>

                <span className={statusInfo.className}>{statusInfo.label}</span>
                <ChevronRight size={18} color="var(--text-muted)" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
