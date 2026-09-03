'use client';
import { useState, useEffect } from 'react';
import {
  Users, Building2, Briefcase, Award, TrendingUp, Target,
  Globe, Shield, CheckCircle, BarChart3, PieChart, FileText, Clock, Check, X as XIcon
} from 'lucide-react';
import { getStoredJobs } from '@/lib/store';
import {
  getPendingOrganizationsReal,
  approveOrganizationReal,
  rejectOrganizationReal,
  downloadVerificationDocumentReal,
  getRealToken,
  PendingOrganization,
} from '@/lib/realApi';

export default function AdminDashboard() {
  const [jobCount, setJobCount] = useState(0);
  const [pendingCompanies, setPendingCompanies] = useState<PendingOrganization[]>([]);
  const [actioningId, setActioningId] = useState<string | null>(null);

  useEffect(() => {
    const loadStore = async () => {
      setJobCount((await getStoredJobs()).length);
    };
    loadStore();
    window.addEventListener('nexyuva_jobs_updated', loadStore);
    return () => window.removeEventListener('nexyuva_jobs_updated', loadStore);
  }, []);

  // Pending-org queue now comes from the real backend (GET
  // /admin/organizations/pending) instead of the old localStorage
  // companyStore, which never talked to this backend and had no relation
  // to whichever org actually got approved via the API.
  const loadPending = async () => {
    if (!getRealToken()) return;
    try {
      setPendingCompanies(await getPendingOrganizationsReal());
    } catch {
      // not logged in as admin, or no pending orgs — leave list empty
    }
  };

  useEffect(() => { loadPending(); }, []);

  const handleApprove = async (id: string) => {
    setActioningId(id);
    try {
      await approveOrganizationReal(id);
      await loadPending();
    } catch (e: any) {
      window.alert(e?.message || 'Could not approve this organization.');
    }
    setActioningId(null);
  };

  const handleReject = async (id: string) => {
    const reason = window.prompt('Reason for rejection (shown to the company, optional):') || undefined;
    setActioningId(id);
    try {
      await rejectOrganizationReal(id, reason);
      await loadPending();
    } catch (e: any) {
      window.alert(e?.message || 'Could not reject this organization.');
    }
    setActioningId(null);
  };

  const handleDownloadDoc = async (id: string, filename: string | null) => {
    try {
      const blob = await downloadVerificationDocumentReal(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || 'verification-document';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      window.alert(e?.message || 'Could not download that document.');
    }
  };

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 4, fontFamily: 'var(--font-serif)' }}>
              Ministry Intelligence Dashboard
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 13, textTransform: 'uppercase' }}>
              PM Internship Scheme · Ministry of Labour & Employment, Government of India
            </p>
          </div>
          <div className="badge badge-emerald" style={{ padding: '8px 16px', fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
            <Shield size={14} /> Real-Time Governance Active
          </div>
        </div>
      </div>

      {/* Top Level KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Registered Platform Users', value: 'Live System', icon: Users, color: 'var(--primary)', sub: 'Pan-India Youth Onboarding' },
          { label: 'Verified Employer Partners', value: 'Active', icon: Building2, color: 'var(--accent-cyan)', sub: 'Scheme Compliant Companies' },
          { label: 'Live Posted Openings', value: jobCount.toString(), icon: Briefcase, color: 'var(--accent-amber)', sub: 'Active Scheme Vacancies' },
          { label: 'AI Match Evaluation', value: '100%', icon: CheckCircle, color: 'var(--accent-emerald)', sub: 'Explainable AI Engine' },
        ].map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div key={i} className="glass-card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ width: 40, height: 40, background: `${stat.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={20} color={stat.color} />
                </div>
                <span className="badge badge-emerald" style={{ fontSize: 9, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>LIVE</span>
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, fontFamily: 'var(--font-mono)', color: stat.color, marginBottom: 4 }}>{stat.value}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{stat.label}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>{stat.sub}</div>
            </div>
          );
        })}
      </div>

      {/* Pending Company Verifications */}
      {pendingCompanies.length > 0 && (
        <div className="glass-card" style={{ padding: 24, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={16} color="var(--accent-amber)" /> Pending Company Verifications
            </h3>
            <span className="badge badge-amber">{pendingCompanies.length} awaiting review</span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
            Review each company's verification document before approving dashboard access.
          </p>
          <div style={{ display: 'grid', gap: 12 }}>
            {pendingCompanies.map(c => (
              <div key={c.id} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', padding: 16, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{c.name}</div>
                  {c.description && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{c.description}</div>}
                  {c.submitted_at && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Submitted {new Date(c.submitted_at).toLocaleDateString()}</div>
                  )}
                </div>
                <button
                  onClick={() => handleDownloadDoc(c.id, c.verification_doc_name)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--primary-light)', background: 'none', cursor: 'pointer', padding: '8px 12px', border: '1px solid var(--glass-border)', whiteSpace: 'nowrap' }}
                >
                  <FileText size={14} /> {c.verification_doc_name || 'View document'}
                </button>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => handleApprove(c.id)} disabled={actioningId === c.id} className="btn-primary" style={{ padding: '8px 16px', fontSize: 12 }}>
                    <Check size={14} /> Approve
                  </button>
                  <button onClick={() => handleReject(c.id)} disabled={actioningId === c.id} className="btn-secondary" style={{ padding: '8px 16px', fontSize: 12, color: '#E06060', borderColor: 'rgba(192,64,64,0.3)' }}>
                    <XIcon size={14} /> Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scheme Objectives & Real-Time Governance Trackers */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Real-time System Monitoring */}
        <div className="glass-card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>PM Internship Scheme Directives</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>National compliance and operational standards</p>

          <div style={{ display: 'grid', gap: 14 }}>
            {[
              { label: 'Tier-2 & Tier-3 Inclusivity Standard', val: 'Active', desc: 'Equal opportunity routing for non-metro youth', color: 'var(--accent-cyan)' },
              { label: 'Explainable AI Evaluation', val: 'Compliant', desc: 'Transparent match scores without blackbox bias', color: 'var(--accent-emerald)' },
              { label: 'Direct Employer Connect', val: 'Verified', desc: 'Direct sourcing without intermediary agencies', color: 'var(--primary-light)' },
              { label: 'Stipend Compliance Monitoring', val: 'Standardized', desc: 'Verifiable monthly stipend guidelines', color: 'var(--accent-amber)' },
            ].map(m => (
              <div key={m.label} style={{ background: 'var(--bg-elevated)', borderRadius: 0, padding: 16, border: '1px solid var(--glass-border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{m.label}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: m.color, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>{m.val}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>{m.desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Live Scheme Activity Tracker */}
        <div className="glass-card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Platform Activity Feed</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>Live telemetry from the NexYuva AI engine</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ background: 'var(--bg-elevated)', padding: 16, borderLeft: '3px solid var(--accent-cyan)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>NextAuth OAuth Engine Ready</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Google Sign-In integration active. Credentials configured in environment.</div>
            </div>
            <div style={{ background: 'var(--bg-elevated)', padding: 16, borderLeft: '3px solid var(--accent-emerald)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>Explainable Match Scoring Ready</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Vector distance matching student skills against employer requirements.</div>
            </div>
            <div style={{ background: 'var(--bg-elevated)', padding: 16, borderLeft: '3px solid var(--accent-amber)' }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>Real-time Employer Sourcing Store Active</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Posted internships propagate instantly with Location, Work Mode, Stipend, Duration & Domain filters.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
