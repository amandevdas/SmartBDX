import { NextRequest } from 'next/server';
import { DatabricksClient, createSuccessResponse, createErrorResponse } from '@/lib/databricks-client';

export async function GET(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  console.log(`[${requestId}] 📥 Received GET request to /api/check_processing_status`);

  try {
    const { searchParams } = new URL(request.url);
    const fileIds = searchParams.get('fileIds')?.split(',');

    if (!fileIds || fileIds.length === 0) {
      return createErrorResponse('fileIds parameter is required', requestId, 400);
    }
    
    if (process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true') {
      console.log(`[${requestId}] 🧪 Using mock data for check_processing_status`);
      const mockData = {
        success: true,
        data: fileIds.reduce((acc, id) => {
          acc[id] = { status: 'completed', cache_available: Math.random() > 0.5 };
          return acc;
        }, {} as Record<string, { status: string; cache_available: boolean }>)
      };
      return createSuccessResponse(mockData);
    }

    const client = new DatabricksClient(requestId);
    const result = await client.executeOperation('check_processing_status', { file_ids: fileIds });

    if (!result || !result.success) {
      console.error(`[${requestId}] ❌ SmartBDX operation unsuccessful:`, result);
      return createErrorResponse(result?.error || 'SmartBDX operation failed', requestId, 500, { operation: 'check_processing_status' });
    }

    console.log(`[${requestId}] ✅ Returning successful result for operation: check_processing_status`);
    return createSuccessResponse(result.data);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error(`[${requestId}] ❌ Error in GET /api/check_processing_status:`, error);
    return createErrorResponse(errorMessage, requestId);
  }
}