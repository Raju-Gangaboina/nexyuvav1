'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import {
  LayoutDashboard, Compass, FileText, MessageSquare,
  User, Bell, LogOut, Menu, X, ChevronDown,
  GraduationCap, Sparkles, ShieldCheck, Route, Star
} from 'lucide-react';
import { fetchStudentProfile } from '@/lib/userContext';
import { StudentProfile } from '@/lib/types';
import ThemeToggle from '@/app/components/ThemeToggle';
import { useArcadeFX } from '@/app/components/ArcadeFX';

const ink = '#0A0A0A';
const blue = '#2155FF';
const sun = '#FFD93B';

const NAV_ITEMS = [
  { href: '/student/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/student/applications', icon: FileText, label: 'My Applications' },
  { href: '/student/career-path', icon: Route, label: 'Career Guidance' },
  { href: '/student/live-internships', icon: ShieldCheck, label: 'Live Internships' },
  { href: '/student/luckship', icon: Compass, label: 'Luckship' },
  { href: '/student/profile', icon: User, label: 'My Profile' },
  { href: '/student/chatbot', icon: MessageSquare, label: 'AI Career Chat' },
];

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { toast, playSound, muted, toggleMute, ArcadeToasts } = useArcadeFX();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [notifications] = useState(3);
  const [student, setStudent] = useState<StudentProfile>({
    id: 'STU-LOCAL', name: 'Student Profile', email: '', avatar: 'SP', college: '', city: '',
    degree: 'Bachelor Degree', branch: 'Engineering', year: 1, cgpa: 0, skills: [], tools: [],
    preferredLocations: [], preferredDomains: [], preferredMode: 'Remote', minStipend: 0,
    bio: '', github: '', linkedin: '', resumeScore: 0,
  });

  useEffect(() => {
    const loadProfile = () => { fetchStudentProfile().then(setStudent); };
    loadProfile();
    window.addEventListener('nexyuva_profile_updated', loadProfile);
    return () => window.removeEventListener('nexyuva_profile_updated', loadProfile);
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('nexyuva_real_token');
    toast('SESSION ENDED', 'THANKS FOR PLAYING — SEE YOU SOON');
    router.push('/');
  };

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
          <Star size={20} color={sun} fill={sun} style={{ filter: `drop-shadow(2px 2px 0 ${ink})`, flexShrink: 0 }} />
          {sidebarOpen && (
            <span style={{ fontSize: 13, fontWeight: 800, color: blue, textShadow: `2px 2px 0 ${ink}`, letterSpacing: 1, whiteSpace: 'nowrap' }}>
              NEX<span style={{ color: sun, WebkitTextStroke: `1px ${ink}` }}>YUVA</span>
            </span>
          )}
        </div>

        {/* Student badge */}
        {sidebarOpen && (
          <div style={{ padding: '10px 14px', borderBottom: `3px solid ${ink}` }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '5px 10px', background: blue, color: '#fff', border: `2px solid ${ink}`,
              fontSize: 10, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase',
            }}>
              <GraduationCap size={11} /> STUDENT PORTAL
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
                {item.href === '/student/chatbot' && sidebarOpen && (
                  <span style={{ marginLeft: 'auto', padding: '2px 6px', background: sun, border: `1px solid ${ink}`, fontSize: 9, fontWeight: 800, color: ink }}>AI</span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom */}
        <div style={{ padding: '10px 8px', borderTop: `3px solid ${ink}` }}>
          <button onClick={handleLogout} onMouseEnter={playSound.blip}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
              background: 'none', border: 'none', cursor: 'pointer', color: '#C04040',
              fontSize: 12, fontWeight: 700, width: '100%', whiteSpace: 'nowrap', textTransform: 'uppercase',
            }}
          >
            <LogOut size={16} />
            {sidebarOpen && 'SIGN OUT'}
          </button>
        </div>
      </aside>

      {/* ── Main ── */}
      <main style={{
        flex: 1, marginLeft: sidebarOpen ? 256 : 68,
        transition: 'margin-left 0.2s steps(6)',
        minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#fff',
      }}>
        {/* Topbar / HUD */}
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

          <div style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '6px 12px',
            background: sun, border: `2px solid ${ink}`, boxShadow: `3px 3px 0 ${ink}`,
          }}>
            <Sparkles size={13} color={ink} />
            <span style={{ fontSize: 11, fontWeight: 700, color: ink }}>
              AI FOUND <strong>3 NEW MATCHES</strong> TODAY
            </span>
          </div>

          <button onClick={toggleMute}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fff', border: `2px solid ${ink}`, boxShadow: `2px 2px 0 ${ink}`, padding: '6px 10px', fontFamily: "'JetBrains Mono', monospace", fontSize: 10, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase' }}
          >
            ♪ {muted ? 'OFF' : 'ON'}
          </button>

          <ThemeToggle />

          <div style={{ position: 'relative' }}>
            <button style={{ background: '#fff', border: `2px solid ${ink}`, padding: 8, cursor: 'pointer', color: ink, display: 'flex', alignItems: 'center' }}>
              <Bell size={17} />
            </button>
            {notifications > 0 && (
              <span style={{ position: 'absolute', top: -4, right: -4, width: 10, height: 10, background: '#FF3B30', border: `2px solid ${ink}`, borderRadius: '50%' }} />
            )}
          </div>

          <div style={{ position: 'relative' }}>
            <button onClick={() => setUserMenuOpen(!userMenuOpen)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', border: `2px solid ${ink}`, padding: '6px 12px', cursor: 'pointer', color: ink }}
            >
              <div style={{ width: 26, height: 26, background: blue, border: `2px solid ${ink}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#fff' }}>
                {student.name.slice(0, 2).toUpperCase()}
              </div>
              <span style={{ fontSize: 12, fontWeight: 700 }}>{student.name}</span>
              <ChevronDown size={13} />
            </button>

            {userMenuOpen && (
              <div style={{
                position: 'absolute', right: 0, top: '100%', marginTop: 8,
                background: '#fff', border: `3px solid ${ink}`, boxShadow: `5px 5px 0 ${ink}`,
                padding: 6, minWidth: 160, zIndex: 100,
              }}>
                <Link href="/student/profile"
                  style={{ display: 'block', padding: '8px 12px', color: ink, fontSize: 12, fontWeight: 700, textDecoration: 'none' }}
                >VIEW PROFILE</Link>
                <button onClick={handleLogout}
                  style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', color: '#C04040', fontSize: 12, fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer' }}
                >SIGN OUT</button>
              </div>
            )}
          </div>
        </header>

        {/* Page */}
        <div style={{ flex: 1, padding: '32px', position: 'relative', background: '#fafafa' }}>
          {children}
        </div>
      </main>
    </div>
  );
}
