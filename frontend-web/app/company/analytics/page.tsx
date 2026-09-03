'use client';
import { useState, useEffect } from 'react';
import { BarChart3, Users, Target, Clock, Award, Briefcase } from 'lucide-react';
import { getMyJobs, Job } from '@/lib/store';

export default function CompanyAnalyticsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);

  useEffect(() => {
    const loadJobs = async () => setJobs(await getMyJobs());
    loadJobs();
    window.addEventListener('nexyuva_jobs_updated', loadJobs);
    return () => window.removeEventListener('nexyuva_jobs_updated', loadJobs);
  }, []);

  const totalOpenings = jobs.reduce((sum, j) => sum + (j.openings || 1), 0);

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 8 }}>
          <BarChart3 size={28} style={{ marginRight: 10, verticalAlign: 'middle', color: 'var(--accent-cyan)' }} />
          Recruitment Analytics
        </h1>
        <p style={{ color: 'var(--text-secondary)' }}>AI match insights & candidate funnel for your posted internships</p>
      </div>

      {/* Overview Cards - real values derived from stored jobs, zero/empty until applications exist */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Posted Internships', val: jobs.length, color: 'var(--primary-light)', icon: Briefcase },
          { label: 'Total Openings', val: totalOpenings, color: 'var(--accent-cyan)', icon: Users },
          { label: 'Applications Received', val: 0, color: 'var(--accent-emerald)', icon: Clock },
          { label: 'Shortlisted', val: 0, color: 'var(--accent-amber)', icon: Award },
        ].map((item, i) => {
          const Icon = item.icon;
          return (
            <div key={i} className="glass-card" style={{ padding: 20 }}>
              <div style={{ width: 40, height: 40, borderRadius: 0, background: `${item.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <Icon size={20} color={item.color} />
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'Space Grotesk', color: item.color, marginBottom: 4 }}>{item.val}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{item.label}</div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Candidate Match Quality - empty state until real applications exist */}
        <div className="glass-card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Candidate Match Quality</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>Distribution of AI match scores for received applications</p>
          <div style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Target size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
            <p style={{ fontSize: 13 }}>Match quality data will appear here once candidates start applying.</p>
          </div>
        </div>

        {/* Applicant Discovery Source - empty state until real applications exist */}
        <div className="glass-card" style={{ padding: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Applicant Discovery Source</h3>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>How applicants found your internship postings</p>
          <div style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Users size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
            <p style={{ fontSize: 13 }}>Source breakdown will appear here once candidates start applying.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
