'use client';
import { useState, useEffect } from 'react';
import {
  User, GraduationCap, Code, Edit3, Save, Plus, X,
  CheckCircle, Star, FileText, Upload, Sparkles, Brain, AlertCircle, RefreshCw,
  ShieldCheck, AlertTriangle, XCircle
} from 'lucide-react';
import {
  ALL_SKILLS, extractAndAnalyzeResume, calculateCompetencyDimensions,
  StudentProfile, ResumeAnalysisResult, CompetencyDimensions
} from '@/lib/aiEngine';
import { fetchStudentProfile, saveStudentProfile, EMPTY_STUDENT_PROFILE } from '@/lib/userContext';
import { uploadResumeReal, uploadAvatarReal, resolveAvatarUrl, getRealToken, RealResumeParseResult, getMyRealProfile, syncGithubProfileReal, getAtsAnalysisReal, ATSAnalysisResult, searchCollegesReal, searchCitiesReal, CollegeLookupResult, CityLookupResult } from '@/lib/realApi';
import { useRouter } from 'next/navigation';
import Autocomplete from '@/app/components/Autocomplete';

const QUICK_SKILLS = ALL_SKILLS.slice(0, 30);

export default function ProfilePage() {
  const [student, setStudent] = useState<StudentProfile>(EMPTY_STUDENT_PROFILE);
  const [editing, setEditing] = useState(false);
  const [activeTab, setActiveTab] = useState<'profile' | 'skills' | 'resume' | 'ats'>('profile');
  const [newSkill, setNewSkill] = useState('');
  const [newTool, setNewTool] = useState('');
  const [saved, setSaved] = useState(false);
  const [profileSyncError, setProfileSyncError] = useState('');

  // Avatar upload state (H4-hardened endpoint: POST /students/me/avatar)
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState('');

  const handleAvatarUpload = async (file: File) => {
    setAvatarUploading(true);
    setAvatarError('');
    try {
      const result = await uploadAvatarReal(file);
      setStudent(prev => ({ ...prev, avatarUrl: result.avatar_url }));
    } catch (err) {
      setAvatarError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setAvatarUploading(false);
    }
  };

  // GitHub sync (H2 follow-up) — score + sync state, kept separate from
  // `student` since StudentProfile (aiEngine) has no github_score field.
  const [githubScore, setGithubScore] = useState<number | null>(null);
  const [githubSyncing, setGithubSyncing] = useState(false);
  const [githubSyncError, setGithubSyncError] = useState('');
  const [githubSyncedAt, setGithubSyncedAt] = useState<Date | null>(null);

  // Resume Analyzer state (real backend — spaCy resume parsing)
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [realResult, setRealResult] = useState<RealResumeParseResult | null>(null);
  const [parseError, setParseError] = useState('');
  const [educationAdded, setEducationAdded] = useState(false);
  const [linksAdded, setLinksAdded] = useState(false);

  // ATS Score tab state — same production analyzer used on Live Internships'
  // "ATS Check" button (backend/app/ai/ats_analyzer.py), but called with no
  // internship_id: this runs only the generic parseability/structure/content
  // checks against whatever resume is currently on file, since there's no
  // specific job here to compare keywords against. That per-role keyword-gap
  // check stays on Live Internships, where a specific job's required_skills
  // actually exist to compare against.
  const [atsResult, setAtsResult] = useState<ATSAnalysisResult | null>(null);
  const [atsLoading, setAtsLoading] = useState(false);
  const [atsError, setAtsError] = useState('');
  const [atsRanOnce, setAtsRanOnce] = useState(false);

  const handleRunAtsCheck = async () => {
    setAtsLoading(true);
    setAtsError('');
    try {
      const result = await getAtsAnalysisReal();
      setAtsResult(result);
      setAtsRanOnce(true);
    } catch (e: any) {
      setAtsError(e?.message || 'Could not run the ATS check.');
    }
    setAtsLoading(false);
  };

  // Real-backend auth (needed because resume parsing hits the real, authenticated FastAPI backend).
  // Provisioned silently behind the scenes using the student's existing platform email —
  // there is no separate sign-up screen shown to the user.
  const [realToken, setRealTokenState] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');

  const router = useRouter();

  useEffect(() => {
    const token = getRealToken();
    if (!token) {
      router.push('/login');
      return;
    }
    setRealTokenState(token);
    fetchStudentProfile().then(setStudent);

    // GitHub score isn't part of StudentProfile (aiEngine type), so it's
    // fetched separately here rather than through fetchStudentProfile above.
    (async () => {
      try {
        const backend = await getMyRealProfile();
        if (typeof backend.github_score === 'number') {
          setGithubScore(backend.github_score);
        }
      } catch {
        // Profile not created yet on the backend — fall back to local only.
      }
    })();
  }, []);

  const addSkill = (skill: string) => {
    if (!student.skills.includes(skill)) {
      const updatedSkills = [...student.skills, skill];
      const updated = { ...student, skills: updatedSkills };
      setStudent(updated);
      saveStudentProfile(updated);
    }
  };

  const removeSkill = (skill: string) => {
    const updatedSkills = student.skills.filter(s => s !== skill);
    const updated = { ...student, skills: updatedSkills };
    setStudent(updated);
    saveStudentProfile(updated);
  };

  const addTool = (tool: string) => {
    if (!student.tools.includes(tool)) {
      const updatedTools = [...student.tools, tool];
      const updated = { ...student, tools: updatedTools };
      setStudent(updated);
      saveStudentProfile(updated);
    }
  };

  const removeTool = (tool: string) => {
    const updatedTools = student.tools.filter(t => t !== tool);
    const updated = { ...student, tools: updatedTools };
    setStudent(updated);
    saveStudentProfile(updated);
  };

  const handleSave = async () => {
    setSaved(true);
    setEditing(false);
    setProfileSyncError('');
    try {
      await saveStudentProfile(student);
    } catch (e: any) {
      setProfileSyncError(e?.message || 'Saved locally, but could not sync to the server.');
    }
    setTimeout(() => setSaved(false), 3000);
  };

  // Accepts either a bare username or a full github.com URL, since the
  // "GitHub URL" field has always actually stored just the username
  // (see StudentProfile.github -> github_username in handleSave above).
  const extractGithubUsername = (input: string): string => {
    const trimmed = input.trim().replace(/\/+$/, '');
    const match = trimmed.match(/github\.com\/([^\/?#]+)/i);
    return match ? match[1] : trimmed;
  };

  const handleSyncGithub = async (forceRefresh: boolean) => {
    const username = extractGithubUsername(student.github || '');
    if (!username) {
      setGithubSyncError('Add your GitHub username first.');
      return;
    }
    setGithubSyncing(true);
    setGithubSyncError('');
    try {
      const result = await syncGithubProfileReal(username, forceRefresh);
      if (typeof result.github_score === 'number') {
        setGithubScore(result.github_score);
      }
      setGithubSyncedAt(new Date());
      // The backend normalizes/echoes github_username back — keep the field
      // in sync in case the user pasted a full URL.
      if (result.github_username && result.github_username !== student.github) {
        const updated = { ...student, github: result.github_username as string };
        setStudent(updated);
        saveStudentProfile(updated);
      }
    } catch (e: any) {
      setGithubSyncError(e?.message || 'Could not sync your GitHub profile right now.');
    }
    setGithubSyncing(false);
  };

  const handleAnalyzeResume = async () => {
    if (!resumeFile) return;
    setIsParsing(true);
    setParseError("");
    setEducationAdded(false);
    setLinksAdded(false);
    try {
      const result = await uploadResumeReal(resumeFile);
      setRealResult(result);
      // Nothing from the resume is auto-merged into the profile -- confirmed
      // skills, suggested skills, education, and links all wait for an
      // explicit tap on their own Add control below.
    } catch (e: any) {
      setParseError(e.message || "Could not parse that resume. Try a PDF or DOCX file.");
    }
    setIsParsing(false);
  };

  const handleAddSuggestedSkill = (skillName: string) => {
    if (student.skills.includes(skillName)) return;
    const updatedStudent: StudentProfile = { ...student, skills: [...student.skills, skillName] };
    setStudent(updatedStudent);
    saveStudentProfile(updatedStudent).catch(() => {
      setProfileSyncError('Added locally, but could not sync to the server.');
    });
  };

  const handleAddSuggestedTool = (toolName: string) => {
    if (student.tools.includes(toolName)) return;
    const updatedStudent: StudentProfile = { ...student, tools: [...student.tools, toolName] };
    setStudent(updatedStudent);
    saveStudentProfile(updatedStudent);
  };

  // Education/links detected from the resume are shown with their own explicit
  // "Add to Profile" button (same tap-to-confirm pattern as suggested skills)
  // rather than being silently merged in — only fields the student doesn't
  // already have filled in get overwritten, existing values are left alone.
  const handleAddEducationToProfile = () => {
    if (!realResult) return;
    const edu = realResult.education;
    const updatedStudent: StudentProfile = {
      ...student,
      degree: student.degree || edu.degree || student.degree,
      branch: student.branch || edu.branch || student.branch,
      cgpa: student.cgpa || edu.cgpa || student.cgpa,
      year: student.year || edu.year || student.year,
      college: student.college || edu.college || student.college,
      city: student.city || edu.college_location || student.city,
    };
    setStudent(updatedStudent);
    saveStudentProfile(updatedStudent).catch(() => {
      setProfileSyncError('Added locally, but could not sync to the server.');
    });
    setEducationAdded(true);
  };

  const handleAddLinksToProfile = () => {
    if (!realResult) return;
    const links = realResult.links;
    const updatedStudent: StudentProfile = {
      ...student,
      github: student.github || links.github_username || student.github,
      linkedin: student.linkedin || links.linkedin_url || student.linkedin,
      email: student.email || links.email || student.email,
    };
    setStudent(updatedStudent);
    saveStudentProfile(updatedStudent).catch(() => {
      setProfileSyncError('Added locally, but could not sync to the server.');
    });
    setLinksAdded(true);
  };

  const [competency, setCompetency] = useState<CompetencyDimensions>({
    academicExcellence: 0, technicalExpertise: 0, projectMaturity: 0, professionalExperience: 0,
    innovation: 0, leadership: 0, communication: 0, careerReadiness: 0,
  });

  useEffect(() => {
    calculateCompetencyDimensions(student).then(setCompetency);
  }, [student]);

  const TABS = [
    { key: 'profile', label: 'Personal Info', icon: User },
    { key: 'skills', label: 'Skills & Competencies', icon: Code },
    { key: 'resume', label: 'AI Resume Parser', icon: FileText },
    { key: 'ats', label: 'ATS Score', icon: ShieldCheck },
  ];

  const atsStatusColor = (status: string) =>
    status === 'pass' ? 'var(--accent-emerald)' : status === 'warn' ? 'var(--accent-amber)' : 'var(--accent-rose)';

  return (
    <div>
      {/* Top Banner */}
      <div style={{ marginBottom: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 4 }}>
            Digital Competency Profile
          </h1>
          <p style={{ color: 'var(--text-secondary)' }}>Student Digital Twin · Powers your AI Vector Match Scores</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {saved && !profileSyncError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'rgba(45,122,95,0.1)', border: '1px solid rgba(45,122,95,0.3)', color: 'var(--accent-emerald)', fontSize: 13, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
              <CheckCircle size={14} /> Profile Saved & Synced!
            </div>
          )}
          {saved && profileSyncError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', background: 'rgba(253,164,175,0.1)', border: '1px solid rgba(253,164,175,0.3)', color: '#FF3B30', fontSize: 13 }}>
              <AlertCircle size={14} /> {profileSyncError}
            </div>
          )}
          <button className={editing ? 'btn-secondary' : 'btn-primary'} onClick={() => editing ? handleSave() : setEditing(true)} style={{ padding: '10px 20px', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
            {editing ? <><Save size={16} /> Save Changes</> : <><Edit3 size={16} /> Edit Profile</>}
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 24 }}>
        {/* Profile Card */}
        <div>
          <div className="glass-card" style={{ padding: 28, textAlign: 'center', marginBottom: 16 }}>
            {/* Avatar */}
            <div style={{ position: 'relative', display: 'inline-block', marginBottom: 16 }}>
              <label htmlFor="avatar-upload-input" style={{ cursor: avatarUploading ? 'wait' : 'pointer', display: 'block' }} title="Click to change photo">
                {student.avatarUrl ? (
                  <img
                    src={resolveAvatarUrl(student.avatarUrl) || undefined}
                    alt={student.name}
                    style={{
                      width: 96, height: 96, objectFit: 'cover',
                      border: '3px solid #0A0A0A', boxShadow: '4px 4px 0 #0A0A0A',
                      opacity: avatarUploading ? 0.5 : 1,
                    }}
                  />
                ) : (
                  <div style={{
                    width: 96, height: 96,
                    background: 'var(--blue)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 32, fontWeight: 700, color: '#050505', fontFamily: 'var(--font-mono)',
                    border: '3px solid #0A0A0A', boxShadow: '4px 4px 0 #0A0A0A',
                    opacity: avatarUploading ? 0.5 : 1,
                  }}>
                    {student.avatar || student.name.slice(0, 2).toUpperCase()}
                  </div>
                )}
              </label>
              <input
                id="avatar-upload-input"
                type="file"
                accept=".jpg,.jpeg,.png,.webp"
                style={{ display: 'none' }}
                disabled={avatarUploading}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleAvatarUpload(file);
                  e.target.value = '';
                }}
              />
              <div style={{ position: 'absolute', top: -8, right: -8, width: 26, height: 26, background: '#2D7A5F', border: '2px solid #0A0A0A', boxShadow: '2px 2px 0 #0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <CheckCircle size={14} color="#050505" />
              </div>
            </div>
            {avatarError && (
              <p style={{ color: '#c0392b', fontSize: 11, marginBottom: 8, fontFamily: 'var(--font-mono)' }}>{avatarError}</p>
            )}

            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{student.name}</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 8, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>
              {student.degree} {student.branch} · Year {student.year}
            </p>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>{student.college}</p>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
              <span className="badge badge-primary">CGPA {student.cgpa}</span>
              <span className="badge badge-emerald">{student.skills.length} Skills</span>
              <span className="badge badge-amber">
                <Star size={9} /> Profile {student.resumeScore}%
              </span>
            </div>

            {/* Social Links */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left' }}>
              <div style={{ padding: '6px 10px', background: '#fff', border: '2px solid #0A0A0A', borderRadius: 0, fontSize: 11, color: '#0A0A0A', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={student.github || undefined}>
                GitHub: {student.github || 'github.com/profile'}
              </div>
              <div style={{ padding: '6px 10px', background: '#fff', border: '2px solid #0A0A0A', borderRadius: 0, fontSize: 11, color: '#0A0A0A', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={student.linkedin || undefined}>
                LinkedIn: {student.linkedin || 'linkedin.com/in/profile'}
              </div>
            </div>

            {/* GitHub sync (H2 follow-up) — pulls real public repo/contribution
                signals via the backend's cached, rate-limited sync endpoint. */}
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--glass-border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}>GitHub Score</span>
                <span style={{ fontWeight: 700, color: githubScore != null ? 'var(--accent-emerald)' : 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                  {githubScore != null ? `${githubScore}/100` : '—'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button
                  className="btn-primary"
                  disabled={githubSyncing || !student.github}
                  onClick={() => handleSyncGithub(false)}
                  style={{ padding: '7px 14px', fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}
                >
                  {githubSyncing ? <><RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} /> Syncing...</> : <><RefreshCw size={12} /> {githubScore != null ? 'Re-sync' : 'Sync GitHub'}</>}
                </button>
                {githubScore != null && (
                  <button
                    className="btn-secondary"
                    disabled={githubSyncing || !student.github}
                    onClick={() => handleSyncGithub(true)}
                    title="Bypass the cache and fetch fresh data from GitHub right now"
                    style={{ padding: '7px 14px', fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase' }}
                  >
                    Force Refresh
                  </button>
                )}
              </div>
              {!student.github && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>Add your GitHub username in Personal Info first.</div>
              )}
              {githubSyncError && (
                <div style={{ fontSize: 11, color: 'var(--accent-rose)', marginTop: 8 }}>{githubSyncError}</div>
              )}
              {githubSyncedAt && !githubSyncError && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>Synced {githubSyncedAt.toLocaleTimeString()}</div>
              )}
            </div>
          </div>

          {/* Competency Readiness Summary */}
          <div className="glass-card" style={{ padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <h4 style={{ fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Brain size={16} color="var(--primary-light)" /> Career Readiness
              </h4>
              <span style={{ fontWeight: 700, color: 'var(--accent-emerald)', fontFamily: 'var(--font-mono)' }}>{competency.careerReadiness}/100</span>
            </div>
            <div className="progress-bar" style={{ marginBottom: 16 }}>
              <div className="progress-fill" style={{ width: `${competency.careerReadiness}%`, background: 'var(--accent-emerald)' }} />
            </div>

            <div style={{ display: 'grid', gap: 8, fontSize: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Academic Score</span>
                <span style={{ fontWeight: 600 }}>{competency.academicExcellence}/100</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Technical Expertise</span>
                <span style={{ fontWeight: 600, color: 'var(--accent-cyan)' }}>{competency.technicalExpertise}/100</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Project Maturity</span>
                <span style={{ fontWeight: 600 }}>{competency.projectMaturity}/100</span>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 20, background: 'var(--bg-elevated)', padding: 4 }}>
            {TABS.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as typeof activeTab)}
                  style={{
                    flex: 1, padding: '10px', border: 'none', cursor: 'pointer',
                    background: activeTab === tab.key ? 'var(--bg-card)' : 'transparent',
                    color: activeTab === tab.key ? 'var(--primary-light)' : 'var(--text-muted)',
                    fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 11, textTransform: 'uppercase',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    transition: 'all 0.15s',
                    boxShadow: activeTab === tab.key ? '0 2px 8px rgba(0,0,0,0.3)' : 'none',
                  }}
                >
                  <Icon size={14} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <div className="glass-card" style={{ padding: 28 }}>
            {/* Tab 1: Personal Info */}
            {activeTab === 'profile' && (
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Personal & Academic Details</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  {[
                    { label: 'Full Name', key: 'name', value: student.name },
                    { label: 'Email Address', key: 'email', value: student.email },
                    { label: 'College / University', key: 'college', value: student.college },
                    { label: 'City', key: 'city', value: student.city },
                    { label: 'Degree', key: 'degree', value: student.degree },
                    { label: 'Branch / Specialization', key: 'branch', value: student.branch },
                    { label: 'Current Year', key: 'year', value: String(student.year) },
                    { label: 'CGPA (out of 10)', key: 'cgpa', value: String(student.cgpa) },
                    { label: 'GitHub URL', key: 'github', value: student.github },
                    { label: 'LinkedIn URL', key: 'linkedin', value: student.linkedin },
                  ].map(field => (
                    <div key={field.key}>
                      <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{field.label}</label>
                      {editing ? (
                        field.key === 'college' ? (
                          <Autocomplete<CollegeLookupResult>
                            value={student.college}
                            onChange={v => setStudent(prev => ({ ...prev, college: v }))}
                            onSelect={item => setStudent(prev => ({ ...prev, college: item.name }))}
                            fetchOptions={searchCollegesReal}
                            getLabel={item => item.name}
                            getSubLabel={item => [item.city, item.state].filter(Boolean).join(', ')}
                          />
                        ) : field.key === 'city' ? (
                          <Autocomplete<CityLookupResult>
                            value={student.city}
                            onChange={v => setStudent(prev => ({ ...prev, city: v }))}
                            onSelect={item => setStudent(prev => ({ ...prev, city: item.name }))}
                            fetchOptions={searchCitiesReal}
                            getLabel={item => item.name}
                            getSubLabel={item => [item.district, item.state].filter(Boolean).join(', ')}
                          />
                        ) : (
                        <input
                          className="input-field"
                          value={field.value}
                          onChange={e => {
                            const val = field.key === 'cgpa' ? parseFloat(e.target.value) || 0 : field.key === 'year' ? parseInt(e.target.value) || 1 : e.target.value;
                            setStudent(prev => ({ ...prev, [field.key]: val }));
                          }}
                        />
                        )
                      ) : (
                        <div style={{ padding: '10px 14px', background: 'var(--bg-elevated)', fontSize: 14, color: 'var(--text-primary)' }}>
                          {field.value || 'Not provided'}
                        </div>
                      )}
                    </div>
                  ))}
                  <div style={{ gridColumn: '1/-1' }}>
                    <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Bio / Personal Statement</label>
                    {editing ? (
                      <textarea className="input-field" value={student.bio} onChange={e => setStudent(prev => ({ ...prev, bio: e.target.value }))} style={{ minHeight: 90, resize: 'vertical' }} />
                    ) : (
                      <div style={{ padding: '10px 14px', background: 'var(--bg-elevated)', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                        {student.bio || 'Add a bio describing your career aspirations...'}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Skills */}
            {activeTab === 'skills' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <h3 style={{ fontSize: 18, fontWeight: 700 }}>Competency Skills ({student.skills.length})</h3>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Skills are converted into high-dimensional vector embeddings for AI similarity matching.</p>
                  </div>
                  <span className="badge badge-primary">Vector Search Ready</span>
                </div>

                {/* Current Skills */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
                  {student.skills.map(skill => (
                    <div key={skill} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '6px 14px',
                      background: 'var(--blue-dim)', border: '1px solid rgba(232,130,10,0.2)',
                      color: 'var(--primary-light)', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)', textTransform: 'uppercase'
                    }}>
                      {skill}
                      <button onClick={() => removeSkill(skill)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary-light)', padding: 0, display: 'flex' }}>
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Tools */}
                <div style={{ marginBottom: 12 }}>
                  <h4 style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Tools ({student.tools.length})</h4>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
                  {student.tools.map(tool => (
                    <div key={tool} style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      padding: '6px 14px',
                      background: 'var(--bg-elevated)', border: '1px solid rgba(10,10,10,0.18)',
                      color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, fontFamily: 'var(--font-mono)', textTransform: 'uppercase'
                    }}>
                      {tool}
                      <button onClick={() => removeTool(tool)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: 0, display: 'flex' }}>
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add Custom Skill */}
                <div style={{ marginBottom: 24 }}>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>ADD SKILL</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="input-field" placeholder="Type a skill (e.g., PyTorch, Docker, React)..." value={newSkill} onChange={e => setNewSkill(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && newSkill.trim()) { addSkill(newSkill.trim()); setNewSkill(''); } }} />
                    <button className="btn-primary" style={{ padding: '10px 20px', whiteSpace: 'nowrap' }}
                      onClick={() => { if (newSkill.trim()) { addSkill(newSkill.trim()); setNewSkill(''); } }}>
                      <Plus size={16} /> Add Skill
                    </button>
                  </div>
                </div>

                {/* Add Custom Tool */}
                <div style={{ marginBottom: 24 }}>
                  <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>ADD TOOL</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input className="input-field" placeholder="Type a tool (e.g., Git, Figma, Postman)..." value={newTool} onChange={e => setNewTool(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && newTool.trim()) { addTool(newTool.trim()); setNewTool(''); } }} />
                    <button className="btn-primary" style={{ padding: '10px 20px', whiteSpace: 'nowrap' }}
                      onClick={() => { if (newTool.trim()) { addTool(newTool.trim()); setNewTool(''); } }}>
                      <Plus size={16} /> Add Tool
                    </button>
                  </div>
                </div>

                {/* Suggested Skills */}
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>QUICK SUGGESTIONS — Click to add</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {QUICK_SKILLS.filter(s => !student.skills.includes(s)).slice(0, 20).map(skill => (
                      <button key={skill} onClick={() => addSkill(skill)}
                        style={{
                          padding: '6px 12px', border: '1px solid var(--glass-border)',
                          background: 'var(--bg-elevated)', color: 'var(--text-secondary)', cursor: 'pointer',
                          fontSize: 11, fontFamily: 'var(--font-mono)', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.15s',
                        }}>
                        <Plus size={11} /> {skill}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Tab 3: AI Resume & ATS Parser - real spaCy-based parsing against your actual backend */}
            {activeTab === 'resume' && (
              <div>
                <div style={{ marginBottom: 20 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <Sparkles size={20} color="var(--accent-amber)" />
                    AI Resume Intelligence
                  </h3>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    Upload your real resume (PDF or DOCX). Nothing is added to your profile automatically -- review what's detected below and tap Add on whatever you want to keep. Want a real ATS parseability check against a specific role? Head to Live Internships and hit "ATS Check" on any listing.
                  </p>
                </div>

                {!realToken ? (
                  <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: 24, maxWidth: 420 }}>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Session expired — please log in again.</div>
                  </div>
                ) : (
                  <>
                    <div style={{ marginBottom: 16 }}>
                      <label style={{ fontSize: 12, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>UPLOAD RESUME (PDF or DOCX)</label>
                      <input
                        type="file"
                        accept=".pdf,.docx"
                        onChange={e => setResumeFile(e.target.files?.[0] || null)}
                        style={{ fontSize: 13, color: 'var(--text-secondary)' }}
                      />
                    </div>

                    <button
                      className="btn-primary"
                      onClick={handleAnalyzeResume}
                      disabled={isParsing || !resumeFile}
                      style={{ padding: '12px 24px', fontSize: 14, marginBottom: 24 }}
                    >
                      {isParsing ? <><RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Parsing Resume with spaCy...</> : <><Sparkles size={16} /> Parse Resume</>}
                    </button>

                    {parseError && (
                      <div style={{ fontSize: 13, color: 'var(--accent-rose)', marginBottom: 20 }}>{parseError}</div>
                    )}

                    {realResult && (
                      <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: 24 }}>
                        <h4 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Resume Analysis (real backend)</h4>
                        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>spaCy PhraseMatcher for exact/confirmed skills, plus a sentence-transformers semantic pass for suggestions.</p>

                        {realResult.academic_background_guess && (
                          <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--text-secondary)' }}>
                            <strong style={{ color: 'var(--text-primary)' }}>Academic background guess:</strong> {realResult.academic_background_guess}
                          </div>
                        )}

                        <div style={{ marginBottom: 16 }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-emerald)' }}>
                              Confirmed Skills ({realResult.confirmed_skills.filter(s => s.category !== 'tool').length})
                            </div>
                            {realResult.confirmed_skills.some(s => s.category !== 'tool' && !student.skills.includes(s.name)) && (
                              <button
                                onClick={() => realResult.confirmed_skills.filter(s => s.category !== 'tool').forEach(s => handleAddSuggestedSkill(s.name))}
                                className="btn-primary"
                                style={{ padding: '5px 12px', fontSize: 11 }}
                              >
                                <Plus size={11} /> Add All
                              </button>
                            )}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                            Found in your resume -- tap a skill to add it to your Competency Skills.
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                            {realResult.confirmed_skills.filter(s => s.category !== 'tool').map(s => (
                              student.skills.includes(s.name) ? (
                                <span key={s.name} className="tag matched" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <CheckCircle size={10} /> {s.name}
                                </span>
                              ) : (
                                <button
                                  key={s.name}
                                  onClick={() => handleAddSuggestedSkill(s.name)}
                                  style={{
                                    display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
                                    padding: '5px 12px', fontSize: 11, fontWeight: 600,
                                                                        border: '1px solid var(--accent-emerald)',
                                    background: 'rgba(45,122,95,0.12)',
                                    color: 'var(--accent-emerald)'
                                  }}
                                >
                                  <Plus size={10} /> {s.name}
                                </button>
                              )
                            ))}
                          </div>
                        </div>

                        {realResult.confirmed_skills.some(s => s.category === 'tool') && (
                          <div style={{ marginBottom: 16 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-cyan)' }}>
                                Confirmed Tools ({realResult.confirmed_skills.filter(s => s.category === 'tool').length})
                              </div>
                              {realResult.confirmed_skills.some(s => s.category === 'tool' && !student.tools.includes(s.name)) && (
                                <button
                                  onClick={() => realResult.confirmed_skills.filter(s => s.category === 'tool').forEach(s => handleAddSuggestedTool(s.name))}
                                  className="btn-primary"
                                  style={{ padding: '5px 12px', fontSize: 11 }}
                                >
                                  <Plus size={11} /> Add All
                                </button>
                              )}
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                              Found in your resume -- tap a tool to add it to your Tools list.
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {realResult.confirmed_skills.filter(s => s.category === 'tool').map(s => (
                                student.tools.includes(s.name) ? (
                                  <span key={s.name} className="tag matched" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <CheckCircle size={10} /> {s.name}
                                  </span>
                                ) : (
                                  <button
                                    key={s.name}
                                    onClick={() => handleAddSuggestedTool(s.name)}
                                    style={{
                                      display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
                                      padding: '5px 12px', fontSize: 11, fontWeight: 600,
                                                                            border: '1px solid var(--accent-cyan)',
                                      background: 'rgba(232,130,10,0.10)',
                                      color: 'var(--accent-cyan)'
                                    }}
                                  >
                                    <Plus size={10} /> {s.name}
                                  </button>
                                )
                              ))}
                            </div>
                          </div>
                        )}

                        {realResult.suggested_skills.length > 0 && (
                          <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-amber)', marginBottom: 4 }}>
                              ✨ Suggested (not in your profile yet — tap to add):
                            </div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>
                              Found via semantic similarity, not an exact match — confirm each one you actually have.
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {realResult.suggested_skills.map(s => (
                                <button
                                  key={s.name}
                                  onClick={() => handleAddSuggestedSkill(s.name)}
                                  className="tag"
                                  title={`Matched: "${s.matched_text}" (confidence ${Math.round(s.confidence * 100)}%)`}
                                  style={{ cursor: 'pointer', border: '1px dashed var(--accent-amber)', background: 'transparent' }}
                                >
                                  + {s.name}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Education detected from the resume — explicit "Add to Profile" button,
                            same tap-to-confirm treatment as suggested skills, since these are
                            profile fields (not just tags) and shouldn't be silently overwritten. */}
                        {(realResult.education.degree || realResult.education.branch || realResult.education.cgpa || realResult.education.year) && (
                          <div style={{ marginBottom: 16, paddingTop: 16, borderTop: '1px solid var(--glass-border)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary-light)' }}>
                                🎓 Education Detected
                              </div>
                              {educationAdded ? (
                                <span style={{ fontSize: 11, color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <CheckCircle size={12} /> Added
                                </span>
                              ) : (
                                <button
                                  onClick={handleAddEducationToProfile}
                                  className="btn-primary"
                                  style={{ padding: '6px 14px', fontSize: 11 }}
                                >
                                  <Plus size={12} /> Add to Profile
                                </button>
                              )}
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                              {realResult.education.college && (
                                <span className="tag">
                                  {realResult.education.college}{realResult.education.college_verified ? ' (verified)' : ' (unverified - please check)'}
                                </span>
                              )}
                              {realResult.education.college_location && <span className="tag">{realResult.education.college_location}</span>}
                              {realResult.education.degree && <span className="tag">{realResult.education.degree}</span>}
                              {realResult.education.branch && <span className="tag">{realResult.education.branch}</span>}
                              {realResult.education.cgpa != null && <span className="tag">CGPA {realResult.education.cgpa}</span>}
                              {realResult.education.year != null && <span className="tag">Year {realResult.education.year}</span>}
                            </div>
                          </div>
                        )}

                        {/* Links detected from the resume */}
                        {(realResult.links.github_username || realResult.links.linkedin_url || realResult.links.email || realResult.links.phone) && (
                          <div style={{ marginBottom: 16, paddingTop: 16, borderTop: '1px solid var(--glass-border)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary-light)' }}>
                                🔗 Links & Contact Detected
                              </div>
                              {linksAdded ? (
                                <span style={{ fontSize: 11, color: 'var(--accent-emerald)', display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <CheckCircle size={12} /> Added
                                </span>
                              ) : (
                                <button
                                  onClick={handleAddLinksToProfile}
                                  className="btn-primary"
                                  style={{ padding: '6px 14px', fontSize: 11 }}
                                >
                                  <Plus size={12} /> Add to Profile
                                </button>
                              )}
                            </div>
                            <div style={{ display: 'grid', gap: 4, fontSize: 12, color: 'var(--text-secondary)' }}>
                              {realResult.links.github_username && <div>GitHub: {realResult.links.github_username}</div>}
                              {realResult.links.linkedin_url && <div>LinkedIn: {realResult.links.linkedin_url}</div>}
                              {realResult.links.email && <div>Email: {realResult.links.email}</div>}
                              {realResult.links.phone && <div>Phone: {realResult.links.phone}</div>}
                            </div>
                          </div>
                        )}

                        {/* Projects detected from the resume — display only, StudentProfile has no
                            projects field to merge into today. */}
                        {realResult.projects.length > 0 && (
                          <div style={{ marginBottom: 16, paddingTop: 16, borderTop: '1px solid var(--glass-border)' }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary-light)', marginBottom: 8 }}>
                              💼 Projects Detected ({realResult.projects.length})
                            </div>
                            <div style={{ display: 'grid', gap: 10 }}>
                              {realResult.projects.map((p, i) => (
                                <div key={i} style={{ padding: '10px 12px', background: 'var(--bg-card)', border: '1px solid var(--glass-border)' }}>
                                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{p.title}</div>
                                  {p.tech_stack.length > 0 && (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 4 }}>
                                      {p.tech_stack.map(t => <span key={t} className="tag" style={{ fontSize: 10 }}>{t}</span>)}
                                    </div>
                                  )}
                                  {p.description && <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{p.description}</div>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Experience / internships detected from the resume — display only. */}
                        {realResult.experience.length > 0 && (
                          <div style={{ marginBottom: 16, paddingTop: 16, borderTop: '1px solid var(--glass-border)' }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary-light)', marginBottom: 8 }}>
                              🏢 Experience Detected ({realResult.experience.length})
                            </div>
                            <div style={{ display: 'grid', gap: 10 }}>
                              {realResult.experience.map((exp, i) => (
                                <div key={i} style={{ padding: '10px 12px', background: 'var(--bg-card)', border: '1px solid var(--glass-border)' }}>
                                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{exp.title}</div>
                                  {exp.description && <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{exp.description}</div>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {realResult.raw_sections_found.length > 0 && (
                          <div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent-cyan)', marginBottom: 6 }}>
                              📄 Sections Detected:
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {realResult.raw_sections_found.map(s => <span key={s} className="tag badge-cyan" style={{ fontSize: 10 }}>{s}</span>)}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Tab 4: ATS Score — generic resume-parseability check (no specific
                job involved). Same backend analyzer as Live Internships'
                per-role "ATS Check", called without internship_id so there's
                no keyword-match-vs-a-role section here — that only makes
                sense when comparing against one specific job's requirements. */}
            {activeTab === 'ats' && (
              <div>
                <div style={{ marginBottom: 20 }}>
                  <h3 style={{ fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <ShieldCheck size={20} color="var(--primary-light)" />
                    ATS Score
                  </h3>
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    Real companies use Applicant Tracking System software (Workday, Greenhouse, iCIMS, Oracle Taleo, SAP SuccessFactors, LinkedIn) to automatically parse and filter resumes before a recruiter ever opens them. This checks whether your resume's <strong>formatting and structure</strong> would parse cleanly through that software — things like using real text (not an image), standard section headers, no multi-column layout, and quantified achievements. It's a check on your resume itself, not on any one job — to see how your resume specifically matches a job's required keywords, use the "ATS Check" button on any listing in Live Internships instead.
                  </p>
                </div>

                {!realToken ? (
                  <div style={{ background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-lg)', padding: 24, maxWidth: 420 }}>
                    <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>Session expired — please log in again.</div>
                  </div>
                ) : (
                  <>
                    <button
                      className="btn-primary"
                      onClick={handleRunAtsCheck}
                      disabled={atsLoading}
                      style={{ padding: '12px 24px', fontSize: 14, marginBottom: 24 }}
                    >
                      {atsLoading ? <><RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} /> Running ATS Check...</> : <><ShieldCheck size={16} /> {atsRanOnce ? 'Re-run ATS Check' : 'Run ATS Check'}</>}
                    </button>

                    {atsError && (
                      <div style={{ fontSize: 13, color: 'var(--accent-rose)', marginBottom: 20 }}>{atsError}</div>
                    )}

                    {atsResult && (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24, flexWrap: 'wrap' }}>
                          <div style={{
                            width: 84, height: 84, borderRadius: '50%', flexShrink: 0,
                            background: `conic-gradient(${atsResult.overall_score >= 80 ? 'var(--accent-emerald)' : atsResult.overall_score >= 55 ? 'var(--accent-amber)' : 'var(--accent-rose)'} ${atsResult.overall_score * 3.6}deg, var(--bg-elevated) 0deg)`,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                          }}>
                            <div style={{ width: 68, height: 68, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18 }}>
                              {atsResult.overall_score}
                            </div>
                          </div>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8, flex: 1, minWidth: 260 }}>
                            {Object.entries(atsResult.category_scores).map(([key, val]) => (
                              <div key={key} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', padding: '8px 10px' }}>
                                <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{key.replace(/_/g, ' ')}</div>
                                <div style={{ fontSize: 16, fontWeight: 700 }}>{val}</div>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div style={{ marginBottom: 20 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Parser Checks</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {atsResult.checks.map(c => (
                              <div key={c.id} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', padding: 10 }}>
                                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                  {c.status === 'pass' ? <CheckCircle size={14} color={atsStatusColor(c.status)} style={{ marginTop: 2, flexShrink: 0 }} /> :
                                    c.status === 'warn' ? <AlertTriangle size={14} color={atsStatusColor(c.status)} style={{ marginTop: 2, flexShrink: 0 }} /> :
                                    <XCircle size={14} color={atsStatusColor(c.status)} style={{ marginTop: 2, flexShrink: 0 }} />}
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 12, fontWeight: 600, color: atsStatusColor(c.status) }}>{c.label}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.5 }}>{c.detail}</div>
                                    <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 4 }}>
                                      {c.platforms.join(' · ')}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {atsResult.ai_reviewed && atsResult.genuine_mistakes.length > 0 && (
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                              <Sparkles size={14} color="var(--accent-amber)" /> Recruiter-Style Notes
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {atsResult.genuine_mistakes.map((m, idx) => (
                                <div key={idx} style={{ background: 'var(--bg-elevated)', border: '1px solid var(--glass-border)', padding: 10 }}>
                                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{m.issue}</div>
                                  <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: 4 }}>"{m.quote}"</div>
                                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>{m.why_it_matters}</div>
                                  <div style={{ fontSize: 11, color: 'var(--accent-emerald)' }}>Fix: {m.fix}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {!atsResult.ai_reviewed && (
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>
                            Deterministic checks only — AI-reviewed qualitative notes weren't available for this run.
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
