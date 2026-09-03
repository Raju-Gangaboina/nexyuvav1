// Backend jobs store — replaces the old frontend localStorage-based lib/store.ts.
// In-memory + optional JSON file persistence so postings survive a server restart.
import fs from 'fs';
import path from 'path';

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
  duration: string;
  stipend: number;
  eligibility?: string;
  openings: number;
  deadline?: string;
  perks?: string[];
  createdAt: string;
  ownerUserId: string; // organization account that posted this job -- previously missing entirely
}

const DATA_FILE = path.join(__dirname, '..', 'data', 'jobs.json');

function loadJobs(): Job[] {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    }
  } catch (e) {
    console.error('Failed to load jobs.json, starting empty.', e);
  }
  return [];
}

function persist(jobs: Job[]) {
  try {
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(jobs, null, 2), 'utf-8');
  } catch (e) {
    console.error('Failed to persist jobs.json', e);
  }
}

let jobs: Job[] = loadJobs();

export function getJobs(): Job[] {
  return jobs;
}

export function getJobsByOwner(ownerUserId: string): Job[] {
  return jobs.filter(j => j.ownerUserId === ownerUserId);
}

export function addJob(job: Omit<Job, 'id' | 'createdAt' | 'ownerUserId'>, ownerUserId: string): Job {
  const newJob: Job = {
    ...job,
    id: `job-${Date.now()}`,
    createdAt: new Date().toISOString(),
    ownerUserId,
  };
  jobs = [newJob, ...jobs];
  persist(jobs);
  return newJob;
}
