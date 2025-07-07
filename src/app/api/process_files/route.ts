import { NextRequest } from 'next/server';
import { DatabricksClient, createSuccessResponse, createErrorResponse } from '@/lib/databricks-client';

export async function POST(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  console.log(`[${requestId}] 📥 Received POST request to /api/process_files`);

  try {
    const { parameters } = await request.json();
    
    if (process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true') {
      console.log(`[${requestId}] 🧪 Using mock data for process_files`);
      const mockData = {
        success: true,
        data: {
          batch_id: `batch-${Date.now()}`,
          status: "submitted",
          files_count: parameters?.files?.length || 0,
          submitted_at: new Date().toISOString()
        }
      };
      return createSuccessResponse(mockData);
    }

    const client = new DatabricksClient(requestId);
    const result = await client.executeOperation('process_files', parameters);

    if (!result || !result.success) {
      console.error(`[${requestId}] ❌ SmartBDX operation unsuccessful:`, result);
      return createErrorResponse(result?.error || 'SmartBDX operation failed', requestId, 500, { operation: 'process_files' });
    }

    console.log(`[${requestId}] ✅ Process files operation completed successfully`);
    let processedResult = result;

    // SPECIAL CASE: Databricks returns success:false but real data is in "error" field as JSON string
    if (processedResult && processedResult.success === false && processedResult.error) {
      try {
        const errorParsed = JSON.parse(processedResult.error);
        if (errorParsed && errorParsed.success === true) {
          console.log(`[${requestId}] 🔄 Found real data in error field, using parsed data`);
          processedResult = errorParsed;
        }
      } catch (e) {
        console.log(`[${requestId}] ❌ Failed to parse error field as JSON, treating as actual error`);
      }
    }

    if (!processedResult || !processedResult.success) {
      console.error(`[${requestId}] ❌ SmartBDX operation unsuccessful after parsing:`, processedResult);
      return createErrorResponse(processedResult?.error || 'SmartBDX operation failed', requestId, 500, { operation: 'process_files' });
    }

    console.log(`[${requestId}] ✅ Returning successful result for operation: process_files`);
    return createSuccessResponse(processedResult.data || processedResult);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error(`[${requestId}] ❌ Error in POST /api/process_files:`, error);
    return createErrorResponse(errorMessage, requestId);
  }
}