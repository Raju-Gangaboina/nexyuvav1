'use client';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import { LayoutDashboard, Plus, Users, BarChart3, Building2, LogOut, Menu, X, Webhook, Clock, ShieldAlert, RefreshCw, Upload, FileCheck, Loader2, MessageSquare, ShieldCheck } from 'lucide-react';
import { getMyOrgVerification, uploadVerificationDocument, getRealToken, clearRealToken, OrgVerificationInfo } from '@/lib/realApi';
import ThemeToggle from '@/app/components/ThemeToggle';
import { useArcadeFX } from '@/app/components/ArcadeFX';

const ink = '#0A0A0A';
const blue = '#2155FF';

const NAV_ITEMS = [
  { href: '/company/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/company/post-internship', icon: Plus, label: 'Post Internship' },
  { href: '/company/candidates', icon: Users, label: 'Candidates' },
  { href: '/company/interviews', icon: MessageSquare, label: 'Interviews' },
  { href: '/company/analytics', icon: BarChart3, label: 'Analytics' },
  { href: '/company/integrations', icon: Webhook, label: 'ATS Integration' },
  { href: '/company/verification', icon: ShieldCheck, label: 'Verification' },
];

export default function CompanyLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast, playSound, ArcadeToasts } = useArcadeFX();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [checking, setChecking] = useState(true);
  const [verification, setVerification] = useState<OrgVerificationInfo | null>(null);
  const [loadError, setLoadError] = useState('');
  const [doc, setDoc] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');

  const handleLogout = () => {
    clearRealToken();
    toast('SESSION ENDED', 'THANKS FOR PLAYING — SEE YOU SOON');
    router.push('/');
  };

  // Source of truth is now the real backend (GET /organizations/me/verification)
  // instead of a browser-localStorage-only company store that never talked
  // to the backend and wasn't tied to who was actually logged in.
  const loadVerification = useCallback(async () => {
    setChecking(true);
    setLoadError('');
    if (!getRealToken()) {
      setChecking(false);
      router.push('/login?role=company');
      return;
    }
    try {
      const data = await getMyOrgVerification();
      setVerification(data);
    } catch (e: any) {
      setLoadError(e?.message || "We couldn't find a company application for this account. Please register your company and submit a verification document to get access.");
    }
    setChecking(false);
  }, [router]);

  useEffect(() => { loadVerification(); }, [loadVerification, pathname]);

  const handleUpload = async () => {
    if (!doc) {
      setUploadError('Please choose a file first.');
      return;
    }
    setUploading(true);
    setUploadError('');
    try {
      await uploadVerificationDocument(doc);
      setDoc(null);
      await loadVerification();
    } catch (e: any) {
      setUploadError(e?.message || 'Could not upload your document. Please try again.');
    }
    setUploading(false);
  };

  if (checking) return null;

  // Couldn't reach a verification record at all — wrong role, expired
  // session, or an account that was never registered as a company.
  if (loadError || !verification) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--void)' }}>
        <div className="glass-card" style={{ padding: 40, maxWidth: 440, textAlign: 'center' }}>
          <ShieldAlert size={32} color="#2B7FD4" style={{ marginBottom: 16 }} />
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>No verified company on file</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 24, lineHeight: 1.7 }}>
            {loadError}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <Link href="/register" className="btn-primary" style={{ borderRadius: 'var(--radius-md)', padding: '12px 24px', textDecoration: 'none', display: 'inline-flex' }}>
              Register Company
            </Link>
            <button className="btn-secondary" onClick={handleLogout} style={{ borderRadius: 'var(--radius-md)', padding: '12px 24px' }}>
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Registered as an organization but hasn't uploaded (or re-uploaded) a
  // verification document yet — let them do it right here instead of
  // forcing a trip back through the full multi-step register form.
  if (verification.status === 'unsubmitted') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--void)' }}>
        <div className="glass-card" style={{ padding: 40, maxWidth: 460, textAlign: 'center' }}>
          <ShieldAlert size={32} color="#2B7FD4" style={{ marginBottom: 16 }} />
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Verification document needed</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20, lineHeight: 1.7 }}>
            <strong>{verification.company_name}</strong> is registered, but we don't have a verification document
            (GST certificate, incorporation certificate, or MSME registration) on file yet.
          </p>
          <label
            htmlFor="company-doc-upload-gate"
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px',
              border: `1px dashed ${doc ? 'rgba(45,122,95,0.4)' : 'var(--glass-border)'}`,
              borderRadius: 'var(--radius-md)', cursor: 'pointer', marginBottom: 16,
              background: doc ? 'rgba(45,122,95,0.06)' : 'var(--bg-elevated)',
            }}
          >
            {doc ? <FileCheck size={18} color="#4AAA82" /> : <Upload size={18} color="var(--text-muted)" />}
            <span style={{ fontSize: 13, color: doc ? '#4AAA82' : 'var(--text-secondary)' }}>
              {doc ? doc.name : 'Click to choose a file (PDF, JPG, PNG)'}
            </span>
          </label>
          <input id="company-doc-upload-gate" type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setDoc(e.target.files?.[0] || null)} style={{ display: 'none' }} />
          {uploadError && (
            <div style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', borderRadius: 0, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#FF3B30' }}>
              {uploadError}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button className="btn-primary" onClick={handleUpload} disabled={uploading} style={{ borderRadius: 'var(--radius-md)', padding: '10px 20px' }}>
              {uploading ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Uploading...</> : 'Submit for review'}
            </button>
            <button className="btn-secondary" onClick={handleLogout} style={{ borderRadius: 'var(--radius-md)', padding: '10px 18px' }}>
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (verification.status === 'pending') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--void)' }}>
        <div className="glass-card" style={{ padding: 40, maxWidth: 460, textAlign: 'center' }}>
          <Clock size={32} color="var(--accent-amber)" style={{ marginBottom: 16 }} />
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Verification pending</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 8, lineHeight: 1.7 }}>
            <strong>{verification.company_name}</strong> is awaiting review by a Ministry/Admin reviewer. You'll get
            access to the dashboard once your verification document is approved.
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 24 }}>
            {verification.submitted_at && <>Submitted {new Date(verification.submitted_at).toLocaleDateString()} · </>}
            Document: {verification.verification_doc_name}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button className="btn-secondary" onClick={() => loadVerification()} style={{ borderRadius: 'var(--radius-md)', padding: '10px 18px' }}>
              <RefreshCw size={14} /> Check again
            </button>
            <button className="btn-secondary" onClick={handleLogout} style={{ borderRadius: 'var(--radius-md)', padding: '10px 18px' }}>
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (verification.status === 'rejected') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'var(--void)' }}>
        <div className="glass-card" style={{ padding: 40, maxWidth: 460, textAlign: 'center', borderColor: 'rgba(192,64,64,0.3)' }}>
          <ShieldAlert size={32} color="#E06060" style={{ marginBottom: 16 }} />
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Verification not approved</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 8, lineHeight: 1.7 }}>
            Your application for <strong>{verification.company_name}</strong> was not approved.
          </p>
          {verification.rejection_reason && (
            <p style={{ color: '#FF3B30', fontSize: 13, marginBottom: 16, padding: '10px 14px', background: 'rgba(244,63,94,0.08)', border: '1px solid rgba(244,63,94,0.2)', borderRadius: 0 }}>
              {verification.rejection_reason}
            </p>
          )}
          <label
            htmlFor="company-doc-upload-resubmit"
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px',
              border: `1px dashed ${doc ? 'rgba(45,122,95,0.4)' : 'var(--glass-border)'}`,
              borderRadius: 'var(--radius-md)', cursor: 'pointer', marginBottom: 16,
              background: doc ? 'rgba(45,122,95,0.06)' : 'var(--bg-elevated)',
            }}
          >
            {doc ? <FileCheck size={18} color="#4AAA82" /> : <Upload size={18} color="var(--text-muted)" />}
            <span style={{ fontSize: 13, color: doc ? '#4AAA82' : 'var(--text-secondary)' }}>
              {doc ? doc.name : 'Click to choose an updated document'}
            </span>
          </label>
          <input id="company-doc-upload-resubmit" type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => setDoc(e.target.files?.[0] || null)} style={{ display: 'none' }} />
          {uploadError && (
            <div style={{ background: 'rgba(244,63,94,0.1)', border: '1px solid rgba(244,63,94,0.3)', borderRadius: 0, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#FF3B30' }}>
              {uploadError}
            </div>
          )}
          <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 24 }}>
            You can re-submit with an updated verification document above.
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button className="btn-primary" onClick={handleUpload} disabled={uploading} style={{ borderRadius: 'var(--radius-md)', padding: '10px 18px' }}>
              {uploading ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Uploading...</> : 'Resubmit application'}
            </button>
            <button className="btn-secondary" onClick={handleLogout} style={{ borderRadius: 'var(--radius-md)', padding: '10px 18px' }}>
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // verification.status === 'approved' -> the real dashboard chrome
  // (rebuilt to match the pixel/arcade design system used by
  // app/student/layout.tsx — see globals.css .sidebar/.sidebar-item and
  // the "Pixel Shadows" tokens; this was the piece of the company portal
  // that never got ported over when that redesign happened.)
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#fff', color: ink, fontFamily: "'JetBrains Mono', monospace" }}>
      {ArcadeToasts}

      {/* ── Sidebar ── */}
      <aside style={{
        width: sidebarOpen ? 256 : 68,
        background: '#fff',
        borderRight: `4px solid ${ink}`,
        display: 'flex', flexDirection: 'column',
        position: 'fixed', top: 0, bottom: 0, left: 0, zIndex: 50,
        transition: 'width 0.2s steps(6)',
        overflow: 'hidden',
      }}>
        {/* Logo */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: sidebarOpen ? 'flex-start' : 'center',
          gap: 10, padding: '14px 16px', borderBottom: `3px solid ${ink}`, height: 68,
          minWidth: sidebarOpen ? 256 : 68,
        }}>
          {sidebarOpen ? (
            <Image src="/nexyuva-light-logo.png" alt="NexYuva" width={150} height={44} style={{ height: 40, width: 'auto', objectFit: 'contain', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 38, height: 38, background: blue, border: `2px solid ${ink}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Cormorant Garamond',serif", fontSize: 18, fontWeight: 700, color: '#fff' }}>N</div>
          )}
        </div>

        {/* Company Portal badge */}
        {sidebarOpen && (
          <div style={{ padding: '10px 14px', borderBottom: `3px solid ${ink}` }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '5px 10px', background: blue, color: '#fff', border: `2px solid ${ink}`,
              fontSize: 10, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase',
            }}>
              <Building2 size={11} /> Company Portal
            </div>
          </div>
        )}

        {/* Nav */}
        <nav style={{ flex: 1, padding: '10px 8px', overflow: 'auto' }}>
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link key={item.href} href={item.href} onMouseEnter={playSound.blip}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                  color: isActive ? '#fff' : ink,
                  background: isActive ? blue : 'transparent',
                  border: isActive ? `2px solid ${ink}` : '2px solid transparent',
                  textDecoration: 'none', fontWeight: 700, fontSize: 12,
                  marginBottom: 4, whiteSpace: 'nowrap', textTransform: 'uppercase', letterSpacing: 0.3,
                }}
              >
                <Icon size={16} style={{ flexShrink: 0 }} />
                {sidebarOpen && item.label}
              </Link>
            );
          })}
        </nav>

        {/* Bottom: company + sign out */}
        <div style={{ padding: '10px 8px', borderTop: `3px solid ${ink}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: sidebarOpen ? '8px 6px' : '8px 0', justifyContent: sidebarOpen ? 'flex-start' : 'center' }}>
            <div style={{ width: 30, height: 30, background: blue, border: `2px solid ${ink}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
              {verification.company_name.slice(0, 2).toUpperCase()}
            </div>
            {sidebarOpen && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{verification.company_name}</div>
                <div style={{ fontSize: 10, color: '#666', textTransform: 'uppercase', letterSpacing: 0.3 }}>Employer</div>
              </div>
            )}
          </div>
          <button onClick={handleLogout} onMouseEnter={playSound.blip}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
              background: 'none', border: 'none', cursor: 'pointer', color: '#C04040',
              fontSize: 12, fontWeight: 700, width: '100%', whiteSpace: 'nowrap', textTransform: 'uppercase',
            }}
          >
            <LogOut size={16} />
            {sidebarOpen && 'Sign out'}
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main style={{
        flex: 1, marginLeft: sidebarOpen ? 256 : 68,
        transition: 'margin-left 0.2s steps(6)',
        minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#fafafa',
      }}>
        {/* Topbar */}
        <header style={{
          height: 68, background: '#fff', borderBottom: `4px solid ${ink}`,
          display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12,
          position: 'sticky', top: 0, zIndex: 40,
        }}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)} onMouseEnter={playSound.blip}
            style={{ background: '#fff', border: `2px solid ${ink}`, cursor: 'pointer', color: ink, padding: 7 }}
          >
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          <div style={{ flex: 1 }} />

          <ThemeToggle />

          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
            background: '#fff', border: `2px solid ${ink}`, boxShadow: `3px 3px 0 ${ink}`,
          }}>
            <div style={{ width: 24, height: 24, background: blue, border: `1px solid ${ink}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#fff' }}>
              {verification.company_name.slice(0, 2).toUpperCase()}
            </div>
            <span style={{ fontSize: 12, fontWeight: 700, color: ink }}>{verification.company_name}</span>
            <span style={{ padding: '2px 8px', background: '#2D7A5F', color: '#fff', border: `1px solid ${ink}`, fontSize: 9, fontWeight: 800, letterSpacing: '0.05em' }}>VERIFIED</span>
          </div>
        </header>

        {/* Page */}
        <div style={{ flex: 1, padding: '32px' }}>{children}</div>
      </main>
    </div>
  );
}
