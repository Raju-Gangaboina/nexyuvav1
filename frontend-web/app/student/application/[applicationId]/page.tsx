'use client';
import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, CheckCircle2, Circle, Loader2, ShieldCheck, Brain, Award,
  XCircle, AlertTriangle, Building2, MapPin, Briefcase, Lock, CalendarClock, Video,
} from 'lucide-react';
import {
  getMyRealApplications, getInternshipDetailReal, getInterviewResult,
  getAtsAnalysisReal, withdrawRealApplication,
  getMyScheduledInterviews, selectInterviewSlot,
  InternshipDetail, ATSAnalysisResult, ScheduledInterview,
} from '@/lib/realApi';

/**
 * Post-Apply journey page — the process that used to be a row of separate
 * buttons (ATS Check / Aptitude Check / Interview) scattered on the browse
 * card now lives here as one guided, ordered flow once a student has
 * actually applied. XAI and the ATS pre-check stay on the browse card
 * (they're decision aids for BEFORE applying); everything that happens
 * AFTER applying — resume match detail, Aptitude Check, Interview/Badge,
 * and current status — is a step here instead.
 *
 * Deliberately reuses the exact same endpoints the old browse-card buttons
 * called (getInterviewResult, getAtsAnalysisReal, startAptitudeCheck via
 * the existing /student/aptitude/[internshipId] page) rather than adding
 * new backend routes -- this is a UI regrouping, not a new pipeline.
 */

type InterviewStepStatus = 'none' | 'in_progress' | 'passed' | 'failed';

const STATUS_LABEL: Record<string, string> = {
  APPLIED: 'Applied — awaiting review',
  SHORTLISTED: 'Shortlisted by the company',
  INTERVIEWED: 'Interview completed',
  HIRED: 'Hired',
  REJECTED: 'Not selected this time',
  COMPLETED: 'Internship completed',
  WITHDRAWN: 'Withdrawn',
};

