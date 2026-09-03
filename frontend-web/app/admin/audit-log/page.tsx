'use client';
import { useState, useEffect, useCallback } from 'react';
import { Clock, RefreshCw } from 'lucide-react';
import { getAuditLog, AuditLogEvent } from '@/lib/adminApi';

export default function AuditLogPage() {
  const [events, setEvents] = useState<AuditLogEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entityType, setEntityType] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setEvents(await getAuditLog({ entityType, limit: 200 }));
    } catch (e: any) {
      setError(e?.message || 'Could not load the audit log.');
    }
    setLoading(false);
  }, [entityType]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4, fontFamily: 'var(--font-serif)' }}>Audit Log</h1>
          <p style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 13, textTransform: 'uppercase' }}>
            Every admin decision, immutable
          </p>
        </div>
        <button onClick={load} className="btn-secondary" style={{ padding: '8px 14px', fontSize: 12 }}>
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      <div className="glass-card" style={{ padding: 16, marginBottom: 20, display: 'flex', gap: 8 }}>
        {[{ label: 'All', value: undefined }, { label: 'Organizations', value: 'organization' }, { label: 'Documents', value: 'document' }].map(f => (
          <button
            key={f.label}
            onClick={() => setEntityType(f.value)}
            className={entityType === f.value ? 'btn-primary' : 'btn-secondary'}
            style={{ padding: '6px 14px', fontSize: 12 }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && <div className="glass-card" style={{ padding: 16, marginBottom: 16, color: '#E06060', fontSize: 13 }}>{error}</div>}

      {loading ? (
        <div className="glass-card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Loading…</div>
      ) : events.length === 0 ? (
        <div className="glass-card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          <Clock size={28} style={{ marginBottom: 8, opacity: 0.5 }} />
          <div>No admin actions recorded yet.</div>
        </div>
      ) : (
        <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--glass-border)', textAlign: 'left' }}>
                {['When', 'Admin', 'Action', 'Entity', 'Status Change', 'Reason'].map(h => (
                  <th key={h} style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', fontSize: 10, color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.map((e, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--glass-border)' }}>
                  <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>{new Date(e.created_at).toLocaleString()}</td>
                  <td style={{ padding: '12px 16px' }}>{e.admin_email}</td>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>{e.action.replace(/_/g, ' ')}</td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{e.entity_type}</td>
                  <td style={{ padding: '12px 16px' }}>
                    {e.previous_status && e.new_status ? `${e.previous_status} → ${e.new_status}` : (e.new_status || '—')}
                  </td>
                  <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontStyle: e.reason ? 'italic' : 'normal' }}>
                    {e.reason ? `“${e.reason}”` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
