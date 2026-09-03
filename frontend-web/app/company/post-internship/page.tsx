'use client';
import { useState, useEffect } from 'react';
import { Plus, CheckCircle, Loader2, Sparkles } from 'lucide-react';
import { ALL_SKILLS } from '@/lib/aiEngine';

import { addJob } from '@/lib/store';
import { getRealToken, loginReal, registerOrganization, postInternshipReal, uploadInterviewQuestionsPdf, updateAptitudeCheck } from '@/lib/realApi';

const DOMAINS = ['Information Technology', 'Data Science', 'Digital Marketing', 'Finance', 'Human Resources', 'Design', 'Cloud Computing', 'Cybersecurity', 'Electronics & IoT', 'FinTech', 'Product Management'];
const COMMON_SKILLS = ALL_SKILLS.slice(0, 24);

export default function PostInternshipPage() {
  const [form, setForm] = useState({
    title: '', companyName: '', domain: 'Information Technology', description: '', responsibilities: '',
    requiredSkills: [] as string[], preferredSkills: [] as string[],
    mode: 'Hybrid' as 'Remote' | 'Hybrid' | 'On-site',
    location: 'Bangalore', duration: '3 months', stipend: '15000',
    eligibility: '', cgpaCutoff: '7.0', openings: '5', deadline: '',
    perks: [] as string[],
  });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  // Real-backend posting (needed for the AI video interview feature)
  const [realToken, setRealTokenState] = useState<string | null>(null);
  const [realInternshipId, setRealInternshipId] = useState<string | null>(null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('register');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [questionsPdf, setQuestionsPdf] = useState<File | null>(null);
  const [questionsUploading, setQuestionsUploading] = useState(false);
  const [questionsParsedCount, setQuestionsParsedCount] = useState<number | null>(null);
  const [questionsError, setQuestionsError] = useState('');
  const [aptitudeEnabled, setAptitudeEnabled] = useState(false);
  const [aptitudeDifficulty, setAptitudeDifficulty] = useState<'easy' | 'medium' | 'hard'>('hard');
  const [aptitudeSaving, setAptitudeSaving] = useState(false);
  const [aptitudeSaved, setAptitudeSaved] = useState(false);
  const [aptitudeError, setAptitudeError] = useState('');

  useEffect(() => { setRealTokenState(getRealToken()); }, []);

  const postRealInternship = async () => {
    try {
      const result = await postInternshipReal({
        title: form.title,
        domain: form.domain,
        required_skills: form.requiredSkills.length ? form.requiredSkills : ['JavaScript', 'React'],
        description: form.description,
        duration_weeks: Math.round((parseInt(form.duration) || 12)),
        stipend: parseInt(form.stipend) || null,
        location: form.location || 'Remote',
        work_mode: form.mode === 'On-site' ? 'on_site' : form.mode.toLowerCase() as 'remote' | 'hybrid',
      });
      setRealInternshipId(result.id);
    } catch (e) {
      // Non-fatal — the mock posting above already succeeded, so the demo
      // dashboard still works even if the real backend post fails
      console.error('Real internship post failed', e);
    }
  };

  const handleRealAuth = async () => {
    setAuthError('');
    if (!authEmail.trim() || !authPassword.trim()) { setAuthError('Enter an email and password.'); return; }
    setAuthLoading(true);
    try {
      if (authMode === 'register') {
        await registerOrganization(authEmail, authPassword, form.companyName || 'My Company');
      } else {
        await loginReal(authEmail, authPassword);
      }
      setRealTokenState(getRealToken());
      await postRealInternship();
    } catch (e: any) {
      setAuthError(e.message || 'Something went wrong.');
    }
    setAuthLoading(false);
  };

  const handleUploadQuestions = async () => {
    if (!questionsPdf || !realInternshipId) return;
    setQuestionsUploading(true);
    setQuestionsError('');
    try {
      const result = await uploadInterviewQuestionsPdf(realInternshipId, questionsPdf);
      setQuestionsParsedCount(result.questions_parsed);
    } catch (e: any) {
      setQuestionsError(e.message || 'Could not parse that PDF.');
    }
    setQuestionsUploading(false);
  };

  const handleToggleAptitude = async (enabled: boolean) => {
    if (!realInternshipId) return;
    setAptitudeSaving(true);
    setAptitudeError(''); 
    try {
      await updateAptitudeCheck(realInternshipId, enabled, aptitudeDifficulty);
      setAptitudeEnabled(enabled);
      setAptitudeSaved(true);
    } catch (e: any) {
      setAptitudeError(e.message || 'Could not update Aptitude Check.');
    }
    setAptitudeSaving(false);
  };

  const PERKS_OPTIONS = ['Certificate', 'PPO', 'Mentorship', 'Free Lunch', 'Remote Work', 'Tech stipend', 'LOR', 'Health Insurance', 'Flexible Hours', 'AWS/Cloud credits'];

  const toggleSkill = (skill: string, type: 'required' | 'preferred') => {
    const key = type === 'required' ? 'requiredSkills' : 'preferredSkills';
    setForm(prev => ({
      ...prev,
      [key]: prev[key].includes(skill) ? prev[key].filter(s => s !== skill) : [...prev[key], skill],
    }));
  };

  const togglePerk = (perk: string) => {
    setForm(prev => ({
      ...prev,
      perks: prev.perks.includes(perk) ? prev.perks.filter(p => p !== perk) : [...prev.perks, perk],
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    addJob({
      title: form.title,
      company: form.companyName || 'My Company',
      domain: form.domain,
      description: form.description,
      responsibilities: form.responsibilities,
      requiredSkills: form.requiredSkills.length ? form.requiredSkills : ['JavaScript', 'React'],
      preferredSkills: form.preferredSkills,
      workMode: form.mode,
      location: form.location || 'Remote',
      duration: form.duration,
      stipend: parseInt(form.stipend) || 10000,
      openings: parseInt(form.openings) || 1,
      deadline: form.deadline,
      perks: form.perks,
    });

    if (realToken) {
      await postRealInternship();
    }

    await new Promise(r => setTimeout(r, 600));
    setSubmitted(true);
    setLoading(false);
  };

  if (submitted) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
        <div className="glass-card" style={{ padding: 48, textAlign: 'center', maxWidth: 500 }}>
          <div style={{ width: 72, height: 72, background: 'rgba(45,122,95,0.1)', border: '1px solid rgba(45,122,95,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
            <CheckCircle size={36} color="var(--accent-emerald)" />
          </div>
          <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12, fontFamily: 'var(--font-serif)' }}>Internship Posted!</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 24, fontFamily: 'var(--font-mono)' }}>
            Your internship "<strong style={{ color: 'var(--text-primary)' }}>{form.title}</strong>" is now live. AI will start matching students immediately.
          </p>
          {!realToken ? (
            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: 20, marginBottom: 20, textAlign: 'left' }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>🎥 Enable AI Stand-Out Interview for this role</div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>Connect your employer account (one-time) to upload interview questions.</p>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button onClick={() => setAuthMode('register')} style={{ flex: 1, padding: '6px 0', fontSize: 12, fontWeight: 600, background: authMode === 'register' ? 'var(--accent-cyan)' : 'transparent', color: authMode === 'register' ? '#050505' : 'var(--text-secondary)', border: '1px solid var(--glass-border)', cursor: 'pointer' }}>Create Account</button>
                <button onClick={() => setAuthMode('login')} style={{ flex: 1, padding: '6px 0', fontSize: 12, fontWeight: 600, background: authMode === 'login' ? 'var(--accent-cyan)' : 'transparent', color: authMode === 'login' ? '#050505' : 'var(--text-secondary)', border: '1px solid var(--glass-border)', cursor: 'pointer' }}>Sign In</button>
              </div>
              <input className="input-field" type="email" placeholder="you@company.com" value={authEmail} onChange={e => setAuthEmail(e.target.value)} style={{ marginBottom: 8 }} />
              <input className="input-field" type="password" placeholder="••••••••" value={authPassword} onChange={e => setAuthPassword(e.target.value)} style={{ marginBottom: 10 }} />
              {authError && <div style={{ fontSize: 12, color: 'var(--accent-rose)', marginBottom: 10 }}>{authError}</div>}
              <button className="btn-primary" onClick={handleRealAuth} disabled={authLoading} style={{ width: '100%' }}>
                {authLoading ? 'Please wait...' : authMode === 'register' ? 'Create Account & Continue' : 'Sign In'}
              </button>
            </div>
          ) : !realInternshipId ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
              Preparing the real posting for interview setup...
            </div>
          ) : questionsParsedCount === null ? (
            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: 20, marginBottom: 20, textAlign: 'left' }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>🎥 Upload Interview Questions (PDF)</div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>Up to 100 questions — 10 are randomly asked per candidate during their proctored video interview.</p>
              <input type="file" accept=".pdf" onChange={e => setQuestionsPdf(e.target.files?.[0] || null)} style={{ fontSize: 13, marginBottom: 12 }} />
              {questionsError && <div style={{ fontSize: 12, color: 'var(--accent-rose)', marginBottom: 10 }}>{questionsError}</div>}
              <button className="btn-primary" onClick={handleUploadQuestions} disabled={questionsUploading || !questionsPdf} style={{ width: '100%' }}>
                {questionsUploading ? 'Parsing with AI...' : 'Upload Question Bank'}
              </button>
            </div>
          ) : (
            <div style={{ background: 'rgba(45,122,95,0.09)', border: '1px solid rgba(45,122,95,0.2)', borderRadius: 'var(--radius-lg)', padding: 16, marginBottom: 20, fontSize: 13, color: '#4AAA82' }}>
              ✓ {questionsParsedCount} interview questions loaded — AI Stand-Out Interview is now active for this role.
            </div>
          )}

          {realInternshipId && (
            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: 20, marginBottom: 20, textAlign: 'left' }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Enable Aptitude Check for this role</div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
                An optional, AI-generated 12-question reasoning test scoped to this role. Never blocks applying &mdash; candidates who skip it aren't penalized. Browser-integrity checks only, no webcam.
              </p>
              <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
                <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Difficulty:</label>
                <select value={aptitudeDifficulty} onChange={e => setAptitudeDifficulty(e.target.value as 'easy' | 'medium' | 'hard')} disabled={aptitudeSaving} style={{ fontSize: 12, padding: '4px 8px', background: 'var(--bg-primary)', border: '1px solid var(--glass-border)', color: 'var(--text-primary)' }}>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
              {aptitudeError && <div style={{ fontSize: 12, color: 'var(--accent-rose)', marginBottom: 10 }}>{aptitudeError}</div>}
              {aptitudeEnabled ? (
                <div style={{ background: 'rgba(45,122,95,0.09)', border: '1px solid rgba(45,122,95,0.2)', borderRadius: 'var(--radius-lg)', padding: 12, fontSize: 13, color: '#4AAA82' }}>
                  ✓ Aptitude Check is active for this role at {aptitudeDifficulty} difficulty.
                  <button className="btn-secondary" onClick={() => handleToggleAptitude(false)} disabled={aptitudeSaving} style={{ marginLeft: 12, fontSize: 11 }}>Disable</button>
                </div>
              ) : (
                <button className="btn-primary" onClick={() => handleToggleAptitude(true)} disabled={aptitudeSaving} style={{ width: '100%' }}>
                  {aptitudeSaving ? 'Saving...' : 'Enable Aptitude Check'}
                </button>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button className="btn-secondary" onClick={() => setSubmitted(false)} style={{ fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>Post Another</button>
            <a href="/company/dashboard" className="btn-primary" style={{ fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>Go to Dashboard</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8, fontFamily: 'var(--font-serif)' }}>
          <Plus size={28} style={{ marginRight: 10, verticalAlign: 'middle', color: 'var(--accent-cyan)' }} />
          Post New Internship
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 13, textTransform: 'uppercase' }}>AI will instantly match your role with the most suitable students from across India</p>
      </div>

      <div style={{ display: 'flex', gap: 24 }}>
        <form onSubmit={handleSubmit} style={{ flex: 1 }}>
          {/* Basic Details */}
          <div className="glass-card" style={{ padding: 24, marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, color: 'var(--accent-cyan)' }}>📋 Basic Details</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Internship Title *</label>
                <input className="input-field" placeholder="e.g., Full Stack Developer Intern" required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Company Name *</label>
                <input className="input-field" placeholder="e.g., Acme Technologies Pvt Ltd" required value={form.companyName} onChange={e => setForm({ ...form, companyName: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Domain *</label>
                <select className="select-field" value={form.domain} onChange={e => setForm({ ...form, domain: e.target.value })}>
                  {DOMAINS.map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Work Mode</label>
                <select className="select-field" value={form.mode} onChange={e => setForm({ ...form, mode: e.target.value as 'Remote' | 'Hybrid' | 'On-site' })}>
                  {['Remote', 'Hybrid', 'On-site'].map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Location *</label>
                <input className="input-field" placeholder="e.g., Bangalore, Mumbai, Remote" required value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Duration</label>
                <select className="select-field" value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })}>
                  {['1 month', '2 months', '3 months', '6 months'].map(d => <option key={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Monthly Stipend (₹) *</label>
                <input type="number" className="input-field" placeholder="8000" required value={form.stipend} onChange={e => setForm({ ...form, stipend: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Number of Openings *</label>
                <input type="number" className="input-field" placeholder="10" required value={form.openings} onChange={e => setForm({ ...form, openings: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Min CGPA Requirement</label>
                <input type="number" step="0.1" min="0" max="10" className="input-field" placeholder="7.0" value={form.cgpaCutoff} onChange={e => setForm({ ...form, cgpaCutoff: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Application Deadline *</label>
                <input type="date" className="input-field" required value={form.deadline} onChange={e => setForm({ ...form, deadline: e.target.value })} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Description *</label>
                <textarea className="input-field" placeholder="Describe the role, team, and what the intern will be working on..." required value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} style={{ minHeight: 100, resize: 'vertical' }} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Key Responsibilities</label>
                <textarea className="input-field" placeholder="• Develop features&#10;• Write unit tests&#10;• Participate in code reviews" value={form.responsibilities} onChange={e => setForm({ ...form, responsibilities: e.target.value })} style={{ minHeight: 80, resize: 'vertical' }} />
              </div>
            </div>
          </div>

          {/* Skills */}
          <div className="glass-card" style={{ padding: 24, marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: 'var(--accent-cyan)' }}>🧠 Skills (Powers AI Matching)</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 20 }}>These skills are used by the AI engine to find matching candidates.</p>

            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Required Skills ({form.requiredSkills.length})</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {COMMON_SKILLS.map(skill => (
                  <button key={skill} type="button" onClick={() => toggleSkill(skill, 'required')}
                    style={{
                      padding: '5px 12px', border: '1px solid var(--glass-border)', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', transition: 'all 0.15s',
                      background: form.requiredSkills.includes(skill) ? 'var(--blue-dim)' : 'var(--bg-elevated)',
                      color: form.requiredSkills.includes(skill) ? 'var(--blue)' : 'var(--text-secondary)',
                    }}>
                    {skill}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Preferred Skills ({form.preferredSkills.length})</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {COMMON_SKILLS.map(skill => (
                  <button key={skill} type="button" onClick={() => toggleSkill(skill, 'preferred')}
                    style={{
                      padding: '5px 12px', border: `1px solid ${form.preferredSkills.includes(skill) ? 'rgba(232,130,10,0.3)' : 'var(--glass-border)'}`, cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', transition: 'all 0.15s',
                      background: form.preferredSkills.includes(skill) ? 'var(--blue-dim)' : 'var(--bg-elevated)',
                      color: form.preferredSkills.includes(skill) ? 'var(--blue)' : 'var(--text-muted)',
                    }}>
                    {skill}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Perks */}
          <div className="glass-card" style={{ padding: 24, marginBottom: 20 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, color: 'var(--accent-cyan)' }}>🎁 Perks & Benefits</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {PERKS_OPTIONS.map(perk => (
                <button key={perk} type="button" onClick={() => togglePerk(perk)}
                  style={{
                    padding: '6px 14px', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', transition: 'all 0.15s',
                    background: form.perks.includes(perk) ? 'rgba(45,122,95,0.1)' : 'var(--bg-elevated)',
                    color: form.perks.includes(perk) ? 'var(--accent-emerald)' : 'var(--text-secondary)',
                    border: `1px solid ${form.perks.includes(perk) ? 'rgba(45,122,95,0.3)' : 'var(--glass-border)'}`,
                  }}>
                  {perk}
                </button>
              ))}
            </div>
          </div>

          <button type="submit" className="btn-primary" style={{ width: '100%', padding: '14px', borderRadius: 'var(--radius-md)', fontSize: 15, justifyContent: 'center' }} disabled={loading}>
            {loading ? <><Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Publishing...</> : <><Sparkles size={18} /> Publish & Start AI Matching</>}
          </button>
        </form>

        {/* Preview Panel */}
        <div style={{ width: 300 }}>
          <div className="glass-card" style={{ padding: 20, position: 'sticky', top: 100 }}>
            <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Live Preview</h4>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4, fontFamily: 'var(--font-serif)' }}>{form.title || 'Internship Title'}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>{form.companyName || 'Your Company'}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
              {form.mode && <span className="badge badge-cyan">{form.mode}</span>}
              {form.domain && <span className="badge badge-primary" style={{ fontSize: 9 }}>{form.domain}</span>}
            </div>
            <div style={{ fontSize: 13, color: 'var(--accent-emerald)', fontWeight: 700, marginBottom: 8 }}>
              {form.stipend ? `₹${Number(form.stipend).toLocaleString()}/month` : 'Stipend TBD'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              {form.duration} · {form.openings || '?'} openings
            </div>

            {form.requiredSkills.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, fontFamily: 'var(--font-mono)' }}>REQUIRED SKILLS</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {form.requiredSkills.slice(0, 5).map(s => <span key={s} className="tag" style={{ fontSize: 10 }}>{s}</span>)}
                </div>
              </div>
            )}

            <div style={{ padding: 12, background: 'var(--blue-dim)', fontSize: 12, color: 'var(--blue)', border: '1px solid rgba(232,130,10,0.2)' }}>
              🤖 AI matching starts as soon as you publish — check your dashboard for real match counts.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
