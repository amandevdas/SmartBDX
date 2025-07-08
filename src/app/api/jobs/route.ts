import { NextRequest, NextResponse } from 'next/server';
import { getAllJobs, clearAllJobs } from '@/lib/redis-job-store';

export async function GET(request: NextRequest) {
  try {
    console.log('📋 API: Getting all jobs from Redis...');
    const jobs = await getAllJobs();
    console.log(`📋 API: Found ${jobs.length} jobs in Redis`);
    
    return NextResponse.json(jobs);
  } catch (error) {
    console.error('❌ API: Error getting jobs:', error);
    return NextResponse.json(
      { error: 'Failed to load jobs' }, 
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    console.log('🗑️ API: Clearing all jobs from Redis...');
    const result = await clearAllJobs();
    console.log(`🗑️ API: Cleared ${result.deletedCount} jobs`);
    
    return NextResponse.json({
      success: true,
      data: result,
      message: `Successfully cleared ${result.deletedCount} jobs`
    });
  } catch (error) {
    console.error('❌ API: Error clearing jobs:', error);
    return NextResponse.json(
      { error: 'Failed to clear jobs' }, 
      { status: 500 }
    );
  }
}