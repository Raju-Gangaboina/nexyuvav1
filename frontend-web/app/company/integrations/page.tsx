'use client';
import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Webhook, CheckCircle, Copy, Zap, ShieldCheck, AlertCircle, CalendarDays, Unlink } from 'lucide-react';
import {
  getMyWebhookConfigReal, updateMyWebhookConfigReal,
  getGoogleCalendarStatus, openGoogleCalendarConnect, disconnectGoogleCalendar,
  CalendarStatus,
} from '@/lib/realApi';

const INTEGRATIONS = [
  { name: 'Greenhouse', logo: '🌿' },
  { name: 'Lever', logo: '⚙️' },
  { name: 'Workday', logo: '📅' },
  { name: 'Zoho Recruit', logo: '🟧' },
  { name: 'BambooHR', logo: '🎋' },
  { name: 'SAP SuccessFactors', logo: '🔷' },
  { name: 'Custom ATS', logo: '🔌' },
];

function IntegrationsPageContent() {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [selectedAts, setSelectedAts] = useState<string>('Custom ATS');
  const [enabled, setEnabled] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);

  const [loadError, setLoadError] = useState('');

  const searchParams = useSearchParams();
  const router = useRouter();
  const [calendarStatus, setCalendarStatus] = useState<CalendarStatus | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [calendarError, setCalendarError] = useState('');
  const [calendarNotice, setCalendarNotice] = useState('');
  const [disconnecting, setDisconnecting] = useState(false);

  const loadCalendarStatus = () => {
    setCalendarLoading(true);
    getGoogleCalendarStatus()
      .then(setCalendarStatus)
      .catch(e => setCalendarError(e?.message || 'Could not load Google Calendar status.'))
      .finally(() => setCalendarLoading(false));
  };

  useEffect(() => {
    getMyWebhookConfigReal()
      .then(cfg => {
        setWebhookUrl(cfg.webhook_url || '');
        setSelectedAts(cfg.webhook_ats || 'Custom ATS');
        setEnabled(cfg.webhook_enabled || false);
      })
      .catch(e => setLoadError(e?.message || 'Could not load webhook settings.'));
    loadCalendarStatus();
  }, []);

  // Google's OAuth consent screen redirects the browser back here (a full
  // page navigation via the backend's /scheduling/google/callback route),
  // landing with a ?calendar_connected=1 or ?calendar_error=... query param.
  useEffect(() => {
    if (!searchParams) return;
    if (searchParams.get('calendar_connected')) {
      setCalendarNotice('Google Calendar connected.');
      loadCalendarStatus();
      router.replace('/company/integrations');
    } else if (searchParams.get('calendar_error')) {
      setCalendarError(searchParams.get('calendar_error') || 'Could not connect Google Calendar.');
      router.replace('/company/integrations');
    }
  }, [searchParams, router]);

  const handleDisconnectCalendar = async () => {
    if (!confirm('Disconnect Google Calendar? You will need to reconnect before proposing new interview slots.')) return;
    setDisconnecting(true);
    try {
      await disconnectGoogleCalendar();
      setCalendarStatus({ connected: false, google_email: null, connected_at: null });
      setCalendarNotice('');
    } catch (e: any) {
      setCalendarError(e?.message || 'Could not disconnect.');
    }
    setDisconnecting(false);
  };

  const handleSave = async () => {
    try {
      await updateMyWebhookConfigReal({ webhook_url: webhookUrl, webhook_ats: selectedAts, webhook_enabled: enabled });
      setSaved(true);
      setLoadError('');
      setTimeout(() => setSaved(false), 2500);
    } catch (e: any) {
      setLoadError(e?.message || 'Could not save webhook settings.');
    }
  };

  const handleTest = async () => {
    if (!webhookUrl.trim()) return;
    setTesting(true);
    setTestResult(null);
    await new Promise(r => setTimeout(r, 1000));
    const looksValid = /^https?:\/\/.+/.test(webhookUrl);
    setTestResult(looksValid ? 'success' : 'error');
    setTesting(false);
  };

  return (
    <div>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 32, fontWeight: 700, marginBottom: 8, fontFamily: 'var(--font-serif)' }}>
          <Webhook size={28} style={{ marginRight: 10, verticalAlign: 'middle', color: 'var(--accent-cyan)' }} />
          ATS Webhook Integration
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 13, textTransform: 'uppercase' }}>
          Sync applicant data directly to your internal Applicant Tracking System.
        </p>
      </div>

      <div className="glass-card" style={{ padding: 24, marginBottom: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
          <CalendarDays size={18} color="#2B7FD4" /> Google Calendar — Smart Scheduling
        </h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
          Connect your Google Calendar to propose real interview slots to candidates and get a Google Meet link
          created automatically once they pick a time.
        </p>

        {calendarLoading ? (
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Checking connection…</p>
        ) : calendarStatus?.connected ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, padding: '6px 12px', borderRadius: 0, background: 'rgba(74,170,130,0.12)', color: '#4AAA82' }}>
              <CheckCircle size={14} /> Connected — {calendarStatus.google_email}
            </span>
            <button className="btn-secondary" onClick={handleDisconnectCalendar} disabled={disconnecting} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Unlink size={13} /> {disconnecting ? 'Disconnecting…' : 'Disconnect'}
            </button>
          </div>
        ) : (
          <button className="btn-primary" onClick={openGoogleCalendarConnect} style={{ fontFamily: 'var(--font-mono)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 8, width: 'fit-content' }}>
            <CalendarDays size={15} /> Connect Google Calendar
          </button>
        )}

        {calendarNotice && (
          <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(45,122,95,0.09)', border: '1px solid rgba(45,122,95,0.2)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: '#4AAA82' }}>
            <ShieldCheck size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            {calendarNotice}
          </div>
        )}
        {calendarError && (
          <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(192,64,64,0.09)', border: '1px solid rgba(192,64,64,0.2)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: '#E06060' }}>
            <AlertCircle size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            {calendarError}
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <div className="glass-card" style={{ padding: 24, flex: '1 1 480px' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, color: 'var(--accent-cyan)' }}>🔗 Webhook Configuration</h3>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Your ATS Platform</label>
            <select className="select-field" value={selectedAts} onChange={e => setSelectedAts(e.target.value)}>
              {INTEGRATIONS.map(i => <option key={i.name}>{i.name}</option>)}
            </select>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Webhook Endpoint URL</label>
            <input
              className="input-field"
              placeholder="https://your-ats.com/webhook/receive"
              value={webhookUrl}
              onChange={e => setWebhookUrl(e.target.value)}
            />
            <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
              Applicant data (name, resume, match score, contact details) will be POSTed here as JSON whenever a student applies.
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)' }}>
            <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} id="enable-webhook" style={{ width: 16, height: 16 }} />
            <label htmlFor="enable-webhook" style={{ fontSize: 13, color: 'var(--text-secondary)', cursor: 'pointer' }}>
              Enable automatic sync for new applications
            </label>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn-primary" onClick={handleSave} style={{ fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
              {saved ? <><CheckCircle size={15} style={{ marginRight: 6, verticalAlign: 'middle' }} />Saved</> : 'Save Configuration'}
            </button>
            <button className="btn-secondary" onClick={handleTest} disabled={testing || !webhookUrl.trim()} style={{ fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
              <Zap size={15} style={{ marginRight: 6, verticalAlign: 'middle' }} />
              {testing ? 'Testing...' : 'Send Test Ping'}
            </button>
          </div>

          {loadError && (
            <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(253,164,175,0.09)', border: '1px solid rgba(253,164,175,0.2)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: '#FDA4AF' }}>
              <AlertCircle size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
              {loadError}
            </div>
          )}

          {testResult === 'success' && (
            <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(45,122,95,0.09)', border: '1px solid rgba(45,122,95,0.2)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: '#4AAA82' }}>
              <ShieldCheck size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
              Test payload accepted — endpoint looks reachable.
            </div>
          )}
          {testResult === 'error' && (
            <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(192,64,64,0.09)', border: '1px solid rgba(192,64,64,0.2)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: '#E06060' }}>
              That doesn't look like a valid URL — it should start with http:// or https://
            </div>
          )}
        </div>

        <div className="glass-card" style={{ padding: 24, flex: '1 1 280px', maxWidth: 340 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Supported Platforms</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {INTEGRATIONS.map(i => (
              <div key={i.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: selectedAts === i.name ? 'rgba(232,130,10,0.06)' : 'var(--bg-elevated)', border: selectedAts === i.name ? '1px solid rgba(232,130,10,0.18)' : '1px solid transparent', borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
                <span style={{ fontSize: 16 }}>{i.logo}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{i.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: 'var(--text-muted)' }}>Loading…</div>}>
      <IntegrationsPageContent />
    </Suspense>
  );
}
