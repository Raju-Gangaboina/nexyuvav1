'use client';
import { useState, useEffect, useCallback } from 'react';
import {
  Users, Search, Briefcase, Plus, MapPin, GraduationCap, GitBranch, Globe,
  Sparkles, CheckCircle2, Loader2, RefreshCw, SlidersHorizontal, ShieldCheck, Filter,
  ChevronDown, ChevronUp, BarChart2, Check, BrainCircuit, AlertTriangle, XCircle, FileText,
  Shield, TrendingUp, Activity, AlertCircle, ThumbsUp, Info, Compass, ClipboardList,
} from 'lucide-react';
import Link from 'next/link';
import {
  getMyRealInternships, getSourcedCandidatesReal, SourcedCandidate, getOrComputeScoreBreakdown,
  screenCandidateReal, ScreeningResult, updateAptitudeCheck,
  getBulkInvitePreview, sendBulkInvite, BulkInvitePreview, BulkInviteResult,
  getOutreachHealth, OutreachHealth,
} from '@/lib/realApi';

// Debounces a fast-changing value (e.g. every keystroke in a text filter)
// so dependents only react once typing pauses -- keeps the input itself
// instantly responsive (it's bound to the raw state) while the expensive
// side effect (a real sourcing API call) waits 400ms after the last change.
function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

// Shape returned by GET /organizations/internships (InternshipResponse) --
// distinct from the deprecated Node/JSON `Job` type this page used to read
// from lib/store, which never contained internships posted through the
// real Post Internship flow (backend/app/services/organization/routes.py).
interface RealInternship {
  id: string;
  title: string;
  domain: string;
  location: string;
  work_mode: string;
  is_active: boolean;
  aptitude_check_enabled?: boolean;
  aptitude_difficulty?: string;
}

const CONFIDENCE_COLOR: Record<string, string> = {
  High: 'var(--accent-emerald)',
  Medium: 'var(--accent-amber)',
  Low: 'var(--accent-rose)',
};

