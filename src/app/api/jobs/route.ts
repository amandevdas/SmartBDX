import { NextRequest, NextResponse } from 'next/server';
import { createSuccessResponse, createErrorResponse } from '@/lib/databricks-client';
import { getAllJobs } from '@/lib/redis-job-store';

export async function GET(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  console.log(`[${requestId}] 📥 Received GET request to /api/jobs`);

  try {
    const jobs = await getAllJobs();
    
    // Convert Redis jobs to JobStatus format
    const jobsData = jobs.map(redisJob => ({
      jobId: redisJob.jobId,
      status: redisJob.status,
      progress: redisJob.progress,
      message: redisJob.message,
      batchId: redisJob.batchId,
      timestamp: redisJob.timestamp,
      endTime: redisJob.endTime,
      files: redisJob.files || [], // Ensure the files array is always present
    }));

    console.log(`[${requestId}] ✅ Retrieved ${jobsData.length} jobs from Redis`);
    return createSuccessResponse(jobsData);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error(`[${requestId}] ❌ Error in GET /api/jobs:`, error);
    return createErrorResponse(errorMessage, requestId);
  }
}

export async function OPTIONS(request: NextRequest) {
  return createSuccessResponse({});
}