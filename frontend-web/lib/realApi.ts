// Client for the REAL NexYuva backend (FastAPI + Postgres + real ML), port 8000.
// Separate from lib/apiClient.ts, which talks to the mock Express backend (port 4000).

const REAL_API_BASE = process.env.NEXT_PUBLIC_REAL_API_URL || 'http://localhost:8000/api/v1';

// Legacy single shared key. Was used for every role (student, company, admin)
// at once, so logging into one portal in a tab silently clobbered whatever
// role was logged in on another tab of the same origin -- e.g. logging into
// /admin overwrote the /student session's token, and the next student API
// call came back 403 for the wrong role. Kept only as a read fallback for
// sessions stored before this split, and cleared out once touched.
const LEGACY_TOKEN_KEY = 'nexyuva_real_token';

// Backend role -> frontend route area. Mirrors ROLE_TO_ROUTE in
// app/login/page.tsx -- keep the two in sync.
const ROLE_TO_AREA: Record<string, 'student' | 'company' | 'admin'> = {
  student: 'student',
  organization: 'company',
  admin: 'admin',
};

function tokenKeyForArea(area: 'student' | 'company' | 'admin'): string {
  return `nexyuva_real_token_${area}`;
}

// Which portal is currently on screen, from the URL -- used to pick which
// role's token to read/clear. Login itself doesn't happen under one of
// these paths (it's on /login), so setRealToken below resolves the area
// from the token's own role claim instead of the URL.
function areaFromPathname(): 'student' | 'company' | 'admin' | null {
  if (typeof window === 'undefined') return null;
  const path = window.location.pathname;
  if (path.startsWith('/student')) return 'student';
  if (path.startsWith('/company')) return 'company';
  if (path.startsWith('/admin')) return 'admin';
  return null;
}

function decodeJwtRole(token: string): string | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return typeof payload.role === 'string' ? payload.role : null;
  } catch {
    return null;
  }
}

export function getRealToken(): string | null {
  if (typeof window === 'undefined') return null;
  const area = areaFromPathname();
  if (area) {
    const scoped = localStorage.getItem(tokenKeyForArea(area));
    if (scoped) return scoped;
  }
  // Fallback for sessions stored before the per-role split.
  return localStorage.getItem(LEGACY_TOKEN_KEY);
}

export function setRealToken(token: string) {
  if (typeof window === 'undefined') return;
  const role = decodeJwtRole(token);
  const area = role ? ROLE_TO_AREA[role] : undefined;
  if (area) {
    localStorage.setItem(tokenKeyForArea(area), token);
    // A fresh, resolvable login makes any old shared-key value stale --
    // drop it so a leftover pre-split session can't get picked up by
    // mistake as a fallback for some other area.
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  } else {
    // Couldn't determine the role from the token -- fall back to the
    // legacy shared key rather than silently dropping it.
    localStorage.setItem(LEGACY_TOKEN_KEY, token);
  }
}

export function clearRealToken() {
  if (typeof window === 'undefined') return;
  const area = areaFromPathname();
  if (area) localStorage.removeItem(tokenKeyForArea(area));
  localStorage.removeItem(LEGACY_TOKEN_KEY);
}

async function handle(res: Response) {
  if (!res.ok) {
    let detail = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      detail = body.detail || detail;
    } catch { /* ignore */ }
    throw new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  }
  return res.json();
}

export async function registerStudent(email: string, password: string, fullName: string) {
  const res = await fetch(`${REAL_API_BASE}/auth/register/student`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, full_name: fullName }),
  });
  const data = await handle(res);
  setRealToken(data.access_token);
  return data;
}

export async function loginReal(email: string, password: string) {
  // Real backend's /login uses OAuth2PasswordRequestForm: form-encoded
  // "username"/"password", not JSON — different from every other endpoint.
  const body = new URLSearchParams();
  body.set('username', email);
  body.set('password', password);
  const res = await fetch(`${REAL_API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const data = await handle(res);
  setRealToken(data.access_token);
  return data;
}

export async function forgotPasswordReal(email: string) {
  const res = await fetch(`${REAL_API_BASE}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  return handle(res);
}

export async function resetPasswordReal(token: string, newPassword: string) {
  const res = await fetch(`${REAL_API_BASE}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, new_password: newPassword }),
  });
  return handle(res);
}

export async function getMyRealProfile() {
  const token = getRealToken();
  const res = await fetch(`${REAL_API_BASE}/students/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return handle(res);
}

export interface RealProfileUpdate {
  full_name?: string;
  academic_background?: string;
  location?: string;
  location_preference?: string;
  skills?: string[];
  github_username?: string;
  degree?: string;
  branch?: string;
  year?: number;
  cgpa?: number;
  linkedin_url?: string;
  college?: string;
}

export async function updateMyProfileReal(payload: RealProfileUpdate) {
  const token = getRealToken();
  const res = await fetch(`${REAL_API_BASE}/students/me`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return handle(res);
}

// --- GitHub sync (H2 fix follow-up): the backend endpoint already existed
// and was rate-limited/cached (H1/H2), but nothing on the frontend ever
// called it -- the profile page only ever PATCHed github_username as a
// plain text field, so github_score was computed nowhere the student could
// trigger. This wires it up. ---
export interface GitHubSyncResult {
  github_username: string | null;
  github_score: number | null;
  // The rest of StudentProfileResponse comes back too but the sync UI only
  // needs these two fields.
  [key: string]: unknown;
}

export async function syncGithubProfileReal(githubUsername: string, forceRefresh = false): Promise<GitHubSyncResult> {
  const token = getRealToken();
  const res = await fetch(`${REAL_API_BASE}/students/me/github/sync`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ github_username: githubUsername, force_refresh: forceRefresh }),
  });
  return handle(res);
}

export interface ConfirmedSkillItem {
  name: string;
  category: string;
}

export interface SuggestedSkillItem {
  name: string;
  category: string;
  confidence: number;
  matched_text: string;
}

export interface ResumeLinksItem {
  github_username: string | null;
  linkedin_url: string | null;
  email: string | null;
  phone: string | null;
}

export interface ResumeEducationItem {
  degree: string | null;
  branch: string | null;
  cgpa: number | null;
  year: number | null;
  college: string | null;
  college_location: string | null;
  college_verified: boolean;
}

export interface ResumeProjectItem {
  title: string;
  tech_stack: string[];
  description: string;
}

export interface ResumeExperienceItem {
  title: string;
  description: string;
}

