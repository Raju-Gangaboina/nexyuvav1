'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, GraduationCap, Building2, Check, ChevronRight, ChevronLeft, Loader2, Plus, Upload, FileCheck, Clock, Mail, Star } from 'lucide-react';
import {
  registerStudent as registerStudentReal,
  registerOrganization as registerOrganizationReal,
  updateMyProfileReal,
  uploadVerificationDocument,
  searchCollegesReal,
  searchCitiesReal,
  CollegeLookupResult,
  CityLookupResult,
} from '@/lib/realApi';
import Autocomplete from '@/app/components/Autocomplete';
import { useArcadeFX } from '../components/ArcadeFX';

const COMMON_SKILLS = [
  'Python', 'JavaScript', 'React', 'SQL', 'Java', 'Machine Learning',
  'Data Analysis', 'Communication', 'Excel', 'Node.js', 'Figma', 'Git',
  'AWS', 'Docker', 'TypeScript', 'MongoDB', 'Finance', 'Digital Marketing',
  'Content Writing', 'Leadership', 'Problem Solving', 'Team Work',
];

const DOMAINS = [
  'Information Technology', 'Data Science', 'Digital Marketing', 'Finance',
  'Human Resources', 'Design', 'Electronics & IoT', 'Cybersecurity',
  'Cloud Computing', 'FinTech', 'Media & Communication', 'Artificial Intelligence',
];

const LOCATIONS = [
  'Bangalore', 'Mumbai', 'Hyderabad', 'Delhi', 'Chennai', 'Pune',
  'Kolkata', 'Ahmedabad', 'Gurugram', 'Remote',
];

const ink = '#0A0A0A';
const blue = '#2155FF';
const sun = '#FFD93B';

// ── shared pixel primitives (kept local so this file has zero new deps) ──
const pxCard: React.CSSProperties = { background: '#fff', border: `4px solid ${ink}`, boxShadow: `8px 8px 0 ${ink}` };
const pxInput: React.CSSProperties = { width: '100%', padding: '11px 13px', border: `3px solid ${ink}`, fontFamily: "'JetBrains Mono', monospace", fontSize: 14, background: '#fff', color: ink };
const pxLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', display: 'block', marginBottom: 6, color: ink };
const pxSelect: React.CSSProperties = { ...pxInput, cursor: 'pointer' };
function PxButton({ children, primary, onClick, disabled, onMouseEnter, style }: any) {
  return (
    <button
      type="button" onClick={onClick} disabled={disabled} onMouseEnter={onMouseEnter}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        padding: '12px 22px', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 13,
        letterSpacing: 0.5, textTransform: 'uppercase', cursor: disabled ? 'not-allowed' : 'pointer',
        border: `3px solid ${ink}`, boxShadow: `5px 5px 0 ${ink}`,
        background: primary ? blue : '#fff', color: primary ? '#fff' : ink,
        opacity: disabled ? 0.6 : 1, ...style,
      }}
    >
      {children}
    </button>
  );
}

