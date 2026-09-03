'use client';
import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck, MapPin, Loader2, Video, Search, Briefcase, Building2, CheckCircle, Info, ChevronDown, X, AlertTriangle, XCircle, Sparkles, Award, Brain, Flag } from 'lucide-react';
import {
  getRealToken, loginReal, registerStudent, getRealRecommendations,
  applyToInternshipReal, getMyRealApplications, getAtsAnalysisReal, getInterviewResult,
  fileReport, REPORT_REASON_LABEL, ReportReason,
  RealRecommendation, ATSAnalysisResult,
} from '@/lib/realApi';

const ATS_PLATFORM_LABEL: Record<string, string> = {
  workday: 'Workday', greenhouse: 'Greenhouse', icims: 'iCIMS',
  taleo: 'Oracle Taleo', successfactors: 'SAP SuccessFactors', linkedin: 'LinkedIn',
};

function atsStatusColor(status: string) {
  return status === 'pass' ? 'var(--accent-emerald)' : status === 'warn' ? 'var(--accent-amber)' : 'var(--accent-rose)';
}

const WORK_MODES: Array<'All' | 'remote' | 'hybrid' | 'on_site'> = ['All', 'remote', 'hybrid', 'on_site'];
const WORK_MODE_LABEL: Record<string, string> = { remote: 'Remote', hybrid: 'Hybrid', on_site: 'On-site' };
const SORT_OPTIONS = ['Match Score', 'Stipend (High-Low)', 'Duration (Short-Long)'];

// What the "interview" action button on a card should show, derived from
// getInterviewResult for that application. 'none' = no attempt yet (the
// "Earn Stand-Out Badge" CTA is honest here). Anything past that should
// reflect the actual outcome instead of still inviting the student to
// "earn" something that's already been decided.
type InterviewCardStatus = 'none' | 'in_progress' | 'passed' | 'failed';

