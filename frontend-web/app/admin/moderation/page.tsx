'use client';
import { useState, useEffect, useCallback } from 'react';
import { ClipboardCheck, MapPin, IndianRupee, Check, Flag, Trash2, RefreshCw } from 'lucide-react';
import {
  getModerationQueue, approveInternshipListing, flagInternshipListing, removeInternshipListing,
  ModerationQueueItem, ModerationStatus,
} from '@/lib/adminApi';

const STATUS_FILTERS: { label: string; value: ModerationStatus | undefined }[] = [
  { label: 'Unreviewed', value: undefined },
  { label: 'Flagged', value: 'flagged' },
  { label: 'Approved', value: 'approved' },
  { label: 'Removed', value: 'removed' },
];

const STATUS_BADGE: Record<ModerationStatus, string> = {
  unreviewed: 'badge',
  approved: 'badge badge-emerald',
  flagged: 'badge badge-amber',
  removed: 'badge',
};

export default function InternshipModerationPage() {
  const [items, setItems] = useState<ModerationQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ModerationStatus | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setItems(await getModerationQueue(statusFilter));
    } catch (e: any) {
      setError(e?.message || 'Could not load the moderation queue.');
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

  const handleApprove = (id: string) => run(id, () => approveInternshipListing(id));
  const handleFlag = (id: string) => {
    const notes = window.prompt('Describe the quality issue with this listing:');
    if (!notes) return;
    run(id, () => flagInternshipListing(id, notes));
  };
  const handleRemove = (id: string) => {
    const notes = window.prompt('Reason for removing this listing (optional):') || undefined;
    if (!window.confirm('This will pull the listing from public view. Continue?')) return;
    run(id, () => removeInternshipListing(id, notes));
  };

  return (
    <div>
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4, fontFamily: 'var(--font-serif)' }}>
            Internship Moderation
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 13, textTransform: 'uppercase' }}>
            Job-quality review, independent of company verification
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
          <ClipboardCheck size={28} style={{ marginBottom: 8, opacity: 0.5 }} />
          <div>Nothing matches these filters.</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {items.map(item => (
            <div key={item.id} className="glass-card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 10 }}>
                <div style={{ flex: 1, minWidth: 260 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>{item.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{item.organization_name} · {item.domain}</div>
                  <div style={{ display: 'flex', gap: 14, marginTop: 6, fontSize: 12, color: 'var(--text-muted)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={12} /> {item.location}</span>
                    {item.stipend != null && <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><IndianRupee size={12} /> {item.stipend}/mo</span>}
                    <span>{new Date(item.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <span className={STATUS_BADGE[item.moderation_status]}>{item.moderation_status}</span>
              </div>

              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.6 }}>
                {item.description.length > 240 ? item.description.slice(0, 240) + '…' : item.description}
              </p>

              {item.moderation_notes && (
                <div style={{ fontSize: 12, color: 'var(--accent-amber)', marginBottom: 12, fontStyle: 'italic' }}>
                  “{item.moderation_notes}”
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button disabled={busyId === item.id} onClick={() => handleApprove(item.id)} className="btn-secondary" style={{ padding: '6px 14px', fontSize: 12, color: 'var(--accent-emerald)' }}>
                  <Check size={13} /> Approve
                </button>
                <button disabled={busyId === item.id} onClick={() => handleFlag(item.id)} className="btn-secondary" style={{ padding: '6px 14px', fontSize: 12, color: 'var(--accent-amber)' }}>
                  <Flag size={13} /> Flag
                </button>
                <button disabled={busyId === item.id} onClick={() => handleRemove(item.id)} className="btn-secondary" style={{ padding: '6px 14px', fontSize: 12, color: '#E06060' }}>
                  <Trash2 size={13} /> Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
