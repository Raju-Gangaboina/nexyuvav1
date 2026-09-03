'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeftRight, BarChart3, CheckCircle2, Clock, Copy, FileText, HelpCircle, LayoutGrid, Maximize2, Rocket, ShieldCheck, Timer, XCircle } from 'lucide-react';
import {
  startAptitudeCheck, submitAptitudeCheck, reportAptitudeIntegrityFlag,
  StartAptitudeResponse, SubmitAptitudeResponse,
} from '@/lib/realApi';

/**
 * Student-side Aptitude Check flow — design doc §3.3/§3.6: single overall
 * timer for the whole test (no per-question countdown; students can move
 * freely between questions and change answers), fullscreen enforcement,
 * tab-blur and copy/paste detection reported as integrity flags, all
 * answers submitted together at the end. Distinct from the Interview
 * flow: no webcam here.
 */
export default function AptitudeCheckPage() {
  const params = useParams();
  const router = useRouter();
  const internshipId = params.internshipId as string;

  const [phase, setPhase] = useState<'loading' | 'intro' | 'in_progress' | 'submitting' | 'result' | 'error'>('loading');
  const [attempt, setAttempt] = useState<StartAptitudeResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [overallSecondsLeft, setOverallSecondsLeft] = useState(0);
  const [result, setResult] = useState<SubmitAptitudeResponse | null>(null);
  const [warning, setWarning] = useState<{ text: string; repeat: boolean } | null>(null);
  const [activityLog, setActivityLog] = useState<Record<string, number>>({});
  const [showReview, setShowReview] = useState(false);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const overallTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const warningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flagCountsRef = useRef<Record<string, number>>({});
  const lastFlagAtRef = useRef<Record<string, number>>({});
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const attemptRef = useRef(attempt);
  attemptRef.current = attempt;

  // Every occurrence pops the banner — the 1st time is a free warning (no
  // backend report, no penalty); the 2nd time onward is reported and
  // actually costs points, and the popup says so explicitly each time.
  const flag = useCallback((flagType: string) => {
    // Debounce: some browsers fire both 'keydown' (Ctrl/Cmd+C) and 'copy'
    // for the same physical attempt — don't double-count within 400ms.
    const now = Date.now();
    if (now - (lastFlagAtRef.current[flagType] || 0) < 400) return;
    lastFlagAtRef.current[flagType] = now;

    const count = (flagCountsRef.current[flagType] || 0) + 1;
    flagCountsRef.current[flagType] = count;

    if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
    if (count === 1) {
      setWarning({ text: WARNING_MESSAGES[flagType] || "That's not allowed during the test. Doing it again will cost integrity points.", repeat: false });
    } else {
      if (attemptRef.current) {
        reportAptitudeIntegrityFlag(attemptRef.current.attempt_id, flagType).catch(() => {});
      }
      setWarning({ text: REPEAT_WARNING_MESSAGES[flagType] || 'Flagged again — points deducted.', repeat: true });
    }
    warningTimeoutRef.current = setTimeout(() => setWarning(null), 4500);
  }, []);

  const finish = useCallback(async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (overallTimerRef.current) clearInterval(overallTimerRef.current);
    if (!attemptRef.current) return;
    // Snapshot every flag occurrence that happened this attempt (including
    // free 1st-time warnings the backend never saw) so the result screen
    // can show a complete activity breakdown, not just what got penalized.
    setActivityLog({ ...flagCountsRef.current });
    setPhase('submitting');
    try {
      const payload = Object.entries(answersRef.current).map(([question_id, selected_index]) => ({ question_id, selected_index }));
      const res = await submitAptitudeCheck(attemptRef.current.attempt_id, payload);
      setResult(res);
      setPhase('result');
    } catch (e: any) {
      setErrorMsg(e.message || 'Could not submit your Aptitude Check.');
      setPhase('error');
    }
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }, []);

  const goToNext = useCallback(() => {
    setCurrentIndex(prev => {
      const a = attemptRef.current;
      if (!a) return prev;
      return Math.min(prev + 1, a.questions.length - 1);
    });
  }, []);

  const goToPrevious = useCallback(() => {
    setCurrentIndex(prev => Math.max(prev - 1, 0));
  }, []);

  // Single whole-test timer (12 min) — students can move freely between
  // questions with Previous/Next and change answers anytime; the only hard
  // stop is this overall countdown, which auto-submits on expiry.
  useEffect(() => {
    if (phase !== 'in_progress' || !attempt) return;
    setOverallSecondsLeft(attempt.overall_attempt_seconds);
    overallTimerRef.current = setInterval(() => {
      setOverallSecondsLeft(s => {
        if (s <= 1) {
          if (overallTimerRef.current) clearInterval(overallTimerRef.current);
          finish();
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => { if (overallTimerRef.current) clearInterval(overallTimerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, attempt]);

  // Anti-cheat: tab-blur, copy/paste, fullscreen-exit — browser-integrity
  // only per design doc §3.6, no webcam.
  useEffect(() => {
    if (phase !== 'in_progress') return;

    const onVisibility = () => { if (document.hidden) flag('tab_blur'); };
    const onCopyPaste = (e: Event) => { e.preventDefault(); flag('copy_paste_attempt'); };
    const onContextMenu = (e: Event) => { e.preventDefault(); flag('copy_paste_attempt'); };
    const onFullscreenChange = () => { if (!document.fullscreenElement) flag('fullscreen_exit'); };
    const onSelectStart = (e: Event) => { e.preventDefault(); flag('copy_paste_attempt'); };
    // Backstop for the case where nothing is selected, so the browser
    // never fires a 'copy' event at all (user-select: none means there's
    // usually nothing to select in the first place) — still catch the
    // Ctrl/Cmd+C attempt itself via the keystroke.
    const onKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && (key === 'c' || key === 'x' || key === 'v')) {
        e.preventDefault();
        flag('copy_paste_attempt');
      }
    };

    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('copy', onCopyPaste);
    document.addEventListener('paste', onCopyPaste);
    document.addEventListener('contextmenu', onContextMenu);
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('selectstart', onSelectStart);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('copy', onCopyPaste);
      document.removeEventListener('paste', onCopyPaste);
      document.removeEventListener('contextmenu', onContextMenu);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('selectstart', onSelectStart);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [phase, flag]);

  const loadAttempt = async () => {
    setPhase('loading');
    setErrorMsg('');
    try {
      const res = await startAptitudeCheck(internshipId);
      setAttempt(res);
      setPhase('intro');
    } catch (e: any) {
      setErrorMsg(e.message || 'Could not start the Aptitude Check for this role.');
      setPhase('error');
    }
  };

  useEffect(() => { loadAttempt(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [internshipId]);

  const beginTest = () => {
    document.documentElement.requestFullscreen?.().catch(() => {});
    flagCountsRef.current = {};
    lastFlagAtRef.current = {};
    setActivityLog({});
    setWarning(null);
    setCurrentIndex(0);
    setAnswers({});
    setPhase('in_progress');
  };

  const selectAnswer = (questionId: string, selectedIndex: number) => {
    setAnswers(prev => ({ ...prev, [questionId]: selectedIndex }));
  };

  if (phase === 'loading') {
    return <CenteredCard><p style={{ color: 'var(--text-secondary)' }}>Preparing your Aptitude Check...</p></CenteredCard>;
  }

  if (phase === 'error') {
    return (
      <CenteredCard>
        <AlertTriangle size={32} color="var(--accent-rose)" style={{ marginBottom: 12 }} />
        <p style={{ color: 'var(--text-secondary)', marginBottom: 16 }}>{errorMsg}</p>
        <button className="btn-primary" onClick={loadAttempt}>Try Again</button>
      </CenteredCard>
    );
  }

  if (phase === 'intro' && attempt) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400, padding: '20px 0' }}>
        <div className="glass-card" style={{ padding: 32, maxWidth: 560, width: '100%' }}>
          <ShieldCheck size={30} color="var(--accent-cyan)" style={{ marginBottom: 10 }} />
          <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8, fontFamily: 'var(--font-serif)' }}>Aptitude Check</h2>
          <p style={{ color: 'var(--text-secondary)', marginBottom: 18, fontSize: 13, lineHeight: 1.6 }}>
            A quick {attempt.questions.length}-question test to assess your problem-solving and logical reasoning. You get {Math.round(attempt.overall_attempt_seconds / 60)} minutes total — move between questions freely and change answers anytime until you submit or time runs out.
            {' '}This is optional and <strong style={{ color: 'var(--accent-cyan)' }}>never affects your ability to apply</strong>.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
            <StatPill icon={<ShieldCheck size={16} color="var(--accent-cyan)" />} value={String(attempt.questions.length)} label="Questions" />
            <StatPill icon={<Timer size={16} color="#a78bfa" />} value={`${Math.round(attempt.overall_attempt_seconds / 60)} min`} label="Total time" />
            <StatPill icon={<Clock size={16} color="var(--accent-emerald)" />} value="Free" label="Jump between Qs" />
          </div>

          <div style={{ textAlign: 'left', marginBottom: 20, padding: '16px 18px', borderRadius: 0, background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--text-muted)' }}>
                Browser-integrity checks
              </span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 0, background: 'rgba(244, 63, 94, 0.15)', color: 'var(--accent-rose)' }}>
                No webcam
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {INTEGRITY_RULES.map((rule, i) => (
                <div key={rule.label} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
                  borderTop: i > 0 ? '1px solid var(--glass-border)' : 'none',
                }}>
                  <span style={{
                    width: 32, height: 32, borderRadius: 0, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: rule.tint, 
                  }}>
                    {rule.icon}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--text-primary)', flex: 1 }}>{rule.label}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 0, whiteSpace: 'nowrap',
                    background: 'rgba(244, 63, 94, 0.14)', color: 'var(--accent-rose)',
                  }}>
                    &minus;{rule.penalty} pts
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>up to &minus;{rule.cap}</span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--glass-border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontSize: 12, color: 'var(--accent-cyan)', lineHeight: 1.6, margin: 0 }}>
                First time doing any of these = just a warning, no points lost. Points are only deducted from the 2nd time onward for that same action.
              </p>
              <p style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
                This only lowers your integrity score, shown separately from your raw score. It never changes your answers or blocks you from applying.
              </p>
            </div>
          </div>

          <button className="btn-primary" onClick={beginTest} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Rocket size={16} /> Start Aptitude Check
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'submitting') {
    return <CenteredCard><p style={{ color: 'var(--text-secondary)' }}>Scoring your attempt...</p></CenteredCard>;
  }

  if (phase === 'result' && result) {
    const totalQuestions = result.question_results.length || attempt?.questions.length || 0;
    const correctCount = result.question_results.filter((q) => q.correct).length;
    // Preserve question order using the original attempt (still in state) so
    // the grid below reads left-to-right the same way the test did.
    const orderedResults = attempt
      ? attempt.questions.map((q) => result.question_results.find((r) => r.question_id === q.id)).filter(Boolean) as typeof result.question_results
      : result.question_results;

    const totalPointsLost = Math.round((100 - result.integrity_score) * 10) / 10;
    const incorrectCount = totalQuestions - correctCount;
    const rawScorePct = Math.round(result.raw_score);
    const integrityLabel = result.integrity_score >= 90 ? 'Excellent' : result.integrity_score >= 70 ? 'Good' : result.integrity_score >= 40 ? 'Flagged' : 'Poor';
    const integrityColor = result.integrity_score >= 90 ? 'var(--accent-emerald)' : result.integrity_score >= 70 ? 'var(--accent-amber)' : 'var(--accent-rose)';
    const shortId = attempt ? `NXA-${attempt.attempt_id.replace(/-/g, '').slice(0, 12).toUpperCase()}` : '';

    return (
      <div style={{ maxWidth: 980, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16, padding: '8px 0 24px' }}>

        {/* Header */}
        <div className="glass-card" style={{ padding: '22px 26px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ position: 'relative', width: 56, height: 56, flexShrink: 0 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26 }}>
                🏆
              </div>
              <div style={{ position: 'absolute', bottom: -2, right: -2, width: 20, height: 20, borderRadius: '50%', background: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid var(--bg-card)' }}>
                <CheckCircle2 size={12} color="#050505" />
              </div>
            </div>
            <div>
              <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 3, fontFamily: 'var(--font-serif)' }}>
                Attempt <span style={{ color: 'var(--accent-emerald)' }}>Complete!</span>
              </h2>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                You've finished the Aptitude Check. Here's how you performed.
              </p>
            </div>
          </div>
          {shortId && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderRadius: 0, background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)' }}>
              <FileText size={16} color="var(--accent-cyan)" />
              <div>
                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Assessment ID</div>
                <div style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{shortId}</div>
              </div>
            </div>
          )}
        </div>

        {/* Result + Integrity, side by side */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
          <div className="glass-card" style={{ padding: 26 }}>
            <SectionLabel icon={<BarChart3 size={14} color="var(--accent-cyan)" />} text="Your result" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 14, flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', width: 140, height: 140, flexShrink: 0 }}>
                <RadialScore value={rawScorePct} color="var(--accent-cyan)" />
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{rawScorePct}%</span>
                  <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>Raw Score</span>
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', marginBottom: 2 }}>
                  {correctCount} / {totalQuestions}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>questions answered correctly</div>
                <div style={{ padding: '10px 14px', borderRadius: 0, background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)' }}>
                  <p style={{ fontSize: 12.5, color: 'var(--accent-cyan)', margin: 0, lineHeight: 1.5 }}>
                    You answered {correctCount} question{correctCount === 1 ? '' : 's'} correctly.
                  </p>
                  <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: '4px 0 0', lineHeight: 1.5 }}>
                    {result.passed ? "That's enough to clear this internship's cutoff." : 'Keep practicing, you\'ll get better.'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="glass-card" style={{ padding: 26 }}>
            <SectionLabel icon={<ShieldCheck size={14} color={integrityColor} />} text="Assessment integrity" />
            <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginTop: 14, flexWrap: 'wrap' }}>
              <div style={{ width: 100, height: 100, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `radial-gradient(circle, ${integrityColor}22, transparent 70%)`, border: `1px solid ${integrityColor}44` }}>
                <ShieldCheck size={44} color={integrityColor} />
              </div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--font-mono)', color: integrityColor, marginBottom: 2 }}>{result.integrity_score}%</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>Integrity Score</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: integrityColor, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                  {result.integrity_score >= 90 ? 'Verified' : 'Reviewed'}
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, margin: 0 }}>
                  {Object.keys(activityLog).length === 0
                    ? 'No integrity issues detected. You followed all the assessment rules.'
                    : `${totalPointsLost} point${totalPointsLost === 1 ? '' : 's'} deducted across ${Object.keys(activityLog).length} flagged action type${Object.keys(activityLog).length === 1 ? '' : 's'}.`}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Answer by answer */}
        {orderedResults.length > 0 && (
          <div className="glass-card" style={{ padding: 26 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
              <SectionLabel icon={<LayoutGrid size={14} color="var(--accent-cyan)" />} text="Answer by answer" />
              <div style={{ display: 'flex', gap: 8, fontSize: 11.5 }}>
                <span style={{ padding: '4px 10px', borderRadius: 0, background: 'rgba(16, 185, 129, 0.12)', color: 'var(--accent-emerald)', fontWeight: 700 }}>{correctCount} correct</span>
                <span style={{ padding: '4px 10px', borderRadius: 0, background: 'rgba(244, 63, 94, 0.12)', color: 'var(--accent-rose)', fontWeight: 700 }}>{incorrectCount} incorrect</span>
              </div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
              {orderedResults.map((q, i) => (
                <div
                  key={q.question_id}
                  title={`Question ${i + 1}: ${q.correct ? 'Correct' : 'Incorrect or skipped'}`}
                  style={{
                    position: 'relative', width: 40, height: 40, borderRadius: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)',
                    background: q.correct ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)',
                    color: q.correct ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                    border: `1px solid ${q.correct ? 'var(--accent-emerald)' : 'var(--accent-rose)'}`,
                  }}
                >
                  {i + 1}
                  <span style={{
                    position: 'absolute', top: -6, right: -6, width: 16, height: 16, borderRadius: '50%',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: q.correct ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                    border: '2px solid var(--bg-card)',
                  }}>
                    {q.correct ? <CheckCircle2 size={9} color="#050505" /> : <XCircle size={9} color="#050505" />}
                  </span>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', margin: 0 }}>
              <span style={{ color: 'var(--accent-emerald)' }}>Green</span> = correct, <span style={{ color: 'var(--accent-rose)' }}>red</span> = incorrect or timed out.
            </p>
          </div>
        )}

        {/* Full review — question, what you picked, and the correct answer */}
        {showReview && (
          <div id="answer-review" className="glass-card" style={{ padding: 26 }}>
            <SectionLabel icon={<FileText size={14} color="var(--accent-cyan)" />} text="Review answers" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 16 }}>
              {orderedResults.map((r, i) => {
                const wasAnswered = r.selected_index !== null && r.selected_index !== undefined;
                return (
                  <div key={r.question_id} style={{ padding: '14px 16px', borderRadius: 0, background: 'var(--bg-elevated)', border: `1px solid ${r.correct ? 'rgba(16,185,129,0.3)' : 'rgba(244,63,94,0.3)'}` }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                      {r.correct ? <CheckCircle2 size={16} color="var(--accent-emerald)" style={{ flexShrink: 0, marginTop: 2 }} /> : <XCircle size={16} color="var(--accent-rose)" style={{ flexShrink: 0, marginTop: 2 }} />}
                      <p style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-primary)', margin: 0, lineHeight: 1.5 }}>
                        {i + 1}. {r.question}
                      </p>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginLeft: 26 }}>
                      {wasAnswered ? (
                        <span style={{
                          fontSize: 12.5, padding: '8px 12px', borderRadius: 0,
                          background: r.correct ? 'rgba(16,185,129,0.1)' : 'rgba(244,63,94,0.1)',
                          color: r.correct ? 'var(--accent-emerald)' : 'var(--accent-rose)',
                          border: `1px solid ${r.correct ? 'var(--accent-emerald)' : 'var(--accent-rose)'}`,
                        }}>
                          Your answer: {r.options[r.selected_index as number]}
                        </span>
                      ) : (
                        <span style={{ fontSize: 12.5, padding: '8px 12px', borderRadius: 0, background: 'var(--bg-card)', color: 'var(--text-muted)', border: '1px solid var(--glass-border)' }}>
                          No answer selected — skipped.
                        </span>
                      )}
                      {!r.correct && (
                        <span style={{
                          fontSize: 12.5, padding: '8px 12px', borderRadius: 0,
                          background: 'rgba(16,185,129,0.1)', color: 'var(--accent-emerald)', border: '1px solid var(--accent-emerald)',
                        }}>
                          Correct answer: {r.options[r.correct_index]}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Integrity breakdown + gauge */}
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(220px, 1fr)', gap: 16 }}>
          <div className="glass-card" style={{ padding: 26, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <SectionLabel icon={<ShieldCheck size={14} color="var(--accent-cyan)" />} text="Integrity breakdown" />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginTop: 14 }}>
              {INTEGRITY_RULES.map((rule) => {
                const total = activityLog[RULE_FLAG_TYPE[rule.label]] || 0;
                return (
                  <BreakdownTile key={rule.label} icon={rule.icon} tint={rule.tint} label={rule.label} count={total} />
                );
              })}
            </div>
          </div>
          <div className="glass-card" style={{ padding: 26, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
            <SectionLabel icon={<ShieldCheck size={14} color={integrityColor} />} text="Integrity score" />
            <div style={{ marginTop: 10 }}>
              <HalfGauge value={result.integrity_score} color={integrityColor} />
            </div>
            <div style={{ marginTop: -8 }}>
              <span style={{ fontSize: 30, fontWeight: 800, fontFamily: 'var(--font-mono)', color: integrityColor }}>{result.integrity_score}</span>
              <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>/100</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: integrityColor, marginTop: 4 }}>{integrityLabel}</div>
          </div>
        </div>

        {/* What is integrity score */}
        <div className="glass-card" style={{ padding: '20px 26px', display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ width: 34, height: 34, borderRadius: 0, background: 'rgba(56, 189, 248, 0.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <HelpCircle size={17} color="var(--accent-cyan)" />
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent-cyan)', margin: '0 0 6px' }}>What is integrity score?</p>
            <p style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
              It reflects how consistently you followed the assessment rules. It doesn't affect your raw score. It only indicates how trustworthy this attempt is.
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 220 }}>
            {['Helps ensure a fair environment for everyone', 'Builds trust in your result', 'Used by recruiters to evaluate attempt validity'].map((t) => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                <CheckCircle2 size={14} color="var(--accent-cyan)" style={{ flexShrink: 0 }} /> {t}
              </div>
            ))}
          </div>
        </div>

        {/* Footer actions */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          <button
            onClick={() => {
              const next = !showReview;
              setShowReview(next);
              if (next) setTimeout(() => document.getElementById('answer-review')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
            }}
            className="glass-card"
            style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--glass-border)', background: 'var(--bg-elevated)', cursor: 'pointer' }}
          >
            <FileText size={18} color="var(--text-secondary)" />
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{showReview ? 'Hide Answer Review' : 'Review Answers'}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>See each question and what you picked</div>
            </div>
          </button>
          <button className="btn-primary" onClick={() => router.push('/student/live-internships')} style={{ width: '100%' }}>Back to Internships</button>
        </div>
      </div>
    );
  }

  if (phase === 'in_progress' && attempt) {
    const question = attempt.questions[currentIndex];
    const selected = answers[question.id];
    const answeredCount = Object.keys(answers).length;
    const isLast = currentIndex + 1 >= attempt.questions.length;
    const mins = Math.floor(overallSecondsLeft / 60);
    const secs = overallSecondsLeft % 60;
    return (
      <div style={{ maxWidth: 660, margin: '0 auto', position: 'relative' }}>
        {warning && (
          <div style={{
            position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)', zIndex: 50,
            maxWidth: 480, width: 'calc(100% - 40px)',
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '12px 16px', borderRadius: 0,
            background: warning.repeat ? 'rgba(244, 63, 94, 0.16)' : 'rgba(56, 189, 248, 0.12)',
            border: `1px solid ${warning.repeat ? 'var(--accent-rose)' : 'var(--accent-cyan)'}`,
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}>
            <AlertTriangle size={16} color={warning.repeat ? 'var(--accent-rose)' : 'var(--accent-cyan)'} style={{ marginTop: 1, flexShrink: 0 }} />
            <span style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.4 }}>{warning.text}</span>
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
            Question {currentIndex + 1} of {attempt.questions.length} · {answeredCount} answered
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: overallSecondsLeft <= 60 ? 'var(--accent-rose)' : 'var(--text-primary)' }}>
            <Clock size={14} /> {mins}:{String(secs).padStart(2, '0')}
          </span>
        </div>

        {/* Jump-to-question strip — lets students see progress and hop between questions freely */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
          {attempt.questions.map((q, i) => {
            const isAnswered = answers[q.id] !== undefined;
            const isCurrent = i === currentIndex;
            return (
              <button
                key={q.id}
                onClick={() => setCurrentIndex(i)}
                style={{
                  width: 30, height: 30, borderRadius: 0, fontSize: 12, fontWeight: 700, fontFamily: 'var(--font-mono)',
                  cursor: 'pointer',
                  background: isCurrent ? 'var(--accent-cyan)' : isAnswered ? 'rgba(56, 189, 248, 0.14)' : 'var(--bg-elevated)',
                  color: isCurrent ? '#050505' : isAnswered ? 'var(--accent-cyan)' : 'var(--text-muted)',
                  border: `1px solid ${isCurrent ? 'var(--accent-cyan)' : isAnswered ? 'var(--accent-cyan)' : 'var(--glass-border)'}`,
                }}
              >
                {i + 1}
              </button>
            );
          })}
        </div>

        <div
          className="glass-card"
          style={{
            padding: 28,
            marginBottom: 20,
            userSelect: 'none',
            WebkitUserSelect: 'none',
            msUserSelect: 'none',
          } as React.CSSProperties}
        >
          <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, lineHeight: 1.5 }}>{question.question}</p>
          {question.options.map((opt, i) => (
            <button
              key={i}
              onClick={() => selectAnswer(question.id, i)}
              style={{
                display: 'block', width: '100%', textAlign: 'left', padding: '12px 16px',
                marginBottom: 10, borderRadius: 0, cursor: 'pointer',
                background: selected === i ? 'var(--accent-cyan)' : 'var(--bg-elevated)',
                color: selected === i ? '#050505' : 'var(--text-primary)',
                border: selected === i ? '1px solid var(--accent-cyan)' : '1px solid var(--glass-border)',
                fontSize: 14, fontFamily: 'Inter',
              }}
            >
              {opt}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: isLast ? '1fr 1fr' : '1fr 1fr', gap: 10 }}>
          <button
            onClick={goToPrevious}
            disabled={currentIndex === 0}
            className="glass-card"
            style={{
              padding: '13px 16px', borderRadius: 0, fontSize: 14, fontWeight: 600, cursor: currentIndex === 0 ? 'default' : 'pointer',
              background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)',
              color: currentIndex === 0 ? 'var(--text-muted)' : 'var(--text-primary)', opacity: currentIndex === 0 ? 0.5 : 1,
            }}
          >
            ← Previous
          </button>
          {isLast ? (
            <button className="btn-primary" onClick={finish} style={{ width: '100%' }}>Submit</button>
          ) : (
            <button className="btn-primary" onClick={goToNext} style={{ width: '100%' }}>Next Question →</button>
          )}
        </div>
        {!isLast && answeredCount === attempt.questions.length && (
          <button onClick={finish} style={{ width: '100%', marginTop: 10, padding: '10px', fontSize: 12.5, color: 'var(--accent-emerald)', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'center' }}>
            All questions answered — submit now instead of continuing?
          </button>
        )}
      </div>
    );
  }

  return null;
}