export interface RealResumeParseResult {
  confirmed_skills: ConfirmedSkillItem[];
  suggested_skills: SuggestedSkillItem[];
  academic_background_guess: string | null;
  raw_sections_found: string[];
  // Previously silently dropped by the backend response model — now declared
  // there and here, so the frontend can actually surface them.
  links: ResumeLinksItem;
  education: ResumeEducationItem;
  projects: ResumeProjectItem[];
  experience: ResumeExperienceItem[];
}

export async function uploadResumeReal(file: File): Promise<RealResumeParseResult> {
  const token = getRealToken();
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${REAL_API_BASE}/students/me/resume`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  return handle(res);
}


// --- Production ATS Analyzer (nexyuva_supplemental_audit.docx M5 follow-up).
// Deterministic parseability/structure/content checks against the platforms
// real Indian/global employers run (Workday, Greenhouse, iCIMS, Taleo,
// SuccessFactors, LinkedIn), plus an optional literal keyword-gap check
// against one specific Live Internship's required_skills, plus an optional
// Groq qualitative pass. See backend/app/ai/ats_analyzer.py docstring. ---

export interface ATSCheckItem {
  id: string;
  status: 'pass' | 'warn' | 'fail';
  label: string;
  detail: string;
  platforms: string[];
}

export interface ATSGenuineMistake {
  issue: string;
  quote: string;
  why_it_matters: string;
  fix: string;
}

export interface ATSFrameworkNote {
  platform: string;
  note: string;
}

export interface ATSKeywordGap {
  matched: string[];
  missing: string[];
}

export interface ATSAnalysisResult {
  overall_score: number;
  category_scores: Record<string, number>;
  checks: ATSCheckItem[];
  genuine_mistakes: ATSGenuineMistake[];
  ai_reviewed: boolean;
  framework_notes: ATSFrameworkNote[];
  keyword_gap: ATSKeywordGap | null;
}

export async function getAtsAnalysisReal(internshipId?: string, includeAi: boolean = true): Promise<ATSAnalysisResult> {
  const params = new URLSearchParams();
  if (internshipId) params.set('internship_id', internshipId);
  if (!includeAi) params.set('include_ai', 'false');
  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${REAL_API_BASE}/students/me/ats-analysis${qs}`, { headers: authHeaders() });
  return handle(res);
}


// --- Proctored Assessment (real backend, adaptive quiz + badge) ---

export interface AssessmentQuestion {
  id: string;
  difficulty: string;
  question: string;
  options: string[];
}

export interface StartAssessmentResult {
  attempt_id: string;
  domain: string;
  question: AssessmentQuestion;
}

export interface AnswerResult {
  was_correct: boolean;
  attempt_status: 'in_progress' | 'completed';
  next_question: AssessmentQuestion | null;
  final_score?: number;
  integrity_score?: number;
  passed?: boolean;
  badge_awarded?: boolean;
}

function authHeaders() {
  const token = getRealToken();
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export async function startAssessment(domain: string): Promise<StartAssessmentResult> {
  const res = await fetch(`${REAL_API_BASE}/assessments/start`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ domain }),
  });
  return handle(res);
}

export async function submitAssessmentAnswer(attemptId: string, questionId: string, selectedIndex: number): Promise<AnswerResult> {
  const res = await fetch(`${REAL_API_BASE}/assessments/${attemptId}/answer`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ question_id: questionId, selected_index: selectedIndex }),
  });
  return handle(res);
}

export async function reportIntegrityFlag(attemptId: string, flagType: string, count: number = 1) {
  try {
    await fetch(`${REAL_API_BASE}/assessments/${attemptId}/integrity-flag`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ flag_type: flagType, count }),
    });
  } catch { /* never let integrity logging break the test */ }
}

export interface BadgeInfo { domain: string; awarded_at: string; }

export async function getMyBadges(): Promise<BadgeInfo[]> {
  const token = getRealToken();
  const res = await fetch(`${REAL_API_BASE}/assessments/me/badges`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return handle(res);
}

// --- Per-application video interview (real backend, Groq + Gemini) ---

export interface InterviewQuestion { index: number; question: string; }
export interface StartInterviewResult { attempt_id: string; questions: InterviewQuestion[]; }
export interface AnswerInterviewResult {
  graded: boolean; all_answered: boolean;
  final_score?: number; integrity_score?: number; passed?: boolean; badge_awarded?: boolean;
}
export interface FrameCheckResult { phone_detected: boolean; multiple_people: boolean; no_person: boolean; }
export interface InterviewResult {
  status: string; final_score: number | null; integrity_score: number | null;
  passed: boolean | null; badge_awarded: boolean;
  questions: {
    question: string; answer: string | null; score: number | null; notes: string | null;
    resume_consistent: boolean | null;
  }[];
  integrity_flags: { flag_type: string; count: number; timestamps: string[] }[];
}

export async function startInterview(applicationId: string): Promise<StartInterviewResult> {
  const res = await fetch(`${REAL_API_BASE}/students/applications/${applicationId}/interview/start`, {
    method: 'POST', headers: authHeaders(),
  });
  return handle(res);
}

export async function submitInterviewAnswer(applicationId: string, questionIndex: number, answer: string): Promise<AnswerInterviewResult> {
  const res = await fetch(`${REAL_API_BASE}/students/applications/${applicationId}/interview/answer`, {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({ question_index: questionIndex, answer }),
  });
  return handle(res);
}

export async function reportInterviewFlag(applicationId: string, flagType: string, count: number = 1) {
  try {
    await fetch(`${REAL_API_BASE}/students/applications/${applicationId}/interview/integrity-flag`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ flag_type: flagType, count }),
    });
  } catch { /* never block the interview on logging failure */ }
}

export async function checkInterviewFrame(applicationId: string, imageBase64: string): Promise<FrameCheckResult> {
  const res = await fetch(`${REAL_API_BASE}/students/applications/${applicationId}/interview/frame-check`, {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({ image_base64: imageBase64 }),
  });
  return handle(res);
}

export async function getInterviewResult(applicationId: string): Promise<InterviewResult> {
  const res = await fetch(`${REAL_API_BASE}/students/applications/${applicationId}/interview/result`, {
    headers: authHeaders(),
  });
  return handle(res);
}

