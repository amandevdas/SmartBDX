import { NextRequest } from 'next/server';
import { DatabricksClient, createSuccessResponse, createErrorResponse } from '@/lib/databricks-client';
import { updateJob, getJobByBatchId } from '@/lib/redis-job-store';

export async function GET(request: NextRequest, { params }: { params: Promise<{ batch_id: string }> }) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const { batch_id } = await params;
  console.log(`[${requestId}] 📥 Received GET request to /api/get_batch_status/${batch_id}`);

  try {
    // Execute real backend operation only

    const client = new DatabricksClient(requestId);
    const result = await client.executeOperation('get_batch_status', { batch_id });

    if (!result || !result.success) {
      console.error(`[${requestId}] ❌ SmartBDX operation unsuccessful:`, result);
      return createErrorResponse(result?.error || 'SmartBDX operation failed', requestId, 500, { operation: 'get_batch_status' });
    }

    // Update job status in Redis if we have status data
    try {
      const statusData = result.data;
      if (statusData && statusData.batch_id) {
        console.log(`[${requestId}] 💾 Updating job status in Redis for batch ${batch_id}...`);
        
        const existingJob = await getJobByBatchId(batch_id);
        if (existingJob) {
          const statusUpdate: any = {
            status: statusData.status || 'processing',
            message: statusData.current_file || statusData.message || 'Processing...',
            timestamp: new Date().toISOString()
          };

          // Add progress for processing/paused statuses
          if (statusData.status === 'processing' || statusData.status === 'paused') {
            statusUpdate.progress = Math.min(Math.max(statusData.progress || 0, 0), 100);
          }

          // Add endTime for completed/error statuses
          if (statusData.status === 'completed' || statusData.status === 'error') {
            statusUpdate.endTime = statusData.end_time || new Date().toISOString();
            if (statusData.status === 'error') {
              statusUpdate.error = statusData.error || 'Processing failed';
            }
          }

          await updateJob(existingJob.jobId, statusUpdate);
          console.log(`[${requestId}] ✅ Job status updated in Redis`);
        } else {
          console.log(`[${requestId}] ⚠️ No existing job found for batch ${batch_id}`);
        }
      }
    } catch (updateError) {
      console.error(`[${requestId}] ⚠️ Failed to update job status in Redis:`, updateError);
      // Don't fail the request if Redis update fails
    }

    console.log(`[${requestId}] ✅ Returning successful result for operation: get_batch_status`);
    return createSuccessResponse(result.data);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error(`[${requestId}] ❌ Error in GET /api/get_batch_status/${batch_id}:`, error);
    return createErrorResponse(errorMessage, requestId);
  }
}