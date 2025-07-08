import { NextRequest, NextResponse } from 'next/server';
import { getAllJobs } from '@/lib/redis-job-store';

// Processing event interface matching the component
interface ProcessingEvent {
  id: string;
  timestamp: string;
  type: 'file_started' | 'file_completed' | 'file_failed' | 'batch_started' | 'batch_completed' | 'batch_failed' | 'batch_paused';
  batchId: string;
  fileId?: string;
  fileName?: string;
  message: string;
  details?: {
    sheets?: string[];
    duration?: number;
    cost?: number;
    cache_hit?: boolean;
    error?: string;
    progress?: number;
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { batchIds, maxEvents = 100 } = body;

    console.log(`📡 API: Getting processing events for batches: ${batchIds?.join(', ')}`);

    // Get current jobs to generate events from
    const jobs = await getAllJobs();
    const relevantJobs = jobs.filter(job => 
      batchIds?.includes(job.batchId) || batchIds?.length === 0
    );

    // Generate events based on job status and activity
    const events: ProcessingEvent[] = [];

    relevantJobs.forEach(job => {
      // Generate batch started event
      events.push({
        id: `${job.batchId}-started`,
        timestamp: job.timestamp,
        type: 'batch_started',
        batchId: job.batchId || job.jobId,
        message: `Batch processing started with ${job.files?.length || 1} files`,
        details: {
          sheets: job.files?.flatMap(f => f.sheets || []),
        }
      });

      // Generate file events for each file in the job
      job.files?.forEach((file, index) => {
        const fileStartTime = new Date(new Date(job.timestamp).getTime() + index * 5000).toISOString();
        
        events.push({
          id: `${job.batchId}-${file.id}-started`,
          timestamp: fileStartTime,
          type: 'file_started',
          batchId: job.batchId || job.jobId,
          fileId: file.id,
          fileName: file.name,
          message: `Processing file: ${file.name}`,
          details: {
            sheets: file.sheets,
          }
        });

        // If job is completed, add file completed events
        if (job.status === 'completed') {
          const fileCompleteTime = new Date(new Date(fileStartTime).getTime() + 10000).toISOString();
          events.push({
            id: `${job.batchId}-${file.id}-completed`,
            timestamp: fileCompleteTime,
            type: 'file_completed',
            batchId: job.batchId || job.jobId,
            fileId: file.id,
            fileName: file.name,
            message: `Successfully processed ${file.sheets?.length || 1} sheets`,
            details: {
              sheets: file.sheets,
              duration: 10,
              cost: 0.0012,
              cache_hit: false,
            }
          });
        }
      });

      // Generate batch completion event if needed
      if (job.status === 'completed') {
        const batchCompleteTime = job.endTime || new Date(new Date(job.timestamp).getTime() + 30000).toISOString();
        events.push({
          id: `${job.batchId}-completed`,
          timestamp: batchCompleteTime,
          type: 'batch_completed',
          batchId: job.batchId || job.jobId,
          message: `Batch processing completed successfully`,
          details: {
            duration: 30,
            cost: (job.files?.length || 1) * 0.0012,
          }
        });
      } else if (job.status === 'error') {
        events.push({
          id: `${job.batchId}-failed`,
          timestamp: job.endTime || new Date().toISOString(),
          type: 'batch_failed',
          batchId: job.batchId || job.jobId,
          message: `Batch processing failed: ${job.error || 'Unknown error'}`,
          details: {
            error: job.error || 'Processing failed',
          }
        });
      } else if (job.status === 'paused') {
        events.push({
          id: `${job.batchId}-paused`,
          timestamp: new Date().toISOString(),
          type: 'batch_paused',
          batchId: job.batchId || job.jobId,
          message: `Batch processing paused`,
        });
      }
    });

    // Sort events by timestamp and limit
    const sortedEvents = events
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, maxEvents);

    console.log(`📡 API: Returning ${sortedEvents.length} processing events`);

    return NextResponse.json({
      success: true,
      data: sortedEvents
    });

  } catch (error) {
    console.error('❌ API: Error getting processing events:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to load processing events' 
      }, 
      { status: 500 }
    );
  }
}