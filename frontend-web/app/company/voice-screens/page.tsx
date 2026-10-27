'use client';
import { useState, useEffect, useCallback } from 'react';
import { Mic, ChevronDown, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { getMyRealInternships, listVoiceScreens, VoiceScreenResult } from '@/lib/realApi';

// Voice Screen (5.7) company-facing review dashboard. Async, one-way audio
// interview -- no live human/AI interviewer, no webcam proctoring, so this
// page is a straightforward list/detail view over transcribed-and-graded
// answers, same shape as company/interviews/page.tsx but simpler (no
// integrity flags, no proctoring signals -- see app/services/voice_screen
// docstring for why).

interface RealInternship { id: string; title: string; is_active: boolean; }

function scoreColor(score: number | null): string {
  if (score === null) return 'var(--text-muted)';
  if (score >= 70) return '#4AAA82';
  if (score >= 40) return 'var(--accent-amber)';
  return '#E06060';
}

export default function CompanyVoiceScreensPage() {
  const [internships, setInternships] = useState<RealInternship[]>([]);
  const [selectedInternshipId, setSelectedInternshipId] = useState<string>('');
  const [attempts, setAttempts] = useState<VoiceScreenResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    getMyRealInternships()
      .then(list => {
        setInternships(list);
        if (list.length > 0) setSelectedInternshipId(list[0].id);
      })
      .catch(() => setInternships([]));
  }, []);

  const loadAttempts = useCallback(async (internshipId: string) => {
    if (!internshipId) return;
    setLoading(true);
    setLoadError('');
    setExpandedId(null);
    try {
      const data = await listVoiceScreens(internshipId);
      setAttempts(data);
    } catch (e: any) {
      setLoadError(e?.message || 'Could not load voice screen attempts for this posting.');
      setAttempts([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadAttempts(selectedInternshipId); }, [selectedInternshipId, loadAttempts]);

  const completedCount = attempts.filter(a => a.status === 'completed').length;
  const passedCount = attempts.filter(a => a.passed).length;

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 4, fontFamily: 'var(--font-serif)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Mic size={28} color="#2B7FD4" /> Voice Screens
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 13, textTransform: 'uppercase' }}>
          Async Voice Screen · Transcripts &amp; Scores
        </p>
      </div>

      {internships.length === 0 ? (
        <div className="glass-card" style={{ padding: 40, textAlign: 'center' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            Post an internship first to see voice screen activity here.
          </p>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 20, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
              Posting
            </label>
            <select
              value={selectedInternshipId}
              onChange={e => setSelectedInternshipId(e.target.value)}
              style={{
                padding: '10px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)',
                borderRadius: 'var(--radius-md)', fontSize: 13, color: 'var(--text-primary)', minWidth: 260,
              }}
            >
              {internships.map(i => (
                <option key={i.id} value={i.id}>{i.title}{!i.is_active ? ' (closed)' : ''}</option>
              ))}
            </select>
          </div>

          {attempts.length > 0 && (
            <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
              <StatChip label="Attempts Completed" value={`${completedCount}/${attempts.length}`} />
              <StatChip label="Passed" value={String(passedCount)} accent="#4AAA82" />
            </div>
          )}

          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 40, justifyContent: 'center', color: 'var(--text-muted)' }}>
              <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Loading attempts...
            </div>
          ) : loadError ? (
            <div className="glass-card" style={{ padding: 24, color: '#E06060', fontSize: 13 }}>{loadError}</div>
          ) : attempts.length === 0 ? (
            <div className="glass-card" style={{ padding: 40, textAlign: 'center' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>No voice screen attempts yet for this posting.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {attempts.map(attempt => (
                <div key={attempt.attempt_id} className="glass-card" style={{ overflow: 'hidden' }}>
                  <button
                    onClick={() => setExpandedId(expandedId === attempt.attempt_id ? null : attempt.attempt_id)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px',
                      background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{attempt.student_name || 'Candidate'}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{attempt.status}</div>
                    </div>

                    <StatusBadge status={attempt.status} passed={attempt.passed} />
                    {attempt.final_score !== null && (
                      <div style={{ fontSize: 13, fontWeight: 700, color: scoreColor(attempt.final_score), minWidth: 70, textAlign: 'right' }}>
                        {attempt.final_score.toFixed(0)}% score
                      </div>
                    )}

                    <ChevronDown
                      size={18}
                      color="var(--text-muted)"
                      style={{ transform: expandedId === attempt.attempt_id ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}
                    />
                  </button>

                  {expandedId === attempt.attempt_id && (
                    <div style={{ borderTop: '1px solid var(--glass-border)', padding: '18px 20px' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginBottom: 10 }}>
                        Transcript
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        {attempt.questions.map((q, i) => (
                          <div key={i} style={{ padding: '12px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)' }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
                              Q{i + 1}. {q.question}
                            </div>
                            {q.transcript ? (
                              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.6 }}>{q.transcript}</p>
                            ) : (
                              <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: 8 }}>No speech captured for this answer.</p>
                            )}
                            {q.score !== null && (
                              <span style={{ fontSize: 12, fontWeight: 700, color: scoreColor(q.score) }}>{q.score.toFixed(0)}/100</span>
                            )}
                            {q.notes && (
                              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, fontStyle: 'italic' }}>{q.notes}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatChip({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{
      padding: '10px 16px', background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)',
      borderRadius: 'var(--radius-md)', display: 'flex', flexDirection: 'column', gap: 2,
    }}>
      <span style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>{label}</span>
      <span style={{ fontSize: 18, fontWeight: 700, color: accent || 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

function StatusBadge({ status, passed }: { status: string; passed: boolean | null }) {
  if (status !== 'completed') {
    return (
      <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 0, background: 'rgba(43,127,212,0.1)', color: '#2B7FD4', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
        In progress
      </span>
    );
  }
  return passed ? (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 0, background: 'rgba(74,170,130,0.12)', color: '#4AAA82', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
      <CheckCircle2 size={12} /> Passed
    </span>
  ) : (
    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 0, background: 'rgba(224,96,96,0.1)', color: '#E06060', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
      <XCircle size={12} /> Did not pass
    </span>
  );
}
