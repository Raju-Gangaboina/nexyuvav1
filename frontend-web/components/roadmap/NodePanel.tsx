'use client';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, BookOpen, Rocket, Bot, ExternalLink } from 'lucide-react';
import ProjectIdeas from './ProjectIdeas';
import AiTutorPanel from './AiTutorPanel';
import { getTopicContent } from '@/lib/roadmapContent';

export interface NodePanelTopic {
  title: string;
  note: string;
}

type Tab = 'overview' | 'projects' | 'tutor';

const TABS: { id: Tab; label: string; icon: typeof BookOpen }[] = [
  { id: 'overview', label: 'Overview', icon: BookOpen },
  { id: 'projects', label: 'Project Ideas', icon: Rocket },
  { id: 'tutor', label: 'AI Tutor', icon: Bot },
];

const RESOURCE_TYPE_LABEL: Record<string, string> = {
  official: 'Official', article: 'Article', course: 'Course', video: 'Video',
  feed: 'Community', opensource: 'Open Source', roadmap: 'Roadmap', podcast: 'Podcast',
};

export default function NodePanel({
  topic, accent, roadmapId, onClose,
}: {
  topic: NodePanelTopic;
  accent: string;
  roadmapId: string;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('overview');
  const [mounted, setMounted] = useState(false);
  const content = getTopicContent(roadmapId, topic.title);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- SSR-safe portal mount flag, must run once after mount
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(5,5,5,0.75)', zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        className="vx-card"
        style={{
          width: 'min(680px, 100%)', height: 'min(680px, 90vh)', background: 'var(--void-card)',
          borderRadius: 'var(--radius-px)', display: 'flex', flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div style={{ padding: '18px 22px', borderBottom: 'var(--px-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: 'var(--void-up)' }}>
          <div>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 4, fontFamily: 'var(--font-sans)' }}>{topic.title}</h3>
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: '0.03em' }}>LEARNING HUB</p>
          </div>
          <button
            onClick={onClose}
            style={{
              display: 'flex', padding: 7, background: 'transparent', border: 'var(--px-border)',
              borderRadius: 'var(--radius-px)', cursor: 'pointer', color: 'var(--text-muted)',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: 'var(--px-border)', padding: '0 14px', background: 'var(--void-card)' }}>
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '11px 13px',
                background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: tab === id ? `2px solid ${accent}` : '2px solid transparent',
                color: tab === id ? 'var(--text-primary)' : 'var(--text-muted)',
                fontSize: 12, fontWeight: tab === id ? 700 : 500, fontFamily: 'var(--font-sans)',
              }}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px' }}>
          {tab === 'overview' && (
            <div>
              <p style={{ fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                {content?.description || topic.note}
              </p>

              {content && content.resources.length > 0 && (
                <div style={{ marginTop: 20 }}>
                  <p style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>
                    Resources
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {content.resources.map(r => (
                      <a
                        key={r.url}
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                          background: 'var(--void-up)', border: 'var(--px-border-2)',
                          borderRadius: 'var(--radius-px)', fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none',
                        }}
                      >
                        <span style={{
                          fontSize: 9, fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
                          color: 'var(--accent-cyan)', border: '1px solid var(--accent-cyan)50',
                          borderRadius: 'var(--radius-px)', padding: '1px 6px', flexShrink: 0, fontWeight: 700,
                          background: 'var(--blue-dim)',
                        }}>
                          {RESOURCE_TYPE_LABEL[r.type] || r.type}
                        </span>
                        <span style={{ flex: 1 }}>{r.label}</span>
                        <ExternalLink size={12} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {tab === 'projects' && <ProjectIdeas topic={topic.title} accent={accent} />}
          {tab === 'tutor' && <AiTutorPanel topic={topic.title} />}
          </div>
          </div>
          </div>,
            document.body
  );
}
