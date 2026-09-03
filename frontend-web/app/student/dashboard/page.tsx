'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import {
  Target, TrendingUp, FileText, Zap, Star, ArrowRight,
  Clock, MapPin, Building2, Briefcase, CheckCircle, AlertCircle,
  Sparkles, ChevronRight, Award, BookOpen, Compass, Brain, Cpu, Bell, X, Shield
} from 'lucide-react';
import { getStoredJobs } from '@/lib/store';
import {
  generateRecommendations, calculateCompetencyDimensions,
  predictCareerPaths, analyzeSkillGaps, StudentProfile, MatchResult,
  CompetencyDimensions, CareerPathPrediction, SkillGapAnalysis
} from '@/lib/aiEngine';
import { fetchStudentProfile, EMPTY_STUDENT_PROFILE } from '@/lib/userContext';
import { resolveAvatarUrl } from '@/lib/realApi';
import {
  getRealToken, getMyRealApplications,
  getRealRecommendationsAsMatchResults, getRealCompetencyDimensions,
  getRealCareerPathPredictions, getRealSkillGapAnalysis,
  getStudentNotifications, markNotificationRead, StudentNotification,
  updateStudentInvitationPreferences,
} from '@/lib/realApi';
import { useArcadeFX } from '@/app/components/ArcadeFX';

