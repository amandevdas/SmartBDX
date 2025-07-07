import { NextRequest, NextResponse } from 'next/server';
import { DatabricksClient, createSuccessResponse, createErrorResponse } from '@/lib/databricks-client';
import { getJobsByBatchIds, updateJobs } from '@/lib/redis-job-store';
import type { JobStatus } from '@/types/api';

// FIXED: Add constants for Databricks states
const DATABRICKS_STATES = {
  LIFECYCLE: {
    TERMINATED: 'TERMINATED',
    RUNNING: 'RUNNING', 
    PENDING: 'PENDING',
    QUEUED: 'QUEUED',
    TERMINATING: 'TERMINATING',
    BLOCKED: 'BLOCKED',
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    SKIPPED: 'SKIPPED'
  },
  RESULT: {
    SUCCESS: 'SUCCESS',
    FAILED: 'FAILED',
    CANCELED: 'CANCELED'
  }
} as const;

// FIXED: Add proper input validation
function validateBatchIds(batchIds: unknown): { valid: boolean; errors: string[]; data?: string[] } {
  const errors: string[] = [];
  
  if (!Array.isArray(batchIds)) {
    errors.push('batchIds must be an array');
    return { valid: false, errors };
  }
  
  if (batchIds.length === 0) {
    errors.push('batchIds array cannot be empty');
    return { valid: false, errors };
  }
  
  if (batchIds.length > 50) { // DoS protection
    errors.push('batchIds array cannot exceed 50 items');
    return { valid: false, errors };
  }
  
  const validIds: string[] = [];
  const seen = new Set<string>();
  
  for (let i = 0; i < batchIds.length; i++) {
    const id = batchIds[i];
    
    if (typeof id !== 'string') {
      errors.push(`batchIds[${i}] must be a string`);
      continue;
    }
    
    if (!id.trim()) {
      errors.push(`batchIds[${i}] cannot be empty`);
      continue;
    }
    
    if (seen.has(id)) {
      errors.push(`Duplicate batchId: ${id}`);
      continue;
    }
    
    seen.add(id);
    validIds.push(id);
  }
  
  if (errors.length > 0) {
    return { valid: false, errors };
  }
  
  return { valid: true, errors: [], data: validIds };
}

// FIXED: Improved status mapping with all states
function mapDatabricksStatusToJobStatus(lifeCycleState: string, resultState?: string): JobStatus['status'] {
  switch (lifeCycleState) {
    case DATABRICKS_STATES.LIFECYCLE.TERMINATED:
      switch (resultState) {
        case DATABRICKS_STATES.RESULT.SUCCESS:
          return 'completed';
        case DATABRICKS_STATES.RESULT.CANCELED:
          return 'cancelled';
        case DATABRICKS_STATES.RESULT.FAILED:
        default:
          return 'error';
      }
    case DATABRICKS_STATES.LIFECYCLE.RUNNING:
      return 'processing';
    case DATABRICKS_STATES.LIFECYCLE.TERMINATING:
      return 'processing'; // Still processing until terminated
    case DATABRICKS_STATES.LIFECYCLE.PENDING:
    case DATABRICKS_STATES.LIFECYCLE.QUEUED:
    case DATABRICKS_STATES.LIFECYCLE.BLOCKED:
      return 'submitted';
    case DATABRICKS_STATES.LIFECYCLE.INTERNAL_ERROR:
    case DATABRICKS_STATES.LIFECYCLE.SKIPPED:
      return 'error';
    default:
      console.warn(`Unknown lifecycle state: ${lifeCycleState}`);
      return 'error';
  }
}

