import { NextRequest, NextResponse } from 'next/server';
import { getAllJobs } from '@/lib/redis-job-store';

export async function GET(request: NextRequest) {
  try {
    console.log('📊 API: Getting batch summaries from Redis jobs...');
    const jobs = await getAllJobs();
    
    // Transform jobs into batch summaries
    const batches = jobs.map(job => ({
      id: job.batchId || job.jobId,
      startTime: job.createdAt || job.timestamp,
      endTime: ('endTime' in job) ? job.endTime : undefined,
      status: job.status === 'submitted' ? 'processing' : 
              job.status === 'completed' ? 'completed' : 
              job.status === 'error' ? 'failed' : 
              job.status === 'processing' ? 'processing' :
              job.status === 'paused' ? 'paused' : 'processing',
      totalFiles: job.files?.length || 0,
      completedFiles: job.status === 'completed' ? (job.files?.length || 0) : 0,
      errorCount: job.status === 'error' ? 1 : 0,
      processingTime: calculateProcessingTime(job.createdAt || job.timestamp, ('endTime' in job) ? job.endTime : undefined)
    }));
    
    console.log(`📊 API: Returning ${batches.length} batch summaries`);
    
    return NextResponse.json({
      success: true,
      data: batches
    });
  } catch (error) {
    console.error('❌ API: Error getting batches:', error);
    return NextResponse.json(
      { error: 'Failed to load batch data' }, 
      { status: 500 }
    );
  }
}

function calculateProcessingTime(startTime: string, endTime?: string): number {
  const start = new Date(startTime).getTime();
  const end = endTime ? new Date(endTime).getTime() : Date.now();
  return Math.floor((end - start) / 1000); // seconds
}