const FLAG_LABELS: Record<string, string> = {
  tab_blur: 'Switched tabs / left the window',
  copy_paste_attempt: 'Copy, paste, or text-selection attempt',
  fullscreen_exit: 'Exited fullscreen',
};

const INTEGRITY_RULES: { label: string; penalty: number; cap: number; icon: React.ReactNode; tint: string }[] = [
  { label: 'Tab Switches', penalty: 10, cap: 40, icon: <ArrowLeftRight size={15} color="var(--accent-rose)" />, tint: 'rgba(244, 63, 94, 0.14)' },
  { label: 'Copy / Paste', penalty: 5, cap: 20, icon: <Copy size={15} color="#f59e0b" />, tint: 'rgba(245, 158, 11, 0.14)' },
  { label: 'Fullscreen Exits', penalty: 15, cap: 60, icon: <Maximize2 size={15} color="var(--accent-cyan)" />, tint: 'rgba(56, 189, 248, 0.14)' },
];

// Maps the short breakdown-tile labels above back to the backend flag_type
// strings used everywhere else (activityLog, integrity_breakdown, etc).
const RULE_FLAG_TYPE: Record<string, string> = {
  'Tab Switches': 'tab_blur',
  'Copy / Paste': 'copy_paste_attempt',
  'Fullscreen Exits': 'fullscreen_exit',
};

