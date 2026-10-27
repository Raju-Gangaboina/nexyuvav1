'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Video, ChevronDown, ShieldAlert, CheckCircle2, XCircle, Award, Loader2, AlertTriangle, BrainCircuit,
  CalendarClock, CalendarCheck2, Ban, MessagesSquare, Sparkles, Send, Square, Mic, MicOff, StickyNote,
  Star, User, Briefcase, Target, ClipboardCheck,
} from 'lucide-react';
import {
  getMyRealInternships,
  getInternshipApplicants,
  getApplicantInterviewReview,
  getGoogleCalendarStatus,
  getOrgScheduledInterviews,
  proposeInterviewSlots,
  cancelScheduledInterview,
  ApplicantListItem,
  InterviewReviewDetail,
  ScheduledInterview,
  listAssistedInterviewSessions,
  startAssistedInterview,
  getAssistedInterviewSession,
  postAssistedInterviewExchange,
  acceptAssistedInterviewSuggestion,
  endAssistedInterview,
  getAssistedInterviewBrief,
  transcribeAssistedInterviewAudio,
  updateAssistedInterviewCoverage,
  addAssistedInterviewNote,
  submitAssistedInterviewScorecard,
  AssistedInterviewSession,
  CandidateBrief,
  AssistedInterviewScorecardInput,
} from '@/lib/realApi';

// Interview Agent (5.4) company-facing review dashboard -- the one net-new
// piece the AI Hiring Suite architecture doc calls out for this agent.
// Everything else (webcam capture, MediaPipe/Gemini proctoring, Groq-graded
// question flow) already existed on the student side; this page is purely
// a read view over that same data, scoped per-internship, per-org.
//
// Each flag type shows its aggregate count plus the wall-clock time of
// every occurrence, so a reviewer can see e.g. "phone_detected at 10:02:14,
// 10:04:51" rather than just a bare count. This is not tied to video
// playback (no raw video is stored -- see app/core/models.py), so it's a
// chronological event list rather than a scrubbable video timeline.

interface RealInternship {
  id: string;
  title: string;
  is_active: boolean;
}

const FLAG_LABELS: Record<string, string> = {
  phone_detected: 'Phone detected on camera',
  multiple_faces_detected: 'Multiple people detected',
  no_face_detected: 'No face detected',
  gaze_away_extended: 'Looked away for extended period',
};

function flagLabel(flagType: string): string {
  return FLAG_LABELS[flagType] || flagType.replace(/_/g, ' ');
}

function scoreColor(score: number | null): string {
  if (score === null) return 'var(--text-muted)';
  if (score >= 70) return '#4AAA82';
  if (score >= 40) return 'var(--accent-amber)';
  return '#E06060';
}

