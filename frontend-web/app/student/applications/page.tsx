'use client';
import { useState, useEffect } from 'react';
import { FileText, Clock, Star, CheckCircle, XCircle, Search, ArrowRight, Loader2, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { getMyRealApplications, withdrawRealApplication } from '../../../lib/realApi';
import { useArcadeFX } from '@/app/components/ArcadeFX';

export default function ApplicationsPage() {
  const { toast, playSound, ArcadeToasts } = useArcadeFX();
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{ id: string; title: string } | null>(null);

  const loadApps = async () => {
    try {
      const data = await getMyRealApplications();
      const mapped = (data || []).map((a: any) => ({
        id: a.id,
        internshipTitle: a.internship_title || 'Untitled Internship',
        company: a.organization_name || 'Unknown Organization',
        appliedDate: a.applied_at,
        status: a.status === 'accepted' ? 'selected' : a.status,
      }));
      setApplications(mapped);
    } catch (e: any) {
      setError(e?.message || 'Failed to load applications');
      setApplications([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadApps(); }, []);

  async function confirmWithdraw() {
    if (!confirmTarget) return;
    const id = confirmTarget.id;
    setConfirmTarget(null);
    setWithdrawingId(id);
    try {
      await withdrawRealApplication(id);
      playSound.beep();
      toast('APPLICATION WITHDRAWN', 'YOU CAN RE-APPLY ONCE IF YOU CHANGE YOUR MIND');
      setApplications(prev => prev.map(a => a.id === id ? { ...a, status: 'withdrawn' } : a));
    } catch (e: any) {
      alert(e?.message || 'Could not withdraw this application. Please try again.');
    }
    setWithdrawingId(null);
  }

  const filtered = activeFilter === 'all' ? applications : applications.filter(a => a.status === activeFilter);
  const counts = {
    all: applications.length,
    shortlisted: applications.filter(a => a.status === 'shortlisted').length,
    selected: applications.filter(a => a.status === 'selected').length,
    rejected: applications.filter(a => a.status === 'rejected').length,
  };

  return (
    <div>
      {ArcadeToasts}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8, fontFamily: 'var(--font-serif)' }}>
          <FileText size={28} style={{ marginRight: 10, verticalAlign: 'middle', color: 'var(--accent-cyan)' }} />
          My Applications
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 13, textTransform: 'uppercase' }}>Track and manage all your submitted internship applications</p>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { key: 'all', label: 'Total Applied', color: 'var(--accent-cyan)' },
          { key: 'shortlisted', label: 'Shortlisted', color: 'var(--accent-amber)' },
          { key: 'selected', label: 'Selected', color: 'var(--accent-emerald)' },
          { key: 'rejected', label: 'Not Selected', color: '#FDA4AF' },
        ].map(stat => (
          <button
            key={stat.key}
            onMouseEnter={playSound.blip}
            onClick={() => { setActiveFilter(stat.key); playSound.beep(); }}
            style={{
              textAlign: 'center', padding: '16px 12px',
              background: activeFilter === stat.key ? `${stat.color}15` : 'var(--bg-card)',
              border: `1px solid ${activeFilter === stat.key ? stat.color + '40' : 'var(--glass-border)'}`,
              borderRadius: 0, cursor: 'pointer',
              transition: 'all 0.2s', fontFamily: 'Inter',
            }}
          >
            <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-mono)', color: stat.color, marginBottom: 4 }}>
              {counts[stat.key as keyof typeof counts]}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>{stat.label}</div>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="glass-card" style={{ padding: '64px 24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
          Loading applications...
        </div>
      ) : error ? (
        <div className="glass-card" style={{ padding: '64px 24px', textAlign: 'center', color: '#FDA4AF' }}>
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card" style={{ padding: '64px 24px', textAlign: 'center' }}>
          <FileText size={40} style={{ opacity: 0.3, marginBottom: 16 }} />
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, fontFamily: 'var(--font-serif)' }}>No Applications Submitted Yet</h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: 450, margin: '0 auto 24px', fontSize: 14 }}>
            Explore AI-matched internships tailored to your profile and apply in one click to track your application status here.
          </p>
          <Link href="/student/live-internships" className="btn-primary" style={{ padding: '10px 20px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            Browse Internships <ArrowRight size={14} />
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filtered.map(app => {
            const canWithdraw = app.status === 'applied' || app.status === 'shortlisted';
            return (
              <div key={app.id} className="glass-card" style={{ padding: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{app.internshipTitle}</h3>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{app.company} · Applied on {new Date(app.appliedDate).toLocaleDateString()}</p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
                  <span className={app.status === 'withdrawn' ? 'badge' : 'badge badge-emerald'} style={{ textTransform: 'uppercase', fontSize: 10 }}>{app.status}</span>
                  {canWithdraw && (
                    <button
                      className="btn-secondary"
                      disabled={withdrawingId === app.id}
                      onClick={() => setConfirmTarget({ id: app.id, title: app.internshipTitle })}
                      style={{ padding: '6px 14px', fontSize: 12 }}
                    >
                      {withdrawingId === app.id ? <Loader2 size={13} className="animate-spin" /> : 'Cancel Application'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {confirmTarget && (
        <div
          onClick={() => setConfirmTarget(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 20,
          }}
        >
          <div
            className="glass-card"
            onClick={e => e.stopPropagation()}
            style={{ maxWidth: 420, width: '100%', padding: 28 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <AlertTriangle size={20} color="#F6B21A" />
              <h3 style={{ fontSize: 17, fontWeight: 700 }}>Withdraw application?</h3>
            </div>
            <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 24 }}>
              You&apos;re withdrawing from <strong style={{ color: 'var(--text-primary)' }}>{confirmTarget.title}</strong>.
              You can re-apply once if you change your mind, but withdrawing a second time will lock you out of this internship for good.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn-secondary" style={{ padding: '8px 18px', fontSize: 13 }} onClick={() => setConfirmTarget(null)}>
                Keep Application
              </button>
              <button className="btn-primary" style={{ padding: '8px 18px', fontSize: 13, background: '#E06060' }} onClick={confirmWithdraw}>
                Withdraw
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