function SectionLabel({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 26, height: 26, borderRadius: 0, background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {icon}
      </span>
      <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--text-muted)' }}>{text}</span>
    </div>
  );
}

function RadialScore({ value, size = 140, stroke = 12, color }: { value: number; size?: number; stroke?: number; color: string }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = circumference * (1 - clamped / 100);
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size / 2} cy={size / 2} r={radius} stroke="var(--bg-elevated)" strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2} cy={size / 2} r={radius} stroke={color} strokeWidth={stroke} fill="none"
        strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 600ms ease' }}
      />
    </svg>
  );
}

function HalfGauge({ value, size = 160, stroke = 14, color }: { value: number; size?: number; stroke?: number; color: string }) {
  const radius = (size - stroke) / 2;
  const circumference = Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = circumference * (1 - clamped / 100);
  return (
    <svg width={size} height={size / 2 + stroke} viewBox={`0 0 ${size} ${size / 2 + stroke}`}>
      <path
        d={`M ${stroke / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - stroke / 2} ${size / 2}`}
        stroke="var(--bg-elevated)" strokeWidth={stroke} fill="none" strokeLinecap="round"
      />
      <path
        d={`M ${stroke / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - stroke / 2} ${size / 2}`}
        stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
        strokeDasharray={circumference} strokeDashoffset={offset}
        style={{ transition: 'stroke-dashoffset 600ms ease' }}
      />
    </svg>
  );
}

