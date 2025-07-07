import { NextRequest, NextResponse } from 'next/server';
import { DatabricksClient, createSuccessResponse, createErrorResponse } from '@/lib/databricks-client';

export async function GET(request: NextRequest) {
  const requestId = `test_${Date.now()}`;
  console.log(`[${requestId}] 🧪 Testing Databricks connection...`);
  
  try {
    // Check environment variables
    const config = {
      DATABRICKS_HOST: process.env.DATABRICKS_HOST || 'MISSING',
      DATABRICKS_TOKEN: process.env.DATABRICKS_TOKEN ? 'SET' : 'MISSING',
      SMARTBDX_API_JOB_ID: process.env.SMARTBDX_API_JOB_ID || 'MISSING'
    };
    
    console.log(`[${requestId}] 📊 Configuration check:`, config);
    
    // Try to create client
    const client = new DatabricksClient(requestId);
    console.log(`[${requestId}] ✅ DatabricksClient created successfully`);
    
    // Try to execute a simple operation
    const result = await client.executeOperation('discover_files_with_sheets', {
      volume_folder: '/Volumes/test/bronze/raw/',
      include_metadata: true,
      calculate_priority: true,
      check_cache_status: true
    });
    console.log(`[${requestId}] ✅ Operation executed:`, JSON.stringify(result, null, 2));
    
    return createSuccessResponse({
      success: true,
      config,
      result
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[${requestId}] ❌ Databricks connection test failed:`, errorMessage);
    console.error(`[${requestId}] ❌ Error details:`, error);
    
    return createErrorResponse(`Databricks connection failed: ${errorMessage}`, requestId);
  }
}