'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, Suspense } from 'react';
import { Eye, EyeOff, ArrowRight, Building2, GraduationCap, Shield, Loader2, Star } from 'lucide-react';
import { loginReal } from '@/lib/realApi';
import { useArcadeFX } from '../components/ArcadeFX';

// The real backend's UserRole enum uses "organization", but the frontend's
// dashboard routes/folders are named "company" (app/company/*). Login used
// to push straight to `/${data.role}/dashboard`, which for an organization
// account meant `/organization/dashboard` — a route that doesn't exist.
// This map is the single place that translates backend role -> frontend route.
const ROLE_TO_ROUTE: Record<string, 'student' | 'company' | 'admin'> = {
  student: 'student',
  organization: 'company',
  admin: 'admin',
};

const ink = '#0A0A0A';
const blue = '#2155FF';
const sun = '#FFD93B';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialRole = searchParams.get('role') || 'student';
  const { toast, playSound, muted, toggleMute, ArcadeToasts } = useArcadeFX();

  const [role, setRole] = useState<'student' | 'company' | 'admin'>(initialRole as 'student' | 'company' | 'admin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const roleConfig = {
    student: { icon: GraduationCap, label: 'STUDENT', color: blue },
    company: { icon: Building2, label: 'COMPANY', color: '#E8820A' },
    admin: { icon: Shield, label: 'MINISTRY', color: '#2D7A5F' },
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    playSound.start();

    try {
      const data = await loginReal(email, password);
      const actualRoute = ROLE_TO_ROUTE[data.role] || (data.role as 'student' | 'company' | 'admin');

      if (actualRoute !== role) {
        setRole(actualRoute);
        const actualLabel = roleConfig[actualRoute]?.label || data.role;
        const pickedLabel = roleConfig[role].label;
        setError(
          `This account is registered as ${actualLabel}, not ${pickedLabel}. ` +
          `Switched the tab above to ${actualLabel} — press Sign In again to continue, ` +
          `or use a different account for a ${pickedLabel} login.`
        );
        setLoading(false);
        return;
      }
      toast('PLAYER AUTHENTICATED', 'WELCOME BACK — LOADING HQ…', playSound.collect);
      router.push(`/${actualRoute}/dashboard`);
    } catch (err: any) {
      setError(err?.message || 'Incorrect email or password.');
      setLoading(false);
    }
  };

  const currentRole = roleConfig[role];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', background: '#fff', color: ink, fontFamily: "'JetBrains Mono', monospace" }}>
      {ArcadeToasts}

      {/* Sound toggle — top-right, matches HUD sndBtn styling */}
      <button
        onClick={toggleMute}
        style={{
          position: 'fixed', top: 16, right: 16, zIndex: 50,
          display: 'flex', alignItems: 'center', gap: 6,
          background: sun, border: `3px solid ${ink}`, boxShadow: `3px 3px 0 ${ink}`,
          padding: '6px 10px', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700,
          cursor: 'pointer', textTransform: 'uppercase',
        }}
      >
        ♪ SOUND: {muted ? 'OFF' : 'ON'}
      </button>

      {/* Left Panel */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 48, position: 'relative' }}>
        <div style={{ maxWidth: 460, width: '100%' }}>
          <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginBottom: 32, textDecoration: 'none' }}>
            <Star size={22} color={sun} fill={sun} style={{ filter: `drop-shadow(2px 2px 0 ${ink})` }} />
            <span style={{ fontSize: 13, fontWeight: 800, color: blue, textShadow: `2px 2px 0 ${ink}`, letterSpacing: 1 }}>
              NEX<span style={{ color: sun, WebkitTextStroke: `1px ${ink}` }}>YUVA</span>
            </span>
          </Link>

          <div style={{
            display: 'inline-block', background: sun, border: `3px solid ${ink}`, boxShadow: `4px 4px 0 ${ink}`,
            padding: '6px 12px', fontSize: 10, fontWeight: 700, letterSpacing: 1, transform: 'rotate(-2deg)', marginBottom: 20,
          }}>
            ★ PRESS START — SIGN IN
          </div>

          <h1 style={{ fontSize: 30, fontWeight: 800, margin: '0 0 8px', letterSpacing: -0.5 }}>Welcome back, Player</h1>
          <p style={{ color: '#555', fontSize: 15, margin: '0 0 28px' }}>Continue your run on NexYuva.</p>

          {/* Role Tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 28 }}>
            {(Object.keys(roleConfig) as Array<keyof typeof roleConfig>).map(r => {
              const Icon = roleConfig[r].icon;
              const active = role === r;
              return (
                <button
                  key={r}
                  onMouseEnter={playSound.blip}
                  onClick={() => { setRole(r); setError(''); }}
                  className="px-tab"
                  style={{
                    flex: 1, padding: '10px 6px', border: `3px solid ${ink}`, cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    background: active ? roleConfig[r].color : '#fff',
                    color: active ? '#fff' : ink,
                    boxShadow: active ? `3px 3px 0 ${ink}` : 'none',
                    transform: active ? 'translate(-1px,-1px)' : 'none',
                  }}
                >
                  <Icon size={16} />
                  {roleConfig[r].label}
                </button>
              );
            })}
          </div>

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>Email Address</label>
              <input
                id="login-email" type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="your@email.com" required
                style={{ width: '100%', padding: '12px 14px', border: `3px solid ${ink}`, fontFamily: 'inherit', fontSize: 15, background: '#fff' }}
              />
            </div>

            <div style={{ marginBottom: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <label style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase' }}>Password</label>
                <Link href="/forgot-password" style={{ fontSize: 11, color: blue, fontWeight: 700 }}>FORGOT?</Link>
              </div>
              <div style={{ position: 'relative' }}>
                <input
                  id="login-password" type={showPassword ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)} placeholder="••••••••" required
                  style={{ width: '100%', padding: '12px 44px 12px 14px', border: `3px solid ${ink}`, fontFamily: 'inherit', fontSize: 15, background: '#fff' }}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: ink }}>
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div style={{ background: '#fff', border: `3px solid ${ink}`, boxShadow: `4px 4px 0 #FF3B30`, padding: '10px 14px', marginBottom: 18, fontSize: 12, fontWeight: 600 }}>
                ⚠ {error}
              </div>
            )}

            <button
              type="submit" disabled={loading} onMouseEnter={playSound.blip}
              style={{
                width: '100%', padding: '14px', fontSize: 14, fontWeight: 700, letterSpacing: 0.5,
                background: blue, color: '#fff', border: `4px solid ${ink}`, boxShadow: `6px 6px 0 ${ink}`,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                transition: 'transform .1s steps(2), box-shadow .1s steps(2)', textTransform: 'uppercase',
              }}
              onMouseDown={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'translate(4px,4px)'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '2px 2px 0 ' + ink; }}
              onMouseUp={e => { (e.currentTarget as HTMLButtonElement).style.transform = 'none'; (e.currentTarget as HTMLButtonElement).style.boxShadow = `6px 6px 0 ${ink}`; }}
            >
              {loading ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> SIGNING IN…</> : <>SIGN IN <ArrowRight size={16} /></>}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 24, fontSize: 13 }}>
            Don't have an account? <Link href="/register" style={{ color: blue, fontWeight: 700 }}>REGISTER FREE →</Link>
          </p>
        </div>
      </div>

      {/* Right Panel — pixel character card, matches bij.html player-card */}
      <div style={{ width: 420, background: '#fff', borderLeft: `4px solid ${ink}`, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <div style={{ border: `4px solid ${ink}`, background: '#fff', boxShadow: `10px 10px 0 ${ink}`, transform: 'rotate(1.5deg)', maxWidth: 320, width: '100%' }}>
          <div style={{ background: ink, color: '#fff', fontSize: 11, fontWeight: 700, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', letterSpacing: 0.5 }}>
            <span>{currentRole.label} PORTAL</span><span style={{ color: sun }}>LV. 1</span>
          </div>
          <div style={{ padding: '28px 22px 10px', display: 'flex', justifyContent: 'center' }}>
            <div style={{ width: 90, height: 90, borderRadius: '50%', background: `${currentRole.color}20`, border: `3px solid ${ink}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <currentRole.icon size={40} color={currentRole.color} />
            </div>
          </div>
          <p style={{ textAlign: 'center', fontSize: 13, padding: '10px 20px 4px', lineHeight: 1.5 }}>
            {role === 'student' && 'Discover AI-matched internships, track applications, and get career guidance.'}
            {role === 'company' && 'Post internships, discover AI-ranked candidates, and grow your talent pipeline.'}
            {role === 'admin' && 'Monitor national internship metrics, regional analytics, and programme performance.'}
          </p>
          <div style={{ borderTop: `3px dashed ${ink}`, padding: '14px 22px 18px' }}>
            {(role === 'student' ? ['AI Match Score', 'Skill Gap Analysis', 'Career Chatbot', 'Application Tracker'] :
              role === 'company' ? ['AI Candidate Ranking', 'Bulk Applications', 'Analytics Dashboard', 'Company Branding'] :
              ['National KPIs', 'Regional Heatmaps', 'Domain Trends', 'Diversity Metrics']).map(f => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 12 }}>
                <span style={{ color: currentRole.color, fontWeight: 800 }}>★</span>{f}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Loader2 size={32} style={{ animation: 'spin 1s linear infinite' }} /></div>}>
      <LoginForm />
    </Suspense>
  );
}