function BreakdownTile({ icon, tint, label, count }: { icon: React.ReactNode; tint: string; label: string; count: number }) {
  const good = count === 0;
  return (
    <div style={{ padding: '14px 12px', borderRadius: 0, background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ width: 26, height: 26, borderRadius: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: tint }}>{icon}</span>
        <span style={{ fontSize: 11.5, color: 'var(--text-secondary)' }}>{label}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{count}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>times</span>
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: good ? 'var(--accent-emerald)' : 'var(--accent-rose)', marginTop: 2 }}>{good ? 'Good' : 'Flagged'}</div>
    </div>
  );
}

function StatPill({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      padding: '12px 8px', borderRadius: 0, background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)',
    }}>
      {icon}
      <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{value}</span>
      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{label}</span>
    </div>
  );
}

const WARNING_MESSAGES: Record<string, string> = {
  tab_blur: "Warning: switching tabs or leaving the window is being flagged. Do it again and it'll cost −10 pts (up to −40).",
  copy_paste_attempt: "Warning: selecting, copying, or pasting text is being flagged. Do it again and it'll cost −5 pts (up to −20).",
  fullscreen_exit: "Warning: exiting fullscreen is being flagged. Do it again and it'll cost −15 pts (up to −60).",
};

const REPEAT_WARNING_MESSAGES: Record<string, string> = {
  tab_blur: 'Flagged: tab switch / left window — −10 pts deducted from your integrity score.',
  copy_paste_attempt: 'Flagged: select / copy / paste — −5 pts deducted from your integrity score.',
  fullscreen_exit: 'Flagged: exited fullscreen — −15 pts deducted from your integrity score.',
};

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
      <div className="glass-card" style={{ padding: 40, textAlign: 'center', maxWidth: 480 }}>
        {children}
      </div>
    </div>
  );
}
