import { NextRequest, NextResponse } from 'next/server';
import { createClient } from 'redis';

const JOB_PREFIX = 'smartbdx:job:';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get('jobId');
  const requestId = `req_debug_${Date.now()}`;
  
  console.log(`[${requestId}] 📥 Received GET request to /api/debug/job with jobId: ${jobId}`);

  if (!jobId) {
    return NextResponse.json({ error: 'Job ID is required' }, { status: 400 });
  }

  try {
    const redis = createClient({ url: process.env.KV_URL });
    await redis.connect();
    
    const rawJobData = await redis.get(`${JOB_PREFIX}${jobId}`);
    await redis.quit();

    if (!rawJobData) {
      return NextResponse.json({ error: `No data found for job ID: ${jobId}` }, { status: 404 });
    }

    console.log(`[${requestId}] ✅ Retrieved raw data for job ${jobId}`);
    
    return NextResponse.json({
      jobId: jobId,
      rawData: rawJobData,
      parsedData: JSON.parse(rawJobData),
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error(`[${requestId}] ❌ Error in GET /api/debug/job:`, error);
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}