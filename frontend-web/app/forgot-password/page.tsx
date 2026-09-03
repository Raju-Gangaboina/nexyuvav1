'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Loader2, ArrowRight, Star } from 'lucide-react';
import { forgotPasswordReal } from '@/lib/realApi';
import { useArcadeFX } from '../components/ArcadeFX';

const ink = '#0A0A0A';
const blue = '#2155FF';
const sun = '#FFD93B';
const pxCard: React.CSSProperties = { background: '#fff', border: `4px solid ${ink}`, boxShadow: `8px 8px 0 ${ink}` };
const pxInput: React.CSSProperties = { width: '100%', padding: '12px 14px', border: `3px solid ${ink}`, fontFamily: "'JetBrains Mono', monospace", fontSize: 15, background: '#fff', color: ink };

export default function ForgotPasswordPage() {
  const { toast, playSound, muted, toggleMute, ArcadeToasts } = useArcadeFX();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [devToken, setDevToken] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    setDevToken(null);
    playSound.start();
    try {
      const data = await forgotPasswordReal(email);
      setMessage(data.message || 'If that email exists, a reset link was sent.');
      if (data.dev_reset_token) setDevToken(data.dev_reset_token);
      toast('SIGNAL SENT', 'CHECK YOUR EMAIL', playSound.collect);
    } catch (err: any) {
      setError(err?.message || 'Something went wrong. Please try again.');
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
            ★ PASSWORD RESET
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Forgot password</h1>
          <p style={{ color: '#555', marginBottom: 22, fontSize: 14 }}>
            Enter your email and we'll send you a reset link.
          </p>

          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6, display: 'block' }}>Email Address</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your@email.com" required style={pxInput} />
            </div>

            {error && (
              <div style={{ background: '#fff', border: `3px solid ${ink}`, boxShadow: `4px 4px 0 #FF3B30`, padding: '10px 14px', marginBottom: 16, fontSize: 12, fontWeight: 600 }}>
                ⚠ {error}
              </div>
            )}

            {message && (
              <div style={{ background: '#EFFBF4', border: `3px solid ${ink}`, boxShadow: `4px 4px 0 #2D7A5F`, padding: '10px 14px', marginBottom: 16, fontSize: 12, fontWeight: 600, color: '#1D5A44' }}>
                {message}
                {devToken && (
                  <div style={{ marginTop: 8 }}>
                    Dev mode — <Link href={`/reset-password?token=${devToken}`} style={{ color: blue, fontWeight: 700 }}>reset your password here</Link>
                  </div>
                )}
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
              {loading ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> SENDING...</> : <>SEND RESET LINK <ArrowRight size={16} /></>}
            </button>
          </form>

          <p style={{ textAlign: 'center', marginTop: 22, fontSize: 13 }}>
            <Link href="/login" style={{ color: blue, fontWeight: 700 }}>← BACK TO SIGN IN</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
