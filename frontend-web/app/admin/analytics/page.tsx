'use client';
import { BarChart3, Shield, Award, CheckCircle } from 'lucide-react';

export default function AdminAnalyticsPage() {
  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8, fontFamily: 'var(--font-serif)' }}>
          <BarChart3 size={28} style={{ marginRight: 10, verticalAlign: 'middle', color: 'var(--accent-emerald)' }} />
          National Analytics & Workforce Insights
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 13, textTransform: 'uppercase' }}>Ministry of Labour & Employment · PM Internship Scheme Analytics</p>
      </div>

      {/* KPI Banner */}
      <div className="glass-card" style={{ padding: 24, marginBottom: 24, background: 'linear-gradient(135deg, rgba(45,122,95,0.1) 0%, rgba(232,130,10,0.1) 100%)', border: '1px solid rgba(45,122,95,0.2)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontFamily: 'var(--font-mono)' }}>OFFICIAL SCHEME TARGET</div>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent-emerald)' }}>1 Crore Youth</div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>5-Year National Objective</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontFamily: 'var(--font-mono)' }}>OFFICIAL STIPEND NORM</div>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)' }}>₹5,000 / mo</div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>₹4.5k Govt + ₹500 Company CSR</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontFamily: 'var(--font-mono)' }}>ONE-TIME INCIDENTAL GRANT</div>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent-amber)' }}>₹6,000</div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>Provided upon joining</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, fontFamily: 'var(--font-mono)' }}>AI EVALUATION MODEL</div>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--primary-light)' }}>NexYuva AI</div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>Explainable Skill Matching</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <div className="glass-card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>PM Internship Scheme Guidelines</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>Eligibility & Eligibility Mandates</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13, color: 'var(--text-primary)' }}>
            <div style={{ padding: 12, background: 'var(--bg-elevated)', borderLeft: '3px solid var(--accent-cyan)' }}>
              <strong>Age Bracket:</strong> Youth aged between 21 and 24 years not currently in full-time education or employment.
            </div>
            <div style={{ padding: 12, background: 'var(--bg-elevated)', borderLeft: '3px solid var(--accent-emerald)' }}>
              <strong>Duration:</strong> 12-month structured internship experience with top 500 companies in India.
            </div>
            <div style={{ padding: 12, background: 'var(--bg-elevated)', borderLeft: '3px solid var(--accent-amber)' }}>
              <strong>Insurance Coverage:</strong> Insurance coverage under PM Jeevan Jyoti Bima Yojana and PM Suraksha Bima Yojana.
            </div>
          </div>
        </div>

        <div className="glass-card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Governance Monitoring</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>Platform audit standards</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13, color: 'var(--text-primary)' }}>
            <div style={{ padding: 12, background: 'var(--bg-elevated)', borderLeft: '3px solid var(--primary-light)' }}>
              <strong>Direct DBT Integration:</strong> Direct Benefit Transfer of government stipend share directly to student bank accounts.
            </div>
            <div style={{ padding: 12, background: 'var(--bg-elevated)', borderLeft: '3px solid var(--accent-emerald)' }}>
              <strong>Explainable Ranking:</strong> Zero proprietary blackbox scoring. Every recommendation provides explicit skill gap analysis.
            </div>
            <div style={{ padding: 12, background: 'var(--bg-elevated)', borderLeft: '3px solid var(--accent-cyan)' }}>
              <strong>CSR Expenditure Eligibility:</strong> Company stipend contribution counts towards statutory CSR obligation.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
