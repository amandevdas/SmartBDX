import { NextResponse } from 'next/server';
import { clearAllJobs } from '@/lib/redis-job-store';

export async function DELETE() {
  const requestId = `req_clear_jobs_${Date.now()}`;
  console.log(`[${requestId}] 🗑️ Request to clear all jobs...`);
  
  // Only allow clearing jobs in development environment
  if (process.env.NODE_ENV !== 'development') {
    console.warn(`[${requestId}] ⚠️ Clear jobs attempted in ${process.env.NODE_ENV} environment - BLOCKED`);
    return NextResponse.json({
      success: false,
      error: 'Clear all jobs is only available in development mode'
    }, { status: 403 });
  }
  
  try {
    console.log(`[${requestId}] ✅ Development mode confirmed - proceeding with clear`);
    const result = await clearAllJobs();
    
    console.log(`[${requestId}] ✅ Successfully cleared ${result.deletedCount} jobs`);
    
    return NextResponse.json({
      success: true,
      data: result,
      message: `Successfully cleared ${result.deletedCount} jobs from the processing dashboard`
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error(`[${requestId}] ❌ Error clearing jobs:`, error);
    
    return NextResponse.json({
      success: false,
      error: errorMessage
    }, { status: 500 });
  }
}

// Also support POST for flexibility
export async function POST() {
  return DELETE();
}