export async function uploadInterviewQuestionsPdf(internshipId: string, file: File): Promise<{ questions_parsed: number }> {
  const token = getRealToken();
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${REAL_API_BASE}/organizations/internships/${internshipId}/interview-questions`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: formData,
  });
  return handle(res);
}

export async function updateAptitudeCheck(internshipId: string, enabled: boolean, difficulty?: string): Promise<{ aptitude_check_enabled: boolean; aptitude_difficulty: string }> {
  const res = await fetch(`${REAL_API_BASE}/organizations/internships/${internshipId}/aptitude-check`, {
    method: 'PATCH', headers: authHeaders(),
    body: JSON.stringify({ aptitude_check_enabled: enabled, aptitude_difficulty: difficulty }),
  });
  return handle(res);
}


// --- Real internships / applications (bridges the interview feature to real data) ---

export interface RealRecommendation {
  internship_id: string; organization_id: string; title: string; organization_name: string; domain: string;
  location: string; work_mode: 'remote' | 'hybrid' | 'on_site'; duration_weeks: number;
  stipend: number | null; final_score: number;
  content_based_score: number | null; skill_overlap_score: number; collaborative_score: number | null;
  matched_skills: string[]; required_skills: string[]; explanation: string;
  description: string | null; responsibilities: string | null; eligibility: string | null;
  perks: string[] | null; cgpa_cutoff: number | null; sector: string;
  aptitude_check_enabled: boolean;
}

export async function getRealRecommendations(): Promise<RealRecommendation[]> {
  const res = await fetch(`${REAL_API_BASE}/recommendations/me`, { headers: authHeaders() });
  return handle(res);
}

// --- Luckship: student-side AI opportunity hunter. Goes OUTSIDE NexYuva's
// own internship table (unlike recommendations/me above) to public job
// boards, so the response shape is intentionally separate from
// RealRecommendation -- no organization_id, no internal internship_id, a
// direct external url instead. ---
export interface LuckshipOpportunity {
  source: string;
  external_id: string;
  title: string;
  company: string;
  location: string | null;
  remote: boolean;
  url: string;
  match_score: number;
  matched_skills: string[];
  missing_skills: string[];
  prep_estimate: string;
  posted_at: string | null;
  explanation: string;
}

export interface LuckshipHuntResult {
  opportunities: LuckshipOpportunity[];
  queries_used: string[];
  sources_checked: string[];
  stale_cache: boolean;
}

export async function huntLuckshipOpportunities(refresh: boolean = false): Promise<LuckshipHuntResult> {
  const qs = refresh ? '?refresh=true' : '';
  const res = await fetch(`${REAL_API_BASE}/luckship/hunt${qs}`, { headers: authHeaders() });
  return handle(res);
}

// --- Adapters: real FastAPI/Postgres pipeline -> the exact shapes the
// dashboard UI already renders (see lib/types.ts). This is the C1/C2 audit
// fix — repointing the dashboard at the real ML backend instead of the
// Node/JSON duplicate, without having to rewrite every consuming page. ---
import type {
  Internship as UiInternship, MatchResult as UiMatchResult,
  CompetencyDimensions as UiCompetencyDimensions,
  CareerPathPrediction as UiCareerPathPrediction,
  SkillGapAnalysis as UiSkillGapAnalysis,
} from './types';

const WORK_MODE_LABEL: Record<string, 'Remote' | 'Hybrid' | 'On-site'> = {
  remote: 'Remote', hybrid: 'Hybrid', on_site: 'On-site',
};

function toUiInternship(r: RealRecommendation): UiInternship {
  return {
    id: r.internship_id,
    title: r.title,
    company: r.organization_name,
    domain: r.domain,
    location: r.location,
    mode: WORK_MODE_LABEL[r.work_mode] || 'On-site',
    duration: `${r.duration_weeks} weeks`,
    stipend: r.stipend ?? 0,
    requiredSkills: r.required_skills,
    preferredSkills: [],
    description: r.description || '',
    responsibilities: r.responsibilities ? [r.responsibilities] : [],
    eligibility: r.eligibility || 'See internship listing for eligibility criteria',
    perks: r.perks ?? [],
    cgpaCutoff: r.cgpa_cutoff ?? undefined,
    openings: 1,
    postedDate: '',
    deadline: '',
    sector: (['Government', 'PSU', 'Private', 'NGO', 'Startup'].includes(r.sector) ? r.sector : 'Private') as UiInternship['sector'],
  };
}

function confidenceFromScore(score: number): UiMatchResult['confidenceLevel'] {
  if (score >= 85) return 'Very High Confidence';
  if (score >= 70) return 'High Confidence';
  if (score >= 50) return 'Moderate Confidence';
  return 'Limited Confidence';
}

export async function getRealRecommendationsAsMatchResults(): Promise<UiMatchResult[]> {
  const recs = await getRealRecommendations();
  return recs.map(r => {
    const score = Math.round(r.final_score * 100);
    const missingSkills = r.required_skills.filter(s => !r.matched_skills.includes(s));
    return {
      internship: toUiInternship(r),
      score,
      confidenceLevel: confidenceFromScore(score),
      confidenceScore: Math.round((r.content_based_score ?? r.skill_overlap_score) * 100),
      matchedSkills: r.matched_skills,
      missingSkills,
      bonusFactors: [],
      explanation: r.explanation,
      areasForImprovement: missingSkills.length > 0
        ? [`Build core proficiency in ${missingSkills.slice(0, 2).join(' and ')}.`]
        : ['Complete an advanced domain certification to boost candidate ranking.'],
    };
  });
}

export interface RealCompetencyDimensions {
  academic_excellence: number; technical_expertise: number; project_maturity: number;
  professional_experience: number; innovation: number; leadership: number;
  communication: number; career_readiness: number;
}

export async function getRealCompetencyDimensions(): Promise<UiCompetencyDimensions> {
  const res = await fetch(`${REAL_API_BASE}/recommendations/competency`, { headers: authHeaders() });
  const d: RealCompetencyDimensions = await handle(res);
  return {
    academicExcellence: d.academic_excellence,
    technicalExpertise: d.technical_expertise,
    projectMaturity: d.project_maturity,
    professionalExperience: d.professional_experience,
    innovation: d.innovation,
    leadership: d.leadership,
    communication: d.communication,
    careerReadiness: d.career_readiness,
  };
}

// Enrichment for the 7 real RandomForest career-path classes (backend/app/ai/career_path.py
// TRAINING_DATA labels) — the model predicts a bare label + probability;
// this is display content the dashboard card needs (growth rate, key
// skills, certs, description), kept client-side as static reference data
// rather than bolted onto the ML response.
const CAREER_PATH_INFO: Record<string, { domain: string; growthRate: string; keySkillsNeeded: string[]; recommendedCertifications: string[]; description: string }> = {
  'Backend Engineer': {
    domain: 'Information Technology', growthRate: '+22% YoY Demand',
    keySkillsNeeded: ['System Design', 'Docker', 'Redis', 'REST APIs'],
    recommendedCertifications: ['AWS Certified Developer', 'Oracle Certified Professional: Java'],
    description: 'Design and maintain the server-side logic, databases, and APIs that power applications.',
  },
  'Frontend Engineer': {
    domain: 'Information Technology', growthRate: '+19% YoY Demand',
    keySkillsNeeded: ['TypeScript', 'Testing', 'Accessibility', 'Performance Optimization'],
    recommendedCertifications: ['Meta Front-End Developer Specialization', 'JavaScript Algorithms and Data Structures'],
    description: 'Build the user-facing interfaces and experiences that users interact with directly.',
  },
  'Full-Stack Engineer': {
    domain: 'Information Technology', growthRate: '+24% YoY Demand',
    keySkillsNeeded: ['System Design', 'Docker', 'AWS', 'GraphQL'],
    recommendedCertifications: ['AWS Certified Developer', 'Meta Front-End Developer Specialization'],
    description: 'High demand career path building modern scalable web applications and enterprise cloud APIs.',
  },
  'Data Analyst': {
    domain: 'Business & Analytics', growthRate: '+18% YoY Demand',
    keySkillsNeeded: ['SQL', 'Excel', 'Data Visualization', 'Statistics'],
    recommendedCertifications: ['Google Data Analytics', 'PMI Certified Associate in Project Management'],
    description: 'Bridge business requirements with data-driven insight across private and government enterprises.',
  },
  'ML Engineer': {
    domain: 'Artificial Intelligence & Data', growthRate: '+32% YoY Demand',
    keySkillsNeeded: ['Deep Learning', 'PyTorch', 'NLP', 'MLOps'],
    recommendedCertifications: ['TensorFlow Developer Certificate', 'Google Data Analytics Professional'],
    description: 'Design intelligence systems, ML models, and predictive data analytics for industry and government.',
  },
  'DevOps Engineer': {
    domain: 'Cloud Computing', growthRate: '+28% YoY Demand',
    keySkillsNeeded: ['Kubernetes', 'Terraform', 'CI/CD', 'Ansible'],
    recommendedCertifications: ['AWS Solutions Architect Associate', 'Certified Kubernetes Administrator (CKA)'],
    description: 'Manage automated cloud infrastructure, container orchestration, and continuous integration pipelines.',
  },
  'Product/Project Analyst': {
    domain: 'Business & Analytics', growthRate: '+18% YoY Demand',
    keySkillsNeeded: ['Agile', 'Scrum', 'Stakeholder Communication', 'Roadmapping'],
    recommendedCertifications: ['PMI Certified Associate in Project Management', 'Certified ScrumMaster'],
    description: 'Coordinate cross-functional delivery, translating business goals into shippable technical plans.',
  },
};

export interface RealCareerPathPrediction {
  predicted_path: string; confidence: number;
  all_paths_ranked: { path: string; probability: number }[];
  top_contributing_skills: { skill: string; importance: number }[];
  skills_not_recognized: string[];
}

export async function getRealCareerPathRaw(): Promise<RealCareerPathPrediction | null> {
  const res = await fetch(`${REAL_API_BASE}/recommendations/career-path`, { headers: authHeaders() });
  if (res.status === 503) return null; // model not trained yet
  return handle(res);
}

export async function getRealCareerPathPredictions(): Promise<UiCareerPathPrediction[]> {
  const raw = await getRealCareerPathRaw();
  if (!raw) return [];
  return raw.all_paths_ranked.map(({ path, probability }) => {
    const info = CAREER_PATH_INFO[path] || {
      domain: 'Information Technology', growthRate: '—',
      keySkillsNeeded: [], recommendedCertifications: [], description: '',
    };
    return {
      title: path,
      domain: info.domain,
      matchProbability: Math.round(probability * 100),
      growthRate: info.growthRate,
      keySkillsNeeded: info.keySkillsNeeded,
      recommendedCertifications: info.recommendedCertifications,
      description: info.description,
    };
  });
}

export interface RealSkillGapResult {
  target: string; match_percentage: number;
  matched_skills: string[]; missing_skills: string[]; additional_skills_you_have: string[];
}

export async function getRealSkillGapRaw(targetPath: string): Promise<RealSkillGapResult> {
  const res = await fetch(`${REAL_API_BASE}/recommendations/skill-gap?target_path=${encodeURIComponent(targetPath)}`, { headers: authHeaders() });
  return handle(res);
}

export async function getRealSkillGapAnalysis(targetPath: string): Promise<UiSkillGapAnalysis> {
  const raw = await getRealSkillGapRaw(targetPath);
  const learningRoadmap = raw.missing_skills.map((skill, index) => ({
    step: index + 1,
    title: `Master ${skill}`,
    resource: `Recommended Course: "${skill} Fundamentals & Practical Projects"`,
    duration: `${2 + index * 2} weeks`,
  }));
  return {
    targetRole: raw.target,
    currentMatch: raw.match_percentage,
    missingSkills: raw.missing_skills,
    learningRoadmap,
    recommendedCertifications: [
      `Official ${raw.target} Practitioner Certification`,
      `Hands-On ${raw.missing_skills[0] || 'Core'} Developer Badge`,
    ],
  };
}

export async function applyToInternshipReal(internshipId: string): Promise<{ id: string }> {
  const res = await fetch(`${REAL_API_BASE}/students/me/applications`, {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({ internship_id: internshipId }),
  });
  return handle(res);
}

export async function getMyRealApplications(): Promise<any[]> {
  const res = await fetch(`${REAL_API_BASE}/students/me/applications`, { headers: authHeaders() });
  return handle(res);
}

export interface InternshipDetail {
  internship_id: string; title: string; organization_name: string; domain: string;
  location: string; work_mode: 'remote' | 'hybrid' | 'on_site'; duration_weeks: number;
  stipend: number | null; aptitude_check_enabled: boolean;
}

// Direct by-ID lookup -- unlike getRealRecommendations() (top_k ranked
// matches only), this always finds the internship regardless of where it
// ranks for this student. Used by the post-apply journey page so a step
// like Aptitude Check doesn't silently disappear for applications outside
// the student's top-10 recommendation list.
export async function getInternshipDetailReal(internshipId: string): Promise<InternshipDetail> {
  const res = await fetch(`${REAL_API_BASE}/students/internships/${internshipId}`, { headers: authHeaders() });
  return handle(res);
}

export async function withdrawRealApplication(applicationId: string): Promise<any> {
  const res = await fetch(`${REAL_API_BASE}/students/me/applications/${applicationId}/withdraw`, {
    method: 'PATCH', headers: authHeaders(),
  });
  return handle(res);
}

export interface RealInternshipCreate {
  title: string; domain: string; required_skills: string[]; description: string;
  duration_weeks: number; stipend: number | null; location: string;
  work_mode: 'remote' | 'hybrid' | 'on_site';
}

export async function postInternshipReal(payload: RealInternshipCreate): Promise<{ id: string }> {
  const res = await fetch(`${REAL_API_BASE}/organizations/internships`, {
    method: 'POST', headers: authHeaders(), body: JSON.stringify(payload),
  });
  return handle(res);
}

export async function getMyRealInternships(): Promise<any[]> {
  const res = await fetch(`${REAL_API_BASE}/organizations/internships`, { headers: authHeaders() });
  return handle(res);
}

// --- Sourcing Agent (AI Talent Discovery): ranks the full student pool
// against one posting, not just students who already applied. See
// backend/app/services/organization/routes.py's source_candidates. ---

export interface SkillConfidence {
  skill: string;
  confidence: number;
  evidence: string[];
}

export interface RecommendationConfidence {
  level: 'High' | 'Medium' | 'Low';
  profile_completeness: number;
  verified_skills_count: number;
  github_connected: boolean;
  assessment_completed: boolean;
}

export interface ScoreBreakdown {
  skill_match: number;        // Weight 40%
  project_relevance: number;  // Weight 25%
  education_match: number;    // Weight 10%
  resume_similarity: number;  // Weight 10%
  verified_skills: number;    // Weight 10%
  location_preference: number;// Weight 5%
  overall_score: number;      // 0 - 100%
}

export interface SourcedCandidate {
  student_id: string;
  full_name: string;
  college: string | null;
  degree: string | null;
  branch: string | null;
  year: number | null;
  cgpa: number | null;
  location: string | null;
  skills: string[];
  resume_score: number;
  github_username: string | null;
  github_score: number | null;
  linkedin_verified: boolean;
  final_score: number;
  content_based_score: number | null;
  skill_overlap_score: number;
  matched_skills: string[];
  missing_skills: string[];
  explanation: string;
  skill_confidence: SkillConfidence[];
  recommendation_confidence: RecommendationConfidence;
  score_breakdown?: ScoreBreakdown;
  already_applied: boolean;
  application_status: string | null;
  stand_out_badge: boolean;
  has_aptitude_badge: boolean;
  aptitude_score: number | null;
  aptitude_percentile: number | null;
  ai_pitch: string | null;
}

export function getOrComputeScoreBreakdown(candidate: SourcedCandidate): ScoreBreakdown {
  if (candidate.score_breakdown) {
    return candidate.score_breakdown;
  }

  // 1. Skill Match (40%)
  const totalSkillsCount = (candidate.matched_skills.length + candidate.missing_skills.length) || 1;
  const reqRatio = candidate.matched_skills.length / totalSkillsCount;
  const skill_match = Math.round(Math.min(100, reqRatio * 100));

  // 2. Project Relevance (25%)
  let project_relevance = 0;
  if (candidate.github_score != null && candidate.github_score > 0) {
    project_relevance = Math.round(Math.min(100, candidate.github_score));
  } else if (candidate.skills && candidate.skills.length > 0) {
    project_relevance = Math.min(50, candidate.skills.length * 8);
  }

  // 3. Education Match (10%)
  let education_match = 50;
  if (candidate.cgpa != null) {
    if (candidate.cgpa >= 7.0) {
      education_match = Math.min(100, Math.round(70 + (candidate.cgpa - 7.0) * 10));
    } else {
      education_match = Math.max(0, Math.round((candidate.cgpa / 7.0) * 50));
    }
  }

  // 4. Resume Similarity (10%)
  let resume_similarity = 0;
  if (candidate.content_based_score != null) {
    resume_similarity = Math.round(Math.min(100, Math.max(0, (candidate.content_based_score + 0.1) / 1.1 * 100)));
  } else if (candidate.resume_score) {
    resume_similarity = candidate.resume_score;
  } else {
    resume_similarity = 20;
  }

  // 5. Verified Skills (10%)
  let verified_skills = 0;
  if (candidate.linkedin_verified) verified_skills += 35;
  if (candidate.recommendation_confidence?.assessment_completed) verified_skills += 45;
  if (candidate.recommendation_confidence?.verified_skills_count) {
    verified_skills += Math.min(30, candidate.recommendation_confidence.verified_skills_count * 10);
  }
  verified_skills = Math.min(100, verified_skills);

  // 6. Location Preference (5%)
  const location_preference = candidate.location ? 90 : 50;

  const overall_score = Math.round(
    skill_match * 0.40 +
    project_relevance * 0.25 +
    education_match * 0.10 +
    resume_similarity * 0.10 +
    verified_skills * 0.10 +
    location_preference * 0.05
  );

  return {
    skill_match,
    project_relevance,
    education_match,
    resume_similarity,
    verified_skills,
    location_preference,
    overall_score,
  };
}

export async function getSourcedCandidatesReal(
  internshipId: string,
  opts?: {
    topK?: number; minCgpa?: number; withAiPitch?: boolean;
    matchThreshold?: number; degree?: string; college?: string;
    graduationYear?: number; location?: string; skills?: string[];
    onlyVerified?: boolean; onlyUntapped?: boolean; minConfidence?: 'High' | 'Medium' | 'Low';
    hasAptitudeBadge?: boolean;
  }
): Promise<SourcedCandidate[]> {
  const params = new URLSearchParams();
  if (opts?.topK) params.set('top_k', String(opts.topK));
  if (opts?.minCgpa != null) params.set('min_cgpa', String(opts.minCgpa));
  if (opts?.withAiPitch === false) params.set('with_ai_pitch', 'false');
  if (opts?.matchThreshold != null) params.set('match_threshold', String(opts.matchThreshold));
  if (opts?.degree) params.set('degree', opts.degree);
  if (opts?.college) params.set('college', opts.college);
  if (opts?.graduationYear != null) params.set('graduation_year', String(opts.graduationYear));
  if (opts?.location) params.set('location', opts.location);
  if (opts?.skills && opts.skills.length > 0) params.set('skills', opts.skills.join(','));
  if (opts?.onlyVerified) params.set('only_verified', 'true');
  if (opts?.onlyUntapped) params.set('only_untapped', 'true');
  if (opts?.hasAptitudeBadge) params.set('has_aptitude_badge', 'true');
  if (opts?.minConfidence) params.set('min_confidence', opts.minConfidence);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${REAL_API_BASE}/organizations/internships/${internshipId}/sourcing${qs}`, {
    headers: authHeaders(),
  });
  return handle(res);
}

