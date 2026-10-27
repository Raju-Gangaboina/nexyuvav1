'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Mic, Square, ChevronRight, Loader2, CheckCircle2, XCircle, Award } from 'lucide-react';
import {
  startVoiceScreen, submitVoiceScreenAnswer, getMyVoiceScreen,
  VoiceScreenQuestionPublic, VoiceScreenResult,
} from '@/lib/realApi';

// Module 5.7 -- Voice Screen. Async, ONE-WAY audio interview: no live
// interviewer, no webcam/proctoring (see backend routes.py docstring).
// Student records an answer per question with the mic, each recording is
// uploaded and transcribed+scored independently -- no live score shown
// (same "no live feedback" convention as the typed AI interview).

type Stage = 'checking' | 'intro' | 'active' | 'submitting' | 'finished' | 'in_progress' | 'error';

export default function VoiceScreenPage() {
  const { applicationId } = useParams<{ applicationId: string }>();
  const router = useRouter();

  const [stage, setStage] = useState<Stage>('checking');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [questions, setQuestions] = useState<VoiceScreenQuestionPublic[]>([]);
  const [qIndex, setQIndex] = useState(0);
  const [recording, setRecording] = useState(false);
  const [hasRecording, setHasRecording] = useState(false);
  const [result, setResult] = useState<VoiceScreenResult | null>(null);
  const [starting, setStarting] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordedBlobRef = useRef<Blob | null>(null);

  // Same "check for an existing attempt first" pattern as the typed AI
  // interview page -- an application only ever gets one voice-screen
  // attempt (backend enforces this), so route straight to the right
  // screen instead of always starting from the intro.
  useEffect(() => {
    let cancelled = false;
    getMyVoiceScreen(applicationId)
      .then(res => {
        if (cancelled) return;
        if (res.status === 'completed') {
          setResult(res);
          setStage('finished');
        } else {
          setStage('in_progress');
        }
      })
      .catch(() => { if (!cancelled) setStage('intro'); });
    return () => { cancelled = true; };
  }, [applicationId]);

  function stopStream() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }
  useEffect(() => () => stopStream(), []);

  const handleStart = async () => {
    setErrorMsg(null);
    setStarting(true);
    try {
      const res = await startVoiceScreen(applicationId);
      setQuestions(res.questions);
      setQIndex(0);
      setHasRecording(false);
      recordedBlobRef.current = null;
      setStage('active');
    } catch (e: any) {
      setErrorMsg(e?.message || 'Could not start the voice screen. Has the company uploaded interview questions for this role yet?');
    }
    setStarting(false);
  };

  const handleStartRecording = async () => {
    setErrorMsg(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      mr.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = () => {
        recordedBlobRef.current = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' });
        setHasRecording(true);
        stopStream();
      };
      mr.start();
      setRecording(true);
      setHasRecording(false);
    } catch {
      setErrorMsg('Could not access the microphone -- check your browser permissions.');
    }
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  };

  const handleRetake = () => {
    recordedBlobRef.current = null;
    setHasRecording(false);
  };

  const handleSubmitAnswer = async () => {
    if (!recordedBlobRef.current) return;
    setStage('submitting');
    setErrorMsg(null);
    try {
      const res = await submitVoiceScreenAnswer(applicationId, qIndex, recordedBlobRef.current);
      if (res.all_answered) {
        const final = await getMyVoiceScreen(applicationId);
        setResult(final);
        setStage('finished');
      } else {
        setQIndex(i => i + 1);
        setHasRecording(false);
        recordedBlobRef.current = null;
        setStage('active');
      }
    } catch (e: any) {
      setErrorMsg(e?.message || 'Could not submit that answer. Please try again.');
      setStage('active');
    }
  };

  if (stage === 'checking') {
    return (
      <div style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center' }}>
        <Loader2 size={28} className="animate-spin" color="#2B7FD4" style={{ marginBottom: 16 }} />
        <p style={{ color: 'var(--gray)', fontSize: 14 }}>Checking your voice screen status...</p>
      </div>
    );
  }

  if (stage === 'in_progress') {
    return (
      <div style={{ maxWidth: 480, margin: '80px auto', textAlign: 'center' }}>
        <div className="glass-card" style={{ padding: 32 }}>
          <XCircle size={28} color="#F6B21A" style={{ marginBottom: 12 }} />
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>Voice screen already in progress</h2>
          <p style={{ color: 'var(--gray)', fontSize: 13.5, lineHeight: 1.6 }}>
            You started this voice screen but didn't finish it, and each application only gets one
            attempt. If you were disconnected partway through, reach out to support.
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
          <Mic size={22} color="#2B7FD4" />
          <h1 style={{ fontSize: 26 }}>Voice Screen</h1>
        </div>
        <p style={{ color: 'var(--gray)', fontSize: 14, marginBottom: 24 }}>
          A short set of questions from the company. Record your spoken answer to each one -- no
          live interviewer, no camera, and no live score shown as you go. Once you submit an
          answer you can't re-record it, so take a moment before you start each one.
        </p>

        {errorMsg && (
          <div className="glass-card" style={{ padding: 16, marginBottom: 20, borderColor: 'rgba(192,64,64,0.3)', display: 'flex', gap: 10, alignItems: 'center' }}>
            <XCircle size={18} color="#E06060" />
            <span style={{ fontSize: 13, color: '#E06060' }}>{errorMsg}</span>
          </div>
        )}

        <button className="btn-primary" onClick={handleStart} disabled={starting}>
          {starting ? <Loader2 size={16} className="animate-spin" /> : <>Begin voice screen <ChevronRight size={14} /></>}
        </button>
      </div>
    );
  }

  if (stage === 'finished' && result) {
    const passed = !!result.passed;
    return (
      <div style={{ maxWidth: 640, margin: '40px auto' }}>
        <div className="glass-card" style={{ padding: '28px 32px', textAlign: 'center' }}>
          {passed ? <Award size={36} color="#F6B21A" style={{ marginBottom: 10 }} /> : <XCircle size={36} color="#E06060" style={{ marginBottom: 10 }} />}
          <h2 style={{ fontSize: 20, marginBottom: 6 }}>{passed ? 'Voice Screen Passed' : 'Voice Screen Complete'}</h2>
          <p style={{ color: 'var(--gray)', fontSize: 13, marginBottom: 22 }}>
            {passed ? 'You cleared the passing bar for this screen.' : 'You did not reach the passing threshold this time.'}
          </p>
          <div style={{ fontSize: 30, fontWeight: 700, color: 'var(--white)', lineHeight: 1 }}>{result.final_score ?? '-'}</div>
          <div style={{ fontSize: 11, color: 'var(--gray)', textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 6 }}>Score</div>
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
  const isLast = qIndex === questions.length - 1;
  return (
    <div style={{ maxWidth: 640, margin: '0 auto' }}>
      <div style={{ fontSize: 12, color: 'var(--gray)', marginBottom: 10 }}>
        Question {qIndex + 1} of {questions.length}
      </div>
      <div className="glass-card" style={{ padding: 24 }}>
        <p style={{ fontSize: 16, lineHeight: 1.5, marginBottom: 24, color: 'var(--white)' }}>{question?.question}</p>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '20px 0' }}>
          {stage === 'submitting' ? (
            <Loader2 size={32} className="animate-spin" color="#2B7FD4" />
          ) : !recording && !hasRecording ? (
            <button className="btn-primary" onClick={handleStartRecording} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Mic size={16} /> Start recording
            </button>
          ) : recording ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#E06060', fontFamily: 'var(--font-mono)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#E06060', display: 'inline-block' }} />
                Recording...
              </div>
              <button className="btn-secondary" onClick={handleStopRecording} style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#E06060', borderColor: '#E06060' }}>
                <Square size={14} /> Stop
              </button>
            </>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#4AAA82' }}>
                <CheckCircle2 size={16} /> Answer recorded
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button className="btn-secondary" onClick={handleRetake}>Re-record</button>
                <button className="btn-primary" onClick={handleSubmitAnswer}>
                  {isLast ? 'Submit final answer' : 'Submit & next question'}
                </button>
              </div>
            </>
          )}
        </div>

        {errorMsg && <p style={{ fontSize: 12, color: '#E06060', marginTop: 8, textAlign: 'center' }}>{errorMsg}</p>}
      </div>
    </div>
  );
}
