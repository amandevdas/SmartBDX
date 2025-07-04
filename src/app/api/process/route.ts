import { NextRequest, NextResponse } from 'next/server';
import type { ProcessRequest } from '@/types/api';
import { DatabricksClient, createSuccessResponse, createErrorResponse } from '@/lib/databricks-client';
import { addJob } from '@/lib/redis-job-store';

// Import cache invalidation function
async function invalidateFilesCache() {
  try {
    const response = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/files`, {
      method: 'DELETE',
      headers: { 'Cache-Control': 'no-cache' }
    });
    console.log('🗑️ Files cache invalidated');
  } catch (error) {
    console.warn('⚠️ Failed to invalidate files cache:', error);
  }
}

export async function POST(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  console.log(`[${requestId}] 📥 Received POST request to /api/process`);
  
  try {
    const requestData: ProcessRequest = await request.json();
    
    // Validate request data
    if (!requestData.fileIds || requestData.fileIds.length === 0) {
      console.warn(`[${requestId}] ⚠️ Missing fileIds in request`);
      return createErrorResponse('No files selected for processing', requestId, 400);
    }
    
    console.log(`[${requestId}] 🔄 Processing ${requestData.fileIds.length} files`);
    
    // Check if we should use mock data
    if (process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true') {
      console.log(`[${requestId}] 🧪 Using mock data for processing`);
      return createSuccessResponse(getMockProcessingResponse(requestData));
    }
    
    // Decode file IDs to get actual file paths
    const decodedFileIds = requestData.fileIds.map(id => {
      try {
        return Buffer.from(id, 'base64').toString('utf-8');
      } catch (error) {
        console.warn(`[${requestId}] ⚠️ Failed to decode file ID: ${id}`);
        return id; // Use as-is if decoding fails
      }
    });
    
    // Transform data for the Databricks notebook which expects a `files` array
    const databricksPayload = {
      files: decodedFileIds.map(fileId => ({
        fileId: fileId,
        sheets: (requestData.sheetSelections || {})[fileId] || [], // Use selected sheets or empty array
      })),
      enable_mapping: true, // Or get from requestData.options if available
      batch_id: `batch_${Date.now()}` // Generate a unique batch ID
    };

    // **REFACTORED LOGIC**
    // The 'catch' block is removed. Errors will now propagate up to the main try-catch block,
    // preventing the creation of "ghost" jobs and ensuring the frontend gets a real error response.
    console.log(`[${requestId}] 🚀 Submitting job to Databricks for processing ${decodedFileIds.length} files`);
    const client = new DatabricksClient(requestId);
    
    // Submit job without waiting for completion (async processing)
    const jobResponse = await client.submitJob('process_files', databricksPayload);
    
    if (!jobResponse || !jobResponse.run_id) {
      // This is a critical failure. If Databricks doesn't return a run_id, we cannot track the job.
      throw new Error('Failed to submit job to Databricks: No run_id returned.');
    }
    
    console.log(`[${requestId}] ✅ Job submitted successfully: ${jobResponse.run_id}`);
    
    // Invalidate files cache to ensure fresh status data
    await invalidateFilesCache();
    
    const processedFiles = decodedFileIds.map((fileId, index) => ({
      id: requestData.fileIds[index], // The original encoded ID
      name: fileId.split('/').pop() || fileId, // Extract file name from path
      sheets: (requestData.sheetSelections || {})[requestData.fileIds[index]] || [],
    }));

    const jobData = {
      jobId: `job-${jobResponse.run_id}`,
      status: 'submitted' as const,
      message: `Processing started for ${requestData.fileIds.length} files`,
      timestamp: new Date().toISOString(),
      progress: 0,
      batchId: databricksPayload.batch_id,
      files: processedFiles,
    };

    // Add the job to persistent KV store
    await addJob(jobData, databricksPayload.batch_id, jobResponse.run_id);
    
    return createSuccessResponse(jobData);
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred during processing.';
    console.error(`[${requestId}] ❌ Final error in POST /api/process:`, error);
    
    // Always return a proper error response. No more mock data on failure.
    return createErrorResponse(errorMessage, requestId);
  }
}

// Handle OPTIONS requests for CORS
export async function OPTIONS(request: NextRequest) {
  return createSuccessResponse({});
}

// Mock data helper function
function getMockProcessingResponse(requestData: ProcessRequest) {
  const jobId = `job-${Date.now()}`;
  const runId = Math.floor(Math.random() * 1000000).toString();
  
  return {
    jobId,
    runId,
    status: 'submitted',
    message: `Processing started for ${requestData.fileIds.length} files`,
    details: {
      timestamp: new Date().toISOString(),
      fileCount: requestData.fileIds.length,
      sheetCount: Object.values(requestData.sheetSelections || {}).flat().length,
      priority: requestData.options?.priority || 'normal'
    }
  };
}