export interface ScreeningResult {
  student_id: string;
  internship_id: string;
  fit_score: number;
  overall_confidence: string;
  rationale: string;
  needs_manual_review: boolean;
  next_action: 'advance' | 'review' | 'reject';
  next_action_label: string;
  screened_at: string;
}

export async function screenCandidateReal(
  internshipId: string,
  studentId: string
): Promise<ScreeningResult> {
  const res = await fetch(
    `${REAL_API_BASE}/organizations/internships/${internshipId}/candidates/${studentId}/screen`,
    {
      method: 'POST',
      headers: authHeaders(),
    }
  );
  return handle(res);
}

export async function registerOrganization(email: string, password: string, orgName: string) {
  const res = await fetch(`${REAL_API_BASE}/auth/register/organization`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, organization_name: orgName }),
  });
  const data = await handle(res);
  setRealToken(data.access_token);
  return data;
}


// --- Company verification workflow (real backend, replaces the old
// browser-localStorage-only companyStore.ts) ---

export interface OrgVerificationInfo {
  company_name: string;
  status: 'unsubmitted' | 'pending' | 'approved' | 'rejected';
  verification_doc_name: string | null;
  submitted_at: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  is_verified: boolean;
}

export async function getMyOrgVerification(): Promise<OrgVerificationInfo> {
  const res = await fetch(`${REAL_API_BASE}/organizations/me/verification`, { headers: authHeaders() });
  return handle(res);
}

