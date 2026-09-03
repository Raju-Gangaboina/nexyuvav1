'use client';
import { useEffect, useState } from 'react';
import { RotateCcw, Clock, Layers, CheckCircle2, Link2, FileText, Sparkles } from 'lucide-react';
import { roadmapProjectIdeas, ProjectIdea } from '@/lib/aiEngine';

const DIFFICULTY_COLOR: Record<ProjectIdea['difficulty'], string> = {
  Beginner: '#4AAA82',
  Intermediate: '#E8820A',
  Advanced: '#E06060',
};

export default function ProjectIdeas({ topic, accent = 'var(--blue)' }: { topic: string; accent?: string }) {
  const [ideas, setIdeas] = useState<ProjectIdea[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = () => {
    setLoading(true);
    setError(false);
    roadmapProjectIdeas(topic)
      .then(setIdeas)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reload is intentional on topic change
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load is stable per-render, only topic should retrigger
  }, [topic]);

  if (loading) {
    return <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: '20px 0' }}>Generating project ideas for {topic}...</p>;
  }
  if (error || !ideas) {
    return (
      <div style={{ padding: '20px 0' }}>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 10 }}>Couldn&apos;t load project ideas.</p>
        <button className="btn-secondary" onClick={load}><RotateCcw size={13} /> Retry</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn-ghost" onClick={load} style={{ fontSize: 11 }}>
          <RotateCcw size={12} /> Regenerate
        </button>
      </div>
      {ideas.map((idea) => (
        <div key={idea.title} className="glass-card" style={{ padding: 18, borderLeft: `3px solid ${accent}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8, gap: 10 }}>
            <h4 style={{ fontSize: 14.5, fontWeight: 700 }}>{idea.title}</h4>
            <span style={{
              fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
              color: DIFFICULTY_COLOR[idea.difficulty], border: `1px solid ${DIFFICULTY_COLOR[idea.difficulty]}50`,
              padding: '2px 8px', borderRadius: 'var(--radius-px)', flexShrink: 0, fontWeight: 700,
              background: `${DIFFICULTY_COLOR[idea.difficulty]}14`,
            }}>{idea.difficulty}</span>
          </div>
          <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.6, marginBottom: 12 }}>{idea.overview}</p>

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 12, fontSize: 11.5, color: 'var(--text-muted)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Clock size={12} /> {idea.estimatedTime}</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Layers size={12} /> {idea.prerequisites.join(', ')}</span>
          </div>

          <div style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Features</p>
            {idea.features.map(f => (
              <div key={f} style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 3 }}>
                <CheckCircle2 size={13} color="#4AAA82" style={{ flexShrink: 0, marginTop: 2 }} /> {f}
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>Starter Guide</p>
            <ol style={{ paddingLeft: 18, margin: 0 }}>
              {idea.starterGuide.map(s => (
                <li key={s} style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 3, lineHeight: 1.5 }}>{s}</li>
              ))}
            </ol>
          </div>

          <div style={{ background: 'var(--void-up)', border: `1px solid ${accent}30`, borderRadius: 8, padding: 10, marginBottom: 10, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <FileText size={13} color={accent} style={{ flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 11.5, color: 'var(--text-secondary)', fontStyle: 'italic' }}>{idea.resumeDescription}</p>
          </div>

          <div style={{ marginBottom: 10 }}>
            <p style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Link2 size={12} /> GitHub Tips
            </p>
            {idea.githubTips.map(t => (
              <p key={t} style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 2 }}>• {t}</p>
            ))}
          </div>

          <div style={{ background: `${accent}0d`, border: `1px solid ${accent}40`, borderRadius: 8, padding: 12, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <Sparkles size={13} color={accent} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <p style={{ fontSize: 10.5, fontWeight: 700, color: accent, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>AI Mentor</p>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{idea.aiMentor}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