// ---------------------------------------------------------------------------
// Module 6 & 10 — Smart Bulk AI Invitation Panel (with Anti-Spam metrics)
// ---------------------------------------------------------------------------
function SmartBulkInvitePanel({ internshipId, internshipTitle }: { internshipId: string; internshipTitle: string }) {
  const [threshold, setThreshold] = useState(85);
  const debouncedThreshold = useDebouncedValue(threshold, 400);
  const [preview, setPreview] = useState<BulkInvitePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<BulkInviteResult | null>(null);
  const [sendError, setSendError] = useState('');

  useEffect(() => {
    if (!internshipId) return;
    setPreviewLoading(true);
    setResult(null);
    setShowConfirm(false);
    getBulkInvitePreview(internshipId, debouncedThreshold)
      .then(setPreview)
      .catch(() => setPreview(null))
      .finally(() => setPreviewLoading(false));
  }, [internshipId, debouncedThreshold]);

  const handleSend = async () => {
    setSending(true);
    setSendError('');
    try {
      const res = await sendBulkInvite(internshipId, threshold);
      setResult(res);
      setShowConfirm(false);
    } catch (e: any) {
      setSendError(e?.message || 'Failed to send invitations.');
    } finally {
      setSending(false);
    }
  };

  const netToInvite = preview?.net_to_invite ?? 0;
  const thresholdColor = threshold >= 85 ? 'var(--accent-emerald)' : threshold >= 70 ? 'var(--accent-amber)' : 'var(--accent-rose)';

  return (
    <div className="glass-card" style={{
      padding: '20px 24px',
      marginBottom: 20,
      border: '1px solid rgba(6, 182, 212, 0.25)',
      background: 'linear-gradient(135deg, rgba(6,182,212,0.04), rgba(16,185,129,0.03))',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <Users size={18} color="var(--accent-cyan)" />
        <span style={{ fontWeight: 700, fontSize: 14, fontFamily: 'var(--font-mono)', color: 'var(--accent-cyan)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          Smart Bulk AI Invitation
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'rgba(6,182,212,0.12)', padding: '2px 8px', borderRadius: 0, fontFamily: 'var(--font-mono)' }}>Module 6</span>
        <span style={{ fontSize: 10, color: 'var(--accent-emerald)', background: 'rgba(16,185,129,0.12)', padding: '2px 8px', borderRadius: 0, fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Shield size={9} /> Anti-Spam
        </span>
      </div>

      {/* AI Quality Warning */}
      {preview?.quality_warning && (
        <div style={{
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: 0, padding: '10px 14px', marginBottom: 14,
          display: 'flex', alignItems: 'flex-start', gap: 10,
        }}>
          <AlertCircle size={15} color="#f87171" style={{ marginTop: 1, flexShrink: 0 }} />
          <div style={{ fontSize: 12, color: '#fca5a5', lineHeight: 1.55 }}>
            <strong style={{ color: '#f87171' }}>AI Quality Warning: </strong>
            {preview.quality_warning}
          </div>
        </div>
      )}

      {/* Threshold Slider + Live Stats */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>Match Threshold</span>
            <span style={{ fontWeight: 700, fontSize: 18, color: thresholdColor, fontFamily: 'var(--font-mono)' }}>{threshold}%</span>
          </div>
          <input
            type="range" min={50} max={100} step={5}
            value={threshold}
            onChange={e => setThreshold(Number(e.target.value))}
            style={{ width: '100%', accentColor: thresholdColor, cursor: 'pointer', height: 4 }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
            <span>50%</span><span>75%</span><span>90%</span><span>100%</span>
          </div>
        </div>

        {/* Live counters — primary */}
        <div style={{ display: 'flex', gap: 20 }}>
          {[
            { label: 'Candidates', value: preview?.candidates_found, color: 'var(--accent-cyan)' },
            { label: 'Net to Invite', value: preview?.net_to_invite, color: 'var(--accent-emerald)' },
            { label: 'Quota Left', value: preview?.daily_quota_remaining, color: 'var(--accent-amber)' },
          ].map(stat => (
            <div key={stat.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: stat.color, fontFamily: 'var(--font-mono)', minWidth: 52 }}>
                {previewLoading ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : (stat.value ?? '—')}
              </div>
              <div style={{ fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', fontFamily: 'var(--font-mono)', marginTop: 2 }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Invite All button */}
        {!result && (
          <button
            className="btn-primary"
            disabled={previewLoading || netToInvite === 0}
            onClick={() => setShowConfirm(v => !v)}
            style={{ padding: '10px 22px', fontFamily: 'var(--font-mono)', fontSize: 12, whiteSpace: 'nowrap' }}
          >
            <Users size={13} />
            Invite {netToInvite > 0 ? netToInvite : 'All'}
            {showConfirm ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          </button>
        )}
      </div>

      {/* Anti-Spam Skip Breakdown */}
      {preview && !previewLoading && (
        <div style={{
          display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14,
          padding: '10px 14px',
          background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)',
          borderRadius: 0,
        }}>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 0.5, marginRight: 4, alignSelf: 'center' }}>Anti-Spam Filters:</span>
          {[
            { icon: <XCircle size={10} />, label: 'Duplicate', value: preview.already_invited, color: 'var(--text-muted)' },
            { icon: <Shield size={10} />, label: '14d Cooldown', value: preview.cooldown_skipped, color: '#fb923c' },
            { icon: <ShieldCheck size={10} />, label: 'Opted Out', value: preview.opted_out_skipped, color: 'var(--accent-amber)' },
          ].map(item => (
            <div key={item.label} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'rgba(255,255,255,0.03)', borderRadius: 0, padding: '4px 10px',
              color: item.color, fontSize: 11, fontFamily: 'var(--font-mono)',
            }}>
              {item.icon}
              <span style={{ color: 'var(--text-secondary)' }}>{item.label}:</span>
              <strong>{item.value}</strong>
            </div>
          ))}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5, marginLeft: 'auto',
            fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--accent-emerald)',
          }}>
            <TrendingUp size={10} />
            <span>Expected Response:</span>
            <strong>{preview.estimated_response_rate}%</strong>
          </div>
        </div>
      )}

      {/* Success Banner */}
      {result && (
        <div style={{
          background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.3)',
          borderRadius: 0, padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <CheckCircle2 size={20} color="var(--accent-emerald)" style={{ marginTop: 1, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: 'var(--accent-emerald)', fontSize: 14, marginBottom: 4 }}>
              {result.invited_count} Invitations Sent Successfully
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              <span>Duplicates skipped: <strong>{result.skipped_duplicates}</strong></span>
              <span>Cooldown skipped: <strong>{result.skipped_cooldown}</strong></span>
              <span>Opted-out skipped: <strong>{result.skipped_opt_out}</strong></span>
              {result.skipped_daily_limit > 0 && <span style={{ color: '#fb923c' }}>Daily limit hit: <strong>{result.skipped_daily_limit}</strong></span>}
              <span>Time: <strong>{result.processing_time_ms}ms</strong></span>
            </div>
          </div>
          <button
            onClick={() => setResult(null)}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}
          >×</button>
        </div>
      )}

      {/* Confirmation Sheet */}
      {showConfirm && preview && !result && (
        <div style={{
          marginTop: 16,
          background: 'rgba(15,23,42,0.85)',
          border: '1px solid var(--glass-border)',
          borderRadius: 0,
          padding: '20px 22px',
        }}>
          <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 16, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Confirm — Review Before Sending
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10, marginBottom: 18 }}>
            {[
              { label: 'Match Threshold', value: `${threshold}%`, color: thresholdColor },
              { label: 'Net Invitations', value: preview.net_to_invite, color: 'var(--accent-cyan)' },
              { label: 'Duplicate Skips', value: preview.already_invited === 0 ? 'None' : preview.already_invited, color: 'var(--text-muted)' },
              { label: 'Cooldown Skips', value: preview.cooldown_skipped === 0 ? 'None' : preview.cooldown_skipped, color: '#fb923c' },
              { label: 'Opted-Out Skips', value: preview.opted_out_skipped === 0 ? 'None' : preview.opted_out_skipped, color: 'var(--accent-amber)' },
              { label: 'Daily Quota Left', value: preview.daily_quota_remaining, color: 'var(--accent-emerald)' },
              { label: 'Expected Apply Rate', value: `${preview.estimated_response_rate}%`, color: 'var(--accent-amber)' },
              { label: 'Est. Processing', value: `~${preview.estimated_processing_seconds}s`, color: 'var(--text-secondary)' },
            ].map(row => (
              <div key={row.label} style={{
                background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)',
                borderRadius: 0, padding: '10px 12px',
              }}>
                <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', marginBottom: 4, letterSpacing: 0.5 }}>{row.label}</div>
                <div style={{ fontSize: 15, fontWeight: 700, color: row.color }}>{row.value}</div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.65, fontStyle: 'italic', borderLeft: '2px solid rgba(251,191,36,0.4)', paddingLeft: 12 }}>
            Students will receive: "{internshipTitle} — {`Your company believes your profile is an excellent match and has invited you to apply.`}"
          </div>

          {sendError && (
            <div style={{ color: '#FDA4AF', fontSize: 12, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <AlertTriangle size={13} /> {sendError}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn-primary"
              onClick={handleSend}
              disabled={sending}
              style={{ padding: '10px 24px', fontFamily: 'var(--font-mono)', fontSize: 13 }}
            >
              {sending
                ? <><Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> Sending…</>
                : <><Users size={13} /> Invite {preview.net_to_invite} Students</>
              }
            </button>
            <button
              className="btn-secondary"
              onClick={() => setShowConfirm(false)}
              disabled={sending}
              style={{ padding: '10px 16px', fontSize: 12 }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Module 10 — Outreach Health Panel
// ---------------------------------------------------------------------------
function OutreachHealthPanel() {
  const [health, setHealth] = useState<OutreachHealth | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getOutreachHealth()
      .then(setHealth)
      .catch(() => setHealth(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="glass-card" style={{ padding: '16px 24px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-muted)', fontSize: 13 }}>
      <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> Loading outreach health…
    </div>
  );
  if (!health) return null;

  const statusConfig = {
    HEALTHY: { color: 'var(--accent-emerald)', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.3)', icon: <ThumbsUp size={16} />, label: 'HEALTHY' },
    NEEDS_IMPROVEMENT: { color: 'var(--accent-amber)', bg: 'rgba(251,191,36,0.08)', border: 'rgba(251,191,36,0.3)', icon: <Info size={16} />, label: 'NEEDS IMPROVEMENT' },
    POOR_CONVERSION_WARN: { color: '#f87171', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.3)', icon: <AlertCircle size={16} />, label: 'POOR CONVERSION' },
  };
  const cfg = statusConfig[health.quality_status];
  const usedPct = health.daily_outreach_limit > 0 ? Math.round((health.invites_sent_today / health.daily_outreach_limit) * 100) : 0;

  return (
    <div className="glass-card" style={{
      padding: '20px 24px', marginBottom: 20,
      border: `1px solid ${cfg.border}`,
      background: cfg.bg,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <Shield size={18} color={cfg.color} />
        <span style={{ fontWeight: 700, fontSize: 14, fontFamily: 'var(--font-mono)', color: cfg.color, textTransform: 'uppercase', letterSpacing: 0.5 }}>
          AI Outreach Quality Monitor
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: 0, fontFamily: 'var(--font-mono)' }}>Module 10</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: cfg.color, background: cfg.bg, border: `1px solid ${cfg.border}`, padding: '3px 10px', borderRadius: 0, fontFamily: 'var(--font-mono)', display: 'flex', alignItems: 'center', gap: 6 }}>
          {cfg.icon} {cfg.label}
        </span>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Total Sent', value: health.total_invitations_sent, color: 'var(--text-primary)' },
          { label: 'Accepted', value: health.total_invitations_accepted, color: 'var(--accent-emerald)' },
          { label: 'Accept Rate', value: `${health.acceptance_rate}%`, color: cfg.color },
          { label: 'Sent Today', value: health.invites_sent_today, color: 'var(--accent-cyan)' },
          { label: 'Daily Remaining', value: health.daily_invites_remaining, color: usedPct >= 80 ? '#fb923c' : 'var(--accent-emerald)' },
          { label: 'Daily Limit', value: health.daily_outreach_limit, color: 'var(--text-secondary)' },
        ].map(stat => (
          <div key={stat.label} style={{
            background: 'rgba(255,255,255,0.03)', border: '1px solid var(--glass-border)',
            borderRadius: 0, padding: '10px 14px',
          }}>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{stat.label}</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: stat.color, fontFamily: 'var(--font-mono)' }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Daily usage bar */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginBottom: 5 }}>
          <span>Daily Outreach Usage</span>
          <span>{usedPct}% used</span>
        </div>
        <div style={{ height: 6, background: 'rgba(255,255,255,0.08)', borderRadius: 0, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 0, transition: 'width 0.6s ease',
            width: `${Math.min(usedPct, 100)}%`,
            background: usedPct >= 80 ? 'linear-gradient(90deg,#fb923c,#ef4444)' : usedPct >= 50 ? 'linear-gradient(90deg,#fbbf24,#f59e0b)' : 'linear-gradient(90deg,var(--accent-cyan),var(--accent-emerald))',
          }} />
        </div>
      </div>

      {/* AI Recommendation */}
      <div style={{
        borderLeft: `3px solid ${cfg.color}`, paddingLeft: 14,
        fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6,
      }}>
        <div style={{ fontSize: 10, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 4, letterSpacing: 0.5 }}>AI Recommendation</div>
        {health.quality_recommendation}
        {health.quality_status !== 'HEALTHY' && (
          <div style={{ marginTop: 6, fontSize: 11, color: cfg.color, fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
            → Suggested threshold: {health.recommended_threshold}%
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Two-tab split: this page used to show applicants (people who applied)
// and AI-sourced non-applicants (people who match but never applied) in one
// flat list, distinguished only by a small "APPLIED"/"UNTAPPED" badge --
// which read as confusing/contradictory ("why are applied and untapped on
// the same page?"). These are two different recruiter tasks: reviewing who
// applied vs. proactively discovering + inviting who didn't. Splitting them
// into explicit tabs makes each list's meaning self-evident from the tab
// label alone, no badge-reading required.
type CandidateTab = 'applicants' | 'discover';

export default function CandidatesPage() {
  const [internships, setInternships] = useState<RealInternship[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [candidates, setCandidates] = useState<SourcedCandidate[]>([]);
  const [loadingInternships, setLoadingInternships] = useState(true);
  const [loadingCandidates, setLoadingCandidates] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [minCgpa, setMinCgpa] = useState('');
  const [activeTab, setActiveTab] = useState<CandidateTab>('applicants');
  const [showFilters, setShowFilters] = useState(false);
  const [degreeFilter, setDegreeFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [skillsFilter, setSkillsFilter] = useState('');
  const [matchThreshold, setMatchThreshold] = useState('');
  const [onlyVerified, setOnlyVerified] = useState(false);
  const [hasAptitudeBadge, setHasAptitudeBadge] = useState(false);
  const [minConfidence, setMinConfidence] = useState<'' | 'High' | 'Medium' | 'Low'>('');

  // Debounced (400ms) counterparts of the free-text/numeric filter inputs --
  // these, not the raw state above, feed loadCandidates, so a real sourcing
  // request only fires once typing pauses instead of on every keystroke.
  // Toggles (onlyVerified) and the confidence dropdown are discrete single
  // actions, not per-keystroke, so they stay instant.
  const debouncedMinCgpa = useDebouncedValue(minCgpa, 400);
  const debouncedDegreeFilter = useDebouncedValue(degreeFilter, 400);
  const debouncedLocationFilter = useDebouncedValue(locationFilter, 400);
  const debouncedSkillsFilter = useDebouncedValue(skillsFilter, 400);
  const debouncedMatchThreshold = useDebouncedValue(matchThreshold, 400);

  useEffect(() => {
    const load = async () => {
      setLoadingInternships(true);
      try {
        const data = await getMyRealInternships();
        setInternships(data);
        setSelectedId(prev => prev || (data.length > 0 ? data[0].id : ''));
      } catch {
        setError('Could not load your posted internships.');
      }
      setLoadingInternships(false);
    };
    load();
  }, []);

  const loadCandidates = useCallback(async (internshipId: string) => {
    if (!internshipId) return;
    setLoadingCandidates(true);
    setError('');
    try {
      const data = await getSourcedCandidatesReal(internshipId, {
        topK: 25,
        minCgpa: debouncedMinCgpa.trim() ? parseFloat(debouncedMinCgpa) : undefined,
        degree: debouncedDegreeFilter.trim() || undefined,
        location: debouncedLocationFilter.trim() || undefined,
        skills: debouncedSkillsFilter.trim() ? debouncedSkillsFilter.split(',').map(s => s.trim()).filter(Boolean) : undefined,
        matchThreshold: debouncedMatchThreshold.trim() ? parseFloat(debouncedMatchThreshold) : undefined,
        onlyVerified: onlyVerified || undefined,
        hasAptitudeBadge: hasAptitudeBadge || undefined,
        minConfidence: minConfidence || undefined,
      });
      setCandidates(data);
    } catch (e: any) {
      setError(e?.message || 'Could not source candidates for this internship.');
      setCandidates([]);
    }
    setLoadingCandidates(false);
  }, [debouncedMinCgpa, debouncedDegreeFilter, debouncedLocationFilter, debouncedSkillsFilter, debouncedMatchThreshold, onlyVerified, hasAptitudeBadge, minConfidence]);

  useEffect(() => {
    if (selectedId) loadCandidates(selectedId);
  }, [selectedId, loadCandidates]);

  const selectedInternship = internships.find(i => i.id === selectedId);

  // Aptitude Check toggle -- previously this could only be set once, right
  // after posting a brand new internship (the post-internship page held
  // realInternshipId in local state that reset on refresh/navigation, so
  // there was no way back in for internships posted in an earlier session).
  // Living here instead, keyed off the internship already selected in this
  // picker, means it works for any internship at any time.
  const [aptitudeSaving, setAptitudeSaving] = useState(false);
  const [aptitudeError, setAptitudeError] = useState('');
  const [aptitudeDifficulty, setAptitudeDifficulty] = useState<'easy' | 'medium' | 'hard'>('hard');

  useEffect(() => {
    if (selectedInternship?.aptitude_difficulty) {
      setAptitudeDifficulty(selectedInternship.aptitude_difficulty as 'easy' | 'medium' | 'hard');
    }
    setAptitudeError('');
  }, [selectedId, selectedInternship?.aptitude_difficulty]);

  const handleToggleAptitude = async (enabled: boolean) => {
    if (!selectedId) return;
    setAptitudeSaving(true);
    setAptitudeError('');
    try {
      await updateAptitudeCheck(selectedId, enabled, aptitudeDifficulty);
      setInternships(prev => prev.map(i => i.id === selectedId ? { ...i, aptitude_check_enabled: enabled, aptitude_difficulty: aptitudeDifficulty } : i));
    } catch (e: any) {
      setAptitudeError(e?.message || 'Could not update Aptitude Check.');
    }
    setAptitudeSaving(false);
  };

  const activeFilterCount = [
    degreeFilter.trim(), locationFilter.trim(), skillsFilter.trim(),
    matchThreshold.trim(), onlyVerified ? '1' : '', hasAptitudeBadge ? '1' : '', minConfidence,
  ].filter(Boolean).length;

  // Tab split happens first -- Applicants tab only ever shows people who
  // applied, Discover tab only ever shows people who didn't. Search/CGPA
  // then narrow further within whichever tab is active.
  const applicants = candidates.filter(c => c.already_applied);
  const discoverable = candidates.filter(c => !c.already_applied);
  const tabCandidates = activeTab === 'applicants' ? applicants : discoverable;

  const filtered = tabCandidates.filter(c => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.full_name.toLowerCase().includes(q) ||
      (c.degree || '').toLowerCase().includes(q) ||
      (c.college || '').toLowerCase().includes(q) ||
      c.skills.some(s => s.toLowerCase().includes(q))
    );
  });

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8, fontFamily: 'var(--font-serif)' }}>
          <Sparkles size={28} style={{ marginRight: 10, verticalAlign: 'middle', color: 'var(--accent-cyan)' }} />
          Candidates
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 13, textTransform: 'uppercase' }}>
          Review who applied, or let the AI Sourcing Agent surface strong matches who haven't applied yet
        </p>
      </div>

      {loadingInternships ? (
        <div className="glass-card" style={{ padding: '64px 24px', textAlign: 'center' }}>
          <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', opacity: 0.5, marginBottom: 12 }} />
        </div>
      ) : internships.length === 0 ? (
        <div className="glass-card" style={{ padding: '64px 24px', textAlign: 'center' }}>
          <Briefcase size={48} style={{ opacity: 0.3, marginBottom: 16 }} />
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8, fontFamily: 'var(--font-serif)' }}>No Posted Internships Found</h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: 450, margin: '0 auto 24px', fontSize: 14 }}>
            Post an internship position first — the Sourcing Agent ranks every student on NexYuva against it,
            not just the ones who apply.
          </p>
          <Link href="/company/post-internship" className="btn-primary" style={{ padding: '10px 20px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
            <Plus size={14} /> Post Internship Position
          </Link>
        </div>
      ) : (
        <div>
          {/* Controls */}
          <div className="glass-card" style={{ padding: 16, marginBottom: 20, display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ flex: 2, minWidth: 240 }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>Select Internship Position</label>
              <select className="select-field" value={selectedId} onChange={e => setSelectedId(e.target.value)}>
                {internships.map(i => (
                  <option key={i.id} value={i.id}>{i.title} ({i.location} · {i.work_mode})</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 2, minWidth: 240 }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>Search Candidates</label>
              <div style={{ position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: 12, top: 12, color: 'var(--text-muted)' }} />
                <input className="input-field" placeholder="Search by name, college, skill..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ paddingLeft: 36 }} />
              </div>
            </div>
            <div style={{ width: 120 }}>
              <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>Min CGPA</label>
              <input className="input-field" type="number" step="0.1" min="0" max="10" placeholder="Any" value={minCgpa} onChange={e => setMinCgpa(e.target.value)} />
            </div>
            <button
              className={showFilters || activeFilterCount > 0 ? 'btn-primary' : 'btn-secondary'}
              onClick={() => setShowFilters(v => !v)}
              style={{ padding: '10px 16px', fontSize: 12, whiteSpace: 'nowrap' }}
              title="More recruiter filters"
            >
              <Filter size={14} /> Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
            </button>
            <button
              className="btn-secondary"
              onClick={() => loadCandidates(selectedId)}
              style={{ padding: '10px 12px' }}
              title="Re-run sourcing"
            >
              <RefreshCw size={14} style={loadingCandidates ? { animation: 'spin 1s linear infinite' } : undefined} />
            </button>
          </div>

          {selectedInternship && (
            <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: 16, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                <BrainCircuit size={16} color="var(--accent-cyan)" /> Aptitude Check
              </div>
              <select
                value={aptitudeDifficulty}
                onChange={e => setAptitudeDifficulty(e.target.value as 'easy' | 'medium' | 'hard')}
                disabled={aptitudeSaving}
                className="select-field"
                style={{ fontSize: 12, padding: '4px 8px', width: 110 }}
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
              {selectedInternship.aptitude_check_enabled ? (
                <>
                  <span style={{ fontSize: 12, color: '#4AAA82', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <CheckCircle2 size={14} /> Active for {selectedInternship.title} at {aptitudeDifficulty} difficulty
                  </span>
                  <button className="btn-secondary" onClick={() => handleToggleAptitude(false)} disabled={aptitudeSaving} style={{ fontSize: 11, padding: '5px 12px' }}>
                    {aptitudeSaving ? <Loader2 size={12} className="animate-spin" /> : 'Disable'}
                  </button>
                </>
              ) : (
                <button className="btn-primary" onClick={() => handleToggleAptitude(true)} disabled={aptitudeSaving} style={{ fontSize: 11, padding: '6px 14px' }}>
                  {aptitudeSaving ? <Loader2 size={12} className="animate-spin" /> : `Enable for ${selectedInternship.title}`}
                </button>
              )}
              {aptitudeError && <div style={{ fontSize: 12, color: 'var(--accent-rose)', width: '100%' }}>{aptitudeError}</div>}
            </div>
          )}

          {/* Tabs — this is the fix: Applicants and Discover are now two
              distinct views instead of one merged list with a status badge
              as the only thing telling them apart. */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, borderBottom: '1px solid var(--glass-border)' }}>
            <button
              onClick={() => setActiveTab('applicants')}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '12px 18px', background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: activeTab === 'applicants' ? '2px solid var(--accent-cyan)' : '2px solid transparent',
                color: activeTab === 'applicants' ? 'var(--text-primary)' : 'var(--text-muted)',
                fontWeight: activeTab === 'applicants' ? 700 : 500, fontSize: 14, fontFamily: 'var(--font-mono)',
                marginBottom: -1,
              }}
            >
              <ClipboardList size={16} /> Applicants
              <span style={{ fontSize: 11, background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', borderRadius: 0, padding: '1px 8px' }}>
                {applicants.length}
              </span>
            </button>
            <button
              onClick={() => setActiveTab('discover')}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '12px 18px', background: 'none', border: 'none', cursor: 'pointer',
                borderBottom: activeTab === 'discover' ? '2px solid var(--accent-cyan)' : '2px solid transparent',
                color: activeTab === 'discover' ? 'var(--text-primary)' : 'var(--text-muted)',
                fontWeight: activeTab === 'discover' ? 700 : 500, fontSize: 14, fontFamily: 'var(--font-mono)',
                marginBottom: -1,
              }}
            >
              <Compass size={16} /> Discover Matches
              <span style={{ fontSize: 11, background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', borderRadius: 0, padding: '1px 8px' }}>
                {discoverable.length}
              </span>
            </button>
          </div>

          {activeTab === 'applicants' ? (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: -12, marginBottom: 20, fontFamily: 'var(--font-mono)' }}>
              Students who applied to this internship through the normal flow — applied, shortlisted, interviewed, or hired.
            </p>
          ) : (
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: -12, marginBottom: 20, fontFamily: 'var(--font-mono)' }}>
              Students on NexYuva who match this posting well but haven't applied — the AI Sourcing Agent surfaces them here so you can invite them.
            </p>
          )}

          {showFilters && (
            <div className="glass-card" style={{ padding: 16, marginBottom: 24, display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ width: 180 }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>Degree</label>
                <input className="input-field" placeholder="e.g. Computer Science" value={degreeFilter} onChange={e => setDegreeFilter(e.target.value)} />
              </div>
              <div style={{ width: 160 }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>Location</label>
                <input className="input-field" placeholder="e.g. Bangalore" value={locationFilter} onChange={e => setLocationFilter(e.target.value)} />
              </div>
              <div style={{ flex: 1, minWidth: 220 }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>Must Have Skills</label>
                <input className="input-field" placeholder="comma-separated, e.g. python, react" value={skillsFilter} onChange={e => setSkillsFilter(e.target.value)} />
              </div>
              <div style={{ width: 160 }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>Match Threshold %</label>
                <input className="input-field" type="number" min="0" max="100" placeholder="Any" value={matchThreshold} onChange={e => setMatchThreshold(e.target.value)} />
              </div>
              <div style={{ width: 160 }}>
                <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>Min Confidence</label>
                <select className="select-field" value={minConfidence} onChange={e => setMinConfidence(e.target.value as any)}>
                  <option value="">Any</option>
                  <option value="Low">Low+</option>
                  <option value="Medium">Medium+</option>
                  <option value="High">High only</option>
                </select>
              </div>
              <button
                className={onlyVerified ? 'btn-primary' : 'btn-secondary'}
                onClick={() => setOnlyVerified(v => !v)}
                style={{ padding: '10px 16px', fontSize: 12, whiteSpace: 'nowrap' }}
                title="LinkedIn-verified profiles only"
              >
                <ShieldCheck size={14} /> Verified only
              </button>
              <button
                className={hasAptitudeBadge ? 'btn-primary' : 'btn-secondary'}
                onClick={() => setHasAptitudeBadge(v => !v)}
                style={{ padding: '10px 16px', fontSize: 12, whiteSpace: 'nowrap' }}
                title="Only candidates who earned the Aptitude Check badge for this internship"
              >
                <BrainCircuit size={14} /> Aptitude badge
              </button>
              {activeFilterCount > 0 && (
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setDegreeFilter(''); setLocationFilter(''); setSkillsFilter('');
                    setMatchThreshold(''); setOnlyVerified(false); setHasAptitudeBadge(false); setMinConfidence('');
                  }}
                  style={{ padding: '10px 16px', fontSize: 12, whiteSpace: 'nowrap' }}
                >
                  Clear filters
                </button>
              )}
            </div>
          )}

          {/* Discover-only tools: these two panels are specifically about
              reaching out to students who haven't applied, so they only
              make sense in the Discover tab -- showing them under Applicants
              (people already in your pipeline) was part of the confusion. */}
          {activeTab === 'discover' && (
            <>
              <OutreachHealthPanel />
              {selectedId && selectedInternship && (
                <SmartBulkInvitePanel internshipId={selectedId} internshipTitle={selectedInternship.title} />
              )}
            </>
          )}

          {error && (
            <div className="glass-card" style={{ padding: 16, marginBottom: 20, borderColor: 'rgba(244,63,94,0.3)', color: '#FDA4AF', fontSize: 13 }}>
              {error}
            </div>
          )}

          {loadingCandidates ? (
            <div className="glass-card" style={{ padding: '64px 24px', textAlign: 'center' }}>
              <Loader2 size={32} style={{ animation: 'spin 1s linear infinite', opacity: 0.5, marginBottom: 12 }} />
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Ranking your student pool against this posting…</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="glass-card" style={{ padding: '64px 24px', textAlign: 'center' }}>
              <Users size={40} style={{ opacity: 0.3, marginBottom: 16 }} />
              <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8, fontFamily: 'var(--font-serif)' }}>
                {activeTab === 'applicants' ? 'No One Has Applied Yet' : 'No New Matches Found'}
              </h3>
              <p style={{ color: 'var(--text-secondary)', maxWidth: 460, margin: '0 auto', fontSize: 13 }}>
                {activeTab === 'applicants'
                  ? 'Once students apply to this internship, they\'ll show up here. In the meantime, check the Discover Matches tab to invite good-fit students.'
                  : candidates.length === 0
                    ? `No students on NexYuva currently match "${selectedInternship?.title}" closely enough to rank. Try lowering the minimum CGPA filter.`
                    : 'Try clearing your search, minimum CGPA, or other filters.'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filtered.map(candidate => (
                <CandidateCard key={candidate.student_id} candidate={candidate} internshipId={selectedId} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function getStatusDetails(alreadyApplied: boolean, status: string | null) {
  if (!alreadyApplied) {
    return {
      label: 'NOT APPLIED',
      meaning: 'This student has never applied for this internship.',
      badgeClass: 'badge-emerald',
    };
  }
  const s = (status || '').toLowerCase();
  if (s.includes('hired')) {
    return {
      label: 'HIRED',
      meaning: 'Candidate has been hired for this position.',
      badgeClass: 'badge-emerald',
    };
  }
  if (s.includes('interview')) {
    return {
      label: 'INTERVIEW SCHEDULED',
      meaning: 'Interview session scheduled with this candidate.',
      badgeClass: 'badge-primary',
    };
  }
  if (s.includes('shortlist')) {
    return {
      label: 'SHORTLISTED',
      meaning: 'Candidate has been shortlisted by the recruiter.',
      badgeClass: 'badge-amber',
    };
  }
  return {
    label: 'APPLIED',
    meaning: 'Student applied for this internship position.',
    badgeClass: 'badge-cyan',
  };
}



function CandidateCard({ candidate, internshipId }: { candidate: SourcedCandidate; internshipId: string }) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showScreening, setShowScreening] = useState(false);
  const [screeningLoading, setScreeningLoading] = useState(false);
  const [screeningResult, setScreeningResult] = useState<ScreeningResult | null>(null);
  const [screeningError, setScreeningError] = useState('');

  const breakdown = getOrComputeScoreBreakdown(candidate);
  const scorePct = breakdown.overall_score || Math.round(candidate.final_score * 100);
  const scoreColor = scorePct >= 80 ? 'var(--accent-emerald)' : scorePct >= 60 ? 'var(--accent-amber)' : 'var(--accent-rose)';
  const eduLine = [candidate.degree, candidate.branch].filter(Boolean).join(' ');
  const statusInfo = getStatusDetails(candidate.already_applied, candidate.application_status);

  const handleRunScreening = async () => {
    if (screeningResult) {
      setShowScreening(v => !v);
      return;
    }
    setScreeningLoading(true);
    setScreeningError('');
    setShowScreening(true);
    try {
      const res = await screenCandidateReal(internshipId, candidate.student_id);
      setScreeningResult(res);
    } catch (e: any) {
      setScreeningError(e?.message || 'Failed to complete deep AI screening.');
    } finally {
      setScreeningLoading(false);
    }
  };

  const breakdownFactors = [
    { label: 'Skill Match', weight: '40%', value: breakdown.skill_match, color: '#10B981' },
    { label: 'Project Relevance', weight: '25%', value: breakdown.project_relevance, color: '#3B82F6' },
    { label: 'Education Match', weight: '10%', value: breakdown.education_match, color: '#8B5CF6' },
    { label: 'Resume Similarity', weight: '10%', value: breakdown.resume_similarity, color: '#F59E0B' },
    { label: 'Verified Skills', weight: '10%', value: breakdown.verified_skills, color: '#06B6D4' },
    { label: 'Location Preference', weight: '5%', value: breakdown.location_preference, color: '#EC4899' },
  ];

  return (
    <div className="glass-card" style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        {/* Left Column: AI Compatibility Score Ring */}
        <div style={{ flexShrink: 0, textAlign: 'center', paddingTop: 4 }}>
          <div style={{
            width: 72, height: 72,
            borderRadius: '50%',
            background: `conic-gradient(${scoreColor} ${scorePct * 3.6}deg, var(--bg-elevated) 0deg)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 3,
            boxShadow: `0 0 18px ${scoreColor}22`,
            margin: '0 auto',
          }}>
            <div style={{
              width: '100%', height: '100%', borderRadius: '50%', background: 'var(--bg-card)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              fontWeight: 700, fontFamily: 'var(--font-mono)', color: scoreColor,
            }}>
              <span style={{ fontSize: 16, lineHeight: 1.1 }}>{scorePct}%</span>
              <span style={{ fontSize: 7, opacity: 0.8, fontWeight: 500 }}>COMPATIBILITY</span>
            </div>
          </div>
          {!candidate.already_applied && (
            <div style={{ fontSize: 9, color: 'var(--accent-emerald)', marginTop: 6, fontWeight: 700, letterSpacing: 0.5, fontFamily: 'var(--font-mono)' }}>NEW MATCH</div>
          )}
        </div>

        {/* Content Header & Candidate Transparency Attributes */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Header Line: Name & Status Badge with Meaning */}
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6, gap: 12 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 2 }}>{candidate.full_name}</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <GraduationCap size={14} color="var(--accent-cyan)" />
                <strong style={{ color: 'var(--text-primary)' }}>{candidate.college || 'College not specified'}</strong>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {eduLine || 'Degree not specified'}
                {candidate.year != null && <> · Year {candidate.year}</>}
                {candidate.cgpa != null && <> · CGPA {candidate.cgpa}</>}
              </div>
            </div>

            {/* Current Status & Meaning */}
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              {/* Status chip and Aptitude badge sit side-by-side in one row
                  (not stacked) so this column doesn't grow taller than the
                  name/education column on the left and leave a blank gap. */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                {candidate.has_aptitude_badge && (
                  <img
                    src="/apptitude.png"
                    alt="Aptitude Check - Stand-Out, Verified Achievement"
                    title={
                      candidate.aptitude_score != null
                        ? `Aptitude Check: ${Math.round(candidate.aptitude_score)}% raw score${candidate.aptitude_percentile != null ? `, ${Math.round(candidate.aptitude_percentile)}th percentile` : ''} for this internship`
                        : 'Earned the Aptitude Check badge for this internship'
                    }
                    style={{ width: 90, filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.35))' }}
                  />
                )}
                <span className={`badge ${statusInfo.badgeClass}`} style={{ fontSize: 9, whiteSpace: 'nowrap' }}>
                  <CheckCircle2 size={10} /> {statusInfo.label}
                </span>
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, fontFamily: 'var(--font-mono)', maxWidth: 180, lineHeight: 1.3 }}>
                {statusInfo.meaning}
              </div>
              {!candidate.has_aptitude_badge && candidate.aptitude_score != null && (
                <div
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--text-muted)', marginTop: 6, fontFamily: 'var(--font-mono)' }}
                  title="Attempted the Aptitude Check for this internship but didn't clear the bar for a badge"
                >
                  <BrainCircuit size={11} /> Aptitude {Math.round(candidate.aptitude_score)}%
                </div>
              )}
            </div>
          </div>

          {/* Confidence Score & Verification Indicators */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
            <ShieldCheck size={14} color={CONFIDENCE_COLOR[candidate.recommendation_confidence.level]} />
            <span style={{ fontSize: 11, fontWeight: 700, color: CONFIDENCE_COLOR[candidate.recommendation_confidence.level] }}>
              {candidate.recommendation_confidence.level} Confidence Score
            </span>
            <span
              style={{ fontSize: 10, color: 'var(--text-muted)', cursor: 'default' }}
              title={`Profile completeness: ${candidate.recommendation_confidence.profile_completeness}% · ${candidate.recommendation_confidence.verified_skills_count} skills · GitHub ${candidate.recommendation_confidence.github_connected ? 'connected' : 'not connected'} · Assessment ${candidate.recommendation_confidence.assessment_completed ? 'passed' : 'not taken'}`}
            >
              (based on verified skills &amp; profile completeness)
            </span>

            {candidate.location && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
                <MapPin size={11} /> {candidate.location}
              </div>
            )}
            {candidate.github_username && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)' }}>
                <GitBranch size={11} /> GitHub {candidate.github_score != null ? Math.round(candidate.github_score) : '—'}
              </div>
            )}
            {candidate.linkedin_verified && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--accent-cyan)' }}>
                <Globe size={11} /> Verified LinkedIn
              </div>
            )}
            {candidate.stand_out_badge && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--accent-emerald)' }} title="Passed the Stand-Out Interview for this internship">
                <ShieldCheck size={11} /> Stand-Out Badge
              </div>
            )}
          </div>

          {/* Matched Skills */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-emerald)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', marginBottom: 4 }}>
              Matched Skills
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {candidate.matched_skills.map(skill => (
                <span key={skill} className="tag matched" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ fontWeight: 700 }}>✓</span> {skill}
                </span>
              ))}
              {candidate.matched_skills.length === 0 && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>No required skills matched</span>
              )}
            </div>
          </div>

          {/* Missing Skills */}
          {candidate.missing_skills.length > 0 && (
            <div style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent-rose)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', marginBottom: 4 }}>
                Missing
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {candidate.missing_skills.map(skill => (
                  <span key={skill} className="tag missing" style={{ fontSize: 11 }}>
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Enterprise-grade AI Compatibility Score Breakdown & Module 2 Screening Toggles */}
      <div style={{
        borderTop: '1px dashed var(--glass-border)',
        paddingTop: 12,
        marginTop: 4,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        flexWrap: 'wrap',
      }}>
        <button
          type="button"
          onClick={() => setShowBreakdown(v => !v)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--accent-cyan)',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            fontWeight: 600,
            fontFamily: 'var(--font-mono)',
            padding: 0,
          }}
        >
          <BarChart2 size={14} />
          {showBreakdown ? 'Hide Compatibility Breakdown' : 'View Compatibility Breakdown'}
          {showBreakdown ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        <button
          type="button"
          onClick={handleRunScreening}
          className={showScreening ? 'btn-primary' : 'btn-secondary'}
          style={{
            padding: '6px 14px',
            fontSize: 11,
            fontFamily: 'var(--font-mono)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            borderRadius: 4,
          }}
        >
          {screeningLoading ? (
            <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
          ) : (
            <BrainCircuit size={13} color="var(--accent-amber)" />
          )}
          {showScreening ? 'Hide AI Note' : 'Get AI Fit Note'}
        </button>
      </div>

      {showBreakdown && (
        <div style={{
          marginTop: 12,
          padding: 16,
          background: 'rgba(15, 23, 42, 0.6)',
          border: '1px solid var(--glass-border)',
          borderRadius: 0,
          fontFamily: 'var(--font-mono)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              AI Compatibility Score
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: scoreColor }}>
              {scorePct}%
            </div>
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12, borderBottom: '1px dotted var(--glass-border)', paddingBottom: 6 }}>
            Breakdown (Deterministic Local Computation)
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {breakdownFactors.map(factor => (
              <div key={factor.label} style={{ fontSize: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {factor.label} <span style={{ opacity: 0.6, fontSize: 11 }}>({factor.weight})</span>
                  </span>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>
                    {factor.value}%
                  </span>
                </div>
                {/* Progress Bar */}
                <div style={{
                  height: 5,
                  width: '100%',
                  background: 'var(--bg-elevated)',
                  borderRadius: 3,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    width: `${factor.value}%`,
                    background: factor.color,
                    borderRadius: 3,
                    transition: 'width 0.4s ease',
                  }} />
                </div>
              </div>
            ))}
          </div>

          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 14, lineHeight: 1.4 }}>
            * Calculated locally via deterministic scoring algorithms. The LLM is solely responsible for generating qualitative explanations.
          </div>
        </div>
      )}

      {/* AI fit note -- deliberately NOT a bordered "report" panel with its own header/button
          ceremony. It adds exactly one thing the Compatibility card above can't: a short,
          resume-derived quality/depth signal. It must never re-show skill names -- see
          screening_agent.py module docstring for why that was tried twice and cut both times. */}
      {showScreening && (
        <div style={{
          marginTop: 10,
          padding: '10px 12px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--glass-border)',
          borderRadius: 0,
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
        }}>
          {screeningLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)' }}>
              <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} />
              Reading resume for fit notes…
            </div>
          ) : screeningError ? (
            <div style={{ color: 'var(--accent-rose)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <XCircle size={13} /> {screeningError}
            </div>
          ) : screeningResult ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 4,
                    textTransform: 'uppercase',
                    color: screeningResult.next_action === 'advance' ? 'var(--accent-emerald)' : screeningResult.next_action === 'reject' ? 'var(--accent-rose)' : 'var(--accent-amber)',
                    border: `1px solid ${screeningResult.next_action === 'advance' ? 'var(--accent-emerald)' : screeningResult.next_action === 'reject' ? 'var(--accent-rose)' : 'var(--accent-amber)'}`,
                  }}
                >
                  {screeningResult.fit_score}% · {screeningResult.next_action_label}
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button disabled title="Pipeline automation coming soon" style={{ fontSize: 9, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'not-allowed' }}>Reject</button>
                  <button disabled title="Pipeline automation coming soon" style={{ fontSize: 9, padding: '3px 8px', borderRadius: 4, border: '1px solid var(--glass-border)', background: 'transparent', color: 'var(--text-muted)', cursor: 'not-allowed' }}>Move to Aptitude</button>
                </div>
              </div>
              <div style={{ color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                {screeningResult.rationale}
              </div>
              {screeningResult.needs_manual_review && (
                <div style={{ color: 'var(--accent-amber)', display: 'flex', alignItems: 'center', gap: 6, fontSize: 10 }}>
                  <AlertTriangle size={12} /> Resume text was minimal — manual review recommended.
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