export async function uploadVerificationDocument(file: File): Promise<OrgVerificationInfo> {
  const token = getRealToken();
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${REAL_API_BASE}/organizations/verification-document`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  return handle(res);
}

// --- Admin: organization verification review ---

export interface PendingOrganization {
  id: string;
  name: string;
  description: string | null;
  verification_doc_name: string | null;
  submitted_at: string | null;
}

export async function getPendingOrganizationsReal(): Promise<PendingOrganization[]> {
  // M4 fix: backend now returns { total, limit, offset, items } instead of
  // a bare array, so pending-org volume can be paginated server-side.
  // Fetching a generous single page here (100 = the backend's max) keeps
  // this function's return type/behavior unchanged for existing callers;
  // revisit with real pagination controls if the admin queue ever
  // routinely exceeds 100.
  const res = await fetch(`${REAL_API_BASE}/admin/organizations/pending?limit=100`, { headers: authHeaders() });
  const data = await handle(res);
  return data.items;
}

export async function approveOrganizationReal(orgId: string) {
  const res = await fetch(`${REAL_API_BASE}/admin/organizations/${orgId}/verify`, {
    method: 'POST', headers: authHeaders(),
  });
  return handle(res);
}

export async function rejectOrganizationReal(orgId: string, reason?: string) {
  const res = await fetch(`${REAL_API_BASE}/admin/organizations/${orgId}/reject`, {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({ reason }),
  });
  return handle(res);
}

export async function downloadVerificationDocumentReal(orgId: string): Promise<Blob> {
  const token = getRealToken();
  const res = await fetch(`${REAL_API_BASE}/admin/organizations/${orgId}/verification-document`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Could not download document');
  return res.blob();
}


// --- Full student profile (replaces lib/userContext.ts's localStorage-only
// store — bio, tools, preferred domains/locations/mode, min stipend now
// persist server-side like everything else on the profile). ---

export interface RealStudentProfile {
  full_name: string;
  email: string;
  avatar_url: string | null;
  academic_background: string | null;
  location: string | null;
  location_preference: string | null;
  skills: string[];
  resume_path: string | null;
  resume_score: number;
  github_username: string | null;
  github_score: number | null;
  linkedin_verified: boolean;
  linkedin_headline: string | null;
  degree: string | null;
  branch: string | null;
  year: number | null;
  cgpa: number | null;
  linkedin_url: string | null;
  bio: string | null;
  college: string | null;
  tools: string[];
  preferred_domains: string[];
  preferred_locations: string[];
  preferred_mode: string | null;
  min_stipend: number | null;
}

export async function getMyFullProfileReal(): Promise<RealStudentProfile> {
  const res = await fetch(REAL_API_BASE + '/students/me', { headers: authHeaders() });
  return handle(res);
}

// --- Avatar upload. Mirrors uploadResumeReal's multipart pattern; the
// backend returns just { avatar_url } rather than the full profile, since
// nothing else on the profile changes from this call. ---
export async function uploadAvatarReal(file: File): Promise<{ avatar_url: string }> {
  const token = getRealToken();
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${REAL_API_BASE}/students/me/avatar`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  return handle(res);
}

