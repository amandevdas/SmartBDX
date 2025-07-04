import { NextRequest, NextResponse } from 'next/server';
import { createClient } from 'redis';
import { createErrorResponse, createSuccessResponse } from '@/lib/databricks-client';

const JOB_PREFIX = 'smartbdx:job:';

export async function GET(request: NextRequest, { params }: { params: { jobId: string } }) {
  const { jobId } = params;
  const requestId = `req_debug_${Date.now()}`;
  console.log(`[${requestId}] 📥 Received GET request to /api/debug/job/${jobId}`);

  if (!jobId) {
    return createErrorResponse('Job ID is required', requestId, 400);
  }

  try {
    const redis = createClient({ url: process.env.KV_URL });
    await redis.connect();
    
    const rawJobData = await redis.get(`${JOB_PREFIX}${jobId}`);
    await redis.quit();

    if (!rawJobData) {
      return createErrorResponse(`No data found for job ID: ${jobId}`, requestId, 404);
    }

    console.log(`[${requestId}] ✅ Retrieved raw data for job ${jobId}`);
    // We return the raw string within a JSON response to see exactly what's stored.
    return NextResponse.json({
      jobId: jobId,
      rawData: rawJobData,
      parsedData: JSON.parse(rawJobData),
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error(`[${requestId}] ❌ Error in GET /api/debug/job/${jobId}:`, error);
    return createErrorResponse(errorMessage, requestId);
  }
}