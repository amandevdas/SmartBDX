import { NextResponse } from 'next/server';
import { getAllJobs, updateJob } from '@/lib/redis-job-store';

export async function POST() {
  const requestId = `req_fix_endtime_${Date.now()}`;
  console.log(`[${requestId}] 🔧 Starting fix for missing endTime fields...`);
  
  try {
    // Get all jobs from Redis
    const jobs = await getAllJobs();
    console.log(`[${requestId}] 📋 Found ${jobs.length} jobs to check`);
    
    let fixedCount = 0;
    let skippedCount = 0;
    
    for (const job of jobs) {
      try {
        // Check if job is completed/error but missing endTime
        if ((job.status === 'completed' || job.status === 'error') && !job.endTime) {
          console.log(`[${requestId}] 🔍 Fixing job ${job.jobId} (${job.status})`);
          
          // Estimate endTime based on timestamp + reasonable processing time
          // For missing endTime, we'll use timestamp + 30 seconds as a reasonable estimate
          const startTime = new Date(job.timestamp || job.createdAt);
          const estimatedEndTime = new Date(startTime.getTime() + 30000); // +30 seconds
          
          // Update the job with estimated endTime
          await updateJob(job.jobId, {
            endTime: estimatedEndTime.toISOString()
          });
          
          console.log(`[${requestId}] ✅ Fixed job ${job.jobId}: endTime set to ${estimatedEndTime.toISOString()}`);
          fixedCount++;
        } else {
          skippedCount++;
        }
      } catch (error) {
        console.error(`[${requestId}] ❌ Error processing job ${job.jobId}:`, error);
      }
    }
    
    const summary = {
      fixedCount,
      skippedCount,
      totalJobs: jobs.length,
      message: `Fixed ${fixedCount} jobs, skipped ${skippedCount} jobs, total ${jobs.length} jobs checked`
    };
    
    console.log(`[${requestId}] 📊 Summary:`, summary);
    
    return NextResponse.json({
      success: true,
      data: summary
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error(`[${requestId}] ❌ Error in fix-endtime:`, error);
    return NextResponse.json({
      success: false,
      error: errorMessage
    }, { status: 500 });
  }
}