// avatar_url from the backend is a path like "/uploads/avatars/xyz.png" --
// this resolves it against the API's origin (not REAL_API_BASE, which has
// the /api/v1 suffix) so <img src> works regardless of deployment host.
export function resolveAvatarUrl(avatarUrl: string | null | undefined): string | null {
  if (!avatarUrl) return null;
  if (avatarUrl.startsWith('http')) return avatarUrl;
  const origin = REAL_API_BASE.replace(/\/api\/v1\/?$/, '');
  return origin + avatarUrl;
}

export interface CollegeLookupResult {
  name: string;
  city: string;
  state: string;
}

export interface CityLookupResult {
  name: string;
  district?: string;
  state?: string;
}

// Unauthenticated (public reference-data lookups, used on the register
// page before a token exists, and in the profile autocomplete).
export async function searchCollegesReal(q: string, limit = 10): Promise<CollegeLookupResult[]> {
  if (q.trim().length < 2) return [];
  const res = await fetch(REAL_API_BASE + `/lookup/colleges?q=${encodeURIComponent(q)}&limit=${limit}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.results || [];
}

export async function searchCitiesReal(q: string, limit = 10): Promise<CityLookupResult[]> {
  if (q.trim().length < 2) return [];
  const res = await fetch(REAL_API_BASE + `/lookup/cities?q=${encodeURIComponent(q)}&limit=${limit}`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.results || [];
}

export interface RealFullProfileUpdate {
  full_name?: string;
  academic_background?: string;
  location?: string;
  location_preference?: string;
  skills?: string[];
  github_username?: string;
  degree?: string;
  branch?: string;
  year?: number;
  cgpa?: number;
  linkedin_url?: string;
  bio?: string;
  college?: string;
  tools?: string[];
  preferred_domains?: string[];
  preferred_locations?: string[];
  preferred_mode?: string;
  min_stipend?: number;
}

export async function updateMyFullProfileReal(payload: RealFullProfileUpdate): Promise<RealStudentProfile> {
  const res = await fetch(REAL_API_BASE + '/students/me', {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  return handle(res);
}

// --- Company ATS webhook settings (Company > Integrations page) ---

export interface WebhookConfig {
  webhook_url: string | null;
  webhook_ats: string | null;
  webhook_enabled: boolean;
}

export async function getMyWebhookConfigReal(): Promise<WebhookConfig> {
  const res = await fetch(REAL_API_BASE + '/organizations/me/webhook', { headers: authHeaders() });
  return handle(res);
}

export async function updateMyWebhookConfigReal(payload: Partial<WebhookConfig>): Promise<WebhookConfig> {
  const res = await fetch(REAL_API_BASE + '/organizations/me/webhook', {
    method: 'PATCH',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  return handle(res);
}

// --- Role, derived from the JWT itself instead of a separate
// localStorage('nexyuva_role') value that could drift out of sync with
// whichever account is actually logged in. ---

export function getStoredRole(): string | null {
  const token = getRealToken();
  if (!token) return null;
  try {
    const payloadB64 = token.split('.')[1];
    const json = decodeURIComponent(
      atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/'))
        .split('')
        .map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    );
    const payload = JSON.parse(json);
    const ROLE_TO_ROUTE: Record<string, string> = { student: 'student', organization: 'company', admin: 'admin' };
    return ROLE_TO_ROUTE[payload.role] || payload.role || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Module 6 & 10 — Smart Bulk AI Invitation & Anti-Spam Protection
// ---------------------------------------------------------------------------

export interface BulkInvitePreview {
  threshold: number;
  candidates_found: number;
  already_invited: number;
  cooldown_skipped: number;
  opted_out_skipped: number;
  daily_quota_remaining: number;
  net_to_invite: number;
  estimated_response_rate: number;
  estimated_processing_seconds: number;
  quality_warning: string | null;
}

export interface BulkInviteResult {
  invited_count: number;
  skipped_duplicates: number;
  skipped_cooldown: number;
  skipped_opt_out: number;
  skipped_daily_limit: number;
  processing_time_ms: number;
  internship_id: string;
}

export interface OutreachHealth {
  organization_id: string;
  total_invitations_sent: number;
  total_invitations_accepted: number;
  acceptance_rate: number;
  quality_status: 'HEALTHY' | 'NEEDS_IMPROVEMENT' | 'POOR_CONVERSION_WARN';
  quality_recommendation: string;
  recommended_threshold: number;
  daily_outreach_limit: number;
  invites_sent_today: number;
  daily_invites_remaining: number;
}

export interface StudentNotification {
  id: string;
  title: string;
  body: string;
  action_url: string | null;
  is_read: boolean;
  created_at: string;
  internship_id: string;
  organization_id: string;
}

export async function getBulkInvitePreview(
  internshipId: string,
  threshold: number,
): Promise<BulkInvitePreview> {
  const token = getRealToken();
  const res = await fetch(
    `${REAL_API_BASE}/organizations/internships/${internshipId}/bulk-invite/preview?threshold=${threshold}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return handle(res);
}

export async function sendBulkInvite(
  internshipId: string,
  threshold: number,
  studentIds?: string[],
): Promise<BulkInviteResult> {
  const token = getRealToken();
  const res = await fetch(
    `${REAL_API_BASE}/organizations/internships/${internshipId}/bulk-invite`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        threshold,
        student_ids: studentIds ?? null,
      }),
    },
  );
  return handle(res);
}

