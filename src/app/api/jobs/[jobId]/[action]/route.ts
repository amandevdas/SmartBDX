import { NextRequest, NextResponse } from 'next/server';
import { getJobById, updateJob } from '@/lib/redis-job-store';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string; action: string }> }
) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const { jobId, action } = await params;
  
  console.log(`[${requestId}] 📥 Received POST request to /api/jobs/${jobId}/${action}`);

  try {
    // Validate action
    const validActions = ['pause', 'resume', 'stop'];
    if (!validActions.includes(action)) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Invalid action: ${action}. Valid actions are: ${validActions.join(', ')}` 
        }, 
        { status: 400 }
      );
    }

    // Get the job from storage
    const job = await getJobById(jobId);
    if (!job) {
      return NextResponse.json(
        { 
          success: false, 
          error: `Job not found: ${jobId}` 
        }, 
        { status: 404 }
      );
    }

    // Determine new status based on action
    let newStatus: string;
    let message: string;
    
    switch (action) {
      case 'pause':
        if (job.status !== 'processing') {
          return NextResponse.json(
            { 
              success: false, 
              error: `Cannot pause job with status: ${job.status}. Only processing jobs can be paused.` 
            }, 
            { status: 400 }
          );
        }
        newStatus = 'paused';
        message = 'Job paused by user';
        break;
        
      case 'resume':
        if (job.status !== 'paused') {
          return NextResponse.json(
            { 
              success: false, 
              error: `Cannot resume job with status: ${job.status}. Only paused jobs can be resumed.` 
            }, 
            { status: 400 }
          );
        }
        newStatus = 'processing';
        message = 'Job resumed by user';
        break;
        
      case 'stop':
        if (!['processing', 'paused', 'submitted'].includes(job.status)) {
          return NextResponse.json(
            { 
              success: false, 
              error: `Cannot stop job with status: ${job.status}. Only active jobs can be stopped.` 
            }, 
            { status: 400 }
          );
        }
        newStatus = 'cancelled';
        message = 'Job cancelled by user';
        break;
        
      default:
        return NextResponse.json(
          { 
            success: false, 
            error: `Unsupported action: ${action}` 
          }, 
          { status: 400 }
        );
    }

    // Update job status with proper typing
    const updateData: any = {
      status: newStatus,
      message: message,
      timestamp: new Date().toISOString()
    };

    // Add endTime for cancelled jobs
    if (newStatus === 'cancelled') {
      updateData.endTime = new Date().toISOString();
    }

    await updateJob(jobId, updateData);

    console.log(`[${requestId}] ✅ Job ${jobId} ${action}ed successfully. New status: ${newStatus}`);

    return NextResponse.json({
      success: true,
      data: {
        jobId,
        action,
        previousStatus: job.status,
        newStatus,
        message
      }
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error(`[${requestId}] ❌ Error in POST /api/jobs/${jobId}/${action}:`, error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: errorMessage 
      }, 
      { status: 500 }
    );
  }
}