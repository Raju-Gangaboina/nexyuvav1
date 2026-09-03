'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ShieldCheck, Camera, AlertTriangle, Award, ChevronRight, ChevronDown, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { loadScript } from '@/lib/loadScript';
import {
  startInterview, submitInterviewAnswer, reportInterviewFlag, checkInterviewFrame, getInterviewResult,
  InterviewQuestion, AnswerInterviewResult, InterviewResult,
} from '@/lib/realApi';

const NO_FACE_STREAK_THRESHOLD = 15;
// Same debounce as no_face_detected -- without this, face_turned_away fired
// on almost every single FaceMesh frame (multiple times a second) whenever
// the head was even slightly turned, so a few real seconds of looking away
// could rack up 50-100+ "occurrences" while only a handful of flush-cycle
// timestamps were ever recorded. Require a sustained streak instead of a
// single frame so the count reflects real look-aways, not per-frame noise.
const TURNED_AWAY_STREAK_THRESHOLD = 15;
const FLUSH_INTERVAL_MS = 10000;
const FRAME_CHECK_INTERVAL_MS = 15000;

type FlagType = 'no_face_detected' | 'face_turned_away' | 'multiple_faces_detected' | 'tab_blur';
type Stage = 'checking' | 'intro' | 'permission' | 'active' | 'finished' | 'in_progress' | 'error';