function StepRow({
  index, title, state, children,
}: {
  index: number;
  title: string;
  state: 'done' | 'current' | 'locked';
  children?: React.ReactNode;
}) {
  const circleColor =
    state === 'done' ? 'var(--accent-emerald)' : state === 'current' ? 'var(--accent-cyan)' : 'var(--text-muted)';
  return (
    <div style={{ display: 'flex', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
        <div
          style={{
            width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: `2px solid ${circleColor}`, color: circleColor, background: 'var(--bg-card)', flexShrink: 0,
          }}
        >
          {state === 'done' ? <CheckCircle2 size={16} /> : state === 'locked' ? <Lock size={13} /> : <span style={{ fontWeight: 700, fontSize: 13 }}>{index}</span>}
        </div>
        <div style={{ width: 2, flex: 1, background: 'var(--glass-border)', marginTop: 4, marginBottom: 4, minHeight: 24 }} />
      </div>
      <div style={{ flex: 1, paddingBottom: 28, opacity: state === 'locked' ? 0.5 : 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 0.5, color: state === 'current' ? 'var(--accent-cyan)' : 'var(--text-primary)' }}>
          {title}
        </div>
        {children}
      </div>
    </div>
  );
}

export default function ApplicationJourneyPage() {
  const params = useParams();
  const router = useRouter();
  const applicationId = params.applicationId as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [application, setApplication] = useState<any | null>(null);
  const [internship, setInternship] = useState<InternshipDetail | null>(null);
  const [interviewStatus, setInterviewStatus] = useState<InterviewStepStatus>('none');

  const [atsResult, setAtsResult] = useState<ATSAnalysisResult | null>(null);
  const [atsLoading, setAtsLoading] = useState(false);
  const [atsError, setAtsError] = useState('');
  const [atsChecked, setAtsChecked] = useState(false);

  const [withdrawing, setWithdrawing] = useState(false);

  // Smart Scheduling (5.5): a human-interview slot the org proposed for
  // THIS application, if any -- separate from the AI interview above.
  const [scheduledInterview, setScheduledInterview] = useState<ScheduledInterview | null>(null);
  const [selectingSlot, setSelectingSlot] = useState<number | null>(null);
  const [schedulingError, setSchedulingError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const apps = await getMyRealApplications();
        const app = apps.find(a => a.id === applicationId);
        if (!app) {
          setError('Application not found.');
          setLoading(false);
          return;
        }
        setApplication(app);

        try {
          const detail = await getInternshipDetailReal(app.internship_id);
          setInternship(detail);
        } catch {
          // Non-fatal: page still works without these details
          // (aptitude_check_enabled falls back to hidden, not broken).
        }

        try {
          const result = await getInterviewResult(applicationId);
          if (result.status === 'completed') setInterviewStatus(result.passed ? 'passed' : 'failed');
          else setInterviewStatus('in_progress');
        } catch {
          // 404 -- no interview attempt yet, matches the 'none' default.
        }

        try {
          const scheduled = await getMyScheduledInterviews();
          setScheduledInterview(scheduled.find(s => s.application_id === applicationId) || null);
        } catch {
          // Non-fatal: this step just doesn't render if it fails to load.
        }
      } catch (e: any) {
        setError(e.message || 'Could not load this application.');
      }
      setLoading(false);
    };
    load();
  }, [applicationId]);

  const handleSelectSlot = async (index: number) => {
    if (!scheduledInterview) return;
    setSelectingSlot(index);
    setSchedulingError('');
    try {
      const row = await selectInterviewSlot(scheduledInterview.id, index);
      setScheduledInterview(row);
    } catch (e: any) {
      setSchedulingError(e?.message || 'Could not confirm that slot -- it may already be taken, try another.');
    }
    setSelectingSlot(null);
  };

  const runAtsCheck = async () => {
    if (!application) return;
    setAtsLoading(true);
    setAtsError('');
    try {
      const result = await getAtsAnalysisReal(application.internship_id, true);
      setAtsResult(result);
      setAtsChecked(true);
    } catch (e: any) {
      setAtsError(e.message || 'Could not run the ATS check.');
    }
    setAtsLoading(false);
  };

  const handleWithdraw = async () => {
    if (!confirm('Withdraw this application? This cannot be undone.')) return;
    setWithdrawing(true);
    try {
      await withdrawRealApplication(applicationId);
      router.push('/student/live-internships');
    } catch (e: any) {
      alert(e.message || 'Could not withdraw.');
    }
    setWithdrawing(false);
  };

  if (loading) {
    return (
      <div style={{ padding: 40, display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)' }}>
        <Loader2 size={18} className="animate-spin" /> Loading your application…
      </div>
    );
  }

  if (error || !application) {
    return (
      <div style={{ padding: 40 }}>
        <div className="glass-card" style={{ padding: 24, color: 'var(--accent-rose)' }}>{error || 'Application not found.'}</div>
        <button className="btn-secondary" style={{ marginTop: 16 }} onClick={() => router.push('/student/live-internships')}>
          <ArrowLeft size={14} style={{ marginRight: 6 }} /> Back to Internships
        </button>
      </div>
    );
  }

  const aptitudeEnabled = internship?.aptitude_check_enabled ?? false;
  const withdrawn = application.status === 'WITHDRAWN';

  return (
    <div style={{ padding: '32px 40px', maxWidth: 720, margin: '0 auto' }}>
      <button className="btn-secondary" onClick={() => router.push('/student/live-internships')} style={{ marginBottom: 20, fontSize: 12 }}>
        <ArrowLeft size={13} style={{ marginRight: 6 }} /> Back to Internships
      </button>

      <div className="glass-card" style={{ padding: '20px 24px', marginBottom: 28 }}>
        <div style={{ fontSize: 19, fontWeight: 700, marginBottom: 4 }}>{application.internship_title}</div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Building2 size={13} /> {application.organization_name}
        </div>
      </div>

      <div className="glass-card" style={{ padding: '28px 28px 4px 28px' }}>
        {/* Step 1: Applied */}
        <StepRow index={1} title="Applied" state="done">
          <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Your profile was submitted for this internship on {new Date(application.applied_at).toLocaleDateString()}.
          </div>
        </StepRow>

        {/* Step 2: ATS Resume Match */}
        <StepRow index={2} title="Resume Match Check" state={withdrawn ? 'locked' : 'current'}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
            See how well your resume lines up with this role's requirements, with AI-reviewed notes on gaps and genuine mistakes.
          </div>
          {!atsChecked ? (
            <button className="btn-secondary" onClick={runAtsCheck} disabled={atsLoading || withdrawn} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              {atsLoading ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
              {atsLoading ? 'Checking…' : 'Run Resume Match Check'}
            </button>
          ) : atsResult ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                className="badge"
                style={{
                  fontSize: 12, padding: '4px 10px',
                  borderColor: atsResult.overall_score >= 80 ? 'var(--accent-emerald)' : atsResult.overall_score >= 55 ? 'var(--accent-amber)' : 'var(--accent-rose)',
                  color: atsResult.overall_score >= 80 ? 'var(--accent-emerald)' : atsResult.overall_score >= 55 ? 'var(--accent-amber)' : 'var(--accent-rose)',
                }}
              >
                ATS Match: {atsResult.overall_score}%
              </span>
              <button className="btn-secondary" onClick={runAtsCheck} style={{ fontSize: 11 }}>Re-check</button>
            </div>
          ) : null}
          {atsError && <div style={{ fontSize: 12, color: 'var(--accent-rose)', marginTop: 8 }}>{atsError}</div>}
        </StepRow>

        {/* Step 3: Aptitude Check (only if this internship has it enabled) */}
        {aptitudeEnabled && (
          <StepRow index={3} title="Aptitude Check" state={withdrawn ? 'locked' : 'current'}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
              A short, freshly-generated reasoning quiz for this internship. Passing earns the Stand-Out badge companies see on your application.
            </div>
            <button
              className="btn-secondary"
              disabled={withdrawn}
              onClick={() => router.push(`/student/aptitude/${application.internship_id}`)}
              style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <Brain size={13} /> Take Aptitude Check
            </button>
          </StepRow>
        )}

        {/* Step 4: Interview / Stand-Out Badge */}
        <StepRow index={aptitudeEnabled ? 4 : 3} title="Interview" state={withdrawn ? 'locked' : 'current'}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
            A short proctored interview. Passing earns your Stand-Out badge and moves you forward in the company's pipeline.
          </div>
          {interviewStatus === 'passed' ? (
            <button className="btn-secondary" onClick={() => router.push(`/student/interview/${applicationId}`)} style={{ borderColor: 'var(--accent-emerald)', color: 'var(--accent-emerald)', fontSize: 12 }}>
              <Award size={13} style={{ marginRight: 6 }} /> Badge Earned — View Result
            </button>
          ) : interviewStatus === 'failed' ? (
            <button className="btn-secondary" onClick={() => router.push(`/student/interview/${applicationId}`)} style={{ borderColor: 'var(--accent-rose)', color: 'var(--accent-rose)', fontSize: 12 }}>
              <XCircle size={13} style={{ marginRight: 6 }} /> View Result
            </button>
          ) : interviewStatus === 'in_progress' ? (
            <button className="btn-secondary" disabled={withdrawn} onClick={() => router.push(`/student/interview/${applicationId}`)} style={{ fontSize: 12 }}>
              <AlertTriangle size={13} style={{ marginRight: 6 }} /> Continue Interview
            </button>
          ) : (
            <button className="btn-secondary" disabled={withdrawn} onClick={() => router.push(`/student/interview/${applicationId}`)} style={{ fontSize: 12 }}>
              Start Interview
            </button>
          )}
        </StepRow>

        {/* Step 4b: Human Interview Scheduling -- only appears once the company has
            actually proposed real-world time slots for this application. */}
        {scheduledInterview && (
          <StepRow index={aptitudeEnabled ? 5 : 4} title="Schedule Your Interview" state={withdrawn ? 'locked' : 'current'}>
            {scheduledInterview.status === 'confirmed' ? (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, fontSize: 13, color: 'var(--accent-emerald)', fontWeight: 600 }}>
                  <CheckCircle2 size={15} /> Confirmed
                </div>
                {scheduledInterview.selected_slot && (
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                    {new Date(scheduledInterview.selected_slot.start).toLocaleString([], { dateStyle: 'full', timeStyle: 'short' })}
                  </div>
                )}
                {scheduledInterview.meet_link && (
                  <a href={scheduledInterview.meet_link} target="_blank" rel="noopener noreferrer" className="btn-secondary" style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
                    <Video size={13} /> Join Google Meet
                  </a>
                )}
              </div>
            ) : scheduledInterview.status === 'proposed' ? (
              <div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
                  {application.organization_name} proposed these times for a human interview. Pick the one that works for you
                  — a Google Meet link will be created automatically once you do.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {scheduledInterview.proposed_slots.map((slot, i) => (
                    <button
                      key={i}
                      className="btn-secondary"
                      disabled={withdrawn || selectingSlot !== null}
                      onClick={() => handleSelectSlot(i)}
                      style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-start' }}
                    >
                      <CalendarClock size={13} />
                      {selectingSlot === i ? 'Confirming…' : new Date(slot.start).toLocaleString([], { dateStyle: 'full', timeStyle: 'short' })}
                    </button>
                  ))}
                </div>
                {schedulingError && <div style={{ fontSize: 12, color: 'var(--accent-rose)', marginTop: 8 }}>{schedulingError}</div>}
              </div>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                This interview slot was cancelled. {application.organization_name} may propose new times.
              </div>
            )}
          </StepRow>
        )}

        {/* Step 5: Status */}
        <StepRow index={aptitudeEnabled ? (scheduledInterview ? 6 : 5) : (scheduledInterview ? 5 : 4)} title="Application Status" state={withdrawn ? 'locked' : 'current'}>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: withdrawn ? 0 : 10 }}>
            {STATUS_LABEL[application.status] || application.status}
          </div>
          {!withdrawn && (application.status === 'APPLIED' || application.status === 'SHORTLISTED') && (
            <button className="btn-secondary" onClick={handleWithdraw} disabled={withdrawing} style={{ fontSize: 12, color: 'var(--accent-rose)', borderColor: 'var(--accent-rose)' }}>
              {withdrawing ? <Loader2 size={13} className="animate-spin" /> : 'Withdraw Application'}
            </button>
          )}
        </StepRow>
      </div>
    </div>
  );
}
