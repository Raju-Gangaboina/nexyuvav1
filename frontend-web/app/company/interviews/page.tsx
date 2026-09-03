'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  Video, ChevronDown, ShieldAlert, CheckCircle2, XCircle, Award, Loader2, AlertTriangle, BrainCircuit,
  CalendarClock, CalendarCheck2, Ban,
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