export async function getOutreachHealth(): Promise<OutreachHealth> {
  const token = getRealToken();
  const res = await fetch(
    `${REAL_API_BASE}/organizations/outreach-health`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return handle(res);
}

export async function getStudentNotifications(unreadOnly = false): Promise<StudentNotification[]> {
  const token = getRealToken();
  const res = await fetch(
    `${REAL_API_BASE}/organizations/notifications?unread_only=${unreadOnly}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  return handle(res);
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const token = getRealToken();
  const res = await fetch(
    `${REAL_API_BASE}/organizations/notifications/${notificationId}/read`,
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  await handle(res);
}

export async function updateStudentInvitationPreferences(
  allowInvitations: boolean,
  maxWeeklyInvites: number,
): Promise<void> {
  const token = getRealToken();
  const res = await fetch(
    `${REAL_API_BASE}/students/me/invitation-preferences`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        allow_invitations: allowInvitations,
        max_weekly_invites: maxWeeklyInvites,
      }),
    },
  );
  await handle(res);
}

// --- Interview Agent (5.4): company-facing review dashboard. Read-only
// over the same InterviewAttempt data the student-side interview flow
// writes (see backend/app/services/organization/routes.py's
// list_applicants / get_applicant_interview). ---

export interface ApplicantInterviewSummary {
  status: string;
  final_score: number | null;
  integrity_score: number | null;
  passed: boolean | null;
}

export interface ApplicantAptitudeSummary {
  attempts_used: number;
  status: 'not_started' | 'in_progress' | 'completed';
  raw_score: number | null;
  percentile: number | null;
  integrity_score: number | null;
  passed: boolean | null;
  badge_awarded: boolean;
}

export interface ApplicantListItem {
  id: string;
  student_id: string;
  candidate_name: string;
  status: string;
  applied_at: string;
  interview: ApplicantInterviewSummary | null;
  aptitude: ApplicantAptitudeSummary | null;
}

export interface InterviewQuestionDetail {
  question: string;
  answer: string | null;
  score: number | null;
  notes: string | null;
  resume_consistent: boolean | null;
}

export interface IntegrityFlagDetail {
  flag_type: string;
  count: number;
  timestamps: string[];
}

export interface InterviewReviewDetail {
  application_id: string;
  student_id: string;
  candidate_name: string;
  internship_id: string;
  internship_title: string;
  status: string;
  final_score: number | null;
  integrity_score: number | null;
  passed: boolean | null;
  badge_awarded: boolean;
  questions: InterviewQuestionDetail[];
  integrity_flags: IntegrityFlagDetail[];
  started_at: string;
  completed_at: string | null;
}

export async function getInternshipApplicants(internshipId: string): Promise<ApplicantListItem[]> {
  const res = await fetch(
    `${REAL_API_BASE}/organizations/internships/${internshipId}/applications`,
    { headers: authHeaders() },
  );
  return handle(res);
}

export async function getApplicantInterviewReview(
  internshipId: string,
  applicationId: string,
): Promise<InterviewReviewDetail> {
  const res = await fetch(
    `${REAL_API_BASE}/organizations/internships/${internshipId}/applications/${applicationId}/interview`,
    { headers: authHeaders() },
  );
  return handle(res);
}



// --- Aptitude Check (student-facing): per-internship, Groq-generated,
// percentile-scored quiz — see backend/app/services/aptitude/routes.py ---

export interface AptitudeQuestion {
  id: string;
  question: string;
  options: string[];
}

export interface StartAptitudeResponse {
  attempt_id: string;
  internship_id: string;
  seconds_per_question: number;
  overall_attempt_seconds: number;
  questions: AptitudeQuestion[];
}

export interface AptitudeIntegrityFlagBreakdown {
  flag_type: string;
  count: number;
  points_deducted: number;
}

export interface AptitudeQuestionResult {
  question_id: string;
  correct: boolean;
  selected_index: number | null;
  correct_index: number;
  options: string[];
  question: string;
}

export interface SubmitAptitudeResponse {
  raw_score: number;
  percentile: number;
  integrity_score: number;
  passed: boolean;
  badge_awarded: boolean;
  percentile_pending: boolean;
  integrity_breakdown: AptitudeIntegrityFlagBreakdown[];
  question_results: AptitudeQuestionResult[];
}

export async function startAptitudeCheck(internshipId: string): Promise<StartAptitudeResponse> {
  const res = await fetch(`${REAL_API_BASE}/aptitude/start`, {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({ internship_id: internshipId }),
  });
  return handle(res);
}

export async function submitAptitudeCheck(
  attemptId: string,
  answers: { question_id: string; selected_index: number }[],
): Promise<SubmitAptitudeResponse> {
  const res = await fetch(`${REAL_API_BASE}/aptitude/${attemptId}/submit`, {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({ answers }),
  });
  return handle(res);
}

export async function reportAptitudeIntegrityFlag(attemptId: string, flagType: string, count = 1): Promise<void> {
  await fetch(`${REAL_API_BASE}/aptitude/${attemptId}/integrity-flag`, {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({ flag_type: flagType, count }),
  });
}

// --- Smart Scheduling (Module 5.5): Google Calendar-backed human interview
// scheduling. Org connects calendar once, proposes slots per application,
// student picks one -> real Calendar event + Meet link. ---

export interface CalendarStatus {
  connected: boolean;
  google_email: string | null;
  connected_at: string | null;
}

export interface ScheduleSlot {
  start: string;
  end: string;
}

export interface ScheduledInterview {
  id: string;
  application_id: string;
  organization_id: string;
  student_id: string;
  internship_id: string;
  status: 'proposed' | 'confirmed' | 'cancelled';
  proposed_slots: ScheduleSlot[];
  selected_slot: ScheduleSlot | null;
  duration_minutes: number;
  meet_link: string | null;
  created_at: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
  internship_title: string | null;
  organization_name: string | null;
  student_name: string | null;
}

// Connecting Google Calendar is a full-page OAuth redirect, not a fetch --
// the browser needs to actually navigate to Google's consent screen. The
// backend route is auth-protected (it reads the org from the JWT to know
// whose account to attach the connection to), and a plain navigation can't
// carry an Authorization header, so we pass the token as a query param on
// this one GET route specifically for that reason.
export function openGoogleCalendarConnect() {
  const token = getRealToken();
  window.location.href = `${REAL_API_BASE}/scheduling/google/login?access_token=${encodeURIComponent(token || '')}`;
}

export async function getGoogleCalendarStatus(): Promise<CalendarStatus> {
  const res = await fetch(`${REAL_API_BASE}/scheduling/google/status`, { headers: authHeaders() });
  return handle(res);
}

export async function disconnectGoogleCalendar(): Promise<void> {
  await fetch(`${REAL_API_BASE}/scheduling/google/disconnect`, {
    method: 'DELETE', headers: authHeaders(),
  });
}

export async function proposeInterviewSlots(
  applicationId: string,
  slots: ScheduleSlot[],
  durationMinutes = 30,
): Promise<ScheduledInterview> {
  const res = await fetch(`${REAL_API_BASE}/scheduling/interviews/${applicationId}/propose`, {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({ slots, duration_minutes: durationMinutes }),
  });
  return handle(res);
}

export async function selectInterviewSlot(
  scheduledInterviewId: string,
  slotIndex: number,
): Promise<ScheduledInterview> {
  const res = await fetch(`${REAL_API_BASE}/scheduling/interviews/${scheduledInterviewId}/select-slot`, {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify({ slot_index: slotIndex }),
  });
  return handle(res);
}

export async function cancelScheduledInterview(scheduledInterviewId: string): Promise<ScheduledInterview> {
  const res = await fetch(`${REAL_API_BASE}/scheduling/interviews/${scheduledInterviewId}/cancel`, {
    method: 'POST', headers: authHeaders(),
  });
  return handle(res);
}

export async function getMyScheduledInterviews(): Promise<ScheduledInterview[]> {
  const res = await fetch(`${REAL_API_BASE}/scheduling/interviews/mine`, { headers: authHeaders() });
  return handle(res);
}

export async function getOrgScheduledInterviews(internshipId?: string): Promise<ScheduledInterview[]> {
  const url = internshipId
    ? `${REAL_API_BASE}/scheduling/interviews?internship_id=${internshipId}`
    : `${REAL_API_BASE}/scheduling/interviews`;
  const res = await fetch(url, { headers: authHeaders() });
  return handle(res);
}

// --- Student reports (ADMIN_TRUST_SAFETY_MEMO.md Phase 4) -- a student
// flagging a listing or a company for review. Shares the same Report row
// the admin queue works from (see lib/adminApi.ts's reports functions). ---

export type ReportTargetType = 'internship' | 'organization';
export type ReportReason =
  | 'fake_listing' | 'unpaid_or_underpaid' | 'misleading_description'
  | 'suspicious_company' | 'harassment' | 'scam_or_fraud' | 'other';
export type ReportStatus = 'open' | 'investigating' | 'dismissed' | 'action_taken';

export const REPORT_REASON_LABEL: Record<ReportReason, string> = {
  fake_listing: 'Fake or non-existent listing',
  unpaid_or_underpaid: 'Unpaid or underpaid, misrepresented as paid',
  misleading_description: 'Misleading role or requirements',
  suspicious_company: 'Suspicious or unverifiable company',
  harassment: 'Harassment from the recruiter',
  scam_or_fraud: 'Scam or fraud (e.g. asked for money)',
  other: 'Other',
};

export interface FileReportPayload {
  target_type: ReportTargetType;
  target_id: string;
  reason: ReportReason;
  details?: string;
}

export interface FileReportResult {
  id: string;
  status: ReportStatus;
  created_at: string;
}

export async function fileReport(payload: FileReportPayload): Promise<FileReportResult> {
  const res = await fetch(`${REAL_API_BASE}/students/reports`, {
    method: 'POST', headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  return handle(res);
}

export interface MyReport {
  id: string;
  target_type: ReportTargetType;
  target_id: string;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  resolution_notes: string | null;
  created_at: string;
  resolved_at: string | null;
}

export async function getMyReports(): Promise<MyReport[]> {
  const res = await fetch(`${REAL_API_BASE}/students/reports/mine`, { headers: authHeaders() });
  return handle(res);
}
