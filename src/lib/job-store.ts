import type { JobStatus } from '@/types/api';

// Simple in-memory store for jobs.
// NOTE: This is for demonstration purposes. In a production environment,
// you would use a proper database (e.g., Redis, PostgreSQL) to persist job state.

interface StoredJob extends JobStatus {
  id: string;
  batchId: string;
  runId: number;
  createdAt: Date;
}

let jobStore: StoredJob[] = [];

export const addJob = (job: JobStatus, batchId: string, runId: number): StoredJob => {
  const newJob: StoredJob = {
    ...job,
    id: job.jobId, // Use the jobId as the unique ID
    batchId: batchId,
    runId: runId,
    createdAt: new Date(),
  };
  // Avoid adding duplicates
  if (!jobStore.find(j => j.id === newJob.id)) {
    jobStore.push(newJob);
  }
  return newJob;
};

export const getAllJobs = (): StoredJob[] => {
  // Return jobs sorted by creation date, newest first
  return jobStore.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
};

export const getJobById = (id: string): StoredJob | undefined => {
  return jobStore.find(job => job.id === id);
};

export const getJobByBatchId = (batchId: string): StoredJob | undefined => {
  return jobStore.find(job => job.batchId === batchId);
};

// Optional: A function to clear old jobs if the store grows too large
export const clearOldJobs = (maxAgeMinutes: number = 60) => {
  const now = new Date();
  const maxAgeMs = maxAgeMinutes * 60 * 1000;
  jobStore = jobStore.filter(job => (now.getTime() - job.createdAt.getTime()) < maxAgeMs);
};