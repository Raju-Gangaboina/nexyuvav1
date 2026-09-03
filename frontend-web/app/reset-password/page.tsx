'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, Suspense } from 'react';
import { Loader2, ArrowRight, Star } from 'lucide-react';
import { resetPasswordReal } from '@/lib/realApi';
import { useArcadeFX } from '../components/ArcadeFX';

const ink = '#0A0A0A';
const blue = '#2155FF';
const sun = '#FFD93B';
const pxCard: React.CSSProperties = { background: '#fff', border: `4px solid ${ink}`, boxShadow: `8px 8px 0 ${ink}` };
const pxInput: React.CSSProperties = { width: '100%', padding: '12px 14px', border: `3px solid ${ink}`, fontFamily: "'JetBrains Mono', monospace", fontSize: 15, background: '#fff', color: ink };

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';
  const { toast, playSound, muted, toggleMute, ArcadeToasts } = useArcadeFX();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!token) { setError('Missing or invalid reset link. Please request a new one.'); return; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match.'); return; }

    setLoading(true);
    playSound.start();
    try {
      await resetPasswordReal(token, newPassword);
      setDone(true);
      playSound.ach();
      toast('PASSWORD RESET', 'REDIRECTING TO SIGN IN…');
      setTimeout(() => router.push('/login'), 2000);
    } catch (err: any) {
      setError(err?.message || 'Invalid or expired reset link. Please request a new one.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: '#fff', color: ink, fontFamily: "'JetBrains Mono', monospace" }}>
      {ArcadeToasts}
      <button onClick={toggleMute} style={{ position: 'fixed', top: 16, right: 16, zIndex: 50, display: 'flex', alignItems: 'center', gap: 6, background: sun, border: `3px solid ${ink}`, boxShadow: `3px 3px 0 ${ink}`, padding: '6px 10px', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase' }}>
        ♪ SOUND: {muted ? 'OFF' : 'ON'}
      </button>

      <div style={{ maxWidth: 420, width: '100%' }}>
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, textDecoration: 'none', marginBottom: 22 }}>
          <Star size={20} color={sun} fill={sun} style={{ filter: `drop-shadow(2px 2px 0 ${ink})` }} />
          <span style={{ fontSize: 13, fontWeight: 800, color: blue, textShadow: `2px 2px 0 ${ink}`, letterSpacing: 1 }}>
            NEX<span style={{ color: sun, WebkitTextStroke: `1px ${ink}` }}>YUVA</span>
          </span>
        </Link>

        <div style={{ ...pxCard, padding: 28 }}>
          <div style={{ display: 'inline-block', background: sun, border: `3px solid ${ink}`, boxShadow: `4px 4px 0 ${ink}`, padding: '5px 10px', fontSize: 10, fontWeight: 700, letterSpacing: 1, transform: 'rotate(-2deg)', marginBottom: 16 }}>
            ★ NEW PASSWORD
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Reset password</h1>
          <p style={{ color: '#555', marginBottom: 22, fontSize: 14 }}>Choose a new password for your account.</p>

          {done ? (
            <div style={{ background: '#EFFBF4', border: `3px solid ${ink}`, boxShadow: `4px 4px 0 #2D7A5F`, padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#1D5A44' }}>
              Password reset successfully. Redirecting to sign in...
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, display: 'block' }}>New Password</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="••••••••" required minLength={8} style={pxInput} />
              </div>

              <div style={{ marginBottom: 22 }}>
                <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, display: 'block' }}>Confirm Password</label>
                <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} placeholder="••••••••" required minLength={8} style={pxInput} />
              </div>

              {error && (
                <div style={{ background: '#fff', border: `3px solid ${ink}`, boxShadow: `4px 4px 0 #FF3B30`, padding: '10px 14px', marginBottom: 16, fontSize: 12, fontWeight: 600 }}>
                  ⚠ {error}
                </div>
              )}

              <button
                type="submit" disabled={loading} onMouseEnter={playSound.blip}
                style={{
                  width: '100%', padding: '13px', fontSize: 14, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase',
                  background: blue, color: '#fff', border: `3px solid ${ink}`, boxShadow: `5px 5px 0 ${ink}`,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit',
                }}
              >
                {loading ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> RESETTING...</> : <>RESET PASSWORD <ArrowRight size={16} /></>}
              </button>
            </form>
          )}

          <p style={{ textAlign: 'center', marginTop: 22, fontSize: 13 }}>
            <Link href="/login" style={{ color: blue, fontWeight: 700 }}>← BACK TO SIGN IN</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Loader2 size={32} style={{ animation: 'spin 1s linear infinite' }} /></div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
