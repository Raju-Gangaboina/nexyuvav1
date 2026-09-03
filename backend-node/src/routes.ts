import { Router, Request, Response } from 'express';
import {
  ALL_SKILLS, SKILL_SYNONYMS_AND_INFERENCES,
  calculateCompetencyDimensions, extractAndAnalyzeResume,
  generateRecommendations, predictCareerPaths, analyzeSkillGaps,
  processRAGQuery, StudentProfile, Internship,
  generateTutorResponse, generateProjectIdeas, TutorRequest,
} from './aiEngine';
import { getJobs, getJobsByOwner, addJob } from './jobsStore';
import { requireAuth, optionalAuth, AuthedRequest } from './auth';

const router = Router();

// ── Reference data ──────────────────────────────────────────────
router.get('/skills', (_req: Request, res: Response) => {
  res.json({ allSkills: ALL_SKILLS, synonyms: SKILL_SYNONYMS_AND_INFERENCES });
});

// ── Jobs (company postings) ─────────────────────────────────────
// GET /jobs: public feed for students to browse everything -- unauthenticated ok.
router.get('/jobs', optionalAuth, (_req: AuthedRequest, res: Response) => {
  res.json(getJobs());
});

// GET /jobs/mine: only the postings created by the logged-in organization.
// This is what fixes companies seeing each other's job postings.
router.get('/jobs/mine', requireAuth, (req: AuthedRequest, res: Response) => {
  if (req.user!.role !== 'organization') {
    return res.status(403).json({ detail: 'Only organization accounts have job postings' });
  }
  res.json(getJobsByOwner(req.user!.userId));
});

// POST /jobs: ownerEmail comes from the verified token, never from the request body,
// so a job always belongs to whichever organization is actually logged in.
router.post('/jobs', requireAuth, (req: AuthedRequest, res: Response) => {
  if (req.user!.role !== 'organization') {
    return res.status(403).json({ detail: 'Only organization accounts can post jobs' });
  }
  const job = addJob(req.body, req.user!.userId);
  res.status(201).json(job);
});

// ── AI Engine: competency profile ───────────────────────────────
router.post('/competency', (req: Request, res: Response) => {
  const student = req.body.student as StudentProfile;
  res.json(calculateCompetencyDimensions(student));
});

// ── AI Engine: resume / ATS analysis ────────────────────────────
router.post('/resume/analyze', (req: Request, res: Response) => {
  const { resumeText } = req.body as { resumeText: string };
  res.json(extractAndAnalyzeResume(resumeText || ''));
});

// ── AI Engine: recommendations (hybrid matching + XAI) ──────────
router.post('/recommendations', (req: Request, res: Response) => {
  const { student, internships } = req.body as { student: StudentProfile; internships: Internship[] };
  res.json(generateRecommendations(student, internships || []));
});

// ── AI Engine: career path prediction ───────────────────────────
router.post('/career-paths', (req: Request, res: Response) => {
  const student = req.body.student as StudentProfile;
  res.json(predictCareerPaths(student));
});

// ── AI Engine: skill gap analysis ───────────────────────────────
router.post('/skill-gap', (req: Request, res: Response) => {
  const { student, targetDomain } = req.body as { student: StudentProfile; targetDomain?: string };
  res.json(analyzeSkillGaps(student, targetDomain));
});

// ── AI Engine: RAG chatbot ───────────────────────────────────────
router.post('/chat', (req: Request, res: Response) => {
  const { query, student } = req.body as { query: string; student: StudentProfile };
  res.json({ response: processRAGQuery(query || '', student) });
});

// ── Roadmaps: AI Tutor ────────────────────────────────────────────
// One endpoint covers every tutor capability (explain/example/quiz/etc.) via
// the `mode` field -- see TutorMode in aiEngine.ts. Real Groq call
// (llama-3.1-8b-instant) with the original templated generator kept as an
// automatic fallback if GROQ_API_KEY is missing or the call fails -- see
// generateTutorResponse's docstring in aiEngine.ts.
router.post('/roadmap/tutor', async (req: Request, res: Response) => {
  const body = req.body as TutorRequest;
  if (!body.topic || !body.mode) {
    return res.status(400).json({ detail: 'topic and mode are required' });
  }
  res.json(await generateTutorResponse(body));
});

// ── Roadmaps: Project Ideas ───────────────────────────────────────
router.post('/roadmap/projects', async (req: Request, res: Response) => {
  const { topic, count } = req.body as { topic: string; count?: number };
  if (!topic) {
    return res.status(400).json({ detail: 'topic is required' });
  }
  res.json(await generateProjectIdeas(topic, count ?? 2));
});

export default router;