export default function CompanyInterviewsPage() {
  const [internships, setInternships] = useState<RealInternship[]>([]);
  const [selectedInternshipId, setSelectedInternshipId] = useState<string>('');
  const [applicants, setApplicants] = useState<ApplicantListItem[]>([]);
  const [loadingApplicants, setLoadingApplicants] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [expandedAppId, setExpandedAppId] = useState<string | null>(null);
  const [detailByAppId, setDetailByAppId] = useState<Record<string, InterviewReviewDetail>>({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<Record<string, string>>({});

  // Smart Scheduling (5.5): whether this org has a connected Google
  // Calendar (org-wide, not per-applicant), and the scheduling row per
  // application (keyed by application_id) for the currently selected posting.
  const [calendarConnected, setCalendarConnected] = useState<boolean | null>(null);
  const [scheduledByAppId, setScheduledByAppId] = useState<Record<string, ScheduledInterview>>({});

  // Assisted Human Interview (5.6): live co-pilot session per application,
  // keyed by application_id for the currently selected posting. Same
  // pattern as scheduledByAppId above -- refetched whenever the posting
  // changes, updated locally as the interviewer works through a session.
  const [assistedByAppId, setAssistedByAppId] = useState<Record<string, AssistedInterviewSession>>({});

  useEffect(() => {
    getMyRealInternships()
      .then(list => {
        setInternships(list);
        if (list.length > 0) setSelectedInternshipId(list[0].id);
      })
      .catch(() => setInternships([]));
    getGoogleCalendarStatus()
      .then(s => setCalendarConnected(s.connected))
      .catch(() => setCalendarConnected(false));
  }, []);

  const loadApplicants = useCallback(async (internshipId: string) => {
    if (!internshipId) return;
    setLoadingApplicants(true);
    setLoadError('');
    setExpandedAppId(null);
    try {
      const data = await getInternshipApplicants(internshipId);
      setApplicants(data);
    } catch (e: any) {
      setLoadError(e?.message || 'Could not load applicants for this posting.');
      setApplicants([]);
    }
    setLoadingApplicants(false);

    try {
      const rows = await getOrgScheduledInterviews(internshipId);
      const map: Record<string, ScheduledInterview> = {};
      for (const row of rows) map[row.application_id] = row;
      setScheduledByAppId(map);
    } catch {
      setScheduledByAppId({});
    }

    try {
      const sessions = await listAssistedInterviewSessions(internshipId);
      const map: Record<string, AssistedInterviewSession> = {};
      for (const s of sessions) map[s.application_id] = s;
      setAssistedByAppId(map);
    } catch {
      setAssistedByAppId({});
    }
  }, []);

  useEffect(() => { loadApplicants(selectedInternshipId); }, [selectedInternshipId, loadApplicants]);

  const toggleExpand = async (applicant: ApplicantListItem) => {
    if (expandedAppId === applicant.id) {
      setExpandedAppId(null);
      return;
    }
    setExpandedAppId(applicant.id);
    if (detailByAppId[applicant.id] || !applicant.interview) return;

    setDetailLoading(applicant.id);
    setDetailError(prev => ({ ...prev, [applicant.id]: '' }));
    try {
      const detail = await getApplicantInterviewReview(selectedInternshipId, applicant.id);
      setDetailByAppId(prev => ({ ...prev, [applicant.id]: detail }));
    } catch (e: any) {
      setDetailError(prev => ({ ...prev, [applicant.id]: e?.message || 'Could not load interview transcript.' }));
    }
    setDetailLoading(null);
  };

  const withInterviews = applicants.filter(a => a.interview !== null);
  const completedCount = withInterviews.filter(a => a.interview?.status === 'completed').length;
  const passedCount = withInterviews.filter(a => a.interview?.passed).length;
  const flaggedCount = withInterviews.filter(
    a => a.interview?.integrity_score !== null && (a.interview?.integrity_score ?? 100) < 80,
  ).length;

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 4, fontFamily: 'var(--font-serif)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Video size={28} color="#2B7FD4" /> Interview Reviews
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 13, textTransform: 'uppercase' }}>
          AI Stand-Out Interview · Transcripts & Proctoring Signals
        </p>
      </div>

      {internships.length === 0 ? (
        <div className="glass-card" style={{ padding: 40, textAlign: 'center' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            Post an internship first to see interview activity here.
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

          {withInterviews.length > 0 && (
            <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
              <StatChip label="Interviews Completed" value={`${completedCount}/${withInterviews.length}`} />
              <StatChip label="Passed" value={String(passedCount)} accent="#4AAA82" />
              <StatChip label="Integrity Flagged" value={String(flaggedCount)} accent={flaggedCount > 0 ? '#E06060' : undefined} />
            </div>
          )}

          {loadingApplicants ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 40, justifyContent: 'center', color: 'var(--text-muted)' }}>
              <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> Loading applicants...
            </div>
          ) : loadError ? (
            <div className="glass-card" style={{ padding: 24, color: '#E06060', fontSize: 13 }}>{loadError}</div>
          ) : applicants.length === 0 ? (
            <div className="glass-card" style={{ padding: 40, textAlign: 'center' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>No applicants yet for this posting.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {applicants.map(applicant => (
                <div key={applicant.id} className="glass-card" style={{ overflow: 'hidden' }}>
                  <button
                    onClick={() => toggleExpand(applicant)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px',
                      background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{applicant.candidate_name}</div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', textTransform: 'capitalize' }}>{applicant.status}</div>
                    </div>

                    {applicant.interview ? (
                      <>
                        <InterviewBadge status={applicant.interview.status} passed={applicant.interview.passed} />
                        {applicant.interview.final_score !== null && (
                          <div style={{ fontSize: 13, fontWeight: 700, color: scoreColor(applicant.interview.final_score), minWidth: 70, textAlign: 'right' }}>
                            {applicant.interview.final_score.toFixed(0)}% score
                          </div>
                        )}
                        {applicant.interview.integrity_score !== null && applicant.interview.integrity_score < 80 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#E06060' }}>
                            <ShieldAlert size={14} /> Flagged
                          </div>
                        )}
                      </>
                    ) : (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Interview not started</span>
                    )}

                    {applicant.aptitude && (
                      <AptitudeChip summary={applicant.aptitude} />
                    )}

                    {assistedByAppId[applicant.id] && (
                      <span
                        style={{
                          display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '3px 10px',
                          borderRadius: 0, textTransform: 'uppercase', fontFamily: 'var(--font-mono)',
                          background: assistedByAppId[applicant.id].status === 'active' ? 'rgba(124,58,237,0.12)' : 'rgba(148,163,184,0.12)',
                          color: assistedByAppId[applicant.id].status === 'active' ? '#7C3AED' : 'var(--text-muted)',
                        }}
                      >
                        <MessagesSquare size={12} /> {assistedByAppId[applicant.id].status === 'active' ? 'Co-Pilot live' : 'Co-Pilot ended'}
                      </span>
                    )}

                    <ChevronDown
                      size={18}
                      color="var(--text-muted)"
                      style={{ transform: expandedAppId === applicant.id ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }}
                    />
                  </button>

                  {expandedAppId === applicant.id && (
                    <div style={{ borderTop: '1px solid var(--glass-border)', padding: '18px 20px' }}>
                      {!applicant.interview ? (
                        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                          This candidate hasn't started their AI Stand-Out Interview yet.
                        </p>
                      ) : detailLoading === applicant.id ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 13 }}>
                          <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Loading transcript...
                        </div>
                      ) : detailError[applicant.id] ? (
                        <p style={{ fontSize: 13, color: '#E06060' }}>{detailError[applicant.id]}</p>
                      ) : (
                        detailByAppId[applicant.id] && (
                          <InterviewDetailView detail={detailByAppId[applicant.id]} />
                        )
                      )}

                      {applicant.aptitude && (
                        <div style={{ marginTop: applicant.interview ? 20 : 0, paddingTop: applicant.interview ? 18 : 0, borderTop: applicant.interview ? '1px dashed var(--glass-border)' : 'none' }}>
                          <AptitudeDetailView summary={applicant.aptitude} />
                        </div>
                      )}

                      <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px dashed var(--glass-border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                          <MessagesSquare size={16} color="#7C3AED" />
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                            Assisted Human Interview — AI Co-Pilot
                          </span>
                        </div>
                        <AssistedInterviewPanel
                          applicationId={applicant.id}
                          session={assistedByAppId[applicant.id]}
                          onUpdate={session => setAssistedByAppId(prev => ({ ...prev, [applicant.id]: session }))}
                        />
                      </div>

                      <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px dashed var(--glass-border)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                          <CalendarClock size={16} color="#2B7FD4" />
                          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                            Human Interview Scheduling
                          </span>
                        </div>
                        <SchedulingPanel
                          applicationId={applicant.id}
                          calendarConnected={calendarConnected}
                          scheduled={scheduledByAppId[applicant.id]}
                          onUpdate={row => setScheduledByAppId(prev => ({ ...prev, [applicant.id]: row }))}
                        />
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

function AptitudeDetailView({ summary }: { summary: NonNullable<ApplicantListItem['aptitude']> }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <BrainCircuit size={16} color="#F59E0B" />
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
          Aptitude Check
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
          ({summary.attempts_used}/2 attempts used)
        </span>
      </div>

      {summary.status === 'in_progress' ? (
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>This candidate is currently taking the Aptitude Check.</p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 20, marginBottom: summary.badge_awarded ? 16 : 0, flexWrap: 'wrap' }}>
            <MiniStat label="Raw Score" value={summary.raw_score !== null ? `${summary.raw_score.toFixed(0)}%` : '—'} color={scoreColor(summary.raw_score)} />
            <MiniStat label="Percentile" value={summary.percentile !== null ? `${summary.percentile.toFixed(0)}th` : '—'} />
            <MiniStat label="Integrity Score" value={summary.integrity_score !== null ? `${summary.integrity_score.toFixed(0)}%` : '—'} color={scoreColor(summary.integrity_score)} />
            <MiniStat label="Result" value={summary.passed ? 'Passed' : 'Did not clear bar'} color={summary.passed ? '#4AAA82' : '#E06060'} />
          </div>
          {summary.badge_awarded && (
            <img
              src="/apptitude.png"
              alt="Aptitude Check - Stand-Out, Verified Achievement"
              style={{ width: 220, filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.35))' }}
            />
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

function AptitudeChip({ summary }: { summary: NonNullable<ApplicantListItem['aptitude']> }) {
  if (summary.status === 'in_progress') {
    return (
      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 0, background: 'rgba(43,127,212,0.1)', color: '#2B7FD4', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
        <BrainCircuit size={12} /> Aptitude in progress
      </span>
    );
  }
  if (summary.badge_awarded) {
    return (
      <span
        title={`Aptitude Check: ${summary.raw_score != null ? Math.round(summary.raw_score) : '—'}% raw score${summary.percentile != null ? `, ${Math.round(summary.percentile)}th percentile` : ''}`}
        style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 0, background: 'rgba(245,158,11,0.14)', color: '#F59E0B', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}
      >
        <Award size={12} /> Aptitude Stand-Out
      </span>
    );
  }
  return (
    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
      Aptitude {summary.raw_score != null ? `${Math.round(summary.raw_score)}%` : '—'}
    </span>
  );
}

function InterviewBadge({ status, passed }: { status: string; passed: boolean | null }) {
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

function InterviewDetailView({ detail }: { detail: InterviewReviewDetail }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 20, marginBottom: 18, flexWrap: 'wrap' }}>
        <MiniStat label="Final Score" value={detail.final_score !== null ? `${detail.final_score.toFixed(0)}%` : '—'} color={scoreColor(detail.final_score)} />
        <MiniStat label="Integrity Score" value={detail.integrity_score !== null ? `${detail.integrity_score.toFixed(0)}%` : '—'} color={scoreColor(detail.integrity_score)} />
        {detail.badge_awarded && (
          <MiniStat label="Badge" value="Stand Out" color="#7C3AED" icon={<Award size={14} />} />
        )}
        <MiniStat
          label="Duration"
          value={
            detail.completed_at
              ? `${Math.max(1, Math.round((new Date(detail.completed_at).getTime() - new Date(detail.started_at).getTime()) / 60000))} min`
              : '—'
          }
        />
      </div>

      {detail.integrity_flags.length > 0 && (
        <div style={{
          marginBottom: 18, padding: '12px 16px', background: 'rgba(224,96,96,0.06)',
          border: '1px solid rgba(224,96,96,0.2)', borderRadius: 'var(--radius-md)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 12, fontWeight: 700, color: '#E06060', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
            <AlertTriangle size={14} /> Proctoring Signals
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.6 }}>
            These are signals to consider, not an automatic reject — lighting, a second monitor, or a
            connection hiccup can trigger false positives. Review the transcript before deciding.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {detail.integrity_flags.map((f, i) => (
              <div key={i}>
                <span style={{ fontSize: 12, padding: '4px 10px', background: 'rgba(224,96,96,0.1)', borderRadius: 0, color: '#E06060' }}>
                  {flagLabel(f.flag_type)} × {f.count}
                </span>
                {f.timestamps && f.timestamps.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6, paddingLeft: 4 }}>
                    {f.timestamps.map((ts, j) => (
                      <span key={j} style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                        {new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        {j < f.timestamps.length - 1 ? ' ·' : ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginBottom: 10 }}>
        Transcript
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {detail.questions.map((q, i) => (
          <div key={i} style={{ padding: '12px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>
              Q{i + 1}. {q.question}
            </div>
            {q.answer ? (
              <>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.6 }}>{q.answer}</p>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  {q.score !== null && (
                    <span style={{ fontSize: 12, fontWeight: 700, color: scoreColor(q.score) }}>{q.score.toFixed(0)}/100</span>
                  )}
                  {q.resume_consistent === false && (
                    <span style={{ fontSize: 11, color: '#E06060', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <AlertTriangle size={11} /> Inconsistent with resume
                    </span>
                  )}
                  {q.resume_consistent === true && (
                    <span style={{ fontSize: 11, color: '#4AAA82', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircle2 size={11} /> Consistent with resume
                    </span>
                  )}
                </div>
                {q.notes && (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, fontStyle: 'italic' }}>{q.notes}</p>
                )}
              </>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Not answered yet</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Assisted Human Interview (5.6): a human interviewer runs the live
// conversation on Google Meet while this panel is their AI co-pilot
// workspace -- candidate brief, mic-captured live transcription (Groq
// Whisper via the shared /transcribe endpoint), contextual AI follow-up
// suggestions, a coverage checklist, private notes/evidence, and a
// human-only post-interview scorecard. The candidate never sees
// suggestions, and there is deliberately no AI-writable score/pass field
// anywhere in this panel -- submitAssistedInterviewScorecard is the only
// call that can ever set technical_knowledge/problem_solving/communication/
// project_understanding/decision, and it is only ever invoked from the
// human-filled form at the bottom of this component. Full session state is
// refetched from the server after every mutation rather than tracked
// optimistically client-side, since a live interview's turn cadence is
// slow (human/mic-paced) and correctness matters more than shaving a
// request.
const COVERAGE_AREAS: { key: string; label: string }[] = [
  { key: 'projects', label: 'Projects' },
  { key: 'technical_fundamentals', label: 'Technical Fundamentals' },
  { key: 'problem_solving', label: 'Problem Solving' },
  { key: 'role_specific', label: 'Role-Specific Skills' },
  { key: 'communication', label: 'Communication / Behavioral' },
  { key: 'motivation', label: 'Role Motivation' },
];

const DECISION_OPTIONS: { key: 'strong_yes' | 'yes' | 'maybe' | 'no'; label: string; color: string }[] = [
  { key: 'strong_yes', label: 'Strong Yes', color: '#4AAA82' },
  { key: 'yes', label: 'Yes', color: '#7FBF9E' },
  { key: 'maybe', label: 'Maybe', color: '#F59E0B' },
  { key: 'no', label: 'No', color: '#E06060' },
];

function CandidateBriefStrip({ brief, loading }: { brief: CandidateBrief | null; loading: boolean }) {
  if (loading) {
    return <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading candidate brief…</p>;
  }
  if (!brief) return null;
  return (
    <div style={{
      display: 'flex', gap: 16, alignItems: 'flex-start', padding: '14px 16px', marginBottom: 16,
      background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)',
      flexWrap: 'wrap',
    }}>
      {brief.avatar_url ? (
        <img src={brief.avatar_url} alt={brief.candidate_name} style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
      ) : (
        <div style={{
          width: 48, height: 48, borderRadius: '50%', background: 'rgba(124,58,237,0.15)', color: '#7C3AED',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <User size={20} />
        </div>
      )}
      <div style={{ flex: 1, minWidth: 200 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>{brief.candidate_name}</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Briefcase size={12} /> {brief.role_title}
          </span>
          {brief.compatibility_score !== null && (
            <span style={{ fontSize: 12, fontWeight: 700, color: scoreColor(brief.compatibility_score), display: 'flex', alignItems: 'center', gap: 4 }}>
              <Target size={12} /> {brief.compatibility_score.toFixed(0)}% match
            </span>
          )}
          {brief.aptitude?.badge_awarded && (
            <span style={{ fontSize: 11, fontWeight: 600, color: '#F59E0B', display: 'flex', alignItems: 'center', gap: 4 }}>
              <Award size={12} /> Aptitude Stand-Out
            </span>
          )}
        </div>
        {brief.skills.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {brief.skills.slice(0, 8).map((s, i) => (
              <span key={i} style={{ fontSize: 11, padding: '2px 8px', background: 'rgba(124,58,237,0.1)', color: '#7C3AED', borderRadius: 0, fontFamily: 'var(--font-mono)' }}>
                {s}
              </span>
            ))}
          </div>
        )}
        {brief.top_projects.length > 0 && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 3 }}>
            {brief.top_projects.slice(0, 3).map((p, i) => (
              <span key={i} style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {p.title}{p.tech_stack.length > 0 ? ` — ${p.tech_stack.slice(0, 4).join(', ')}` : ''}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AssistedInterviewPanel({
  applicationId, session, onUpdate,
}: {
  applicationId: string;
  session: AssistedInterviewSession | undefined;
  onUpdate: (session: AssistedInterviewSession) => void;
}) {
  const [brief, setBrief] = useState<CandidateBrief | null>(null);
  const [briefLoading, setBriefLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [speaker, setSpeaker] = useState<'interviewer' | 'candidate'>('interviewer');
  const [draftText, setDraftText] = useState('');
  const [recording, setRecording] = useState(false);
  const [transcribingChunk, setTranscribingChunk] = useState(false);
  const [sending, setSending] = useState(false);
  const [ending, setEnding] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [coverageSaving, setCoverageSaving] = useState<string | null>(null);
  const [noteText, setNoteText] = useState('');
  const [noteIsEvidence, setNoteIsEvidence] = useState(false);
  const [addingNote, setAddingNote] = useState(false);
  const [tk, setTk] = useState<number | null>(null);
  const [ps, setPs] = useState<number | null>(null);
  const [comm, setComm] = useState<number | null>(null);
  const [pu, setPu] = useState<number | null>(null);
  const [roleNotes, setRoleNotes] = useState('');
  const [decision, setDecision] = useState<'strong_yes' | 'yes' | 'maybe' | 'no' | null>(null);
  const [submittingScorecard, setSubmittingScorecard] = useState(false);
  const [error, setError] = useState('');
  const transcriptRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Mirrors `recording` state but readable synchronously inside the
  // MediaRecorder onstop closure below, which otherwise captures a stale
  // `recording` from whichever render it was created in.
  const isRecordingRef = useRef(false);
  // Bursts overlap in time (see recordBurst below), so more than one
  // MediaRecorder can be capturing at once -- tracked here so stop() can
  // shut all of them down together instead of just the most recent.
  const activeRecordersRef = useRef<MediaRecorder[]>([]);
  // The scheduled "start next burst" / "stop this burst" timeouts, so a
  // manual Stop Mic click can cancel anything still pending rather than
  // leaving a burst to start or stop after recording was already ended.
  const pendingTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    let cancelled = false;
    setBriefLoading(true);
    getAssistedInterviewBrief(applicationId)
      .then(b => { if (!cancelled) setBrief(b); })
      .catch(() => { /* brief is a nice-to-have -- don't block the panel on it */ })
      .finally(() => { if (!cancelled) setBriefLoading(false); });
    return () => { cancelled = true; };
  }, [applicationId]);

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [session?.turns.length]);

  // Once the interviewer ends the session, seed the scorecard form from
  // whatever (if anything) is already on the session -- lets them resume
  // filling it out without losing progress on a re-render.
  useEffect(() => {
    if (session?.status === 'ended') {
      setTk(session.technical_knowledge);
      setPs(session.problem_solving);
      setComm(session.communication);
      setPu(session.project_understanding);
      setRoleNotes(session.role_specific_notes || '');
      setDecision(session.decision);
    }
  }, [session?.status]);

  // Stop the mic if the interviewer navigates away mid-recording.
  useEffect(() => () => {
    isRecordingRef.current = false;
    pendingTimeoutsRef.current.forEach(id => clearTimeout(id));
    pendingTimeoutsRef.current = [];
    activeRecordersRef.current.forEach(r => { if (r.state !== 'inactive') r.stop(); });
    activeRecordersRef.current = [];
    streamRef.current?.getTracks().forEach(t => t.stop());
  }, []);

  const refresh = async (sessionId: string) => {
    const fresh = await getAssistedInterviewSession(sessionId);
    onUpdate(fresh);
  };

  const handleStart = async () => {
    setError('');
    setStarting(true);
    try {
      const { session_id } = await startAssistedInterview(applicationId);
      await refresh(session_id);
    } catch (e: any) {
      setError(e?.message || 'Could not start the assisted interview session.');
    }
    setStarting(false);
  };

  // Records in ~4s bursts using a fresh MediaRecorder each burst (rather
  // than one long-lived recorder with start(timeslice)). With timeslice,
  // only the very first emitted blob is a complete, self-contained WebM
  // file -- every blob after that is a headerless continuation fragment
  // that Whisper can't decode on its own, so transcription silently died
  // after the first ~4 seconds. Stopping/restarting a whole recorder every
  // burst means each blob has its own valid container header.
  const BURST_MS = 6000;
  // Each burst starts this many ms before the previous one stops, so the
  // ~1.5s around every boundary is captured whole by *some* burst instead
  // of being split exactly at the cut. Two independent MediaRecorders on
  // the same stream during that overlap is fine -- each just gets its own
  // copy of the shared audio track.
  const OVERLAP_MS = 1500;

  // Stitches a new burst's transcript onto the running draft. Bursts
  // overlap, so the tail of `prev` and the head of `next` likely describe
  // the same few seconds of audio -- find the longest word-level match
  // (case/punctuation-insensitive) between them and only append whatever
  // comes after it, instead of naively concatenating and duplicating the
  // overlapping words. Falls back to a plain append if no overlap is
  // found (e.g. the interviewer paused, so there's genuinely nothing in
  // common between the two bursts).
  const mergeOverlappingTranscript = (prev: string, next: string): string => {
    if (!prev.trim()) return next;
    const normalize = (w: string) => w.toLowerCase().replace(/[^a-z0-9']/g, '');
    const prevWords = prev.trim().split(/\s+/);
    const nextWords = next.trim().split(/\s+/);
    const maxOverlap = Math.min(10, prevWords.length, nextWords.length);
    // A 2+ word match is trusted outright. A 1-word match is only trusted
    // if that word is long/distinctive enough (>=4 chars) -- this is
    // exactly the common case of a single word getting cut by the burst
    // boundary (e.g. "introduce") -- while still ignoring short filler
    // words ("a", "the", "is") that would otherwise cause a false-positive
    // merge and silently eat real content.
    for (let k = maxOverlap; k >= 1; k--) {
      const prevTail = prevWords.slice(-k).map(normalize).join(' ');
      const nextHead = nextWords.slice(0, k).map(normalize).join(' ');
      if (!prevTail || prevTail !== nextHead) continue;
      if (k === 1 && prevTail.length < 4) continue;
      const remainder = nextWords.slice(k).join(' ');
      return remainder ? `${prev} ${remainder}` : prev;
    }
    return `${prev} ${next}`;
  };

  const recordBurst = () => {
    const stream = streamRef.current;
    if (!stream || !isRecordingRef.current) return;
    const mr = new MediaRecorder(stream);
    mediaRecorderRef.current = mr;
    activeRecordersRef.current.push(mr);
    const chunks: Blob[] = [];
    mr.ondataavailable = (e: BlobEvent) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    mr.onstop = async () => {
      activeRecordersRef.current = activeRecordersRef.current.filter(r => r !== mr);
      const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
      if (blob.size > 0 && session) {
        setTranscribingChunk(true);
        try {
          const text = await transcribeAssistedInterviewAudio(session.id, blob);
          if (text && text.trim()) {
            setDraftText(prev => mergeOverlappingTranscript(prev, text.trim()));
          }
        } catch {
          // Transcription hiccup on one burst -- the interviewer can still
          // type/fix the draft by hand, so stay silent rather than
          // interrupting a live interview with a transient error.
        }
        setTranscribingChunk(false);
      }
    };
    mr.start();
    // Kick off the *next* burst before this one ends (creating the overlap
    // window), rather than chaining from onstop -- onstop no longer drives
    // continuation since two bursts are alive at once.
    const nextId = setTimeout(() => { if (isRecordingRef.current) recordBurst(); }, BURST_MS - OVERLAP_MS);
    const stopId = setTimeout(() => { if (mr.state !== 'inactive') mr.stop(); }, BURST_MS);
    pendingTimeoutsRef.current.push(nextId, stopId);
  };

  const handleStartRecording = async () => {
    if (!session) return;
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      isRecordingRef.current = true;
      setRecording(true);
      recordBurst();
    } catch {
      setError('Could not access the microphone -- check your browser permissions.');
    }
  };

  const handleStopRecording = () => {
    isRecordingRef.current = false;
    pendingTimeoutsRef.current.forEach(id => clearTimeout(id));
    pendingTimeoutsRef.current = [];
    activeRecordersRef.current.forEach(r => { if (r.state !== 'inactive') r.stop(); });
    activeRecordersRef.current = [];
    streamRef.current?.getTracks().forEach(t => t.stop());
    setRecording(false);
  };

  const handleLogTurn = async () => {
    if (!session || !draftText.trim()) return;
    setError('');
    setSending(true);
    try {
      await postAssistedInterviewExchange(session.id, speaker, draftText.trim());
      setDraftText('');
      // Alternate speaker by default after each turn -- an interviewer
      // asks, then logs the candidate's reply, back and forth -- while
      // still letting them override via the toggle for consecutive turns
      // from the same speaker (e.g. a multi-part question).
      setSpeaker(prev => (prev === 'interviewer' ? 'candidate' : 'interviewer'));
      await refresh(session.id);
    } catch (e: any) {
      setError(e?.message || 'Could not record that turn.');
    }
    setSending(false);
  };

  const handleAccept = async (turnId: string, suggestionId: string) => {
    if (!session) return;
    setError('');
    setAcceptingId(suggestionId);
    try {
      await acceptAssistedInterviewSuggestion(session.id, turnId, suggestionId);
      await refresh(session.id);
    } catch (e: any) {
      setError(e?.message || 'Could not record that suggestion as used.');
    }
    setAcceptingId(null);
  };

  const handleEnd = async () => {
    if (!session) return;
    if (!confirm('End this assisted interview session? You can still add notes and fill the scorecard afterward.')) return;
    if (recording) handleStopRecording();
    setError('');
    setEnding(true);
    try {
      const ended = await endAssistedInterview(session.id);
      onUpdate(ended);
    } catch (e: any) {
      setError(e?.message || 'Could not end the session.');
    }
    setEnding(false);
  };

  const toggleCoverage = async (key: string, current: boolean) => {
    if (!session) return;
    setError('');
    setCoverageSaving(key);
    try {
      const updated = await updateAssistedInterviewCoverage(session.id, { [key]: !current });
      onUpdate({ ...session, coverage: updated.reduce((acc, a) => ({ ...acc, [a.key]: a.covered }), {} as Record<string, boolean>) });
    } catch (e: any) {
      setError(e?.message || 'Could not update coverage.');
    }
    setCoverageSaving(null);
  };

  const handleAddNote = async () => {
    if (!session || !noteText.trim()) return;
    setError('');
    setAddingNote(true);
    try {
      const note = await addAssistedInterviewNote(session.id, noteText.trim(), noteIsEvidence);
      onUpdate({ ...session, notes: [...session.notes, note] });
      setNoteText('');
      setNoteIsEvidence(false);
    } catch (e: any) {
      setError(e?.message || 'Could not add that note.');
    }
    setAddingNote(false);
  };

  const handleSubmitScorecard = async () => {
    if (!session) return;
    setError('');
    setSubmittingScorecard(true);
    try {
      const updated = await submitAssistedInterviewScorecard(session.id, {
        technical_knowledge: tk,
        problem_solving: ps,
        communication: comm,
        project_understanding: pu,
        role_specific_notes: roleNotes.trim() || null,
        decision,
      });
      onUpdate(updated);
    } catch (e: any) {
      setError(e?.message || 'Could not submit the scorecard.');
    }
    setSubmittingScorecard(false);
  };

  if (!session) {
    return (
      <div>
        <CandidateBriefStrip brief={brief} loading={briefLoading} />
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12, lineHeight: 1.6 }}>
          Run this candidate's human interview on your usual Google Meet link, and use this workspace
          alongside it for live transcription, private AI-suggested follow-up questions, coverage
          tracking, notes, and the scorecard — the candidate never sees any of this, and the AI never
          scores the interview or makes a pass/fail call.
        </p>
        <button className="btn-primary" onClick={handleStart} disabled={starting} style={{ fontSize: 12, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
          {starting ? 'Starting…' : 'Start Assisted Interview'}
        </button>
        {error && <p style={{ fontSize: 12, color: '#E06060', marginTop: 8 }}>{error}</p>}
      </div>
    );
  }

  const isActive = session.status === 'active';
  const isEnded = session.status === 'ended';

  return (
    <div>
      <CandidateBriefStrip brief={brief} loading={briefLoading} />

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <span style={{
          fontSize: 11, fontWeight: 700, textTransform: 'uppercase', fontFamily: 'var(--font-mono)',
          color: isActive ? '#7C3AED' : 'var(--text-muted)',
        }}>
          {isActive ? 'Session live — running alongside your Google Meet call' : 'Session ended'}
        </span>
        {isActive && (
          <button
            className="btn-secondary"
            onClick={handleEnd}
            disabled={ending}
            style={{ fontSize: 12, color: '#E06060', borderColor: '#E06060', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Square size={12} /> {ending ? 'Ending…' : 'End Interview'}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* Left: live transcript + mic-captured turn composer + AI follow-ups */}
        <div style={{ flex: '1 1 380px', minWidth: 320 }}>
          <div
            ref={transcriptRef}
            style={{
              maxHeight: 340, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10,
              padding: session.turns.length > 0 ? '12px 14px' : 0,
              background: session.turns.length > 0 ? 'var(--bg-elevated)' : 'transparent',
              border: session.turns.length > 0 ? '1px solid var(--glass-border)' : 'none',
              borderRadius: 'var(--radius-md)', marginBottom: 14,
            }}
          >
            {session.turns.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                No turns logged yet — record and log each turn as the interview happens below.
              </p>
            ) : (
              session.turns.map(turn => (
                <div key={turn.id}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 2 }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, textTransform: 'uppercase', fontFamily: 'var(--font-mono)',
                      color: turn.speaker === 'interviewer' ? '#2B7FD4' : '#4AAA82',
                    }}>
                      {turn.speaker}
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.5 }}>{turn.text}</p>

                  {turn.ai_suggestions.length > 0 && (
                    <div style={{ marginTop: 6, paddingLeft: 12, borderLeft: '2px solid rgba(124,58,237,0.3)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', fontFamily: 'var(--font-mono)', color: '#7C3AED' }}>
                        <Sparkles size={11} /> Suggested follow-ups
                      </span>
                      {turn.ai_suggestions.map(s => {
                        const accepted = turn.accepted_suggestion_id === s.id;
                        return (
                          <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 12, color: accepted ? 'var(--text-muted)' : 'var(--text-secondary)', flex: 1 }}>
                              {s.question}
                            </span>
                            {isActive && (
                              accepted ? (
                                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#4AAA82', flexShrink: 0 }}>
                                  <CheckCircle2 size={12} /> Asked
                                </span>
                              ) : (
                                <button
                                  onClick={() => handleAccept(turn.id, s.id)}
                                  disabled={acceptingId === s.id}
                                  className="btn-secondary"
                                  style={{ fontSize: 11, padding: '3px 10px', flexShrink: 0 }}
                                >
                                  {acceptingId === s.id ? '…' : 'Use this'}
                                </button>
                              )
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>

          {isActive && (
            <div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setSpeaker('interviewer')}
                  className={speaker === 'interviewer' ? 'btn-primary' : 'btn-secondary'}
                  style={{ fontSize: 11, padding: '5px 12px' }}
                >
                  Interviewer
                </button>
                <button
                  onClick={() => setSpeaker('candidate')}
                  className={speaker === 'candidate' ? 'btn-primary' : 'btn-secondary'}
                  style={{ fontSize: 11, padding: '5px 12px' }}
                >
                  Candidate
                </button>
                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  is speaking now
                </span>
                <div style={{ flex: 1 }} />
                {!recording ? (
                  <button
                    onClick={handleStartRecording}
                    className="btn-primary"
                    style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <Mic size={13} /> Start Mic
                  </button>
                ) : (
                  <button
                    onClick={handleStopRecording}
                    className="btn-secondary"
                    style={{ fontSize: 12, color: '#E06060', borderColor: '#E06060', display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <MicOff size={13} /> Stop Mic
                  </button>
                )}
              </div>

              {recording && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, fontSize: 11, color: '#7C3AED', fontFamily: 'var(--font-mono)' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#E06060', display: 'inline-block' }} />
                  Listening{transcribingChunk ? ' — transcribing…' : '…'}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <textarea
                  value={draftText}
                  onChange={e => setDraftText(e.target.value)}
                  placeholder={recording ? "Live transcript will appear here as it's captured — edit freely if it needs a fix…" : 'Start the mic to transcribe, or type/edit the turn here…'}
                  rows={3}
                  className="input-field"
                  style={{ flex: 1, resize: 'none', fontSize: 13 }}
                />
                <button
                  className="btn-primary"
                  onClick={handleLogTurn}
                  disabled={sending || !draftText.trim()}
                  style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
                >
                  <Send size={14} /> {sending ? 'Logging…' : 'Log Turn'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Right: coverage checklist, private notes/evidence, human scorecard */}
        <div style={{ flex: '1 1 280px', minWidth: 260, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <ClipboardCheck size={14} color="#2B7FD4" />
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                Coverage
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {COVERAGE_AREAS.map(area => {
                const covered = !!session.coverage?.[area.key];
                return (
                  <label
                    key={area.key}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', color: covered ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                  >
                    <input
                      type="checkbox"
                      checked={covered}
                      onChange={() => toggleCoverage(area.key, covered)}
                      disabled={coverageSaving === area.key}
                    />
                    {area.label}
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <StickyNote size={14} color="#F59E0B" />
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                Private Notes &amp; Evidence
              </span>
            </div>
            {session.notes.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
                {session.notes.map(n => (
                  <div key={n.id} style={{ padding: '8px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)' }}>
                    <p style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.5 }}>{n.text}</p>
                    {n.is_evidence && (
                      <span style={{ fontSize: 10, color: '#F59E0B', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>Flagged as evidence</span>
                    )}
                  </div>
                ))}
              </div>
            )}
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder="Add a private note or evidence marker…"
              rows={2}
              className="input-field"
              style={{ width: '100%', resize: 'none', fontSize: 13, marginBottom: 6 }}
            />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}>
                <input type="checkbox" checked={noteIsEvidence} onChange={e => setNoteIsEvidence(e.target.checked)} />
                Flag as evidence
              </label>
              <button
                className="btn-secondary"
                onClick={handleAddNote}
                disabled={addingNote || !noteText.trim()}
                style={{ fontSize: 12 }}
              >
                {addingNote ? 'Adding…' : 'Add Note'}
              </button>
            </div>
          </div>

          {isEnded && (
            <div style={{ borderTop: '1px dashed var(--glass-border)', paddingTop: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <Star size={14} color="#7C3AED" />
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
                  Human Scorecard
                </span>
              </div>
              {session.scorecard_submitted_at ? (
                <p style={{ fontSize: 12, color: '#4AAA82', marginBottom: 10 }}>
                  Submitted {new Date(session.scorecard_submitted_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              ) : (
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 10, lineHeight: 1.6 }}>
                  Fill this out yourself from what you heard — the AI never fills any of this in.
                </p>
              )}
              <RatingRow label="Technical Knowledge" value={tk} onChange={setTk} />
              <RatingRow label="Problem Solving" value={ps} onChange={setPs} />
              <RatingRow label="Communication" value={comm} onChange={setComm} />
              <RatingRow label="Project Understanding" value={pu} onChange={setPu} />
              <textarea
                value={roleNotes}
                onChange={e => setRoleNotes(e.target.value)}
                placeholder="Role-specific criteria / notes…"
                rows={2}
                className="input-field"
                style={{ width: '100%', resize: 'none', fontSize: 13, marginTop: 6, marginBottom: 10 }}
              />
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                {DECISION_OPTIONS.map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setDecision(opt.key)}
                    style={{
                      fontSize: 11, padding: '5px 12px', borderRadius: 0, cursor: 'pointer',
                      fontFamily: 'var(--font-mono)', textTransform: 'uppercase',
                      background: decision === opt.key ? opt.color : 'transparent',
                      color: decision === opt.key ? '#0A0A0F' : opt.color,
                      border: `1px solid ${opt.color}`,
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <button
                className="btn-primary"
                onClick={handleSubmitScorecard}
                disabled={submittingScorecard}
                style={{ fontSize: 12, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}
              >
                {submittingScorecard ? 'Submitting…' : session.scorecard_submitted_at ? 'Update Scorecard' : 'Submit Scorecard'}
              </button>
            </div>
          )}
        </div>
      </div>

      {error && <p style={{ fontSize: 12, color: '#E06060', marginTop: 12 }}>{error}</p>}
    </div>
  );
}

function RatingRow({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
      <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</span>
      <div style={{ display: 'flex', gap: 4 }}>
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            onClick={() => onChange(n)}
            style={{
              width: 24, height: 24, fontSize: 11, borderRadius: '50%', cursor: 'pointer',
              border: '1px solid var(--glass-border)',
              background: value !== null && value >= n ? '#7C3AED' : 'transparent',
              color: value !== null && value >= n ? '#fff' : 'var(--text-muted)',
            }}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

// Smart Scheduling (5.5): org proposes up to 10 candidate slots for this
// application, the student picks one on their side, and we surface
// whatever the row's current status is here. Slot conflict-checking against
// the org's own Google freebusy, event creation, and Meet-link generation
// all happen server-side in app/services/scheduling/routes.py -- this panel
// is only the propose/cancel UI.
function SchedulingPanel({
  applicationId, calendarConnected, scheduled, onUpdate,
}: {
  applicationId: string;
  calendarConnected: boolean | null;
  scheduled: ScheduledInterview | undefined;
  onUpdate: (row: ScheduledInterview) => void;
}) {
  const [slotInputs, setSlotInputs] = useState<{ date: string; time: string }[]>([{ date: '', time: '' }]);
  const [duration, setDuration] = useState(30);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState('');

  if (calendarConnected === null) {
    return <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Checking calendar connection…</p>;
  }
  if (!calendarConnected) {
    return (
      <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        Connect your Google Calendar under{' '}
        <a href="/company/integrations" style={{ color: 'var(--accent-cyan)' }}>Integrations</a>{' '}
        to propose real interview slots for this candidate.
      </p>
    );
  }

  const addSlot = () => setSlotInputs(prev => [...prev, { date: '', time: '' }]);
  const removeSlot = (i: number) => setSlotInputs(prev => prev.filter((_, idx) => idx !== i));
  const updateSlot = (i: number, field: 'date' | 'time', value: string) =>
    setSlotInputs(prev => prev.map((s, idx) => (idx === i ? { ...s, [field]: value } : s)));

  const handlePropose = async () => {
    setError('');
    const valid = slotInputs.filter(s => s.date && s.time);
    if (valid.length === 0) { setError('Add at least one date and time.'); return; }
    setSubmitting(true);
    try {
      const slots = valid.map(s => {
        const start = new Date(`${s.date}T${s.time}`);
        const end = new Date(start.getTime() + duration * 60000);
        return { start: start.toISOString(), end: end.toISOString() };
      });
      const row = await proposeInterviewSlots(applicationId, slots, duration);
      onUpdate(row);
    } catch (e: any) {
      setError(e?.message || 'Could not propose slots -- check they don\'t conflict with your calendar.');
    }
    setSubmitting(false);
  };

  const handleCancel = async () => {
    if (!scheduled) return;
    if (!confirm('Cancel this scheduled interview?')) return;
    setCancelling(true);
    try {
      const row = await cancelScheduledInterview(scheduled.id);
      onUpdate(row);
    } catch (e: any) {
      setError(e?.message || 'Could not cancel.');
    }
    setCancelling(false);
  };

  if (scheduled?.status === 'confirmed') {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 12, fontWeight: 700, color: '#4AAA82', textTransform: 'uppercase', fontFamily: 'var(--font-mono)' }}>
          <CalendarCheck2 size={14} /> Confirmed
        </div>
        {scheduled.selected_slot && (
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
            {new Date(scheduled.selected_slot.start).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        )}
        {scheduled.meet_link && (
          <a href={scheduled.meet_link} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--accent-cyan)', display: 'block', marginBottom: 10 }}>
            Join Google Meet →
          </a>
        )}
        <button className="btn-secondary" onClick={handleCancel} disabled={cancelling} style={{ fontSize: 12, color: '#E06060', borderColor: '#E06060' }}>
          <Ban size={12} style={{ marginRight: 6, verticalAlign: 'middle' }} />
          {cancelling ? 'Cancelling…' : 'Cancel Interview'}
        </button>
        {error && <p style={{ fontSize: 12, color: '#E06060', marginTop: 8 }}>{error}</p>}
      </div>
    );
  }

  if (scheduled?.status === 'proposed') {
    return (
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: '#2B7FD4', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginBottom: 8 }}>
          Awaiting candidate's pick
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
          {scheduled.proposed_slots.map((s, i) => (
            <span key={i} style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {new Date(s.start).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
            </span>
          ))}
        </div>
        <button className="btn-secondary" onClick={handleCancel} disabled={cancelling} style={{ fontSize: 12, color: '#E06060', borderColor: '#E06060' }}>
          {cancelling ? 'Withdrawing…' : 'Withdraw Proposal'}
        </button>
        {error && <p style={{ fontSize: 12, color: '#E06060', marginTop: 8 }}>{error}</p>}
      </div>
    );
  }

  // status is undefined (never proposed) or 'cancelled' -- either way, show the propose form.
  return (
    <div>
      {scheduled?.status === 'cancelled' && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>Previous interview was cancelled — propose new times below.</p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
        {slotInputs.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input type="date" value={s.date} onChange={e => updateSlot(i, 'date', e.target.value)} className="input-field" style={{ maxWidth: 160 }} />
            <input type="time" value={s.time} onChange={e => updateSlot(i, 'time', e.target.value)} className="input-field" style={{ maxWidth: 120 }} />
            {slotInputs.length > 1 && (
              <button onClick={() => removeSlot(i)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }}>✕</button>
            )}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
        {slotInputs.length < 10 && (
          <button className="btn-secondary" onClick={addSlot} style={{ fontSize: 12 }}>+ Add another time</button>
        )}
        <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
          Duration
          <select value={duration} onChange={e => setDuration(Number(e.target.value))} className="select-field" style={{ padding: '4px 8px', fontSize: 12 }}>
            <option value={15}>15 min</option>
            <option value={30}>30 min</option>
            <option value={45}>45 min</option>
            <option value={60}>60 min</option>
          </select>
        </label>
      </div>
      <button className="btn-primary" onClick={handlePropose} disabled={submitting} style={{ fontSize: 12, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
        {submitting ? 'Proposing…' : 'Propose Slots'}
      </button>
      {error && <p style={{ fontSize: 12, color: '#E06060', marginTop: 8 }}>{error}</p>}
    </div>
  );
}

function MiniStat({ label, value, color, icon }: { label: string; value: string; color?: string; icon?: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em', marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: color || 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 4 }}>
        {icon}{value}
      </div>
    </div>
  );
}
