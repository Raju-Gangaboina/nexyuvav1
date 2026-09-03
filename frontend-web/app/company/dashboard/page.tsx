'use client';
import Link from 'next/link';
import { useState, useEffect, useCallback } from 'react';
import { Briefcase, Users, Star, Target, Plus } from 'lucide-react';
import { getMyRealInternships } from '@/lib/realApi';

// Shape returned by GET /organizations/internships (InternshipResponse) --
// the real Postgres-backed postings. Previously this page read from the
// deprecated Node/JSON mock (lib/store's getMyJobs), which is a separate,
// unsynced data store with its own fake `job-<timestamp>` ids -- so even
// though a posting showed up here, its id never matched a real internship
// in Postgres, and clicking through to Candidates/Sourcing for it couldn't
// have worked. There is no `openings` field on the real model (the mock's
// was never wired to anything on the backend), so that stat is replaced
// below with something the real data actually supports.
interface RealInternship {
  id: string;
  title: string;
  domain: string;
  location: string;
  work_mode: 'remote' | 'hybrid' | 'on_site';
  stipend: number | null;
  is_active: boolean;
}

const WORK_MODE_LABEL: Record<string, string> = {
  remote: 'Remote', hybrid: 'Hybrid', on_site: 'On-site',
};

export default function CompanyDashboard() {
  const [jobs, setJobs] = useState<RealInternship[]>([]);

  const loadData = useCallback(async () => {
    try {
      setJobs(await getMyRealInternships());
    } catch {
      setJobs([]);
    }
  }, []);

  useEffect(() => {
    loadData();
    // Still fired by the mock addJob() call on the post-internship page
    // (kept there for the legacy demo path) -- harmless to also use it here
    // as a "something changed, refetch the real data" signal.
    window.addEventListener('nexyuva_jobs_updated', loadData);
    return () => window.removeEventListener('nexyuva_jobs_updated', loadData);
  }, [loadData]);

  const activeCount = jobs.filter(j => j.is_active).length;
  const domainCount = new Set(jobs.map(j => j.domain)).size;

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 4, fontFamily: 'var(--font-serif)' }}>
          Company Dashboard
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 13, textTransform: 'uppercase' }}>Employer Partner · PM Internship Scheme</p>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Active Internships', value: activeCount, icon: Briefcase, color: 'var(--accent-cyan)', bg: 'var(--blue-dim)' },
          { label: 'Domains Covered', value: domainCount, icon: Users, color: 'var(--primary-light)', bg: 'var(--blue-dim)' },
          { label: 'Shortlisted', value: 0, icon: Star, color: 'var(--accent-amber)', bg: 'var(--orange-dim)' },
          { label: 'Match Precision', value: jobs.length > 0 ? 'Active' : '0%', icon: Target, color: 'var(--accent-emerald)', bg: 'rgba(45,122,95,0.1)' },
        ].map(stat => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="glass-card" style={{ padding: 20 }}>
              <div style={{ width: 40, height: 40, background: stat.bg, border: `1px solid ${stat.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <Icon size={20} color={stat.color} />
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-mono)', color: stat.color, marginBottom: 4 }}>{stat.value}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>{stat.label}</div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* My Internships */}
        <div className="glass-card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>My Internships ({jobs.length})</h3>
            <Link href="/company/post-internship" className="btn-primary" style={{ padding: '6px 14px', fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
              <Plus size={12} /> Post New
            </Link>
          </div>
          {jobs.length === 0 ? (
            <div style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Briefcase size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
              <p style={{ fontSize: 14, marginBottom: 16 }}>No internships posted yet.</p>
              <Link href="/company/post-internship" className="btn-secondary" style={{ fontSize: 12, padding: '8px 16px' }}>
                Post First Internship
              </Link>
            </div>
          ) : (
            jobs.map(internship => (
              <div key={internship.id} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid var(--glass-border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 2 }}>{internship.title}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {internship.location} · {WORK_MODE_LABEL[internship.work_mode] || internship.work_mode}
                    {internship.stipend != null && <> · ₹{internship.stipend.toLocaleString()}/mo</>}
                  </div>
                </div>
                <span className={`badge ${internship.is_active ? 'badge-emerald' : 'badge-primary'}`} style={{ fontSize: 9, flexShrink: 0 }}>
                  {internship.is_active ? 'ACTIVE' : 'INACTIVE'}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Candidate Pipeline */}
        <div className="glass-card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>AI-Ranked Candidates</h3>
            <Link href="/company/candidates" style={{ fontSize: 12, color: 'var(--accent-cyan)', textDecoration: 'none' }}>View all</Link>
          </div>
          <div style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Users size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
            <p style={{ fontSize: 13 }}>
              {jobs.length === 0
                ? 'Post an internship to see AI-ranked candidates — including strong matches who haven\'t applied yet.'
                : 'Head to Candidates to see AI-ranked matches for each posting, including students who haven\'t applied yet.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
