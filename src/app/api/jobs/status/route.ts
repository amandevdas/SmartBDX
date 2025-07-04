import { NextRequest, NextResponse } from 'next/server';
import { DatabricksClient, createSuccessResponse, createErrorResponse } from '@/lib/databricks-client';
import { getJobByBatchId, updateJob } from '@/lib/redis-job-store';
import type { JobStatus } from '@/types/api';

export async function POST(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  console.log(`[${requestId}] 📥 Received POST request to /api/jobs/status`);

  try {
    const { batchIds } = await request.json();

    if (!batchIds || !Array.isArray(batchIds) || batchIds.length === 0) {
      return createErrorResponse('batchIds array is required', requestId, 400);
    }

    const client = new DatabricksClient(requestId);
    const statuses = [];

    for (const batchId of batchIds) {
      try {
        const job = await getJobByBatchId(batchId);
        if (!job || !job.runId) {
          console.warn(`[${requestId}] ⚠️ No job or runId found for batchId: ${batchId}`);
          statuses.push({ batchId, status: 'error', message: 'Job not found in Redis' });
          continue;
        }

        // If job is already in a terminal state, just return that status without checking Databricks
        if (job.status === 'completed' || job.status === 'error') {
          statuses.push({
            jobId: job.jobId,
            batchId: batchId,
            status: job.status,
            message: job.message || '',
          });
          continue;
        }

        // *** THE FIX: Call getRunStatus instead of executeOperation ***
        const runDetails = await client.getRunStatus(job.runId);
        
        const lifeCycleState = runDetails.state?.life_cycle_state;
        const resultState = runDetails.state?.result_state;
        const stateMessage = runDetails.state?.state_message || '';

        let newStatus: JobStatus['status'] = job.status;

        switch (lifeCycleState) {
          case 'TERMINATED':
            newStatus = resultState === 'SUCCESS' ? 'completed' : 'error';
            break;
          case 'RUNNING':
            newStatus = 'processing';
            break;
          case 'PENDING':
          case 'QUEUED':
            newStatus = 'submitted';
            break;
          case 'INTERNAL_ERROR':
          case 'SKIPPED':
            newStatus = 'error';
            break;
        }
        
        // Update the job in Redis only if the status has changed
        if (newStatus !== job.status) {
          const updatePayload: Partial<JobStatus> = { status: newStatus, message: stateMessage };
          // If the job is finishing, set the end time
          if ((newStatus === 'completed' || newStatus === 'error') && !job.endTime) {
            updatePayload.endTime = new Date().toISOString();
          }
          await updateJob(job.jobId, updatePayload);
        }

        statuses.push({
          jobId: job.jobId,
          batchId: batchId,
          status: newStatus,
          message: stateMessage,
        });
      } catch (error) {
        const job = await getJobByBatchId(batchId);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[${requestId}] ❌ Error getting status for batch ${batchId}:`, errorMessage);
        if (job) {
          statuses.push({
            jobId: job.jobId,
            batchId: batchId,
            status: 'error',
            message: errorMessage,
          });
        }
      }
    }

    return createSuccessResponse(statuses);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error(`[${requestId}] ❌ Error in POST /api/jobs/status:`, error);
    return createErrorResponse(errorMessage, requestId);
  }
}

export async function OPTIONS(request: NextRequest) {
  return createSuccessResponse({});
}