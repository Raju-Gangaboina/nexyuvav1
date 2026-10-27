'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';
import { LayoutDashboard, BarChart3, LogOut, Menu, X, Shield, Award, ClipboardList, ScrollText, ClipboardCheck, Flag, Star } from 'lucide-react';
import ThemeToggle from '@/app/components/ThemeToggle';
import { useUIMode } from '@/app/components/UIMode';

const NAV_ITEMS = [
  { href: '/admin/dashboard', icon: LayoutDashboard, label: 'Overview Dashboard' },
  { href: '/admin/verification', icon: ClipboardList, label: 'Verification Queue' },
  { href: '/admin/moderation', icon: ClipboardCheck, label: 'Internship Moderation' },
  { href: '/admin/reports', icon: Flag, label: 'Student Reports' },
  { href: '/admin/audit-log', icon: ScrollText, label: 'Audit Log' },
  { href: '/admin/analytics', icon: BarChart3, label: 'National Analytics' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { mode } = useUIMode();
  const isArcade = mode === 'arcade';
  const ink = isArcade ? '#0A0A0A' : '#E8E6E1';
  const blue = isArcade ? '#2155FF' : '#2B7FD4';
  const sun = isArcade ? '#FFD93B' : '#E8820A';
  const paper = isArcade ? '#fff' : '#0A0A0B';
  const paperAlt = isArcade ? '#fafafa' : '#0D0D0F';
  const borderW = isArcade ? 4 : 1;
  const borderW3 = isArcade ? 3 : 1;
  const borderW2 = isArcade ? 2 : 1;
  const font = isArcade ? "'JetBrains Mono', monospace" : "'Inter', sans-serif";
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const handleLogout = () => { router.push('/'); };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: paper, color: ink, fontFamily: font }}>
      {/* ── Sidebar ── */}
      <aside style={{
        width: sidebarOpen ? 256 : 68,
        background: paper,
        borderRight: `${borderW}px solid ${ink}`,
        display: 'flex', flexDirection: 'column',
        position: 'fixed', top: 0, bottom: 0, left: 0, zIndex: 50,
        transition: 'width 0.2s steps(6)',
        overflow: 'hidden',
      }}>
        {/* Logo */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: sidebarOpen ? 'flex-start' : 'center',
          gap: 10, padding: '14px 16px', borderBottom: `${borderW3}px solid ${ink}`, height: 68,
          minWidth: sidebarOpen ? 256 : 68,
        }}>
          <Star size={20} color={sun} fill={sun} style={{ filter: isArcade ? `drop-shadow(2px 2px 0 ${ink})` : 'none', flexShrink: 0 }} />
          {sidebarOpen && (
            <span style={{ fontSize: 13, fontWeight: 800, color: blue, textShadow: isArcade ? `2px 2px 0 ${ink}` : 'none', letterSpacing: 1, whiteSpace: 'nowrap' }}>
              NEX<span style={{ color: sun, WebkitTextStroke: isArcade ? `1px ${ink}` : 'none' }}>YUVA</span>
            </span>
          )}
        </div>

        {/* Portal badge */}
        {sidebarOpen && (
          <div style={{ padding: '10px 14px', borderBottom: `${borderW3}px solid ${ink}` }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '5px 10px', background: blue, color: '#fff', border: `${borderW2}px solid ${ink}`,
              fontSize: 10, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase',
            }}>
              <Award size={11} /> Ministry Portal
            </div>
          </div>
        )}

        {/* Nav */}
        <nav style={{ flex: 1, padding: '10px 8px', overflow: 'auto' }}>
          {NAV_ITEMS.map(item => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== '/admin/dashboard' && pathname?.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                  color: isActive ? '#fff' : ink,
                  background: isActive ? blue : 'transparent',
                  border: isActive ? `${borderW2}px solid ${ink}` : `${borderW2}px solid transparent`,
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

        {/* Bottom */}
        <div style={{ padding: '10px 8px', borderTop: `${borderW3}px solid ${ink}` }}>
          <button onClick={handleLogout}
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
        minHeight: '100vh', display: 'flex', flexDirection: 'column', background: paper,
      }}>
        {/* Topbar */}
        <header style={{
          height: 68, background: paper, borderBottom: `${borderW}px solid ${ink}`,
          display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12,
          position: 'sticky', top: 0, zIndex: 40,
        }}>
          <button onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{ background: paper, border: `${borderW2}px solid ${ink}`, cursor: 'pointer', color: ink, padding: 7 }}
          >
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>

          <div style={{ flex: 1 }} />

          <ThemeToggle />

          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '6px 12px',
            background: paper, border: `${borderW2}px solid ${ink}`, boxShadow: isArcade ? `2px 2px 0 ${ink}` : 'none',
          }}>
            <div style={{ width: 24, height: 24, background: blue, border: `${borderW2}px solid ${ink}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#fff' }}>GOI</div>
            <span style={{ fontSize: 11, fontWeight: 700, color: ink, textTransform: 'uppercase' }}>Govt. Administrator</span>
            <span style={{ padding: '2px 8px', background: sun, border: `1px solid ${ink}`, fontSize: 9, fontWeight: 800, color: '#0A0A0A', letterSpacing: '0.05em' }}>OFFICIAL</span>
          </div>
        </header>

        {/* Page */}
        <div style={{ flex: 1, padding: '32px', background: paperAlt }}>{children}</div>
      </main>
    </div>
  );
}
