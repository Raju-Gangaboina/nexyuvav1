import { StudentProfile } from './types';
import { getMyFullProfileReal, updateMyFullProfileReal, RealFullProfileUpdate } from './realApi';

// Previously this entire module read/wrote lib/userContext.ts to browser
// localStorage only, so a student's profile (bio, tools, preferences, even
// name/college) reset on any new device/browser or cleared storage, and
// was invisible to the recommendation engine, admin views, or anything
// server-side. Every read/write now goes through the real backend
// (GET/PATCH /api/v1/students/me) instead.

export const EMPTY_STUDENT_PROFILE: StudentProfile = {
  id: 'STU-LOCAL',
  name: 'Student Profile',
  email: '',
  avatar: 'SP',
  avatarUrl: null,
  college: '',
  city: '',
  degree: 'Bachelor Degree',
  branch: 'Engineering',
  year: 1,
  cgpa: 0,
  skills: [],
  tools: [],
  preferredLocations: [],
  preferredDomains: [],
  preferredMode: 'Remote',
  minStipend: 0,
  bio: '',
  github: '',
  linkedin: '',
  resumeScore: 0,
};

function initials(name: string, email: string): string {
  const base = (name || email || 'SP').trim();
  return base.slice(0, 2).toUpperCase();
}

/**
 * Fetches the logged-in student's full profile from the real backend.
 * Returns EMPTY_STUDENT_PROFILE (never throws) if there's no token yet or
 * the request fails, so callers can render a sensible default while a
 * proper auth redirect (see app/student/layout.tsx) takes over.
 */
export async function fetchStudentProfile(): Promise<StudentProfile> {
  try {
    const backend = await getMyFullProfileReal();
    return {
      id: backend.email || 'STU-REAL',
      name: backend.full_name || 'Student',
      email: backend.email,
      avatar: initials(backend.full_name, backend.email),
      avatarUrl: backend.avatar_url || null,
      college: backend.college || '',
      city: backend.location || '',
      degree: backend.degree || 'Bachelor Degree',
      branch: backend.branch || 'Engineering',
      year: backend.year ?? 1,
      cgpa: backend.cgpa ?? 0,
      skills: backend.skills || [],
      tools: backend.tools || [],
      preferredLocations: backend.preferred_locations || [],
      preferredDomains: backend.preferred_domains || [],
      preferredMode: backend.preferred_mode || 'Remote',
      minStipend: backend.min_stipend ?? 0,
      bio: backend.bio || '',
      github: backend.github_username || '',
      linkedin: backend.linkedin_url || '',
      resumeScore: backend.resume_score,
    };
  } catch {
    return EMPTY_STUDENT_PROFILE;
  }
}

/**
 * Persists a partial profile edit to the real backend and returns the
 * merged, canonical profile back (same shape fetchStudentProfile returns).
 */
export async function saveStudentProfile(profile: Partial<StudentProfile>): Promise<StudentProfile> {
  const payload: RealFullProfileUpdate = {};
  if (profile.name !== undefined) payload.full_name = profile.name;
  if (profile.college !== undefined) payload.college = profile.college;
  if (profile.city !== undefined) payload.location = profile.city;
  if (profile.degree !== undefined) payload.degree = profile.degree;
  if (profile.branch !== undefined) payload.branch = profile.branch;
  if (profile.year !== undefined) payload.year = profile.year;
  if (profile.cgpa !== undefined) payload.cgpa = profile.cgpa;
  if (profile.skills !== undefined) payload.skills = profile.skills;
  if (profile.tools !== undefined) payload.tools = profile.tools;
  if (profile.preferredDomains !== undefined) payload.preferred_domains = profile.preferredDomains;
  if (profile.preferredLocations !== undefined) payload.preferred_locations = profile.preferredLocations;
  if (profile.preferredMode !== undefined) payload.preferred_mode = profile.preferredMode;
  if (profile.minStipend !== undefined) payload.min_stipend = profile.minStipend;
  if (profile.bio !== undefined) payload.bio = profile.bio;
  if (profile.github !== undefined) payload.github_username = profile.github;
  if (profile.linkedin !== undefined) payload.linkedin_url = profile.linkedin;

  const backend = await updateMyFullProfileReal(payload);
  const updated: StudentProfile = {
    id: backend.email || 'STU-REAL',
    name: backend.full_name || 'Student',
    email: backend.email,
    avatar: initials(backend.full_name, backend.email),
    avatarUrl: backend.avatar_url || null,
    college: backend.college || '',
    city: backend.location || '',
    degree: backend.degree || 'Bachelor Degree',
    branch: backend.branch || 'Engineering',
    year: backend.year ?? 1,
    cgpa: backend.cgpa ?? 0,
    skills: backend.skills || [],
    tools: backend.tools || [],
    preferredLocations: backend.preferred_locations || [],
    preferredDomains: backend.preferred_domains || [],
    preferredMode: backend.preferred_mode || 'Remote',
    minStipend: backend.min_stipend ?? 0,
    bio: backend.bio || '',
    github: backend.github_username || '',
    linkedin: backend.linkedin_url || '',
    resumeScore: backend.resume_score,
  };

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('nexyuva_profile_updated'));
  }
  return updated;
}
