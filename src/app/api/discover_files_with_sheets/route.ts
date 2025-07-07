import { NextRequest } from 'next/server';
import { z } from 'zod';
import { DatabricksClient, createSuccessResponse, createErrorResponse } from '@/lib/databricks-client';
import { mockFilesData } from '@/lib/mock-data/files';

// FIXED: Add proper TypeScript types
interface DiscoverFilesParameters {
  volume_folder?: string;
  include_metadata?: boolean;
  max_files?: number;
}

interface FileWithSheets {
  id: string;
  name: string;
  status: string;
  size: number;
  lastModified: string;
  priority_score?: number;
  cache_available?: boolean;
  estimated_processing_time?: number;
  ai_recommendation?: string;
  sheets: string[];
}

interface DatabricksResponse {
  success: boolean;
  data?: FileWithSheets[];
  error?: string;
}

// FIXED: Add input validation schema
const parametersSchema = z.object({
  volume_folder: z.string().optional(),
  include_metadata: z.boolean().optional(),
  max_files: z.number().min(1).max(1000).optional()
});

export async function POST(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  console.log(`[${requestId}] 📥 POST /api/discover_files_with_sheets`);

  try {
    // FIXED: Parse and validate request body
    const body = await request.json().catch(() => ({}));
    const { parameters = {} } = body;
    
    // FIXED: Validate input parameters
    const validatedParameters = parametersSchema.safeParse(parameters);
    if (!validatedParameters.success) {
      console.error(`[${requestId}] ❌ Invalid parameters:`, validatedParameters.error);
      return createErrorResponse(
        'Invalid parameters: ' + validatedParameters.error.issues.map(i => i.message).join(', '),
        requestId,
        400
      );
    }

    // FIXED: Use server-only environment variable
    if (process.env.USE_MOCK_DATA === 'true') {
      console.log(`[${requestId}] 🧪 Using mock data`);
      return createSuccessResponse(mockFilesData.discover_files_with_sheets);
    }

    // FIXED: Simplified Databricks interaction
    const client = new DatabricksClient(requestId);
    const result = await client.executeOperation('discover_files_with_sheets', validatedParameters.data);

    // FIXED: Standardized response handling
    const processedResult = parseStandardizedResponse(result, requestId);
    
    if (processedResult.success) {
      console.log(`[${requestId}] ✅ Operation successful`);
      return createSuccessResponse(processedResult.data);
    } else {
      console.error(`[${requestId}] ❌ Operation failed:`, processedResult.error);
      return createErrorResponse(
        processedResult.error || 'Operation failed',
        requestId,
        500,
        { operation: 'discover_files_with_sheets' }
      );
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error(`[${requestId}] ❌ Unexpected error:`, error);
    return createErrorResponse(errorMessage, requestId, 500);
  }
}

// FIXED: Centralized response parsing logic
function parseStandardizedResponse(result: any, requestId: string): DatabricksResponse {
  try {
    // Handle string responses
    if (typeof result === 'string') {
      try {
        result = JSON.parse(result);
      } catch (e) {
        console.error(`[${requestId}] ❌ Invalid JSON string response`);
        return { success: false, error: 'Invalid response format' };
      }
    }

    // Handle null/undefined
    if (!result) {
      return { success: false, error: 'Empty response from Databricks' };
    }

    // Handle explicit success/failure
    if (typeof result.success === 'boolean') {
      return {
        success: result.success,
        data: result.success ? result.data : undefined,
        error: result.success ? undefined : result.error || 'Operation failed'
      };
    }

    // REMOVED: Dangerous error field parsing
    // If no explicit success field, assume success if we have data
    if (result.data || Array.isArray(result)) {
      return {
        success: true,
        data: result.data || result
      };
    }

    return { success: false, error: 'Unexpected response structure' };

  } catch (error) {
    console.error(`[${requestId}] ❌ Error parsing response:`, error);
    return { success: false, error: 'Failed to parse response' };
  }
}