import { NextRequest, NextResponse } from 'next/server';
import { DatabricksClient, createSuccessResponse, createErrorResponse } from '@/lib/databricks-client';

// Handle POST requests (for operations that need request body)
export async function POST(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  console.log(`[${requestId}] 📥 Received POST request to /api/databricks`);
  
  try {
    const { operation, parameters } = await request.json();
    
    if (!operation) {
      console.warn(`[${requestId}] ⚠️ Missing operation parameter`);
      return createErrorResponse('Operation parameter required', requestId, 400);
    }
    
    console.log(`[${requestId}] 🔄 Processing POST operation: ${operation}`, parameters);
    
    // Check if we should use mock data for this operation
    if (process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true') {
      console.log(`[${requestId}] 🧪 Using mock data for operation: ${operation}`);
      const mockData = getMockDataForOperation(operation, parameters);
      return createSuccessResponse(mockData);
    }
    
    try {
      console.log(`[${requestId}] 🚀 Executing Databricks operation: ${operation}`);
      const client = new DatabricksClient(requestId);
      const result = await client.executeOperation(operation, parameters || {});
      
      if (!result || !result.success) {
        console.error(`[${requestId}] ❌ SmartBDX operation unsuccessful:`, result);
        
        // If we have mock data for this operation, use it as fallback
        if (process.env.NEXT_PUBLIC_ALLOW_FALLBACK === 'true') {
          console.log(`[${requestId}] ⚠️ Using fallback mock data for failed operation: ${operation}`);
          const mockData = getMockDataForOperation(operation, parameters);
          return createSuccessResponse(mockData);
        }
        
        return createErrorResponse(
          result?.error || 'SmartBDX operation failed',
          requestId,
          500,
          { operation }
        );
      }

      console.log(`[${requestId}] ✅ Returning successful result for operation: ${operation}`);
      return createSuccessResponse(result.data);
    } catch (error) {
      // Handle specific Databricks errors
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error(`[${requestId}] ❌ Error in Databricks operation:`, errorMessage);
      
      // Check for multi-task job error
      if (error instanceof Error && error.message.includes('multiple tasks is not supported')) {
        console.warn(`[${requestId}] ⚠️ Multi-task job error detected, using fallback if available`);
        
        if (process.env.NEXT_PUBLIC_ALLOW_FALLBACK === 'true') {
          console.log(`[${requestId}] ⚠️ Using fallback mock data for operation with multi-task error: ${operation}`);
          const mockData = getMockDataForOperation(operation, parameters);
          return createSuccessResponse(mockData);
        }
      } else if (error instanceof Error && error.message.includes('No valid output found in any task')) {
        console.warn(`[${requestId}] ⚠️ No valid output found but job may have succeeded, using fallback if available`);
        
        if (process.env.NEXT_PUBLIC_ALLOW_FALLBACK === 'true') {
          console.log(`[${requestId}] ⚠️ Using fallback mock data for operation with output error: ${operation}`);
          const mockData = getMockDataForOperation(operation, parameters);
          return createSuccessResponse(mockData);
        }
      } else if (error instanceof Error && error.message.includes('SmartBDX operation timeout')) {
        console.warn(`[${requestId}] ⚠️ Operation timed out, using fallback if available`);
        
        if (process.env.NEXT_PUBLIC_ALLOW_FALLBACK === 'true') {
          console.log(`[${requestId}] ⚠️ Using fallback mock data for operation with timeout: ${operation}`);
          const mockData = getMockDataForOperation(operation, parameters);
          return createSuccessResponse(mockData);
        }
      }
      
      // Re-throw to be caught by the outer try-catch
      throw error;
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error(`[${requestId}] ❌ Error in POST /api/databricks:`, error);
    
    // Check if this is a Databricks API error
    const isDatabricksError = errorMessage.includes('Databricks API error');
    
    // If it's a job not found error, provide a more helpful message
    if (isDatabricksError && errorMessage.includes('Job') && errorMessage.includes('does not exist')) {
      return createErrorResponse(
        'The Databricks job ID specified in the environment variables does not exist. Please check your SMARTBDX_API_JOB_ID setting.',
        requestId,
        500,
        { details: errorMessage }
      );
    }
    
    // For specific error types, use mock data as fallback if allowed
    if (process.env.NEXT_PUBLIC_ALLOW_FALLBACK === 'true' &&
        (errorMessage.includes('multiple tasks is not supported') ||
         errorMessage.includes('No valid output found in any task') ||
         errorMessage.includes('SmartBDX operation timeout') ||
         errorMessage.includes('timeout') ||
         errorMessage.includes('connection') ||
         isDatabricksError)) {
      try {
        // Get the operation and parameters from the request body
        let operationName: string | undefined;
        let operationParams: any;
        
        try {
          const requestData = await request.json();
          operationName = requestData.operation;
          operationParams = requestData.parameters;
        } catch (parseError) {
          console.warn(`[${requestId}] ⚠️ Could not parse request body for fallback:`, parseError);
        }
        
        if (operationName) {
          console.log(`[${requestId}] ⚠️ Using fallback mock data due to error: ${errorMessage}`);
          const mockData = getMockDataForOperation(operationName, operationParams);
          return createSuccessResponse(mockData);
        }
      } catch (mockError) {
        console.error(`[${requestId}] ❌ Error generating mock data:`, mockError);
      }
    }
    
    return createErrorResponse(errorMessage, requestId);
  }
}

// Mock data helper function
function getMockDataForOperation(operation: string, parameters?: any): any {
  console.log(`Generating mock data for operation: ${operation}`);

  const mockData: Record<string, any> = {
    discover_files_with_sheets: {
      success: true,
      data: [
        {
          id: 'file-001',
          name: 'Bordereaux_Claims_Q1_2023.xlsx',
          status: 'ready',
          size: 1024 * 25,
          lastModified: new Date('2023-04-15').toISOString(),
          priority_score: 95,
          processing_status: 'ready_for_processing',
          structure_signature: 'claims_standard_v2',
          cache_available: true,
          estimated_processing_time: 180,
          ai_recommendation: 'high_priority',
          base_file_name: 'bordereaux_claims_q1_2023',
          file_size_mb: 0.024,
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          path: '/Volumes/test/bronze/raw/Bordereaux_Claims_Q1_2023.xlsx',
          sheets: ['Claims Data', 'Claim Details', 'Summary']
        },
        {
          id: 'file-002',
          name: 'Bordereaux_Premium_Q2_2023.xlsx',
          status: 'ready',
          size: 1024 * 32,
          lastModified: new Date('2023-07-20').toISOString(),
          priority_score: 85,
          processing_status: 'ready_for_processing',
          structure_signature: 'premium_standard_v1',
          cache_available: false,
          estimated_processing_time: 240,
          ai_recommendation: 'high_priority',
          base_file_name: 'bordereaux_premium_q2_2023',
          file_size_mb: 0.031,
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          path: '/Volumes/test/bronze/raw/Bordereaux_Premium_Q2_2023.xlsx',
          sheets: ['Premium Data', 'Premium Details', 'Summary']
        },
      ]
    },
    process_files: {
      success: true,
      data: {
        batch_id: `batch-${Date.now()}`,
        status: "submitted",
        files_count: parameters?.files?.length || 0,
        submitted_at: new Date().toISOString()
      }
    },
    get_batch_status: {
      success: true,
      data: {
        batch_id: parameters?.batch_id || "batch-001",
        status: "processing",
        progress: 60,
        completed_files: 12,
        total_files: 20,
        errors: 0,
        current_file: "Q3_2023_Claims.xlsx",
        elapsed_time: "00:15:30",
        estimated_remaining: "00:10:00"
      }
    },
    smart_file_selection: {
        success: true,
        data: {
            recommended_files: ['file-001', 'file-002'],
            reasoning: "These files have the highest priority scores and are recommended for immediate processing."
        }
    },
    get_cache_analytics: {
        success: true,
        data: {
            cache_hit_rate: 0.78,
            total_queries: 1500,
            cache_hits: 1170,
            cache_misses: 330,
            most_cached_files: [
                { file: 'Reinsurance_Data_Q3_2023.xlsx', hits: 250 },
                { file: 'Bordereaux_Claims_Q1_2023.xlsx', hits: 180 }
            ]
        }
    }
  };

  return mockData[operation] || { success: true, data: { message: `Mock data not available for operation: ${operation}` } };
}

// Handle GET requests (for simple operations)
export async function GET(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  console.log(`[${requestId}] 📥 Received GET request to /api/databricks`);
  
  try {
    const { searchParams } = new URL(request.url);
    const operation = searchParams.get('operation');
    const parameters = searchParams.get('parameters');
    
    if (!operation) {
      console.warn(`[${requestId}] ⚠️ Missing operation parameter`);
      return createErrorResponse('Operation parameter required', requestId, 400);
    }
    
    console.log(`[${requestId}] 🔄 Processing GET operation: ${operation}`);
    
    // Check if we should use mock data for this operation
    if (process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true') {
      console.log(`[${requestId}] 🧪 Using mock data for operation: ${operation}`);
      const parsedParams = parameters ? JSON.parse(parameters) : {};
      const mockData = getMockDataForOperation(operation, parsedParams);
      return createSuccessResponse(mockData);
    }
    
    try {
      const parsedParams = parameters ? JSON.parse(parameters) : {};
      console.log(`[${requestId}] 🚀 Executing Databricks GET operation: ${operation}`);
      const client = new DatabricksClient(requestId);
      const result = await client.executeOperation(operation, parsedParams);
      
      if (!result || !result.success) {
        console.error(`[${requestId}] ❌ SmartBDX operation unsuccessful:`, result);
        
        // If we have mock data for this operation, use it as fallback
        if (process.env.NEXT_PUBLIC_ALLOW_FALLBACK === 'true') {
          console.log(`[${requestId}] ⚠️ Using fallback mock data for failed operation: ${operation}`);
          const mockData = getMockDataForOperation(operation, parsedParams);
          return createSuccessResponse(mockData);
        }
        
        return createErrorResponse(
          result?.error || 'SmartBDX operation failed',
          requestId,
          500,
          { operation }
        );
      }

      console.log(`[${requestId}] ✅ Returning successful result for operation: ${operation}`);
      return createSuccessResponse(result.data);
    } catch (error) {
      // Handle specific Databricks errors
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error(`[${requestId}] ❌ Error in Databricks GET operation:`, errorMessage);
      
      // Check for multi-task job error
      if (error instanceof Error && error.message.includes('multiple tasks is not supported')) {
        console.warn(`[${requestId}] ⚠️ Multi-task job error detected, using fallback if available`);
        
        if (process.env.NEXT_PUBLIC_ALLOW_FALLBACK === 'true') {
          console.log(`[${requestId}] ⚠️ Using fallback mock data for operation with multi-task error: ${operation}`);
          const parsedParams = parameters ? JSON.parse(parameters) : {};
          const mockData = getMockDataForOperation(operation, parsedParams);
          return createSuccessResponse(mockData);
        }
      } else if (error instanceof Error && error.message.includes('No valid output found in any task')) {
        console.warn(`[${requestId}] ⚠️ No valid output found but job may have succeeded, using fallback if available`);
        
        if (process.env.NEXT_PUBLIC_ALLOW_FALLBACK === 'true') {
          console.log(`[${requestId}] ⚠️ Using fallback mock data for operation with output error: ${operation}`);
          const parsedParams = parameters ? JSON.parse(parameters) : {};
          const mockData = getMockDataForOperation(operation, parsedParams);
          return createSuccessResponse(mockData);
        }
      } else if (error instanceof Error && error.message.includes('SmartBDX operation timeout')) {
        console.warn(`[${requestId}] ⚠️ Operation timed out, using fallback if available`);
        
        if (process.env.NEXT_PUBLIC_ALLOW_FALLBACK === 'true') {
          console.log(`[${requestId}] ⚠️ Using fallback mock data for operation with timeout: ${operation}`);
          const parsedParams = parameters ? JSON.parse(parameters) : {};
          const mockData = getMockDataForOperation(operation, parsedParams);
          return createSuccessResponse(mockData);
        }
      }
      
      // Re-throw to be caught by the outer try-catch
      throw error;
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error(`[${requestId}] ❌ Error in GET /api/databricks:`, error);
    
    // Check if this is a Databricks API error
    const isDatabricksError = errorMessage.includes('Databricks API error');
    
    // If it's a job not found error, provide a more helpful message
    if (isDatabricksError && errorMessage.includes('Job') && errorMessage.includes('does not exist')) {
      return createErrorResponse(
        'The Databricks job ID specified in the environment variables does not exist. Please check your SMARTBDX_API_JOB_ID setting.',
        requestId,
        500,
        { details: errorMessage }
      );
    }
    
    // For specific error types, use mock data as fallback if allowed
    if (process.env.NEXT_PUBLIC_ALLOW_FALLBACK === 'true' &&
        (errorMessage.includes('multiple tasks is not supported') ||
         errorMessage.includes('No valid output found in any task') ||
         errorMessage.includes('SmartBDX operation timeout') ||
         errorMessage.includes('timeout') ||
         errorMessage.includes('connection') ||
         isDatabricksError)) {
      try {
        const { searchParams } = new URL(request.url);
        const operation = searchParams.get('operation');
        const parameters = searchParams.get('parameters');
        
        if (operation) {
          console.log(`[${requestId}] ⚠️ Using fallback mock data due to error: ${errorMessage}`);
          const parsedParams = parameters ? JSON.parse(parameters) : {};
          const mockData = getMockDataForOperation(operation, parsedParams);
          return createSuccessResponse(mockData);
        }
      } catch (mockError) {
        console.error(`[${requestId}] ❌ Error generating mock data:`, mockError);
      }
    }
    
    return createErrorResponse(errorMessage, requestId);
  }
}

// Handle OPTIONS requests for CORS
export async function OPTIONS(request: NextRequest) {
  return createSuccessResponse({});
}