export default function RegisterPage() {
  const router = useRouter();
  const { toast, playSound, muted, toggleMute, ArcadeToasts } = useArcadeFX();
  const [role, setRole] = useState<'student' | 'company'>('student');
  const [method, setMethod] = useState<'choose' | 'email'>('choose');
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    name: '', email: '', password: '',
    college: '', city: '', degree: 'B.Tech', branch: 'Computer Science',
    year: '3', cgpa: '8.0',
    skills: [] as string[], skillInput: '',
    preferredDomains: [] as string[],
    preferredLocations: [] as string[],
    preferredMode: 'Remote',
    minStipend: '5000',
    bio: '',
  });

  const [companyForm, setCompanyForm] = useState({
    name: '', email: '', password: '',
    companyName: '', industry: 'Information Technology',
    size: '100-500', location: 'Bangalore', website: '', description: '',
  });
  const [verificationDoc, setVerificationDoc] = useState<File | null>(null);
  const [companyError, setCompanyError] = useState('');
  const [companySubmitted, setCompanySubmitted] = useState(false);
  const [studentError, setStudentError] = useState('');

  const toggleSkill = (skill: string) => {
    setForm(prev => ({
      ...prev,
      skills: prev.skills.includes(skill) ? prev.skills.filter(s => s !== skill) : [...prev.skills, skill],
    }));
  };
  const toggleDomain = (domain: string) => {
    setForm(prev => ({
      ...prev,
      preferredDomains: prev.preferredDomains.includes(domain) ? prev.preferredDomains.filter(d => d !== domain) : [...prev.preferredDomains, domain],
    }));
  };
  const toggleLocation = (loc: string) => {
    setForm(prev => ({
      ...prev,
      preferredLocations: prev.preferredLocations.includes(loc) ? prev.preferredLocations.filter(l => l !== loc) : [...prev.preferredLocations, loc],
    }));
  };

  const handleGoogleSignup = async () => {
    setLoading(true);
    playSound.start();
    try {
      const { signIn } = await import('next-auth/react');
      await signIn('google', { callbackUrl: `/${role}/dashboard` });
    } catch (e) {
      router.push(`/${role}/dashboard`);
    }
  };

  const handleSubmit = async () => {
    if (role === 'company') {
      setCompanyError('');
      if (!verificationDoc) {
        setCompanyError('Please upload a verification document (GST certificate, incorporation certificate, or MSME registration) before submitting.');
        return;
      }
      setLoading(true);
      try {
        await registerOrganizationReal(companyForm.email, companyForm.password, companyForm.companyName);
        await uploadVerificationDocument(verificationDoc);
        playSound.ach();
        toast('APPLICATION SUBMITTED', 'AWAITING MINISTRY REVIEW');
        setCompanySubmitted(true);
      } catch (e: any) {
        setCompanyError(e?.message || 'Could not create your account. Please try again.');
      }
      setLoading(false);
      return;
    }

    setLoading(true);
    setStudentError('');
    try {
      await registerStudentReal(form.email, form.password, form.name);
      const academicBackground = [form.degree, form.branch]
        .filter(Boolean)
        .join(', ') + (form.year ? ' - Year ' + form.year : '') + (form.cgpa ? ', CGPA ' + form.cgpa : '');
      await updateMyProfileReal({
        academic_background: academicBackground,
        college: form.college || undefined,
        location: form.city || undefined,
        skills: form.skills,
        location_preference: form.preferredLocations.join(', ') || undefined,
      });
      playSound.god();
      toast('NEW GAME STARTED', 'ACCOUNT CREATED — LOADING DASHBOARD…');
      router.push(`/${role}/dashboard`);
    } catch (realErr: any) {
      setStudentError(realErr?.message || 'Could not create your account. Please try again.');
      setLoading(false);
    }
  };

  const STEPS_STUDENT = ['Account', 'Academics', 'Skills', 'Preferences'];
  const totalSteps = role === 'student' ? 4 : 2;

  const SoundToggle = (
    <button
      onClick={toggleMute}
      style={{
        position: 'fixed', top: 16, right: 16, zIndex: 50, display: 'flex', alignItems: 'center', gap: 6,
        background: sun, border: `3px solid ${ink}`, boxShadow: `3px 3px 0 ${ink}`, padding: '6px 10px',
        fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase',
      }}
    >
      ♪ SOUND: {muted ? 'OFF' : 'ON'}
    </button>
  );

  const Logo = (
    <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
      <Star size={22} color={sun} fill={sun} style={{ filter: `drop-shadow(2px 2px 0 ${ink})` }} />
      <span style={{ fontSize: 14, fontWeight: 800, color: blue, textShadow: `2px 2px 0 ${ink}`, letterSpacing: 1 }}>
        NEX<span style={{ color: sun, WebkitTextStroke: `1px ${ink}` }}>YUVA</span>
      </span>
    </Link>
  );

  if (companySubmitted) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', background: '#fff', color: ink, fontFamily: "'JetBrains Mono', monospace" }}>
        {ArcadeToasts}{SoundToggle}
        <div style={{ maxWidth: 460, width: '100%', textAlign: 'center' }}>
          <div style={pxCard}>
            <div style={{ background: ink, color: sun, padding: '10px 16px', fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>★ QUEST SUBMITTED</div>
            <div style={{ padding: 32 }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', margin: '0 auto 20px', background: '#FFF7DA', border: `3px solid ${ink}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Clock size={28} color="#E8820A" />
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 10 }}>Application submitted</h2>
              <p style={{ fontSize: 14, lineHeight: 1.7, marginBottom: 8 }}>
                Thanks for registering <strong>{companyForm.companyName || 'your company'}</strong>. Your verification
                document has been received and is awaiting review by a Ministry/Admin reviewer.
              </p>
              <p style={{ fontSize: 13, color: '#555', marginBottom: 24 }}>
                You'll be able to sign in and access the company dashboard once your application is approved.
                This usually takes 1-2 business days.
              </p>
              <Link href="/login?role=company" style={{ textDecoration: 'none' }}>
                <PxButton>BACK TO SIGN IN</PxButton>
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (method === 'choose') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', background: '#fff', color: ink, fontFamily: "'JetBrains Mono', monospace" }}>
        {ArcadeToasts}{SoundToggle}
        <div style={{ maxWidth: 440, width: '100%' }}>
          <div style={{ textAlign: 'center', marginBottom: 28 }}>
            {Logo}
            <div style={{
              display: 'inline-block', background: sun, border: `3px solid ${ink}`, boxShadow: `4px 4px 0 ${ink}`,
              padding: '6px 12px', fontSize: 10, fontWeight: 700, letterSpacing: 1, transform: 'rotate(-2deg)', margin: '18px 0 10px',
            }}>
              ★ CREATE NEW PLAYER
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 800, margin: '10px 0 4px' }}>Create your account</h1>
            <p style={{ color: '#555', fontSize: 14 }}>Join the PM Internship Scheme platform</p>
          </div>

          <div style={{ ...pxCard, padding: 28 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 22 }}>
              {(['student', 'company'] as const).map(r => (
                <button
                  key={r} onClick={() => setRole(r)} onMouseEnter={playSound.blip}
                  style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '11px 10px',
                    border: `3px solid ${ink}`, cursor: 'pointer', fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 12,
                    background: role === r ? blue : '#fff', color: role === r ? '#fff' : ink,
                    boxShadow: role === r ? `3px 3px 0 ${ink}` : 'none', textTransform: 'uppercase',
                  }}
                >
                  {r === 'student' ? <GraduationCap size={15} /> : <Building2 size={15} />}
                  {r === 'student' ? 'STUDENT' : 'COMPANY'}
                </button>
              ))}
            </div>

            <button
              type="button" onClick={handleGoogleSignup} disabled={loading} onMouseEnter={playSound.blip}
              style={{
                width: '100%', padding: '12px 16px', border: `3px solid ${ink}`, background: '#fff', color: ink,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                fontFamily: "'JetBrains Mono', monospace", fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 14,
              }}
            >
              {loading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : (
                <svg width="18" height="18" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
              )}
              CONTINUE WITH GOOGLE
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{ flex: 1, height: 2, background: ink }} />
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>OR</span>
              <div style={{ flex: 1, height: 2, background: ink }} />
            </div>

            <PxButton primary onClick={() => { setMethod('email'); setStep(1); playSound.beep(); }} onMouseEnter={playSound.blip} style={{ width: '100%' }}>
              <Mail size={16} /> CONTINUE WITH EMAIL <ArrowRight size={16} />
            </PxButton>
          </div>

          <p style={{ textAlign: 'center', marginTop: 18, fontSize: 13 }}>
            Already have an account? <Link href="/login" style={{ color: blue, fontWeight: 700 }}>SIGN IN →</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 24px', background: '#fff', color: ink, fontFamily: "'JetBrains Mono', monospace" }}>
      {ArcadeToasts}{SoundToggle}
      <div style={{ maxWidth: 680, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          {Logo}
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: '18px 0 4px' }}>
            {role === 'student' ? 'Student' : 'Company'} sign-up
          </h1>
          <p style={{ color: '#555', fontSize: 13, fontWeight: 700 }}>STAGE {step} / {totalSteps}</p>
          <button
            type="button" onClick={() => setMethod('choose')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 10, background: 'none', border: 'none', cursor: 'pointer', color: blue, fontSize: 12, fontWeight: 700 }}
          >
            <ChevronLeft size={14} /> BACK TO SIGN-UP OPTIONS
          </button>
        </div>

        {role === 'student' && (
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 26, gap: 0 }}>
            {STEPS_STUDENT.map((s, i) => (
              <div key={s} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
                  {i > 0 && <div style={{ flex: 1, height: 3, background: i <= step - 1 ? blue : ink, opacity: i <= step - 1 ? 1 : 0.15 }} />}
                  <div style={{
                    width: 30, height: 30, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: i + 1 <= step ? blue : '#fff', border: `3px solid ${ink}`,
                    fontSize: 12, fontWeight: 800, color: i + 1 <= step ? '#fff' : ink,
                  }}>
                    {i + 1 < step ? <Check size={13} /> : i + 1}
                  </div>
                  {i < STEPS_STUDENT.length - 1 && <div style={{ flex: 1, height: 3, background: i + 1 < step ? blue : ink, opacity: i + 1 < step ? 1 : 0.15 }} />}
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: i + 1 === step ? blue : '#888', marginTop: 6 }}>{s}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ ...pxCard, padding: 32 }}>
          {role === 'student' ? (
            <>
              {step === 1 && (
                <div>
                  <h3 style={{ fontSize: 17, marginBottom: 20, fontWeight: 800, textTransform: 'uppercase' }}>Basic Information</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                    <div><label style={pxLabel}>Full Name *</label><input id="reg-name" style={pxInput} placeholder="Priya Sharma" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
                    <div><label style={pxLabel}>Email Address *</label><input id="reg-email" type="email" style={pxInput} placeholder="priya@college.edu" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required /></div>
                  </div>
                  <div><label style={pxLabel}>Password *</label><input id="reg-password" type="password" style={pxInput} placeholder="Create a strong password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required /></div>
                  <div style={{ marginTop: 16 }}>
                    <label style={pxLabel}>Brief Bio</label>
                    <textarea style={{ ...pxInput, minHeight: 80, resize: 'vertical' }} placeholder="Tell us about yourself, your interests, and career goals..." value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })} />
                  </div>
                </div>
              )}

              {step === 2 && (
                <div>
                  <h3 style={{ fontSize: 17, marginBottom: 20, fontWeight: 800, textTransform: 'uppercase' }}>Academic Details</h3>
                  <div style={{ marginBottom: 16 }}>
                    <label style={pxLabel}>College / University *</label>
                    <Autocomplete<CollegeLookupResult>
                      value={form.college} onChange={v => setForm({ ...form, college: v })}
                      onSelect={item => setForm({ ...form, college: item.name })} fetchOptions={searchCollegesReal}
                      getLabel={item => item.name} getSubLabel={item => [item.city, item.state].filter(Boolean).join(', ')}
                      placeholder="Siva Sivani Degree College"
                    />
                  </div>
                  <div style={{ marginBottom: 16 }}>
                    <label style={pxLabel}>City</label>
                    <Autocomplete<CityLookupResult>
                      value={form.city} onChange={v => setForm({ ...form, city: v })}
                      onSelect={item => setForm({ ...form, city: item.name })} fetchOptions={searchCitiesReal}
                      getLabel={item => item.name} getSubLabel={item => [item.district, item.state].filter(Boolean).join(', ')}
                      placeholder="Hyderabad, Suraram, Kompally..."
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                    <div><label style={pxLabel}>Degree</label>
                      <select style={pxSelect} value={form.degree} onChange={e => setForm({ ...form, degree: e.target.value })}>
                        {['B.Tech', 'B.Sc', 'B.Com', 'BBA', 'BCA', 'M.Tech', 'MBA', 'MCA', 'M.Sc', 'B.A'].map(d => <option key={d}>{d}</option>)}
                      </select>
                    </div>
                    <div><label style={pxLabel}>Branch / Specialization</label><input style={pxInput} placeholder="Computer Science" value={form.branch} onChange={e => setForm({ ...form, branch: e.target.value })} /></div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div><label style={pxLabel}>Current Year</label>
                      <select style={pxSelect} value={form.year} onChange={e => setForm({ ...form, year: e.target.value })}>
                        {['1', '2', '3', '4'].map(y => <option key={y}>{y}</option>)}
                      </select>
                    </div>
                    <div><label style={pxLabel}>CGPA (out of 10)</label><input type="number" min="0" max="10" step="0.1" style={pxInput} placeholder="8.5" value={form.cgpa} onChange={e => setForm({ ...form, cgpa: e.target.value })} /></div>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div>
                  <h3 style={{ fontSize: 17, marginBottom: 6, fontWeight: 800, textTransform: 'uppercase' }}>Your Skills</h3>
                  <p style={{ color: '#555', fontSize: 13, marginBottom: 18 }}>Select all skills you have. This powers your AI match score!</p>
                  <div style={{ marginBottom: 16 }}>
                    <label style={pxLabel}>Selected: <span style={{ color: blue }}>{form.skills.length} skills</span></label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {COMMON_SKILLS.map(skill => (
                        <button
                          key={skill} type="button" onClick={() => toggleSkill(skill)} onMouseEnter={playSound.blip}
                          style={{
                            padding: '6px 13px', border: `2px solid ${ink}`, cursor: 'pointer',
                            background: form.skills.includes(skill) ? blue : '#fff',
                            color: form.skills.includes(skill) ? '#fff' : ink,
                            fontSize: 12, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                            display: 'flex', alignItems: 'center', gap: 4,
                          }}
                        >
                          {form.skills.includes(skill) && <Check size={12} />}
                          {skill}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ marginTop: 16 }}>
                    <label style={pxLabel}>Add custom skill</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        style={pxInput} placeholder="e.g. Rust, CUDA, R..." value={form.skillInput}
                        onChange={e => setForm({ ...form, skillInput: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter' && form.skillInput.trim()) { toggleSkill(form.skillInput.trim()); setForm(prev => ({ ...prev, skillInput: '' })); } }}
                      />
                      <PxButton primary onClick={() => { if (form.skillInput.trim()) { toggleSkill(form.skillInput.trim()); setForm(prev => ({ ...prev, skillInput: '' })); } }}>
                        <Plus size={16} />
                      </PxButton>
                    </div>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div>
                  <h3 style={{ fontSize: 17, marginBottom: 20, fontWeight: 800, textTransform: 'uppercase' }}>Internship Preferences</h3>
                  <div style={{ marginBottom: 20 }}>
                    <label style={pxLabel}>Preferred Domains</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {DOMAINS.map(d => (
                        <button key={d} type="button" onClick={() => toggleDomain(d)} onMouseEnter={playSound.blip}
                          style={{
                            padding: '6px 12px', cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                            background: form.preferredDomains.includes(d) ? blue : '#fff',
                            color: form.preferredDomains.includes(d) ? '#fff' : ink,
                            border: `2px solid ${ink}`,
                          }}>
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ marginBottom: 20 }}>
                    <label style={pxLabel}>Preferred Locations</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {LOCATIONS.map(l => (
                        <button key={l} type="button" onClick={() => toggleLocation(l)} onMouseEnter={playSound.blip}
                          style={{
                            padding: '6px 12px', cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
                            background: form.preferredLocations.includes(l) ? '#E8820A' : '#fff',
                            color: form.preferredLocations.includes(l) ? '#fff' : ink,
                            border: `2px solid ${ink}`,
                          }}>
                          {l}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <div><label style={pxLabel}>Work Mode</label>
                      <select style={pxSelect} value={form.preferredMode} onChange={e => setForm({ ...form, preferredMode: e.target.value })}>
                        {['Remote', 'Hybrid', 'On-site', 'Any'].map(m => <option key={m}>{m}</option>)}
                      </select>
                    </div>
                    <div><label style={pxLabel}>Min. Stipend (₹/month)</label><input type="number" style={pxInput} placeholder="5000" value={form.minStipend} onChange={e => setForm({ ...form, minStipend: e.target.value })} /></div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div>
              <h3 style={{ fontSize: 17, marginBottom: 20, fontWeight: 800, textTransform: 'uppercase' }}>Company Registration</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div><label style={pxLabel}>Your Name *</label><input style={pxInput} placeholder="HR Manager Name" value={companyForm.name} onChange={e => setCompanyForm({ ...companyForm, name: e.target.value })} /></div>
                <div><label style={pxLabel}>Company Email *</label><input type="email" style={pxInput} placeholder="hr@company.com" value={companyForm.email} onChange={e => setCompanyForm({ ...companyForm, email: e.target.value })} /></div>
              </div>
              <div style={{ marginBottom: 16 }}><label style={pxLabel}>Company Name *</label><input style={pxInput} placeholder="Acme Technologies Pvt. Ltd." value={companyForm.companyName} onChange={e => setCompanyForm({ ...companyForm, companyName: e.target.value })} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div><label style={pxLabel}>Industry</label>
                  <select style={pxSelect} value={companyForm.industry} onChange={e => setCompanyForm({ ...companyForm, industry: e.target.value })}>
                    {['Information Technology', 'Finance & Banking', 'Manufacturing', 'Healthcare', 'Government', 'E-Commerce', 'Media', 'Others'].map(i => <option key={i}>{i}</option>)}
                  </select>
                </div>
                <div><label style={pxLabel}>Company Size</label>
                  <select style={pxSelect} value={companyForm.size} onChange={e => setCompanyForm({ ...companyForm, size: e.target.value })}>
                    {['1-50', '50-200', '200-500', '500-1000', '1000-5000', '5000+'].map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 16 }}><label style={pxLabel}>Password *</label><input type="password" style={pxInput} placeholder="••••••••" value={companyForm.password} onChange={e => setCompanyForm({ ...companyForm, password: e.target.value })} /></div>

              <div style={{ marginTop: 20, paddingTop: 20, borderTop: `3px dashed ${ink}` }}>
                <label style={pxLabel}>Business Verification Document *</label>
                <p style={{ fontSize: 12, color: '#555', marginBottom: 12 }}>
                  Upload a GST certificate, Certificate of Incorporation, or MSME registration (PDF, JPG, or PNG).
                  A Ministry/Admin reviewer verifies this before your company can access the dashboard.
                </p>
                <label
                  htmlFor="company-doc-upload"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '13px 16px',
                    border: `3px dashed ${ink}`, cursor: 'pointer',
                    background: verificationDoc ? '#EFFBF4' : '#fafafa',
                  }}
                >
                  {verificationDoc ? <FileCheck size={18} color="#2D7A5F" /> : <Upload size={18} color={ink} />}
                  <span style={{ fontSize: 13, fontWeight: 600, color: verificationDoc ? '#2D7A5F' : ink }}>
                    {verificationDoc ? verificationDoc.name : 'Click to upload verification document'}
                  </span>
                </label>
                <input id="company-doc-upload" type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setVerificationDoc(e.target.files?.[0] || null)} style={{ display: 'none' }} />
                {companyError && (
                  <div style={{ background: '#fff', border: `3px solid ${ink}`, boxShadow: `4px 4px 0 #FF3B30`, padding: '10px 14px', marginTop: 12, fontSize: 12, fontWeight: 600 }}>
                    ⚠ {companyError}
                  </div>
                )}
              </div>
            </div>
          )}

          {role === 'student' && studentError && (
            <div style={{ background: '#fff', border: `3px solid ${ink}`, boxShadow: `4px 4px 0 #FF3B30`, padding: '10px 14px', marginTop: 20, fontSize: 12, fontWeight: 600 }}>
              ⚠ {studentError}
            </div>
          )}

          <div style={{ display: 'flex', gap: 12, marginTop: 26, justifyContent: 'space-between' }}>
            {step > 1 && role === 'student' ? (
              <PxButton onClick={() => setStep(s => s - 1)} onMouseEnter={playSound.blip}>BACK</PxButton>
            ) : <div />}

            {role === 'student' && step < totalSteps ? (
              <PxButton primary onClick={() => { setStep(s => s + 1); playSound.beep(); }} onMouseEnter={playSound.blip}>
                CONTINUE <ChevronRight size={16} />
              </PxButton>
            ) : (
              <PxButton primary onClick={handleSubmit} disabled={loading} onMouseEnter={playSound.blip}>
                {loading ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> CREATING...</> : <><Check size={16} /> CREATE ACCOUNT</>}
              </PxButton>
            )}
          </div>
        </div>

        <p style={{ textAlign: 'center', marginTop: 18, fontSize: 13 }}>
          Already have an account? <Link href="/login" style={{ color: blue, fontWeight: 700 }}>SIGN IN →</Link>
        </p>
      </div>
    </div>
  );
}
