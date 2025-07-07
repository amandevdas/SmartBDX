import { NextRequest } from 'next/server';
import { DatabricksClient, createSuccessResponse, createErrorResponse } from '@/lib/databricks-client';

export async function GET(request: NextRequest, { params }: { params: { batch_id: string } }) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const { batch_id } = params;
  console.log(`[${requestId}] 📥 Received GET request to /api/get_batch_status/${batch_id}`);

  try {
    if (process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true') {
      console.log(`[${requestId}] 🧪 Using mock data for get_batch_status`);
      const mockData = {
        success: true,
        data: {
          batch_id: batch_id,
          status: "processing",
          progress: Math.floor(Math.random() * 100),
          completed_files: Math.floor(Math.random() * 20),
          total_files: 20,
          errors: 0,
          current_file: "Q3_2023_Claims.xlsx",
          elapsed_time: "00:15:30",
          estimated_remaining: "00:10:00"
        }
      };
      return createSuccessResponse(mockData);
    }

    const client = new DatabricksClient(requestId);
    const result = await client.executeOperation('get_batch_status', { batch_id });

    if (!result || !result.success) {
      console.error(`[${requestId}] ❌ SmartBDX operation unsuccessful:`, result);
      return createErrorResponse(result?.error || 'SmartBDX operation failed', requestId, 500, { operation: 'get_batch_status' });
    }

    console.log(`[${requestId}] ✅ Returning successful result for operation: get_batch_status`);
    return createSuccessResponse(result.data);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error(`[${requestId}] ❌ Error in GET /api/get_batch_status/${batch_id}:`, error);
    return createErrorResponse(errorMessage, requestId);
  }
}