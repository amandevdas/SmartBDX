import { NextRequest } from 'next/server';
import { DatabricksClient, createSuccessResponse, createErrorResponse } from '@/lib/databricks-client';

export async function GET(request: NextRequest) {
  const requestId = `health_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  console.log(`[${requestId}] 🏥 Health check requested`);

  try {
    // Check Databricks connectivity
    const client = new DatabricksClient(requestId);
    const healthResult = await client.healthCheck();
    
    // Check job configuration
    let jobConfig = null;
    try {
      jobConfig = await client.getJobConfig();
      console.log(`[${requestId}] ✅ Job configuration retrieved successfully`);
    } catch (error) {
      console.warn(`[${requestId}] ⚠️ Could not retrieve job config:`, error);
    }

    const healthData = {
      status: healthResult.status,
      message: healthResult.message,
      timestamp: new Date().toISOString(),
      databricks: {
        connected: healthResult.status === 'healthy',
        job_id: process.env.SMARTBDX_API_JOB_ID,
        job_config_accessible: !!jobConfig
      },
      environment: {
        has_databricks_host: !!process.env.DATABRICKS_HOST,
        has_databricks_token: !!process.env.DATABRICKS_TOKEN,
        has_job_id: !!process.env.SMARTBDX_API_JOB_ID,
        node_env: process.env.NODE_ENV
      }
    };

    if (healthResult.status === 'healthy') {
      console.log(`[${requestId}] ✅ Health check passed`);
      return createSuccessResponse(healthData);
    } else {
      console.error(`[${requestId}] ❌ Health check failed:`, healthResult.message);
      return createErrorResponse(healthResult.message, requestId, 503, healthData);
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Health check failed';
    console.error(`[${requestId}] ❌ Health check error:`, error);
    
    return createErrorResponse(errorMessage, requestId, 500, {
      status: 'unhealthy',
      error: errorMessage,
      timestamp: new Date().toISOString()
    });
  }
}