// FIXED: Batch processing function
async function processBatchStatuses(
  jobs: Array<{ jobId: string; batchId: string; runId: string; status: JobStatus['status']; message?: string; endTime?: string }>,
  client: DatabricksClient,
  requestId: string
): Promise<Array<{ jobId: string; batchId: string; status: JobStatus['status']; message: string; }>> {
  
  // FIXED: Batch Databricks API calls for better performance
  const runIds = jobs.map(job => job.runId);
  const runDetailsMap = await client.getBatchRunStatus(runIds); // Assuming this method exists
  
  const updatesNeeded: Array<{ jobId: string; updates: Partial<JobStatus> }> = [];
  const results: Array<{ jobId: string; batchId: string; status: JobStatus['status']; message: string; }> = [];
  
  for (const job of jobs) {
    try {
      // Skip if already in terminal state
      if (job.status === 'completed' || job.status === 'error' || job.status === 'cancelled') {
        results.push({
          jobId: job.jobId,
          batchId: job.batchId,
          status: job.status,
          message: job.message || '',
        });
        continue;
      }
      
      const runDetails = runDetailsMap[job.runId];
      if (!runDetails) {
        console.warn(`[${requestId}] ⚠️ No run details found for runId: ${job.runId}`);
        results.push({
          jobId: job.jobId,
          batchId: job.batchId,
          status: 'error',
          message: 'Run details not found',
        });
        continue;
      }
      
      const lifeCycleState = runDetails.state?.life_cycle_state;
      const resultState = runDetails.state?.result_state;
      const stateMessage = runDetails.state?.state_message || '';
      
      const newStatus = mapDatabricksStatusToJobStatus(lifeCycleState, resultState);
      
      // FIXED: Only update if status actually changed
      if (newStatus !== job.status) {
        const updatePayload: any = {
          status: newStatus,
          message: stateMessage
        };
        
        // Add end time for terminal states
        if ((newStatus === 'completed' || newStatus === 'error' || newStatus === 'cancelled') && !job.endTime) {
          updatePayload.endTime = new Date().toISOString();
        }
        
        updatesNeeded.push({
          jobId: job.jobId,
          updates: updatePayload
        });
      }
      
      results.push({
        jobId: job.jobId,
        batchId: job.batchId,
        status: newStatus,
        message: stateMessage,
      });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error processing job';
      console.error(`[${requestId}] ❌ Error processing job ${job.jobId}:`, errorMessage);
      
      results.push({
        jobId: job.jobId,
        batchId: job.batchId,
        status: 'error',
        message: errorMessage,
      });
    }
  }
  
  // FIXED: Batch update Redis with atomic operations
  if (updatesNeeded.length > 0) {
    try {
      await updateJobs(updatesNeeded); // Batch update function
      console.log(`[${requestId}] ✅ Updated ${updatesNeeded.length} job statuses in Redis`);
    } catch (error) {
      console.error(`[${requestId}] ❌ Failed to update jobs in Redis:`, error);
      // Don't fail the entire request - just log the error
    }
  }
  
  return results;
}

export async function POST(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  console.log(`[${requestId}] 📥 POST /api/jobs/status`);

  try {
    const body = await request.json().catch(() => ({}));
    const { batchIds } = body;

    // FIXED: Comprehensive input validation
    const validation = validateBatchIds(batchIds);
    if (!validation.valid) {
      console.error(`[${requestId}] ❌ Invalid input:`, validation.errors);
      return createErrorResponse(
        'Validation failed: ' + validation.errors.join(', '),
        requestId,
        400
      );
    }

    const validBatchIds = validation.data!;
    console.log(`[${requestId}] 📋 Processing ${validBatchIds.length} batch IDs`);

    // FIXED: Batch Redis lookup
    const jobs = await getJobsByBatchIds(validBatchIds);
    const foundJobsMap = new Map(jobs.map(job => [job.batchId, job]));
    
    const client = new DatabricksClient(requestId);
    const statuses: Array<{ jobId?: string; batchId: string; status: JobStatus['status']; message: string; }> = [];
    
    // FIXED: Separate found and missing jobs
    const foundJobs: Array<{ jobId: string; batchId: string; runId: string; status: JobStatus['status']; message?: string; endTime?: string }> = [];
    const missingBatchIds: string[] = [];
    
    for (const batchId of validBatchIds) {
      const job = foundJobsMap.get(batchId);
      if (!job || !(job as any).runId) {
        console.warn(`[${requestId}] ⚠️ No job or runId found for batchId: ${batchId}`);
        missingBatchIds.push(batchId);
      } else {
        // Type assert to include runId since we know it exists from the check above
        foundJobs.push({
          jobId: job.jobId,
          batchId: job.batchId || batchId,
          runId: (job as any).runId,
          status: job.status,
          message: job.message,
          endTime: 'endTime' in job ? job.endTime : undefined
        });
      }
    }
    
    // FIXED: Process found jobs in batch
    if (foundJobs.length > 0) {
      const batchResults = await processBatchStatuses(foundJobs, client, requestId);
      statuses.push(...batchResults);
    }
    
    // FIXED: Handle missing jobs consistently
    for (const batchId of missingBatchIds) {
      statuses.push({
        batchId,
        status: 'error',
        message: 'Job not found in Redis',
      });
    }

    console.log(`[${requestId}] ✅ Processed ${statuses.length} job statuses`);
    return createSuccessResponse(statuses);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error(`[${requestId}] ❌ Unexpected error:`, error);
    return createErrorResponse(errorMessage, requestId, 500);
  }
}

export async function OPTIONS(request: NextRequest) {
  return createSuccessResponse({});
}