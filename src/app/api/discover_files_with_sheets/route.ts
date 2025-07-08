import { NextRequest } from 'next/server';
import { DatabricksClient, createSuccessResponse, createErrorResponse } from '@/lib/databricks-client';

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

// Add simple TypeScript interface for parameters
interface DiscoverFilesParameters {
  volume_folder?: string;
  include_metadata?: boolean;
  max_files?: number;
}

export async function POST(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  console.log(`[${requestId}] 📥 POST /api/discover_files_with_sheets`);

  try {
    // FIXED: Parse and validate request body
    const body = await request.json().catch(() => ({}));
    const { parameters = {} } = body;
    
    // Simple parameter validation
    const validatedParameters = parameters as DiscoverFilesParameters;
    
    // Basic validation
    if (validatedParameters.max_files && (validatedParameters.max_files < 1 || validatedParameters.max_files > 1000)) {
      console.error(`[${requestId}] ❌ Invalid max_files parameter:`, validatedParameters.max_files);
      return createErrorResponse(
        'Invalid max_files parameter: must be between 1 and 1000',
        requestId,
        400
      );
    }

    // Execute real backend operation
    console.log(`[${requestId}] 🚀 Executing Databricks operation with parameters:`, validatedParameters);
    
    const client = new DatabricksClient(requestId);
    const result = await client.executeOperation('discover_files_with_sheets', validatedParameters);

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

    // FIXED: Standardized response handling
    const finalResult = parseStandardizedResponse(processedResult, requestId);
    
    console.log(`[${requestId}] 🔍 Processed result:`, JSON.stringify(processedResult, null, 2));
    
    if (finalResult.success) {
      console.log(`[${requestId}] ✅ Operation successful - returning data:`, finalResult.data);
      return createSuccessResponse(finalResult.data);
    } else {
      console.error(`[${requestId}] ❌ Operation failed:`, finalResult.error);
      return createErrorResponse(
        finalResult.error || 'Operation failed',
        requestId,
        500,
        { operation: 'discover_files_with_sheets', debug_result: result }
      );
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    console.error(`[${requestId}] ❌ Unexpected error:`, error);
    return createErrorResponse(errorMessage, requestId, 500);
  }
}

// FIXED: Centralized response parsing logic with enhanced debugging
function parseStandardizedResponse(result: any, requestId: string): DatabricksResponse {
  console.log(`[${requestId}] 🔍 Parsing response of type: ${typeof result}`);
  
  try {
    // Handle string responses
    if (typeof result === 'string') {
      console.log(`[${requestId}] 📝 Processing string response: ${result.substring(0, 200)}...`);
      try {
        result = JSON.parse(result);
        console.log(`[${requestId}] ✅ Successfully parsed JSON from string`);
      } catch (e) {
        console.error(`[${requestId}] ❌ Invalid JSON string response:`, e);
        return { success: false, error: `Invalid JSON response format: ${e}` };
      }
    }

    // Handle null/undefined
    if (!result) {
      console.log(`[${requestId}] ⚠️ Empty/null response from Databricks`);
      return { success: false, error: 'Empty response from Databricks' };
    }

    // Log the structure we're working with
    console.log(`[${requestId}] 🔍 Response structure:`, {
      hasSuccess: 'success' in result,
      successValue: result.success,
      hasData: 'data' in result,
      dataType: typeof result.data,
      isArray: Array.isArray(result),
      keys: Object.keys(result)
    });

    // Handle explicit success/failure
    if (typeof result.success === 'boolean') {
      console.log(`[${requestId}] ✅ Found explicit success field: ${result.success}`);
      return {
        success: result.success,
        data: result.success ? result.data : undefined,
        error: result.success ? undefined : result.error || 'Operation failed'
      };
    }

    // Handle warning responses (from our enhanced Databricks client)
    if (result.warning) {
      console.log(`[${requestId}] ⚠️ Got warning response, treating as success:`, result.warning);
      return {
        success: true,
        data: result.data || []
      };
    }

    // If no explicit success field, assume success if we have data
    if (result.data || Array.isArray(result)) {
      console.log(`[${requestId}] ✅ No explicit success field, but found data - treating as success`);
      return {
        success: true,
        data: result.data || result
      };
    }

    // Check for common Databricks response patterns
    if (result.file_name || result.files || result.discovered_files) {
      console.log(`[${requestId}] ✅ Found file data pattern - treating as success`);
      return {
        success: true,
        data: result.files || result.discovered_files || [result]
      };
    }

    // Log the unexpected structure for debugging
    console.error(`[${requestId}] ❌ Unexpected response structure:`, JSON.stringify(result, null, 2));
    return { success: false, error: `Unexpected response structure. Keys: ${Object.keys(result).join(', ')}` };

  } catch (error) {
    console.error(`[${requestId}] ❌ Error parsing response:`, error);
    return { success: false, error: `Failed to parse response: ${error}` };
  }
}