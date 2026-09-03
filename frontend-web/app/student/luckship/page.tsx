'use client';
import { useState, useEffect } from 'react';
import { Loader2, RefreshCw, ExternalLink, MapPin, Sparkles, Compass, AlertTriangle } from 'lucide-react';
import { getRealToken, huntLuckshipOpportunities, LuckshipOpportunity } from '@/lib/realApi';
import { useArcadeFX } from '@/app/components/ArcadeFX';

// Match-score color mirrors the same 3-band convention the rest of the app
// uses for internal recommendations (emerald/amber/rose), so a "good match"
// looks like a good match the same way everywhere -- Luckship isn't a
// visually different product bolted onto NexYuva, it's the same product
// pointed outward.
function scoreColor(score: number): string {
  if (score >= 0.6) return 'var(--accent-emerald)';
  if (score >= 0.3) return 'var(--accent-amber)';
  return 'var(--accent-rose)';
}

function timeAgo(iso: string | null): string {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString();
}

export default function LuckshipPage() {
  const { toast, playSound, ArcadeToasts } = useArcadeFX();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [opportunities, setOpportunities] = useState<LuckshipOpportunity[]>([]);
  const [queriesUsed, setQueriesUsed] = useState<string[]>([]);

  useEffect(() => {
    setReady(!!getRealToken());
  }, []);

  const load = async (refresh: boolean) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const result = await huntLuckshipOpportunities(refresh);
      setOpportunities(result.opportunities);
      setQueriesUsed(result.queries_used);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Hunt failed');
    }
    refresh ? setRefreshing(false) : setLoading(false);
  };

  useEffect(() => {
    if (ready) load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  if (!ready) {
    return (
      <div style={{ maxWidth: 420, margin: '60px auto', textAlign: 'center' }}>
        <Compass size={32} color="var(--text-muted)" style={{ marginBottom: 12 }} />
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Luckship</h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Sign in from Live Internships or your Dashboard first — Luckship hunts opportunities using your saved profile.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 6, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Compass size={26} />
            Luckship
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 560 }}>
            Say nothing, and NexYuva goes hunting. Live internships and jobs pulled from external boards, ranked and explained against your real profile — not another listing to scroll.
          </p>
        </div>
        <button
          className="btn-primary"
          onClick={() => load(true)}
          disabled={refreshing || loading}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', fontSize: 13, fontWeight: 600, background: 'var(--accent-cyan)', color: '#050505', border: 'none', cursor: refreshing ? 'default' : 'pointer' }}
        >
          <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          {refreshing ? 'Hunting...' : 'Hunt again'}
        </button>
      </div>

      {queriesUsed.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 18 }}>
          Hunted using: {queriesUsed.join(' · ')}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-secondary)' }}>
          <Loader2 size={20} className="animate-spin" /> Hunting external opportunities...
        </div>
      ) : error ? (
        <div className="glass-card" style={{ padding: 24, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <AlertTriangle size={20} color="var(--accent-rose)" />
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Couldn't complete the hunt</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{error}</div>
          </div>
        </div>
      ) : opportunities.length === 0 ? (
        <div className="glass-card" style={{ padding: 48, textAlign: 'center' }}>
          <Compass size={36} color="var(--text-muted)" style={{ marginBottom: 14 }} />
          <h3 style={{ marginBottom: 8 }}>Nothing worth surfacing yet</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            Add skills or a preferred domain to your profile so Luckship knows what to hunt for.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {opportunities.map((opp) => {
            const pct = Math.round(opp.match_score * 100);
            return (
              <div key={`${opp.source}:${opp.external_id}`} className="glass-card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 320px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <h3 style={{ fontSize: 16, fontWeight: 700 }}>{opp.title}</h3>
                      <span style={{ fontSize: 11, color: 'var(--text-muted)', border: '1px solid var(--glass-border)', borderRadius: 4, padding: '1px 6px', textTransform: 'capitalize' }}>{opp.source}</span>
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>{opp.company}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
                      {opp.location && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <MapPin size={12} /> {opp.location}
                        </span>
                      )}
                      {opp.remote && <span>Remote</span>}
                      {opp.posted_at && <span>{timeAgo(opp.posted_at)}</span>}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px', background: 'var(--surface-secondary, rgba(255,255,255,0.03))', borderRadius: 0, marginBottom: 12 }}>
                      <Sparkles size={14} color="var(--accent-cyan)" style={{ marginTop: 2, flexShrink: 0 }} />
                      <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{opp.explanation}</p>
                    </div>

                    {(opp.matched_skills.length > 0 || opp.missing_skills.length > 0) && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {opp.matched_skills.map(s => (
                          <span key={`m-${s}`} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 0, background: 'rgba(45,122,95,0.15)', color: 'var(--accent-emerald)', border: '1px solid rgba(45,122,95,0.3)' }}>{s}</span>
                        ))}
                        {opp.missing_skills.slice(0, 6).map(s => (
                          <span key={`x-${s}`} style={{ fontSize: 11, padding: '2px 8px', borderRadius: 0, background: 'rgba(192,64,64,0.10)', color: 'var(--accent-rose)', border: '1px solid rgba(192,64,64,0.25)' }}>{s}</span>
                        ))}
                        {opp.missing_skills.length > 6 && (
                          <span style={{ fontSize: 11, color: 'var(--text-muted)', padding: '2px 4px' }}>+{opp.missing_skills.length - 6} more</span>
                        )}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10, minWidth: 130 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 24, fontWeight: 800, color: scoreColor(opp.match_score) }}>{pct}%</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>match</div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right', maxWidth: 130 }}>{opp.prep_estimate}</div>
                    <a
                      href={opp.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary"
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', fontSize: 12, fontWeight: 600, background: 'var(--accent-amber)', color: '#050505', textDecoration: 'none', borderRadius: 0, whiteSpace: 'nowrap' }}
                    >
                      Review & apply <ExternalLink size={12} />
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
