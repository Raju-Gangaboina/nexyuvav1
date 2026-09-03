// Frontend AI Engine client.
// IMPORTANT: The actual matching/ML/NLP logic no longer runs in the browser —
// it lives in ../backend/src/aiEngine.ts and is served over HTTP. These
// functions keep the exact same names/signatures the pages already used,
// but are now async and call the backend.

import { apiPost } from './apiClient';
import {
  StudentProfile, Internship, CompetencyDimensions, MatchResult,
  ResumeAnalysisResult, CareerPathPrediction, SkillGapAnalysis,
} from './types';

export { ALL_SKILLS } from './types';
export type {
  StudentProfile, Internship, CompetencyDimensions, MatchResult,
  ResumeAnalysisResult, CareerPathPrediction, SkillGapAnalysis,
} from './types';

export async function calculateCompetencyDimensions(student: StudentProfile): Promise<CompetencyDimensions> {
  return apiPost<CompetencyDimensions>('/competency', { student });
}

export async function extractAndAnalyzeResume(resumeText: string): Promise<ResumeAnalysisResult> {
  return apiPost<ResumeAnalysisResult>('/resume/analyze', { resumeText });
}

export async function generateRecommendations(student: StudentProfile, internships: Internship[]): Promise<MatchResult[]> {
  return apiPost<MatchResult[]>('/recommendations', { student, internships });
}

export async function predictCareerPaths(student: StudentProfile): Promise<CareerPathPrediction[]> {
  return apiPost<CareerPathPrediction[]>('/career-paths', { student });
}

export async function analyzeSkillGaps(student: StudentProfile, targetDomain?: string): Promise<SkillGapAnalysis> {
  return apiPost<SkillGapAnalysis>('/skill-gap', { student, targetDomain });
}

export async function processRAGQuery(query: string, student: StudentProfile): Promise<string> {
  const { response } = await apiPost<{ response: string }>('/chat', { query, student });
  return response;
}

// ── Roadmap AI Tutor ────────────────────────────────────────────────────
export type TutorMode =
  | 'explain_beginner' | 'explain_advanced' | 'example' | 'explain_code' | 'review_code'
  | 'quiz' | 'flashcards' | 'interview_questions' | 'revision_notes' | 'learning_roadmap';

export interface TutorResponse { topic: string; mode: TutorMode; content: string; }

export async function roadmapTutor(topic: string, mode: TutorMode, code?: string): Promise<TutorResponse> {
  return apiPost<TutorResponse>('/roadmap/tutor', { topic, mode, code });
}

// ── Roadmap Project Ideas ───────────────────────────────────────────────
export interface ProjectIdea {
  title: string;
  overview: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  prerequisites: string[];
  estimatedTime: string;
  features: string[];
  starterGuide: string[];
  resumeDescription: string;
  githubTips: string[];
  aiMentor: string;
}

export async function roadmapProjectIdeas(topic: string, count: number = 2): Promise<ProjectIdea[]> {
  return apiPost<ProjectIdea[]>('/roadmap/projects', { topic, count });
}
