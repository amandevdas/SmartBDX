import { NextRequest } from 'next/server';
import { DatabricksClient, createSuccessResponse, createErrorResponse } from '@/lib/databricks-client';

export async function POST(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  console.log(`[${requestId}] 📥 Received POST request to /api/smart_file_selection`);

  try {
    const { parameters } = await request.json();
    
    if (process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true') {
      console.log(`[${requestId}] 🧪 Using mock data for smart_file_selection`);
      const mockData = {
        success: true,
        data: {
            recommended_files: ['file-001', 'file-002'],
            reasoning: "These files have the highest priority scores and are recommended for immediate processing."
        }
      };
      return createSuccessResponse(mockData);
    }

    const client = new DatabricksClient(requestId);
    const result = await client.executeOperation('smart_file_selection', parameters);

    if (!result || !result.success) {
      console.error(`[${requestId}] ❌ SmartBDX operation unsuccessful:`, result);
      return createErrorResponse(result?.error || 'SmartBDX operation failed', requestId, 500, { operation: 'smart_file_selection' });
    }

    console.log(`[${requestId}] ✅ Returning successful result for operation: smart_file_selection`);
    return createSuccessResponse(result.data);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error(`[${requestId}] ❌ Error in POST /api/smart_file_selection:`, error);
    return createErrorResponse(errorMessage, requestId);
  }
}