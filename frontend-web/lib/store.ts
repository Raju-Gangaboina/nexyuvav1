// Jobs (internship postings) client.
// Previously these lived only in browser localStorage. Postings are now shared,
// backend-owned data — this file calls ../backend's /api/jobs endpoints instead.

import { apiGet, apiPost } from './apiClient';

export interface Job {
  id: string;
  title: string;
  company: string;
  domain: string;
  description: string;
  responsibilities?: string;
  requiredSkills: string[];
  preferredSkills?: string[];
  workMode: 'Remote' | 'Hybrid' | 'On-site';
  location: string;
  duration: string; // e.g. "3 months"
  stipend: number; // monthly stipend in INR
  eligibility?: string;
  openings: number;
  deadline?: string;
  perks?: string[];
  createdAt: string;
  ownerUserId?: string; // the organization account that posted this job
}

// All postings, from every company — for students browsing internships.
export async function getStoredJobs(): Promise<Job[]> {
  try {
    return await apiGet<Job[]>('/jobs');
  } catch (e) {
    console.error('Failed to fetch jobs from backend:', e);
    return [];
  }
}

// Only the postings created by the logged-in organization. Use this on company-side
// pages (dashboard, candidates, analytics, post-internship) — using getStoredJobs()
// there was the bug where a newly registered company saw every other company's jobs.
export async function getMyJobs(): Promise<Job[]> {
  try {
    return await apiGet<Job[]>('/jobs/mine');
  } catch (e) {
    console.error('Failed to fetch your jobs from backend:', e);
    return [];
  }
}

export async function addJob(job: Omit<Job, 'id' | 'createdAt' | 'ownerUserId'>): Promise<Job | null> {
  try {
    const created = await apiPost<Job>('/jobs', job);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('nexyuva_jobs_updated'));
    }
    return created;
  } catch (e) {
    console.error('Failed to create job via backend:', e);
    return null;
  }
}