export default function LiveInternshipsPage() {
  const router = useRouter();
  const [realToken, setRealTokenState] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  const [internships, setInternships] = useState<RealRecommendation[]>([]);
  const [applications, setApplications] = useState<Record<string, string>>({});
  const [interviewStatus, setInterviewStatus] = useState<Record<string, InterviewCardStatus>>({});
  const [loading, setLoading] = useState(false);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [atsInternship, setAtsInternship] = useState<RealRecommendation | null>(null);
  const [atsLoading, setAtsLoading] = useState(false);
  const [atsError, setAtsError] = useState('');
  const [atsResult, setAtsResult] = useState<ATSAnalysisResult | null>(null);

  // Report a listing/company for review (ADMIN_TRUST_SAFETY_MEMO.md Phase 4)
  const [reportInternship, setReportInternship] = useState<RealRecommendation | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason>('fake_listing');
  const [reportDetails, setReportDetails] = useState('');
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportError, setReportError] = useState('');
  const [reportSubmitted, setReportSubmitted] = useState(false);
  const [reportAlsoOrg, setReportAlsoOrg] = useState(false);

  // Lightweight per-card ATS score badge — deterministic-only (include_ai=false,
  // no Groq call), fetched for every listed internship so the card can show a
  // real percentage immediately instead of a plain "ATS Check" button. Clicking
  // the badge triggers the full Groq-reviewed analysis below (handleCheckAts),
  // same as before.
  const [atsBadgeScores, setAtsBadgeScores] = useState<Record<string, number>>({});
  const [atsBadgeLoading, setAtsBadgeLoading] = useState<Record<string, boolean>>({});

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('All');
  const [selectedDomain, setSelectedDomain] = useState('All');
  const [selectedMode, setSelectedMode] = useState<'All' | 'remote' | 'hybrid' | 'on_site'>('All');
  const [minStipend, setMinStipend] = useState(0);
  const [maxDurationWeeks, setMaxDurationWeeks] = useState(0);
  const [sortBy, setSortBy] = useState('Match Score');

  useEffect(() => { setRealTokenState(getRealToken()); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [recs, apps] = await Promise.all([getRealRecommendations(), getMyRealApplications()]);
      setInternships(recs);
      const appMap: Record<string, string> = {};
      for (const a of apps) appMap[a.internship_id] = a.id;
      setApplications(appMap);
      loadAtsBadges(recs);
      loadInterviewStatuses(appMap);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  // Fires the cheap deterministic-only ATS check (include_ai=false, no Groq
  // call) for every internship in the list, in parallel, and fills in each
  // card's badge as its result comes back — doesn't block the rest of the
  // page from rendering. One shared resume, so failures here (e.g. no resume
  // uploaded yet) just leave that internship's badge blank rather than
  // erroring the whole page.
  const loadAtsBadges = (recs: RealRecommendation[]) => {
    const ids = recs.map(r => r.internship_id);
    setAtsBadgeLoading(prev => {
      const next = { ...prev };
      ids.forEach(id => { next[id] = true; });
      return next;
    });
    ids.forEach(async (id) => {
      try {
        const result = await getAtsAnalysisReal(id, false);
        setAtsBadgeScores(prev => ({ ...prev, [id]: result.overall_score }));
      } catch {
        // No resume uploaded yet, or the check failed — badge just stays blank
        // for this card; the full click-through check will surface the real error.
      }
      setAtsBadgeLoading(prev => ({ ...prev, [id]: false }));
    });
  };

  // For every applied internship, check whether an interview attempt exists
  // and what it resolved to, so the card's action button can say something
  // true instead of always inviting the student to "Earn Stand-Out Badge"
  // even after they've already failed that exact interview.
  const loadInterviewStatuses = (appMap: Record<string, string>) => {
    Object.entries(appMap).forEach(async ([internshipId, applicationId]) => {
      try {
        const result = await getInterviewResult(applicationId);
        let status: InterviewCardStatus = 'in_progress';
        if (result.status === 'completed') status = result.passed ? 'passed' : 'failed';
        setInterviewStatus(prev => ({ ...prev, [internshipId]: status }));
      } catch {
        // 404 -- no attempt started yet for this application, which is the
        // normal case and matches the 'none' default (card just won't have
        // an entry here, and the render code below treats missing as 'none').
      }
    });
  };

  useEffect(() => { if (realToken) loadData(); }, [realToken]);

  const handleAuth = async () => {
    setAuthError('');
    if (!authEmail.trim() || !authPassword.trim()) { setAuthError('Enter an email and password.'); return; }
    setAuthLoading(true);
    try {
      if (authMode === 'register') await registerStudent(authEmail, authPassword, 'Student');
      else await loginReal(authEmail, authPassword);
      setRealTokenState(getRealToken());
    } catch (e: any) {
      setAuthError(e.message || 'Something went wrong.');
    }
    setAuthLoading(false);
  };

  const handleApply = async (internshipId: string) => {
    setApplyingId(internshipId);
    try {
      const result = await applyToInternshipReal(internshipId);
      setApplications(prev => ({ ...prev, [internshipId]: result.id }));
      // Post-apply, the process (resume match / Aptitude Check / Interview)
      // now lives on its own guided page instead of scattered buttons on
      // this card -- see app/student/application/[applicationId]/page.tsx.
      router.push(`/student/application/${result.id}`);
      return;
    } catch (e: any) {
      alert(e.message || 'Could not apply.');
    }
    setApplyingId(null);
  };

  const handleCheckAts = async (internship: RealRecommendation) => {
    setAtsInternship(internship);
    setAtsResult(null);
    setAtsError('');
    setAtsLoading(true);
    try {
      const result = await getAtsAnalysisReal(internship.internship_id);
      setAtsResult(result);
    } catch (e: any) {
      setAtsError(e.message || 'Could not run the ATS check.');
    }
    setAtsLoading(false);
  };

  const closeAtsModal = () => {
    setAtsInternship(null);
    setAtsResult(null);
    setAtsError('');
  };

  const openReportModal = (internship: RealRecommendation) => {
    setReportInternship(internship);
    setReportReason('fake_listing');
    setReportDetails('');
    setReportError('');
    setReportSubmitted(false);
    setReportAlsoOrg(false);
  };

  const closeReportModal = () => {
    setReportInternship(null);
    setReportError('');
    setReportSubmitted(false);
  };

  const handleSubmitReport = async () => {
    if (!reportInternship) return;
    setReportSubmitting(true);
    setReportError('');
    try {
      await fileReport({
        target_type: 'internship',
        target_id: reportInternship.internship_id,
        reason: reportReason,
        details: reportDetails.trim() || undefined,
      });
      if (reportAlsoOrg && reportInternship.organization_id) {
        await fileReport({
          target_type: 'organization',
          target_id: reportInternship.organization_id,
          reason: reportReason,
          details: reportDetails.trim() || undefined,
        });
      }
      setReportSubmitted(true);
    } catch (e: any) {
      setReportError(e?.message || 'Could not submit the report.');
    }
    setReportSubmitting(false);
  };

  const locations = useMemo(() => ['All', ...Array.from(new Set(internships.map(i => i.location).filter(Boolean)))], [internships]);
  const domains = useMemo(() => ['All', ...Array.from(new Set(internships.map(i => i.domain).filter(Boolean)))], [internships]);

  const filtered = useMemo(() => {
    let list = internships.filter(i =>
      (searchQuery.trim() === '' || i.title.toLowerCase().includes(searchQuery.toLowerCase()) || i.organization_name.toLowerCase().includes(searchQuery.toLowerCase())) &&
      (selectedLocation === 'All' || i.location === selectedLocation) &&
      (selectedDomain === 'All' || i.domain === selectedDomain) &&
      (selectedMode === 'All' || i.work_mode === selectedMode) &&
      ((i.stipend ?? 0) >= minStipend) &&
      (maxDurationWeeks === 0 || i.duration_weeks <= maxDurationWeeks)
    );
    if (sortBy === 'Stipend (High-Low)') list = [...list].sort((a, b) => (b.stipend ?? 0) - (a.stipend ?? 0));
    else if (sortBy === 'Duration (Short-Long)') list = [...list].sort((a, b) => a.duration_weeks - b.duration_weeks);
    else list = [...list].sort((a, b) => b.final_score - a.final_score);
    return list;
  }, [internships, searchQuery, selectedLocation, selectedDomain, selectedMode, minStipend, maxDurationWeeks, sortBy]);
  if (!realToken) {
    return (
      <div style={{ maxWidth: 420, margin: '60px auto' }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Live Internships</h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
          Real internships from your actual backend. Sign in to view and apply.
        </p>
        <div className="glass-card" style={{ padding: 24 }}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <button onClick={() => setAuthMode('register')} style={{ flex: 1, padding: '8px 0', fontSize: 13, fontWeight: 600, background: authMode === 'register' ? 'var(--accent-cyan)' : 'transparent', color: authMode === 'register' ? '#050505' : 'var(--text-secondary)', border: '1px solid var(--glass-border)', cursor: 'pointer' }}>Create Account</button>
            <button onClick={() => setAuthMode('login')} style={{ flex: 1, padding: '8px 0', fontSize: 13, fontWeight: 600, background: authMode === 'login' ? 'var(--accent-cyan)' : 'transparent', color: authMode === 'login' ? '#050505' : 'var(--text-secondary)', border: '1px solid var(--glass-border)', cursor: 'pointer' }}>Sign In</button>
          </div>
          <input className="input-field" type="email" placeholder="you@example.com" value={authEmail} onChange={e => setAuthEmail(e.target.value)} style={{ marginBottom: 10 }} />
          <input className="input-field" type="password" placeholder="********" value={authPassword} onChange={e => setAuthPassword(e.target.value)} style={{ marginBottom: 14 }} />
          {authError && <div style={{ fontSize: 12, color: 'var(--accent-rose)', marginBottom: 12 }}>{authError}</div>}
          <button className="btn-primary" onClick={handleAuth} disabled={authLoading} style={{ width: '100%' }}>
            {authLoading ? 'Please wait...' : authMode === 'register' ? 'Create Account & Continue' : 'Sign In'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 6 }}>Live Internships</h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Real postings from your backend, ranked by match score against your profile.</p>
      </div>

      <div className="glass-card" style={{ padding: 16, marginBottom: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 200px' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--text-muted)' }} />
          <input className="input-field" placeholder="Search title or company..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ paddingLeft: 32 }} />
        </div>
        <select className="input-field" value={selectedLocation} onChange={e => setSelectedLocation(e.target.value)} style={{ width: 150 }}>
          {locations.map(l => <option key={l} value={l}>{l === 'All' ? 'All Locations' : l}</option>)}
        </select>
        <select className="input-field" value={selectedMode} onChange={e => setSelectedMode(e.target.value as any)} style={{ width: 140 }}>
          {WORK_MODES.map(m => <option key={m} value={m}>{m === 'All' ? 'All Modes' : WORK_MODE_LABEL[m]}</option>)}
        </select>
        <select className="input-field" value={selectedDomain} onChange={e => setSelectedDomain(e.target.value)} style={{ width: 170 }}>
          {domains.map(d => <option key={d} value={d}>{d === 'All' ? 'All Domains' : d}</option>)}
        </select>
        <input type="number" className="input-field" placeholder="Min stipend (Rs)" value={minStipend || ''} onChange={e => setMinStipend(Number(e.target.value) || 0)} style={{ width: 140 }} />
        <input type="number" className="input-field" placeholder="Max duration (wks)" value={maxDurationWeeks || ''} onChange={e => setMaxDurationWeeks(Number(e.target.value) || 0)} style={{ width: 150 }} />
        <select className="input-field" value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ width: 180 }}>
          {SORT_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {loading ? (
        <Loader2 size={24} className="animate-spin" />
      ) : filtered.length === 0 ? (
        <div className="glass-card" style={{ padding: 48, textAlign: 'center' }}>
          <Search size={40} color="var(--text-muted)" style={{ marginBottom: 16 }} />
          <h3 style={{ marginBottom: 8 }}>No matches found</h3>
          <p style={{ color: 'var(--text-secondary)' }}>Try adjusting your filters, or check back once more internships are posted.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {filtered.map((i, idx) => {
            const applicationId = applications[i.internship_id];
            const iStatus: InterviewCardStatus = interviewStatus[i.internship_id] || 'none';
            // BUG FIX: final_score arrives from the backend as a 0-1 ratio
            // (see recommendation_engine.py's compute_hybrid_score -- it's
            // never multiplied by 100), but this card was treating it as if
            // it were already a 0-100 percentage everywhere below -- so a
            // real 82% match rendered as "1%" (Math.round(0.82)) and
            // anything under a 0.5 ratio rounded down to "0%". Converting
            // once here and using matchPct everywhere fixes the display
            // without touching the actual scoring math, which was correct
            // all along.
            const matchPct = Math.round(i.final_score * 100);
            const scoreColor = matchPct >= 80 ? 'var(--accent-emerald)' : matchPct >= 60 ? 'var(--accent-amber)' : 'var(--accent-rose)';
            return (
              <div key={i.internship_id} className="glass-card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                  <div style={{ flexShrink: 0, textAlign: 'center', width: 64 }}>
                    <div style={{
                      width: 58, height: 58, borderRadius: '50%',
                      background: `conic-gradient(${scoreColor} ${matchPct * 3.6}deg, var(--bg-elevated) 0deg)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 4px',
                    }}>
                      <div style={{
                        width: 44, height: 44, borderRadius: '50%', background: 'var(--bg-card)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 800, fontSize: 12, color: scoreColor,
                      }}>
                        {matchPct}%
                      </div>
                    </div>
                    {idx < 3 && (
                      <div className={`badge badge-${idx === 0 ? 'amber' : idx === 1 ? 'primary' : 'cyan'}`} style={{ fontSize: 8, padding: '2px 4px' }}>#{idx + 1}</div>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <div style={{ fontSize: 16, fontWeight: 700 }}>{i.title}</div>
                      {iStatus === 'passed' ? (
                        <span className="badge badge-emerald" style={{ fontSize: 9, display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Award size={10} /> Badge Earned
                        </span>
                      ) : iStatus === 'failed' ? (
                        <span className="badge" style={{ fontSize: 9, display: 'flex', alignItems: 'center', gap: 3, color: 'var(--accent-rose)', borderColor: 'var(--accent-rose)' }}>
                          Interview Not Passed
                        </span>
                      ) : iStatus === 'in_progress' ? (
                        <span className="badge badge-amber" style={{ fontSize: 9 }}>Interview In Progress</span>
                      ) : (
                        <span className="badge badge-amber" style={{ fontSize: 9, display: 'flex', alignItems: 'center', gap: 3 }}>Earn a Badge</span>
                      )}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <Building2 size={12} /> {i.organization_name} - {i.domain}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><MapPin size={12} /> {i.location}</span>
                      <span className={`badge badge-${i.work_mode === 'remote' ? 'emerald' : i.work_mode === 'hybrid' ? 'cyan' : 'primary'}`} style={{ fontSize: 9 }}>{WORK_MODE_LABEL[i.work_mode]}</span>
                      <span>{i.duration_weeks} wks</span>
                      {i.stipend != null && (
                        <span style={{ color: 'var(--accent-emerald)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                          <Briefcase size={11} /> Rs {i.stipend.toLocaleString()}/mo
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }} onClick={e => e.stopPropagation()}>
                    <button className="btn-secondary" onClick={() => setExpandedId(expandedId === i.internship_id ? null : i.internship_id)} style={{ padding: '8px 12px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Info size={12} /> XAI <ChevronDown size={12} style={{ transform: expandedId === i.internship_id ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={() => handleCheckAts(i)}
                      title="Click for the full ATS breakdown, including AI-reviewed notes"
                      style={{ padding: '6px 12px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}
                    >
                      {atsBadgeLoading[i.internship_id] ? (
                        <><Loader2 size={12} className="animate-spin" /> ATS</>
                      ) : atsBadgeScores[i.internship_id] != null ? (
                        <>
                          <ShieldCheck size={12} color={atsBadgeScores[i.internship_id] >= 80 ? 'var(--accent-emerald)' : atsBadgeScores[i.internship_id] >= 55 ? 'var(--accent-amber)' : 'var(--accent-rose)'} />
                          ATS {atsBadgeScores[i.internship_id]}%
                        </>
                      ) : (
                        <><ShieldCheck size={12} /> ATS Check</>
                      )}
                    </button>
                    <button
                      className="btn-secondary"
                      onClick={() => openReportModal(i)}
                      title="Report this listing or company"
                      style={{ padding: '6px 10px', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}
                    >
                      <Flag size={12} />
                    </button>
                    {!applicationId ? (
                      <button className="btn-primary" onClick={() => handleApply(i.internship_id)} disabled={applyingId === i.internship_id}>
                        {applyingId === i.internship_id ? <Loader2 size={14} className="animate-spin" /> : 'Apply'}
                      </button>
                    ) : (
                      /* Once applied, the whole post-apply process (resume match,
                         Aptitude Check, Interview, status) lives on its own guided
                         page instead of separate buttons here -- see
                         app/student/application/[applicationId]/page.tsx. The small
                         badge/status chip next to the title above still gives an
                         at-a-glance read without leaving this list. */
                      <button className="btn-primary" onClick={() => router.push(`/student/application/${applicationId}`)}>
                        Continue Application
                      </button>
                    )}
                  </div>
                </div>

                {expandedId === i.internship_id && (
                  <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--glass-border)' }}>
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 12 }}>{i.explanation}</p>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 12 }}>
                      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', padding: '8px 10px' }}>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Skill Overlap</div>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{Math.round(i.skill_overlap_score * 100)}%</div>
                      </div>
                      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', padding: '8px 10px' }}>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Profile Similarity</div>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{i.content_based_score != null ? `${Math.round(i.content_based_score * 100)}%` : 'N/A'}</div>
                      </div>
                      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', padding: '8px 10px' }}>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Peer Signal</div>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{i.collaborative_score != null ? `${Math.round(i.collaborative_score * 100)}%` : 'N/A'}</div>
                      </div>
                    </div>
                    {i.matched_skills.length > 0 && (
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--accent-emerald)', fontWeight: 600, marginBottom: 6 }}>Matched Skills</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {i.matched_skills.map(s => <span key={s} className="tag matched" style={{ fontSize: 11 }}>{s}</span>)}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {atsInternship && (
        <div
          onClick={closeAtsModal}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <div
            className="glass-card"
            onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 640, maxHeight: '85vh', overflowY: 'auto', padding: 24 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <ShieldCheck size={18} /> ATS Analysis
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {atsInternship.title} at {atsInternship.organization_name}
                </div>
              </div>
              <button onClick={closeAtsModal} className="btn-secondary" style={{ padding: 6 }}><X size={16} /></button>
            </div>

            {atsLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '24px 0', color: 'var(--text-secondary)' }}>
                <Loader2 size={16} className="animate-spin" /> Running deterministic ATS checks...
              </div>
            )}

            {atsError && (
              <div style={{ padding: 16, background: 'var(--bg-elevated)', border: '1px solid var(--accent-rose)', fontSize: 13, color: 'var(--accent-rose)', marginBottom: 12 }}>
                {atsError}
              </div>
            )}

            {atsResult && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
                  <div style={{
                    width: 72, height: 72, borderRadius: '50%', flexShrink: 0,
                    background: `conic-gradient(${atsResult.overall_score >= 80 ? 'var(--accent-emerald)' : atsResult.overall_score >= 55 ? 'var(--accent-amber)' : 'var(--accent-rose)'} ${atsResult.overall_score * 3.6}deg, var(--bg-elevated) 0deg)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <div style={{ width: 58, height: 58, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15 }}>
                      {atsResult.overall_score}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))', gap: 8, flex: 1 }}>
                    {Object.entries(atsResult.category_scores).map(([key, val]) => (
                      <div key={key} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', padding: '6px 8px' }}>
                        <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{key.replace(/_/g, ' ')}</div>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{val}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {atsResult.keyword_gap && (
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Keyword Match vs This Role</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
                      {atsResult.keyword_gap.matched.map(s => <span key={s} className="tag matched" style={{ fontSize: 11 }}>{s}</span>)}
                    </div>
                    {atsResult.keyword_gap.missing.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {atsResult.keyword_gap.missing.map(s => (
                          <span key={s} className="tag" style={{ fontSize: 11, color: 'var(--accent-rose)', borderColor: 'var(--accent-rose)' }}>{s} (missing)</span>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Parser Checks</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {atsResult.checks.map(c => (
                      <div key={c.id} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', padding: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          {c.status === 'pass' ? <CheckCircle size={14} color={atsStatusColor(c.status)} style={{ marginTop: 2, flexShrink: 0 }} /> :
                            c.status === 'warn' ? <AlertTriangle size={14} color={atsStatusColor(c.status)} style={{ marginTop: 2, flexShrink: 0 }} /> :
                            <XCircle size={14} color={atsStatusColor(c.status)} style={{ marginTop: 2, flexShrink: 0 }} />}
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, color: atsStatusColor(c.status) }}>{c.label}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.5 }}>{c.detail}</div>
                            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>
                              {c.platforms.map(p => ATS_PLATFORM_LABEL[p] || p).join(' - ')}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {atsResult.ai_reviewed && atsResult.genuine_mistakes.length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <Sparkles size={13} /> Recruiter-Style Notes
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {atsResult.genuine_mistakes.map((m, idx) => (
                        <div key={idx} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', padding: 10 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{m.issue}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: 4 }}>"{m.quote}"</div>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>{m.why_it_matters}</div>
                          <div style={{ fontSize: 11, color: 'var(--accent-emerald)' }}>Fix: {m.fix}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {!atsResult.ai_reviewed && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                    Deterministic checks only -- AI-reviewed qualitative notes weren't available for this run.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {reportInternship && (
        <div
          onClick={closeReportModal}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100,
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
        >
          <div
            className="glass-card"
            onClick={e => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 480, padding: 24 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Flag size={18} /> Report Listing
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                  {reportInternship.title} at {reportInternship.organization_name}
                </div>
              </div>
              <button onClick={closeReportModal} className="btn-secondary" style={{ padding: 6 }}><X size={16} /></button>
            </div>

            {reportSubmitted ? (
              <div style={{ padding: '20px 0', textAlign: 'center' }}>
                <CheckCircle size={28} color="var(--accent-emerald)" style={{ marginBottom: 10 }} />
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Report submitted</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Our trust &amp; safety team will review this.</div>
                <button className="btn-primary" onClick={closeReportModal} style={{ marginTop: 16 }}>Close</button>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Reason</label>
                  <select
                    className="input-field"
                    value={reportReason}
                    onChange={e => setReportReason(e.target.value as ReportReason)}
                    style={{ width: '100%' }}
                  >
                    {(Object.keys(REPORT_REASON_LABEL) as ReportReason[]).map(r => (
                      <option key={r} value={r}>{REPORT_REASON_LABEL[r]}</option>
                    ))}
                  </select>
                </div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Details (optional)</label>
                  <textarea
                    className="input-field"
                    value={reportDetails}
                    onChange={e => setReportDetails(e.target.value)}
                    placeholder="Anything that would help us look into this..."
                    rows={4}
                    style={{ width: '100%', resize: 'vertical' }}
                  />
                </div>
                {reportInternship.organization_id && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={reportAlsoOrg}
                      onChange={e => setReportAlsoOrg(e.target.checked)}
                    />
                    Also report {reportInternship.organization_name} (the company)
                  </label>
                )}
                {reportError && (
                  <div style={{ fontSize: 12, color: 'var(--accent-rose)', marginBottom: 12 }}>{reportError}</div>
                )}
                <button className="btn-primary" onClick={handleSubmitReport} disabled={reportSubmitting} style={{ width: '100%' }}>
                  {reportSubmitting ? <Loader2 size={14} className="animate-spin" /> : 'Submit Report'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