export default function InterviewPage() {
  const { applicationId } = useParams<{ applicationId: string }>();
  const router = useRouter();

  const [stage, setStage] = useState<Stage>('checking');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [faceStatus, setFaceStatus] = useState<{ text: string; ok: boolean }>({ text: 'Initializing camera...', ok: true });

  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [finalResult, setFinalResult] = useState<AnswerInterviewResult | null>(null);
  const [detailedResult, setDetailedResult] = useState<InterviewResult | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [expandedQ, setExpandedQ] = useState<number | null>(null);
  const [integrityOpen, setIntegrityOpen] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const flagCountsRef = useRef<Record<FlagType, number>>({
    no_face_detected: 0, face_turned_away: 0, multiple_faces_detected: 0, tab_blur: 0,
  });
  const noFaceStreakRef = useRef(0);
  const turnedAwayStreakRef = useRef(0);
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameCheckTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const faceMeshRef = useRef<any>(null);
  const cameraCtorRef = useRef<any>(null);
  const cameraInstanceRef = useRef<any>(null);

  const recordFlag = useCallback((flagType: FlagType) => {
    flagCountsRef.current[flagType] += 1;
    setFaceStatus({ text: `Flagged: ${flagType.replace(/_/g, ' ')} (this attempt: ${flagCountsRef.current[flagType]})`, ok: false });
  }, []);

  // An application can only ever have one interview attempt (backend
  // enforces this -- see start_interview's "Interview already started"
  // check). Without this, clicking a completed/in-progress application's
  // interview link always landed on the intro screen, which then failed
  // with that exact error the moment "Enable camera & begin" was clicked --
  // instead of showing the result the student already has. Check for an
  // existing attempt first and route straight to the right screen.
  useEffect(() => {
    let cancelled = false;
    getInterviewResult(applicationId)
      .then(result => {
        if (cancelled) return;
        if (result.status === 'completed') {
          setDetailedResult(result);
          setFinalResult({
            graded: true, all_answered: true,
            final_score: result.final_score ?? undefined,
            integrity_score: result.integrity_score ?? undefined,
            passed: result.passed ?? undefined,
            badge_awarded: result.badge_awarded,
          });
          setStage('finished');
        } else {
          // in_progress -- there is no resume flow (which question was
          // reached isn't tracked client-side), so be upfront about it
          // rather than silently restarting from question 1.
          setStage('in_progress');
        }
      })
      .catch(() => {
        // No attempt exists yet for this application -- this is the
        // expected/normal case for a student who hasn't interviewed yet.
        if (!cancelled) setStage('intro');
      });
    return () => { cancelled = true; };
  }, [applicationId]);

  useEffect(() => {
    const onVisibility = () => { if (document.hidden) recordFlag('tab_blur'); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [recordFlag]);

  const flushFlags = useCallback(async () => {
    for (const [flagType, count] of Object.entries(flagCountsRef.current) as [FlagType, number][]) {
      if (count === 0) continue;
      try {
        await reportInterviewFlag(applicationId, flagType, count);
        flagCountsRef.current[flagType] = 0;
      } catch { /* retry next cycle */ }
    }
  }, [applicationId]);

  function estimateFaceAngle(landmarks: { x: number; y: number }[]) {
    const noseTip = landmarks[1];
    const leftCheek = landmarks[234];
    const rightCheek = landmarks[454];
    const leftDist = Math.abs(noseTip.x - leftCheek.x);
    const rightDist = Math.abs(noseTip.x - rightCheek.x);
    return leftDist / (rightDist || 0.001);
  }

  const onFaceMeshResults = useCallback((results: { multiFaceLandmarks?: { x: number; y: number }[][] }) => {
    const faces = results.multiFaceLandmarks || [];
    if (faces.length === 0) {
      noFaceStreakRef.current += 1;
      turnedAwayStreakRef.current = 0;
      if (noFaceStreakRef.current === NO_FACE_STREAK_THRESHOLD) recordFlag('no_face_detected');
    } else {
      noFaceStreakRef.current = 0;
      if (faces.length > 1) {
        turnedAwayStreakRef.current = 0;
        recordFlag('multiple_faces_detected');
      } else {
        const ratio = estimateFaceAngle(faces[0]);
        if (ratio < 0.4 || ratio > 2.5) {
          turnedAwayStreakRef.current += 1;
          // Only count once per sustained look-away, then require the face
          // to come back centered before it can count again -- otherwise
          // every frame past the threshold keeps incrementing the count.
          if (turnedAwayStreakRef.current === TURNED_AWAY_STREAK_THRESHOLD) recordFlag('face_turned_away');
        } else {
          turnedAwayStreakRef.current = 0;
          setFaceStatus({ text: 'Face detected normally', ok: true });
        }
      }
    }
  }, [recordFlag]);

  const captureFrameAndCheck = useCallback(async () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) return;
    const canvas = document.createElement('canvas');
    canvas.width = 320; canvas.height = 240;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, 320, 240);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
    const base64 = dataUrl.split(',')[1];
    try {
      const result = await checkInterviewFrame(applicationId, base64);
      if (result.phone_detected) setFaceStatus({ text: 'Flagged: phone detected in frame', ok: false });
      else if (result.multiple_people) setFaceStatus({ text: 'Flagged: multiple people detected', ok: false });
    } catch { /* Gemini hiccup should not interrupt the interview */ }
  }, [applicationId]);

  async function initCameraAndInterview() {
    setStage('permission');
    setErrorMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 480, height: 360 } });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
    } catch {
      setErrorMsg('Camera permission denied - this interview needs camera access to proceed.');
      setStage('intro');
      return;
    }

    try {
      await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/face_mesh.js');
      await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');
    } catch {
      setErrorMsg('Failed to load proctoring components. Check your connection and try again.');
      setStage('intro');
      return;
    }

    const w = window as any;
    const faceMesh = new w.FaceMesh({
      locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`,
    });
    faceMesh.setOptions({ maxNumFaces: 2, refineLandmarks: true, minDetectionConfidence: 0.5, minTrackingConfidence: 0.5 });
    faceMesh.onResults(onFaceMeshResults);

    faceMeshRef.current = faceMesh;
    cameraCtorRef.current = w.Camera;

    flushTimerRef.current = setInterval(flushFlags, FLUSH_INTERVAL_MS);
    frameCheckTimerRef.current = setInterval(captureFrameAndCheck, FRAME_CHECK_INTERVAL_MS);

    try {
      const res = await startInterview(applicationId);
      setQuestions(res.questions);
      setStage('active');
    } catch (e: any) {
      setErrorMsg(e.message || 'Could not start the interview. Has the company uploaded questions for this role yet?');
      setStage('intro');
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    cameraInstanceRef.current = null;
    if (flushTimerRef.current) clearInterval(flushTimerRef.current);
    if (frameCheckTimerRef.current) clearInterval(frameCheckTimerRef.current);
  }

  useEffect(() => () => stopCamera(), []);

  // The <video> element only mounts once stage becomes 'active' (it is not
  // rendered during 'intro'/'permission'), so the stream + face-mesh camera
  // must be attached here rather than inside initCameraAndInterview -
  // attaching them there was a silent no-op since videoRef.current was
  // still null at that point, which is why the feed showed a black canvas.
  useEffect(() => {
    if (stage !== 'active') return;
    if (!videoRef.current || !streamRef.current) return;
    videoRef.current.srcObject = streamRef.current; videoRef.current.play().catch(() => {});
    if (cameraCtorRef.current && faceMeshRef.current && !cameraInstanceRef.current) {
      const camera = new cameraCtorRef.current(videoRef.current, {
        onFrame: async () => { await faceMeshRef.current.send({ image: videoRef.current }); },
        width: 480, height: 360,
      });
      camera.start();
      cameraInstanceRef.current = camera;
    }
  }, [stage]);

  async function handleSubmitAnswer() {
    if (!answer.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await submitInterviewAnswer(applicationId, qIndex, answer);
      await flushFlags();
      if (res.all_answered) {
        setFinalResult(res);
        stopCamera();
        setStage('finished');
        setDetailLoading(true);
        getInterviewResult(applicationId)
          .then(setDetailedResult)
          .catch(() => { /* breakdown is a bonus, don't block the finished screen on it */ })
          .finally(() => setDetailLoading(false));
      } else {
        setQIndex(i => i + 1);
        setAnswer('');
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'Could not submit that answer. Please try again.');
    }
    setSubmitting(false);
  }

  if (stage === 'checking') {
    return (
      <div style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center' }}>
        <Loader2 size={28} className="animate-spin" color="#2B7FD4" style={{ marginBottom: 16 }} />
        <p style={{ color: 'var(--gray)', fontSize: 14 }}>Checking your interview status...</p>
      </div>
    );
  }

  if (stage === 'in_progress') {
    return (
      <div style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center' }}>
        <div className="glass-card" style={{ padding: 32 }}>
          <AlertTriangle size={28} color="#F6B21A" style={{ marginBottom: 12 }} />
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>Interview already in progress</h2>
          <p style={{ color: 'var(--gray)', fontSize: 13.5, lineHeight: 1.6 }}>
            You started this interview but didn't finish it, and each application only gets one attempt.
            If you were disconnected partway through, reach out to support - this can't be restarted from here.
          </p>
        </div>
        <button className="btn-secondary" style={{ marginTop: 20 }} onClick={() => router.push('/student/applications')}>
          Back to applications
        </button>
      </div>
    );
  }

  if (stage === 'intro') {
    return (
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <ShieldCheck size={22} color="#2B7FD4" />
          <h1 style={{ fontSize: 26 }}>AI Stand-Out Interview</h1>
        </div>
        <p style={{ color: 'var(--gray)', fontSize: 14, marginBottom: 24 }}>
          10 questions from the company, graded by AI, cross-checked against your resume.
          Your webcam runs throughout for integrity - no video ever leaves your browser,
          only periodic snapshots and aggregated flag counts.
        </p>

        {errorMsg && (
          <div className="glass-card" style={{ padding: 16, marginBottom: 20, borderColor: 'rgba(192,64,64,0.3)', display: 'flex', gap: 10, alignItems: 'center' }}>
            <XCircle size={18} color="#E06060" />
            <span style={{ fontSize: 13, color: '#E06060' }}>{errorMsg}</span>
          </div>
        )}

        <button className="btn-primary" onClick={initCameraAndInterview}>
          <Camera size={16} /> Enable camera & begin <ChevronRight size={14} />
        </button>
      </div>
    );
  }

  if (stage === 'permission') {
    return (
      <div style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center' }}>
        <Loader2 size={28} className="animate-spin" color="#2B7FD4" style={{ marginBottom: 16 }} />
        <p style={{ color: 'var(--gray)', fontSize: 14 }}>Requesting camera access and starting your interview...</p>
      </div>
    );
  }

  if (stage === 'finished' && finalResult) {
    const passed = !!finalResult.passed;
    return (
      <div style={{ maxWidth: 640, margin: '40px auto' }}>
        <div className="glass-card" style={{ padding: '28px 32px', textAlign: 'center' }}>
          {passed ? <Award size={36} color="#F6B21A" style={{ marginBottom: 10 }} /> : <XCircle size={36} color="#E06060" style={{ marginBottom: 10 }} />}
          <h2 style={{ fontSize: 20, marginBottom: 6 }}>{passed ? 'Interview Passed' : 'Interview Complete'}</h2>
          <p style={{ color: 'var(--gray)', fontSize: 13, marginBottom: 22 }}>
            {passed ? 'A Stand-Out badge has been added - visible to the company.' : 'You did not reach the passing threshold this time.'}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 14 }}>
            <div style={{ flex: '0 0 150px', padding: '16px 10px', borderRadius: 0, background: 'rgba(10,10,10,0.04)' }}>
              <div style={{ fontSize: 30, fontWeight: 700, color: 'var(--white)', lineHeight: 1 }}>{finalResult.final_score ?? '-'}</div>
              <div style={{ fontSize: 11, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 6 }}>Score</div>
            </div>
            <div style={{ flex: '0 0 150px', padding: '16px 10px', borderRadius: 0, background: 'rgba(10,10,10,0.04)' }}>
              <div style={{ fontSize: 30, fontWeight: 700, color: 'var(--white)', lineHeight: 1 }}>{finalResult.integrity_score ?? '-'}</div>
              <div style={{ fontSize: 11, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 6 }}>Integrity</div>
            </div>
          </div>
          {finalResult.badge_awarded && <span className="badge badge-amber" style={{ marginTop: 14, display: 'inline-block' }}>Stand-Out Badge Awarded</span>}
        </div>

        <div style={{ marginTop: 20 }}>
          {detailLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--gray)', fontSize: 13, justifyContent: 'center', padding: 20 }}>
              <Loader2 size={15} className="animate-spin" /> Loading your answer breakdown...
            </div>
          ) : detailedResult ? (
            <>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 10 }}>
                Why this score
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: detailedResult.integrity_flags.length > 0 ? 16 : 0 }}>
                {detailedResult.questions.map((q, i) => {
                  const isOpen = expandedQ === i;
                  return (
                    <div key={i} className="glass-card" style={{ padding: 0, textAlign: 'left', overflow: 'hidden' }}>
                      <button
                        onClick={() => setExpandedQ(isOpen ? null : i)}
                        style={{
                          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          gap: 10, padding: '12px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                        }}
                      >
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--white)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          Q{i + 1}. {q.question}
                        </span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                          {q.score !== null && (
                            <span style={{ fontSize: 12, fontWeight: 700, color: q.score >= 70 ? '#4AAA82' : q.score >= 40 ? '#F6B21A' : '#E06060' }}>
                              {q.score.toFixed(0)}/100
                            </span>
                          )}
                          {q.resume_consistent === false && <AlertTriangle size={13} color="#E06060" />}
                          {q.resume_consistent === true && <CheckCircle2 size={13} color="#4AAA82" />}
                          <ChevronDown size={14} color="var(--gray)" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                        </span>
                      </button>
                      {isOpen && (
                        <div style={{ padding: '0 16px 14px' }}>
                          {q.answer ? (
                            <>
                              <p style={{ fontSize: 12.5, color: 'var(--gray)', marginBottom: 8, lineHeight: 1.6 }}>{q.answer}</p>
                              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                                {q.resume_consistent === false && (
                                  <span style={{ fontSize: 11, color: '#E06060', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <AlertTriangle size={11} /> Flagged as inconsistent with your resume
                                  </span>
                                )}
                                {q.resume_consistent === true && (
                                  <span style={{ fontSize: 11, color: '#4AAA82', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <CheckCircle2 size={11} /> Consistent with your resume
                                  </span>
                                )}
                              </div>
                              {q.notes && (
                                <p style={{ fontSize: 11.5, color: 'var(--gray)', marginTop: 6, fontStyle: 'italic' }}>{q.notes}</p>
                              )}
                            </>
                          ) : (
                            <p style={{ fontSize: 12, color: 'var(--gray)', fontStyle: 'italic' }}>Not answered</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {detailedResult.integrity_flags.length > 0 && (
                <div className="glass-card" style={{ padding: 0, textAlign: 'left', borderColor: 'rgba(224,96,96,0.3)', overflow: 'hidden' }}>
                  <button
                    onClick={() => setIntegrityOpen(o => !o)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: 10, padding: '12px 16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, fontWeight: 700, color: '#E06060', textTransform: 'uppercase' }}>
                      <AlertTriangle size={14} /> What affected your integrity score
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                      <span style={{ fontSize: 11, color: 'var(--gray)' }}>
                        {detailedResult.integrity_flags.length} signal{detailedResult.integrity_flags.length > 1 ? 's' : ''}
                      </span>
                      <ChevronDown size={14} color="var(--gray)" style={{ transform: integrityOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
                    </span>
                  </button>
                  {integrityOpen && (
                    <div style={{ padding: '0 16px 14px' }}>
                      <p style={{ fontSize: 11.5, color: 'var(--gray)', marginBottom: 10, lineHeight: 1.6 }}>
                        These are automatic proctoring signals - lighting, a second monitor, or a brief look away
                        can all trigger them. They're shown here so the score isn't a mystery, not as an accusation.
                      </p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {detailedResult.integrity_flags.map((f, i) => (
                          <div key={i}>
                            <span style={{ fontSize: 12, padding: '3px 10px', background: 'rgba(224,96,96,0.1)', borderRadius: 0, color: '#E06060' }}>
                              {f.flag_type.replace(/_/g, ' ')} × {f.count}
                            </span>
                            {f.timestamps && f.timestamps.length > 0 && (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6, paddingLeft: 4 }}>
                                {f.timestamps.map((ts, j) => (
                                  <span key={j} style={{ fontSize: 10.5, color: 'var(--gray)' }}>
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
                </div>
              )}
            </>
          ) : null}
        </div>

        <div style={{ textAlign: 'center' }}>
          <button className="btn-secondary" style={{ marginTop: 20 }} onClick={() => router.push('/student/applications')}>
            Back to applications
          </button>
        </div>
      </div>
    );
  }

  const question = questions[qIndex];
  return (
    <div style={{ maxWidth: 960, margin: '0 auto', display: 'grid', gridTemplateColumns: '320px 1fr', gap: 28 }}>
      <div>
        <div style={{ position: 'relative', width: 280, height: 210, marginBottom: 12 }}>
          <video ref={videoRef} autoPlay playsInline muted style={{ width: 280, height: 210, borderRadius: 2, objectFit: 'cover' }} />
          <canvas ref={canvasRef} width={280} height={210} style={{ position: 'absolute', top: 0, left: 0 }} />
        </div>
        <div className="glass-card" style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
          {faceStatus.ok ? <CheckCircle2 size={15} color="#4AAA82" /> : <AlertTriangle size={15} color="#E06060" />}
          <span style={{ fontSize: 12, color: faceStatus.ok ? '#4AAA82' : '#E06060' }}>{faceStatus.text}</span>
        </div>
        <div style={{ marginTop: 14, fontSize: 12, color: 'var(--gray)' }}>
          Question {qIndex + 1} of {questions.length}
        </div>
      </div>

      <div>
        <div className="glass-card" style={{ padding: 24 }}>
          <p style={{ fontSize: 16, lineHeight: 1.5, marginBottom: 20, color: 'var(--white)' }}>{question?.question}</p>
          <textarea
            value={answer}
            onChange={e => setAnswer(e.target.value)}
            placeholder="Type your answer here..."
            className="input-field"
            style={{ width: '100%', minHeight: 140, resize: 'vertical', fontSize: 14 }}
            disabled={submitting}
          />
          <button
            className="btn-primary"
            disabled={!answer.trim() || submitting}
            onClick={handleSubmitAnswer}
            style={{ marginTop: 16, opacity: !answer.trim() || submitting ? 0.5 : 1 }}
          >
            {submitting ? <Loader2 size={15} className="animate-spin" /> : qIndex === questions.length - 1 ? 'Submit final answer' : 'Submit & next question'}
          </button>
        </div>
      </div>
    </div>
  );
}