export default function StudentDashboard() {
  const { toast, playSound, ArcadeToasts } = useArcadeFX();
  const [student, setStudent] = useState<StudentProfile>(EMPTY_STUDENT_PROFILE);
  const [recommendations, setRecommendations] = useState<MatchResult[]>([]);
  const [userApps, setUserApps] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<StudentNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  // Module 10 — Invitation preferences
  const [allowInvitations, setAllowInvitations] = useState(true);
  const [maxWeeklyInvites, setMaxWeeklyInvites] = useState(10);
  const [prefSaving, setPrefSaving] = useState(false);
  const [prefSaved, setPrefSaved] = useState(false);
  const [competency, setCompetency] = useState<CompetencyDimensions>({
    academicExcellence: 0, technicalExpertise: 0, projectMaturity: 0, professionalExperience: 0,
    innovation: 0, leadership: 0, communication: 0, careerReadiness: 0,
  });
  const [careerPredictions, setCareerPredictions] = useState<CareerPathPrediction[]>([]);
  const [skillGap, setSkillGap] = useState<SkillGapAnalysis>({
    targetRole: '', currentMatch: 0, missingSkills: [], learningRoadmap: [], recommendedCertifications: [],
  });

  useEffect(() => {
    const loadData = async () => {
      const activeStudent = await fetchStudentProfile();
      setStudent(activeStudent);

      const hasRealToken = !!getRealToken();

      // ---------- Recommendations ----------
      let recs: MatchResult[] = [];
      if (hasRealToken) {
        try {
          recs = await getRealRecommendationsAsMatchResults();
        } catch { /* fall through to Node fallback */ }
      }
      if (recs.length === 0) {
        // Fallback: old Node/JSON pipeline (mock data / locally-posted jobs)
        const jobs = await getStoredJobs();
        const customInternships = jobs.map(j => ({
          id: j.id,
          title: j.title,
          company: j.company,
          domain: j.domain,
          sector: 'Private' as const,
          mode: j.workMode,
          location: j.location,
          duration: j.duration,
          stipend: j.stipend,
          openings: j.openings,
          deadline: j.deadline || '2025-12-31',
          description: j.description,
          responsibilities: [j.description],
          eligibility: ['Pursuing Bachelor degree'],
          requiredSkills: j.requiredSkills,
          preferredSkills: j.preferredSkills || [],
          perks: j.perks || ['Certificate', 'Mentorship'],
          postedDate: j.createdAt,
          state: j.location.includes('Remote') ? 'All India' : j.location,
        }));
        recs = await generateRecommendations(activeStudent, customInternships);
      }
      setRecommendations(recs.slice(0, 5));

      // Notifications (Module 6)
      if (hasRealToken) {
        try {
          const notifs = await getStudentNotifications();
          setNotifications(notifs);
        } catch { /* silently ignore — non-critical */ }
      }

      // ---------- Competency / Career / Skill-Gap ----------
      let comp: CompetencyDimensions | null = null;
      let careerPreds: CareerPathPrediction[] = [];
      let gap: SkillGapAnalysis | null = null;

      if (hasRealToken) {
        // Try real backend for all three in parallel
        const targetDomain = activeStudent.preferredDomains[0] || 'Full-Stack Engineer';
        const results = await Promise.allSettled([
          getRealCompetencyDimensions(),
          getRealCareerPathPredictions(),
          getRealSkillGapAnalysis(targetDomain),
        ]);
        if (results[0].status === 'fulfilled') comp = results[0].value;
        if (results[1].status === 'fulfilled') careerPreds = results[1].value;
        if (results[2].status === 'fulfilled') gap = results[2].value;
      }

      // Fallback to Node backend for any that didn't resolve
      if (!comp) comp = await calculateCompetencyDimensions(activeStudent);
      if (careerPreds.length === 0) careerPreds = await predictCareerPaths(activeStudent);
      if (!gap) gap = await analyzeSkillGaps(activeStudent, activeStudent.preferredDomains[0] || 'Information Technology');

      setCompetency(comp);
      setCareerPredictions(careerPreds);
      setSkillGap(gap);

      // ---------- Applications ----------
      try {
        const realApps = hasRealToken ? await getMyRealApplications() : [];
        setUserApps(realApps || []);
      } catch (e) {
        setUserApps([]);
      }
    };

    loadData();
    window.addEventListener('nexyuva_profile_updated', loadData);
    window.addEventListener('nexyuva_jobs_updated', loadData);
    window.addEventListener('nexyuva_apps_updated', loadData);
    return () => {
      window.removeEventListener('nexyuva_profile_updated', loadData);
      window.removeEventListener('nexyuva_jobs_updated', loadData);
      window.removeEventListener('nexyuva_apps_updated', loadData);
    };
  }, []);


  const topMatch = recommendations[0];
  const appliedCount = userApps.length;
  const shortlistedCount = userApps.filter(a => a.status === 'shortlisted').length;

  return (
    <div>
      {ArcadeToasts}
      {/* Dynamic Header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span className="badge badge-primary">SYS:IDENTIFIED</span>
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>STUDENT_TWIN_ACTIVE</span>
            </div>
            <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 4, fontFamily: 'var(--font-serif)' }}>
              Welcome back, <span className="gradient-text">{student.name.split(' ')[0]}</span>
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, fontFamily: 'var(--font-mono)' }}>
              {student.college} · {student.degree} {student.branch} · YEAR {student.year} · CGPA {student.cgpa}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative' }}>
            {/* Notification Bell */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => { setShowNotifications(v => !v); }}
                onMouseEnter={() => {}}
                style={{
                  background: notifications.some(n => !n.is_read)
                    ? 'rgba(251,191,36,0.12)'
                    : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${notifications.some(n => !n.is_read) ? 'rgba(251,191,36,0.4)' : 'var(--glass-border)'}`,
                  borderRadius: 0, width: 40, height: 40,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', position: 'relative',
                }}
              >
                <Bell size={18} color={notifications.some(n => !n.is_read) ? 'var(--accent-amber)' : 'var(--text-muted)'} />
                {notifications.filter(n => !n.is_read).length > 0 && (
                  <span style={{
                    position: 'absolute', top: -4, right: -4,
                    background: 'var(--accent-rose)', color: '#fff',
                    borderRadius: '50%', width: 18, height: 18,
                    fontSize: 10, fontWeight: 700, fontFamily: 'var(--font-mono)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {notifications.filter(n => !n.is_read).length}
                  </span>
                )}
              </button>

              {/* Notification Dropdown */}
              {showNotifications && (
                <div style={{
                  position: 'absolute', top: 48, right: 0, zIndex: 100,
                  width: 360, maxHeight: 480, overflowY: 'auto',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: 0,
                  boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                }}>
                  <div style={{
                    padding: '14px 16px', borderBottom: '1px solid var(--glass-border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  }}>
                    <span style={{ fontWeight: 700, fontSize: 13, fontFamily: 'var(--font-mono)', color: 'var(--accent-amber)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      <Bell size={13} style={{ display: 'inline', marginRight: 6 }} />
                      Invitations
                    </span>
                    <button onClick={() => setShowNotifications(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                      <X size={16} />
                    </button>
                  </div>
                  {notifications.length === 0 ? (
                    <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                      No invitations yet
                    </div>
                  ) : (
                    notifications.map(notif => (
                      <div
                        key={notif.id}
                        style={{
                          padding: '14px 16px',
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                          background: notif.is_read ? 'transparent' : 'rgba(251,191,36,0.04)',
                          cursor: 'pointer',
                          transition: 'background 0.15s',
                        }}
                        onClick={async () => {
                          if (!notif.is_read) {
                            await markNotificationRead(notif.id);
                            setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n));
                          }
                          if (notif.action_url) window.location.href = notif.action_url;
                        }}
                      >
                        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                          {!notif.is_read && (
                            <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent-amber)', marginTop: 5, flexShrink: 0 }} />
                          )}
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: notif.is_read ? 500 : 700, fontSize: 13, color: 'var(--text-primary)', marginBottom: 4 }}>
                              {notif.title}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                              {notif.body}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, fontFamily: 'var(--font-mono)' }}>
                              {new Date(notif.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="badge badge-amber" style={{ padding: '6px 12px' }}>
              <Star size={12} /> PROFILE SCORE: {student.resumeScore}%
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Top AI Match', value: topMatch ? `${topMatch.score}%` : '—', icon: Target, color: 'var(--primary)', sub: topMatch ? topMatch.internship.company : 'Best match', bg: 'var(--blue-dim)' },
          { label: 'Career Readiness', value: `${competency.careerReadiness}%`, icon: Cpu, color: 'var(--accent-emerald)', sub: '8-Dimension Assessment', bg: 'rgba(45,122,95,0.1)' },
          { label: 'Applications', value: appliedCount, icon: FileText, color: 'var(--accent-cyan)', sub: `${shortlistedCount} shortlisted`, bg: 'var(--blue-dim)' },
          { label: 'Active Skills', value: student.skills.length, icon: Brain, color: 'var(--accent-amber)', sub: 'Competency Vector', bg: 'var(--orange-dim)' },
        ].map(stat => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="glass-card" style={{ padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ width: 40, height: 40, background: stat.bg, border: `1px solid ${stat.color}30`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={20} color={stat.color} />
                </div>
                <span className="badge badge-primary" style={{ fontSize: 9 }}>AI LIVE</span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, fontFamily: 'var(--font-mono)', color: stat.color, marginBottom: 4 }}>{stat.value}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 2 }}>{stat.label}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>{stat.sub}</div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: 24 }}>
        {/* Main Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

          {/* 8-Dimension Digital Competency Profile (SRS Chapter 13 & Slide 34) */}
          <div className="glass-card" style={{ padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Brain size={20} color="var(--primary-light)" />
                  Digital Competency Profile
                </h2>
                <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Normalized 8-Dimension Assessment across structured & NLP data</p>
              </div>
              <Link href="/student/profile" className="btn-ghost" style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}>MANAGE SKILLS →</Link>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {[
                { name: 'Academic Excellence', val: competency.academicExcellence, color: 'var(--primary)' },
                { name: 'Technical Expertise', val: competency.technicalExpertise, color: 'var(--accent-cyan)' },
                { name: 'Project Maturity', val: competency.projectMaturity, color: 'var(--secondary)' },
                { name: 'Professional Experience', val: competency.professionalExperience, color: 'var(--accent-emerald)' },
                { name: 'Innovation & Research', val: competency.innovation, color: 'var(--accent-amber)' },
                { name: 'Leadership & Soft Skills', val: competency.leadership, color: 'var(--accent-rose)' },
                { name: 'Communication Clarity', val: competency.communication, color: '#67E8F9' },
                { name: 'Overall Career Readiness', val: competency.careerReadiness, color: '#6EE7B7' },
              ].map(dim => (
                <div key={dim.name} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>{dim.name}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: dim.color, fontFamily: 'var(--font-mono)' }}>{dim.val}/100</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${dim.val}%`, background: dim.color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* AI Career Path Predictions (SRS Chapter 22 & Slide 8) */}
          <div className="glass-card" style={{ padding: 24 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <TrendingUp size={20} color="var(--accent-emerald)" />
              Predicted Career Trajectories
            </h2>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
              {careerPredictions.slice(0, 2).map((path, idx) => (
                <div key={idx} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 700 }}>{path.title}</h3>
                    <span className="badge badge-emerald" style={{ fontSize: 9 }}>{path.matchProbability}% MATCH</span>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.5 }}>{path.description}</p>
                  <div style={{ fontSize: 10, color: 'var(--accent-cyan)', fontWeight: 600, marginBottom: 8, fontFamily: 'var(--font-mono)' }}>DEMAND: {path.growthRate}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {path.keySkillsNeeded.map(s => <span key={s} className="tag" style={{ fontSize: 10 }}>{s}</span>)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top Recommendations */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                <Sparkles size={20} color="var(--accent-amber)" />
                AI Recommendation Engine
              </h2>
              <Link href="/student/live-internships" style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--primary-light)', fontSize: 13, textDecoration: 'none', fontWeight: 600 }}>
                View all ({recommendations.length}) <ChevronRight size={14} />
              </Link>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {recommendations.map((rec, i) => (
                <RecommendationCard key={rec.internship.id} rec={rec} rank={i + 1} />
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Skill Gap Analysis (SRS Chapter 23) */}
          <div className="glass-card" style={{ padding: 20, borderRadius: 'var(--radius-md)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Target size={16} color="var(--accent-rose)" />
              Skill Gap Analysis
            </h3>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
              TARGET: <strong style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{skillGap.targetRole}</strong>
            </p>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>FIT SCORE</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>{skillGap.currentMatch}%</span>
            </div>
            <div className="progress-bar" style={{ marginBottom: 16 }}>
              <div className="progress-fill" style={{ width: `${skillGap.currentMatch}%`, background: 'var(--accent-cyan)' }} />
            </div>

            {skillGap.missingSkills.length > 0 ? (
              <div>
                <div style={{ fontSize: 10, color: 'var(--accent-rose)', fontWeight: 700, marginBottom: 8, fontFamily: 'var(--font-mono)' }}>COMPETENCIES REQUIRED:</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
                  {skillGap.missingSkills.map(s => (
                    <span key={s} className="tag missing" style={{ fontSize: 10 }}>{s}</span>
                  ))}
                </div>
                <div style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', padding: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
                  💡 Step 1: {skillGap.learningRoadmap[0]?.title}
                </div>
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--accent-emerald)' }}>🎉 You meet all core requirements for your target domain!</div>
            )}
          </div>

          {/* Dynamic Profile Summary */}
          <div className="glass-card" style={{ padding: 20 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Active Profile</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              {student.avatarUrl ? (
                <img
                  src={resolveAvatarUrl(student.avatarUrl) || undefined}
                  alt={student.name}
                  style={{ width: 48, height: 48, objectFit: 'cover' }}
                />
              ) : (
                <div style={{
                  width: 48, height: 48, background: 'var(--blue)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 16, color: '#050505',
                  fontFamily: 'var(--font-mono)'
                }}>
                  {student.avatar || student.name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{student.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{student.email}</div>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 8, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>College</span>
                <span style={{ fontWeight: 600 }}>{student.college}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Degree & Branch</span>
                <span style={{ fontWeight: 600 }}>{student.degree} {student.branch}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>CGPA</span>
                <span style={{ fontWeight: 600, color: 'var(--accent-emerald)' }}>{student.cgpa} / 10</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Skills Added</span>
                <span style={{ fontWeight: 600, color: 'var(--primary-light)' }}>{student.skills.length} skills</span>
              </div>
            </div>

            <Link href="/student/profile" className="btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 16, borderRadius: 'var(--radius-md)', padding: '10px' }}>
              Edit & Parse Resume
            </Link>
          </div>

          {/* Module 10 — Invitation Preferences */}
          <div className="glass-card" style={{
            padding: 20,
            border: '1px solid rgba(16,185,129,0.2)',
            background: 'linear-gradient(135deg, rgba(16,185,129,0.04), rgba(6,182,212,0.03))',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <Shield size={15} color="var(--accent-emerald)" />
              <h3 style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--accent-emerald)', textTransform: 'uppercase', letterSpacing: 0.4 }}>Invitation Preferences</h3>
              <span style={{ marginLeft: 'auto', fontSize: 9, background: 'rgba(16,185,129,0.12)', color: 'var(--accent-emerald)', padding: '2px 7px', borderRadius: 0, fontFamily: 'var(--font-mono)' }}>Module 10</span>
            </div>

            {/* Allow Invitations toggle */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>Receive Invitations</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Allow companies to invite you</div>
              </div>
              <button
                onClick={() => setAllowInvitations(v => !v)}
                style={{
                  width: 44, height: 24, borderRadius: 0, border: 'none',
                  background: allowInvitations ? 'var(--accent-emerald)' : 'rgba(255,255,255,0.12)',
                  cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
                }}
              >
                <div style={{
                  position: 'absolute', top: 3,
                  left: allowInvitations ? 23 : 3,
                  width: 18, height: 18, borderRadius: '50%',
                  background: '#fff',
                  transition: 'left 0.2s',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                }} />
              </button>
            </div>

            {/* Max weekly invites */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ fontSize: 12, fontWeight: 600 }}>Weekly Invite Limit</label>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-cyan)', fontFamily: 'var(--font-mono)' }}>{maxWeeklyInvites}</span>
              </div>
              <input
                type="range" min={1} max={20} step={1}
                value={maxWeeklyInvites}
                onChange={e => setMaxWeeklyInvites(Number(e.target.value))}
                disabled={!allowInvitations}
                style={{ width: '100%', accentColor: 'var(--accent-cyan)', opacity: allowInvitations ? 1 : 0.4 }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
                <span>1/wk</span><span>10/wk</span><span>20/wk</span>
              </div>
            </div>

            <button
              className="btn-primary"
              style={{ width: '100%', justifyContent: 'center', padding: '9px', fontSize: 12, fontFamily: 'var(--font-mono)' }}
              disabled={prefSaving}
              onClick={async () => {
                setPrefSaving(true);
                try {
                  await updateStudentInvitationPreferences(allowInvitations, maxWeeklyInvites);
                  playSound.collect();
                  toast('PREFERENCES SAVED', `WEEKLY LIMIT SET TO ${maxWeeklyInvites}`);
                  setPrefSaved(true);
                  setTimeout(() => setPrefSaved(false), 3000);
                } catch { /* ignore */ } finally { setPrefSaving(false); }
              }}
            >
              {prefSaving ? 'Saving…' : prefSaved ? '✓ Saved' : 'Save Preferences'}
            </button>

            <p style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 10, lineHeight: 1.5, fontStyle: 'italic' }}>
              Companies respect your opt-out. A 14-day cooldown applies automatically after rejecting an invitation.
            </p>
          </div>

          {/* Recent Applications */}
          <div className="glass-card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>Recent Applications</h3>
              <Link href="/student/applications" style={{ fontSize: 12, color: 'var(--primary-light)', textDecoration: 'none' }}>View all</Link>
            </div>
            {userApps.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>No applications submitted yet.</p>
            ) : (
              userApps.slice(0, 3).map(app => (
                <div key={app.id} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 0, background: 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>
                    {(app.organization_name || '?').split(' ').map((w: string) => w[0]).slice(0, 2).join('')}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{app.internship_title}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{app.organization_name}</div>
                  </div>
                  <span className={`badge status-${app.status}`} style={{ fontSize: 9, flexShrink: 0 }}>{app.status}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function RecommendationCard({ rec, rank }: { rec: MatchResult; rank: number }) {
  const scoreColor = rec.score >= 80 ? 'var(--accent-emerald)' : rec.score >= 60 ? 'var(--accent-amber)' : 'var(--accent-rose)';

  return (
    <div className="glass-card" style={{ padding: 20, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      {/* Score Ring */}
      <div style={{ flexShrink: 0, textAlign: 'center' }}>
        <div style={{
          width: 60, height: 60,
          background: `conic-gradient(${scoreColor} ${rec.score * 3.6}deg, var(--bg-elevated) 0deg)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
        }}>
          <div style={{
            width: 46, height: 46, background: 'var(--bg-card)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 13, fontFamily: 'var(--font-mono)', color: scoreColor,
          }}>
            {rec.score}%
          </div>
        </div>
        {rank === 1 && <div style={{ fontSize: 9, color: 'var(--accent-amber)', marginTop: 4, fontWeight: 700 }}>TOP MATCH</div>}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 2 }}>{rec.internship.title}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Building2 size={12} /> {rec.internship.company}
            </div>
          </div>
          <span className={`badge badge-${rec.internship.sector === 'Government' ? 'amber' : rec.internship.sector === 'PSU' ? 'cyan' : 'primary'}`} style={{ fontSize: 9, flexShrink: 0 }}>
            {rec.internship.sector}
          </span>
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
            <MapPin size={11} /> {rec.internship.location}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--text-muted)' }}>
            <Clock size={11} /> {rec.internship.duration}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--accent-emerald)' }}>
            <Briefcase size={11} /> ₹{rec.internship.stipend.toLocaleString()}/mo
          </div>
          <div style={{ fontSize: 11, color: 'var(--accent-cyan)', fontWeight: 600 }}>
            AI Confidence: {rec.confidenceLevel}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
          {rec.matchedSkills.slice(0, 3).map(skill => (
            <span key={skill} className="tag matched">{skill}</span>
          ))}
          {rec.missingSkills.slice(0, 1).map(skill => (
            <span key={skill} className="tag missing">{skill}</span>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            ✓ {rec.matchedSkills.length} matched · ✗ {rec.missingSkills.length} missing
          </span>
          <Link href="/student/live-internships" className="btn-primary" style={{ padding: '6px 16px', fontSize: 12 }}>
            View XAI Breakdown
          </Link>
        </div>
      </div>
    </div>
  );
}
