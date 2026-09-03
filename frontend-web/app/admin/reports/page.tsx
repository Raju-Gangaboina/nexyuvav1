'use client';
import { useState, useEffect, useCallback } from 'react';
import { Flag, Search, ShieldAlert, RefreshCw, CheckCircle2, XCircle, Gavel } from 'lucide-react';
import {
  getReportsQueue, investigateReport, dismissReport, actionTakenReport,
  ReportQueueItem, ReportStatus, ReportReason,
} from '@/lib/adminApi';

const STATUS_FILTERS: { label: string; value: ReportStatus | undefined }[] = [
  { label: 'Open', value: undefined },
  { label: 'Investigating', value: 'investigating' },
  { label: 'Dismissed', value: 'dismissed' },
  { label: 'Action Taken', value: 'action_taken' },
];

const STATUS_BADGE: Record<ReportStatus, string> = {
  open: 'badge badge-amber',
  investigating: 'badge badge-primary',
  dismissed: 'badge',
  action_taken: 'badge badge-emerald',
};

const REASON_LABEL: Record<ReportReason, string> = {
  fake_listing: 'Fake listing',
  unpaid_or_underpaid: 'Unpaid / underpaid',
  misleading_description: 'Misleading description',
  suspicious_company: 'Suspicious company',
  harassment: 'Harassment',
  scam_or_fraud: 'Scam / fraud',
  other: 'Other',
};

export default function ReportsQueuePage() {
  const [items, setItems] = useState<ReportQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ReportStatus | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await getReportsQueue(statusFilter));
    } catch (e: any) {
      setError(e?.message || 'Could not load the reports queue.');
    }
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  const run = async (id: string, fn: () => Promise<any>) => {
    setBusyId(id);
    try {
      await fn();
      await load();
    } catch (e: any) {
      window.alert(e?.message || 'That action failed.');
    }
    setBusyId(null);
  };

  const handleInvestigate = (id: string) => {
    const notes = window.prompt('Notes for starting the investigation (optional):') || undefined;
    run(id, () => investigateReport(id, notes));
  };
  const handleDismiss = (id: string) => {
    const notes = window.prompt('Reason for dismissing this report:') || undefined;
    run(id, () => dismissReport(id, notes));
  };
  const handleActionTaken = (id: string) => {
    const notes = window.prompt('What was actually done? (e.g. "listing removed, see moderation log")');
    if (!notes) return;
    run(id, () => actionTakenReport(id, notes));
  };

  return (
    <div>
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4, fontFamily: 'var(--font-serif)' }}>
            Student Reports
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 13, textTransform: 'uppercase' }}>
            Raw complaints filed against listings or companies
          </p>
        </div>
        <button onClick={load} className="btn-secondary" style={{ padding: '8px 14px', fontSize: 12 }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="glass-card" style={{ padding: 16, marginBottom: 20, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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

      {error && <div className="glass-card" style={{ padding: 16, marginBottom: 16, color: '#E06060', fontSize: 13 }}>{error}</div>}

      {loading ? (
        <div className="glass-card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
      ) : items.length === 0 ? (
        <div className="glass-card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          <ShieldAlert size={28} style={{ marginBottom: 8, opacity: 0.5 }} />
          <div>Nothing matches these filters.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {items.map(item => (
            <div key={item.id} className="glass-card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 10 }}>
                <div style={{ flex: 1, minWidth: 260 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Flag size={14} color="var(--accent-rose)" />
                    {REASON_LABEL[item.reason]}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Against {item.target_type} · {item.target_id.slice(0, 8)}… · reported by {item.reporter_email || 'unknown'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    {new Date(item.created_at).toLocaleString()}
                  </div>
                </div>
                <span className={STATUS_BADGE[item.status]}>{item.status.replace('_', ' ')}</span>
              </div>

              {item.details && (
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.6 }}>
                  {item.details}
                </p>
              )}

              {item.resolution_notes && (
                <div style={{ fontSize: 12, color: 'var(--accent-amber)', marginBottom: 12, fontStyle: 'italic' }}>
                  “{item.resolution_notes}”
                </div>
              )}

              {(item.status === 'open' || item.status === 'investigating') && (
                <div style={{ display: 'flex', gap: 8 }}>
                  {item.status === 'open' && (
                    <button disabled={busyId === item.id} onClick={() => handleInvestigate(item.id)} className="btn-secondary" style={{ padding: '6px 14px', fontSize: 12, color: 'var(--accent-primary)' }}>
                      <Search size={13} /> Investigate
                    </button>
                  )}
                  <button disabled={busyId === item.id} onClick={() => handleActionTaken(item.id)} className="btn-secondary" style={{ padding: '6px 14px', fontSize: 12, color: 'var(--accent-emerald)' }}>
                    <Gavel size={13} /> Action Taken
                  </button>
                  <button disabled={busyId === item.id} onClick={() => handleDismiss(item.id)} className="btn-secondary" style={{ padding: '6px 14px', fontSize: 12, color: 'var(--text-muted)' }}>
                    <XCircle size={13} /> Dismiss
                  </button>
                </div>
              )}
              {item.status === 'action_taken' && (
                <div style={{ fontSize: 12, color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle2 size={13} /> Resolved
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
