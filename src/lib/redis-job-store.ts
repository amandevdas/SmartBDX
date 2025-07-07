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

type StoredJob = JobStatus & {
  id: string;
  batchId: string;
  runId: number;
  createdAt: string; // ISO string for Redis compatibility
};

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
 * Get multiple jobs by batch IDs - NEW FUNCTION
 */
export const getJobsByBatchIds = async (batchIds: string[]): Promise<JobStatus[]> => {
  try {
    const client = await getRedisClient();
    const jobs: JobStatus[] = [];
    
    // Get all job IDs for the batch IDs
    const jobIds = await Promise.all(
      batchIds.map(async (batchId) => {
        const jobId = await client.get(`${BATCH_PREFIX}${batchId}`);
        return jobId ? { batchId, jobId } : null;
      })
    );
    
    // Filter out null results and get job data
    const validJobIds = jobIds.filter(Boolean) as { batchId: string; jobId: string }[];
    
    for (const { batchId, jobId } of validJobIds) {
      try {
        const jobData = await client.get(`${JOB_PREFIX}${jobId}`);
        if (jobData) {
          const storedJob = JSON.parse(jobData) as StoredJob;
          // Convert StoredJob to JobStatus format
          const jobStatus: JobStatus = {
            jobId: storedJob.id, // Use id instead of jobId
            batchId: storedJob.batchId,
            timestamp: storedJob.timestamp || storedJob.createdAt,
            status: storedJob.status,
            message: storedJob.message,
            files: storedJob.files || []
          } as any; // Use any to handle the discriminated union
          jobs.push(jobStatus);
        }
      } catch (error) {
        console.warn(`⚠️ Failed to get job data for batch ${batchId}:`, error);
      }
    }
    
    return jobs;
  } catch (error) {
    console.error('❌ Error getting jobs by batch IDs from Redis:', error);
    return [];
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
    const updatedJob: any = {
      ...existingJob,
      ...updates,
      // Preserve immutable fields that should never be overwritten
      id: existingJob.id,
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
 * Update multiple jobs atomically - NEW FUNCTION
 */
export const updateJobs = async (
  updates: Array<{ jobId: string; updates: Partial<JobStatus> }>
): Promise<void> => {
  try {
    const client = await getRedisClient();
    
    // Process updates one by one (Redis transactions with async operations are complex)
    const promises = updates.map(async ({ jobId, updates: jobUpdates }) => {
      try {
        // Get existing job
        const existingJobData = await client.get(`${JOB_PREFIX}${jobId}`);
        
        if (existingJobData) {
          const existingJob = JSON.parse(existingJobData) as StoredJob;
          
          // Merge updates
          const updatedJob: any = {
            ...existingJob,
            ...jobUpdates,
            // Preserve immutable fields
            id: existingJob.id,
            batchId: existingJob.batchId,
            runId: existingJob.runId,
            createdAt: existingJob.createdAt,
          };
          
          // Store updated job
          await client.set(`${JOB_PREFIX}${jobId}`, JSON.stringify(updatedJob));
          return { success: true, jobId };
        } else {
          console.warn(`⚠️ Job ${jobId} not found for update`);
          return { success: false, jobId };
        }
      } catch (error) {
        console.warn(`⚠️ Failed to update job ${jobId}:`, error);
        return { success: false, jobId };
      }
    });
    
    // Execute all updates concurrently
    const results = await Promise.all(promises);
    
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    
    console.log(`✅ Updated ${successful} jobs in Redis${failed > 0 ? ` (${failed} failed)` : ''}`);
  } catch (error) {
    console.error('❌ Error updating jobs in Redis:', error);
    throw new Error(`Failed to update jobs: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

/**
 * Delete a specific job by ID - BONUS FUNCTION
 */
export const deleteJob = async (jobId: string): Promise<boolean> => {
  try {
    const client = await getRedisClient();
    
    // Get job data to find batchId
    const jobData = await client.get(`${JOB_PREFIX}${jobId}`);
    
    if (!jobData) {
      console.warn(`⚠️ Job ${jobId} not found for deletion`);
      return false;
    }
    
    const job = JSON.parse(jobData) as StoredJob;
    
    // Delete job data
    await client.del(`${JOB_PREFIX}${jobId}`);
    
    // Delete batch mapping
    await client.del(`${BATCH_PREFIX}${job.batchId}`);
    
    // Remove from jobs set
    await client.sRem(JOBS_KEY, jobId);
    
    console.log(`✅ Job ${jobId} deleted from Redis`);
    return true;
  } catch (error) {
    console.error(`❌ Error deleting job ${jobId} from Redis:`, error);
    return false;
  }
};

/**
 * Get job statistics - BONUS FUNCTION
 */
export const getJobStats = async (): Promise<{
  total: number;
  byStatus: Record<string, number>;
  oldest: string | null;
  newest: string | null;
}> => {
  try {
    const jobs = await getAllJobs();
    
    const stats = {
      total: jobs.length,
      byStatus: {} as Record<string, number>,
      oldest: jobs.length > 0 ? jobs[jobs.length - 1].createdAt : null,
      newest: jobs.length > 0 ? jobs[0].createdAt : null,
    };
    
    // Count by status
    jobs.forEach(job => {
      const status = job.status || 'unknown';
      stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;
    });
    
    return stats;
  } catch (error) {
    console.error('❌ Error getting job stats:', error);
    return {
      total: 0,
      byStatus: {},
      oldest: null,
      newest: null,
    };
  }
};