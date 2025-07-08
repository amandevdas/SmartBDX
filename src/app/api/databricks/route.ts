import { NextRequest } from 'next/server';
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
    
    // Execute real backend operation only
    
    try {
      console.log(`[${requestId}] 🚀 Executing Databricks operation: ${operation}`);
      const client = new DatabricksClient(requestId);
      const result = await client.executeOperation(operation, parameters || {});
      
      if (!result || !result.success) {
        console.error(`[${requestId}] ❌ SmartBDX operation unsuccessful:`, result);
        
        // No fallback - real backend operations only
        
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
        
        // No fallback - real backend operations only
      } else if (error instanceof Error && error.message.includes('No valid output found in any task')) {
        console.warn(`[${requestId}] ⚠️ No valid output found but job may have succeeded, using fallback if available`);
        
        // No fallback - real backend operations only
      } else if (error instanceof Error && error.message.includes('SmartBDX operation timeout')) {
        console.warn(`[${requestId}] ⚠️ Operation timed out, using fallback if available`);
        
        // No fallback - real backend operations only
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
    
    // No fallback - real backend operations only
    
    return createErrorResponse(errorMessage, requestId);
  }
}

// Mock data removed - all operations must use real backend

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
    
    // Execute real backend operation only
    
    try {
      const parsedParams = parameters ? JSON.parse(parameters) : {};
      console.log(`[${requestId}] 🚀 Executing Databricks GET operation: ${operation}`);
      const client = new DatabricksClient(requestId);
      const result = await client.executeOperation(operation, parsedParams);
      
      if (!result || !result.success) {
        console.error(`[${requestId}] ❌ SmartBDX operation unsuccessful:`, result);
        
        // No fallback - real backend operations only
        
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
        
        // No fallback - real backend operations only
      } else if (error instanceof Error && error.message.includes('No valid output found in any task')) {
        console.warn(`[${requestId}] ⚠️ No valid output found but job may have succeeded, using fallback if available`);
        
        // No fallback - real backend operations only
      } else if (error instanceof Error && error.message.includes('SmartBDX operation timeout')) {
        console.warn(`[${requestId}] ⚠️ Operation timed out, using fallback if available`);
        
        // No fallback - real backend operations only
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
    
    // No fallback - real backend operations only
    
    return createErrorResponse(errorMessage, requestId);
  }
}

// Handle OPTIONS requests for CORS
export async function OPTIONS(request: NextRequest) {
  return createSuccessResponse({});
}