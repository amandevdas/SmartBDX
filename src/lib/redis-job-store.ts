// Server-side only Redis job store
// This file should only be imported in API routes, never in client components

import { createClient } from 'redis';
import type { JobStatus } from '@/types/api';

// Create Redis client
let redis: any = null;

const getRedisClient = async () => {
  if (!redis) {
    redis = createClient({
      url: process.env.KV_URL
    });
    
    redis.on('error', (err: any) => console.error('Redis Client Error:', err));
    await redis.connect();
  }
  return redis;
};

// KV keys for different data types
const JOBS_KEY = 'smartbdx:jobs';
const JOB_PREFIX = 'smartbdx:job:';
const BATCH_PREFIX = 'smartbdx:batch:';

interface StoredJob extends JobStatus {
  id: string;
  batchId: string;
  runId: number;
  createdAt: string; // ISO string for Redis compatibility
}

/**
 * Add a job to persistent storage
 */
export const addJob = async (job: JobStatus, batchId: string, runId: number): Promise<StoredJob> => {
  const newJob: StoredJob = {
    ...job,
    id: job.jobId,
    batchId: batchId,
    runId: runId,
    createdAt: new Date().toISOString(),
    files: job.files || [], // Ensure files is always an array
  };

  try {
    const client = await getRedisClient();
    
    // Store the job data
    await client.set(`${JOB_PREFIX}${newJob.id}`, JSON.stringify(newJob));
    
    // Store batch mapping for quick lookups
    await client.set(`${BATCH_PREFIX}${batchId}`, newJob.id);
    
    // Add to jobs list (for getAllJobs)
    await client.sAdd(JOBS_KEY, newJob.id);
    
    console.log(`✅ Job ${newJob.id} stored in Redis with batch ${batchId}`);
    return newJob;
  } catch (error) {
    console.error('❌ Error storing job in Redis:', error);
    throw new Error(`Failed to store job: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

/**
 * Get all jobs from persistent storage
 */
export const getAllJobs = async (): Promise<StoredJob[]> => {
  try {
    const client = await getRedisClient();
    
    // Get all job IDs
    const jobIds = await client.sMembers(JOBS_KEY);
    
    if (!jobIds || jobIds.length === 0) {
      console.log('📋 No jobs found in Redis storage');
      return [];
    }

    // Get all job data in parallel
    const jobs: StoredJob[] = [];
    for (const jobId of jobIds) {
      try {
        const jobData = await client.get(`${JOB_PREFIX}${jobId}`);
        if (jobData) {
          const job = JSON.parse(jobData) as StoredJob;
          jobs.push(job);
        }
      } catch (error) {
        console.warn(`⚠️ Failed to get job ${jobId}:`, error);
      }
    }

    // Sort by creation date, newest first
    return jobs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  } catch (error) {
    console.error('❌ Error getting all jobs from Redis:', error);
    return [];
  }
};

/**
 * Get a specific job by ID
 */
export const getJobById = async (id: string): Promise<StoredJob | null> => {
  try {
    const client = await getRedisClient();
    const jobData = await client.get(`${JOB_PREFIX}${id}`);
    return jobData ? JSON.parse(jobData) as StoredJob : null;
  } catch (error) {
    console.error(`❌ Error getting job ${id} from Redis:`, error);
    return null;
  }
};

/**
 * Get a job by batch ID
 */
export const getJobByBatchId = async (batchId: string): Promise<StoredJob | null> => {
  try {
    const client = await getRedisClient();
    
    // First get the job ID from batch mapping
    const jobId = await client.get(`${BATCH_PREFIX}${batchId}`);
    
    if (!jobId) {
      console.log(`📋 No job found for batch ${batchId}`);
      return null;
    }

    // Then get the job data
    const jobData = await client.get(`${JOB_PREFIX}${jobId}`);
    return jobData ? JSON.parse(jobData) as StoredJob : null;
  } catch (error) {
    console.error(`❌ Error getting job by batch ${batchId} from Redis:`, error);
    return null;
  }
};

/**
 * Update a job's status and progress
 */
export const updateJob = async (jobId: string, updates: Partial<JobStatus>): Promise<StoredJob | null> => {
  try {
    const client = await getRedisClient();
    
    // Get existing job
    const existingJobData = await client.get(`${JOB_PREFIX}${jobId}`);
    
    if (!existingJobData) {
      console.warn(`⚠️ Job ${jobId} not found for update`);
      return null;
    }

    const existingJob = JSON.parse(existingJobData) as StoredJob;

    // Merge updates - ensure all fields from updates are preserved
    const updatedJob: StoredJob = {
      ...existingJob,
      ...updates,
      // Preserve immutable fields that should never be overwritten
      id: existingJob.id,
      jobId: existingJob.jobId,
      batchId: existingJob.batchId,
      runId: existingJob.runId,
      createdAt: existingJob.createdAt,
    };

    // Store updated job
    await client.set(`${JOB_PREFIX}${jobId}`, JSON.stringify(updatedJob));
    
    console.log(`✅ Job ${jobId} updated in Redis`);
    return updatedJob;
  } catch (error) {
    console.error(`❌ Error updating job ${jobId} in Redis:`, error);
    return null;
  }
};

/**
 * Clear all jobs from persistent storage
 */
export const clearAllJobs = async (): Promise<{ deletedCount: number }> => {
  try {
    const client = await getRedisClient();
    
    // Get all job IDs
    const jobIds = await client.sMembers(JOBS_KEY);
    
    if (!jobIds || jobIds.length === 0) {
      console.log('📋 No jobs found to clear');
      return { deletedCount: 0 };
    }

    let deletedCount = 0;
    
    // Delete all individual job records
    for (const jobId of jobIds) {
      try {
        await client.del(`${JOB_PREFIX}${jobId}`);
        deletedCount++;
      } catch (error) {
        console.warn(`⚠️ Failed to delete job ${jobId}:`, error);
      }
    }
    
    // Get all batch keys and delete them
    const batchKeys = await client.keys(`${BATCH_PREFIX}*`);
    for (const batchKey of batchKeys) {
      try {
        await client.del(batchKey);
      } catch (error) {
        console.warn(`⚠️ Failed to delete batch ${batchKey}:`, error);
      }
    }
    
    // Clear the jobs set
    await client.del(JOBS_KEY);
    
    console.log(`✅ Cleared ${deletedCount} jobs from Redis storage`);
    return { deletedCount };
  } catch (error) {
    console.error('❌ Error clearing all jobs from Redis:', error);
    throw new Error(`Failed to clear jobs: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};