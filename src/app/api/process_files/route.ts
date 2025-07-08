import { NextRequest } from 'next/server';
import { DatabricksClient, createSuccessResponse, createErrorResponse } from '@/lib/databricks-client';
import { addJob } from '@/lib/redis-job-store';
import type { JobStatus } from '@/types/api';

export async function POST(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  console.log(`[${requestId}] 📥 Received POST request to /api/process_files`);

  try {
    const { parameters } = await request.json();
    
    // Execute real backend operation only

    const client = new DatabricksClient(requestId);
    const result = await client.executeOperation('process_files', parameters);

    console.log(`[${requestId}] 🔍 Raw result from executeOperation:`, JSON.stringify(result, null, 2));

    // SPECIAL CASE: Databricks returns success:false but real data is in "error" field as JSON string
    let processedResult = result;
    if (result && result.success === false && result.error) {
      try {
        const errorParsed = JSON.parse(result.error);
        if (errorParsed && errorParsed.success === true) {
          console.log(`[${requestId}] 🔄 Found real data in error field, using parsed data`);
          processedResult = errorParsed;
        }
      } catch (e) {
        console.log(`[${requestId}] ❌ Failed to parse error field as JSON, treating as actual error`);
      }
    }

    console.log(`[${requestId}] 🔍 Processed result:`, JSON.stringify(processedResult, null, 2));

    if (!processedResult || !processedResult.success) {
      console.error(`[${requestId}] ❌ SmartBDX operation unsuccessful after parsing:`, processedResult);
      return createErrorResponse(processedResult?.error || 'SmartBDX operation failed', requestId, 500, { operation: 'process_files' });
    }

    console.log(`[${requestId}] ✅ Process files operation completed successfully`);

    // Extract batch ID and create job record
    const batchData = processedResult.data || processedResult;
    const batchId = batchData?.batch_id || batchData?.jobId || `batch-${Date.now()}`;
    
    // Create job status for persistence
    const jobStatus: JobStatus = {
      jobId: batchId,
      batchId: batchId,
      status: 'submitted' as const,
      timestamp: new Date().toISOString(),
      message: 'Job submitted successfully',
      files: parameters?.files?.map((f: any) => ({
        id: f.fileId,
        name: f.fileId,
        sheets: f.sheets || []
      })) || []
    };

    // Persist job to Redis for tracking
    try {
      console.log(`[${requestId}] 💾 Persisting job ${batchId} to Redis...`);
      await addJob(jobStatus, batchId, Date.now());
      console.log(`[${requestId}] ✅ Job persisted to Redis successfully`);
    } catch (jobError) {
      console.error(`[${requestId}] ⚠️ Failed to persist job to Redis:`, jobError);
      // Don't fail the request if Redis persistence fails
    }

    console.log(`[${requestId}] ✅ Returning successful result for operation: process_files`);
    return createSuccessResponse(processedResult.data || processedResult);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error(`[${requestId}] ❌ Error in POST /api/process_files:`, error);
    return createErrorResponse(errorMessage, requestId);
  }
}