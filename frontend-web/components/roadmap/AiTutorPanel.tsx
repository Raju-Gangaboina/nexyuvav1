'use client';
import { useState } from 'react';
import { Bot, Sparkles, Code2 } from 'lucide-react';
import { roadmapTutor, TutorMode, TutorResponse } from '@/lib/aiEngine';

const MODE_LABELS: { mode: TutorMode; label: string; needsCode?: boolean }[] = [
  { mode: 'explain_beginner', label: 'Explain (Beginner)' },
  { mode: 'explain_advanced', label: 'Explain (Advanced)' },
  { mode: 'example', label: 'Generate Example' },
  { mode: 'explain_code', label: 'Explain Code', needsCode: true },
  { mode: 'review_code', label: 'Review Code', needsCode: true },
  { mode: 'quiz', label: 'Generate Quiz' },
  { mode: 'flashcards', label: 'Flashcards' },
  { mode: 'interview_questions', label: 'Interview Questions' },
  { mode: 'revision_notes', label: 'Revision Notes' },
  { mode: 'learning_roadmap', label: 'Learning Roadmap' },
];

function formatContent(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part.split('\n').map((line, j) => (
      <span key={`${i}-${j}`}>{j > 0 && <br />}{line}</span>
    ));
  });
}

export default function AiTutorPanel({ topic }: { topic: string }) {
  const [activeMode, setActiveMode] = useState<TutorMode | null>(null);
  const [response, setResponse] = useState<TutorResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [code, setCode] = useState('');
  const [showCodeInput, setShowCodeInput] = useState<TutorMode | null>(null);

  const run = async (mode: TutorMode, codeArg?: string) => {
    setActiveMode(mode);
    setLoading(true);
    setShowCodeInput(null);
    try {
      const res = await roadmapTutor(topic, mode, codeArg);
      setResponse(res);
    } finally {
      setLoading(false);
    }
  };

  const handleClick = (mode: TutorMode, needsCode?: boolean) => {
    if (needsCode) {
      setShowCodeInput(mode);
      return;
    }
    run(mode);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 12 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {MODE_LABELS.map(({ mode, label, needsCode }) => (
          <button
            key={mode}
            onClick={() => handleClick(mode, needsCode)}
            className={activeMode === mode ? 'btn-primary' : 'btn-secondary'}
            style={{ fontSize: 11, padding: '6px 12px' }}
          >
            {needsCode ? <Code2 size={12} /> : <Sparkles size={12} />} {label}
          </button>
        ))}
      </div>

      {showCodeInput && (
        <div className="glass-card" style={{ padding: 14 }}>
          <textarea
            className="input-field"
            placeholder="Paste your code here..."
            value={code}
            onChange={e => setCode(e.target.value)}
            rows={6}
            style={{ width: '100%', fontFamily: 'var(--font-mono)', fontSize: 12, resize: 'vertical' }}
          />
          <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
            <button className="btn-ghost" onClick={() => setShowCodeInput(null)}>Cancel</button>
            <button className="btn-primary" onClick={() => run(showCodeInput, code)} disabled={!code.trim()}>
              Submit
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '16px 0' }}>
          <div style={{ width: 28, height: 28, background: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Bot size={14} color="#050505" />
          </div>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Thinking about {topic}...</p>
        </div>
      )}

      {!loading && response && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <div style={{ width: 28, height: 28, background: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Bot size={14} color="#050505" />
          </div>
          <div style={{
            flex: 1, padding: '14px 16px', background: 'var(--bg-elevated)',
            border: '1px solid var(--glass-border)', fontSize: 13.5, lineHeight: 1.7, color: 'var(--text-primary)',
          }}>
            {formatContent(response.content)}
          </div>
        </div>
      )}

      {!loading && !response && (
        <p style={{ color: 'var(--text-muted)', fontSize: 12.5, padding: '8px 0' }}>
          Pick an action above to get AI Tutor help with <strong>{topic}</strong>.
        </p>
      )}
    </div>
  );
}
