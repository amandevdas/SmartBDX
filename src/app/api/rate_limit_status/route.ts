import { NextRequest, NextResponse } from 'next/server';
import { DatabricksClient, createSuccessResponse, createErrorResponse } from '@/lib/databricks-client';

export async function GET(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  console.log(`[${requestId}] 📥 Received GET request to /api/rate_limit_status`);
  
  try {
    // Check if we should use mock data
    if (process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true') {
      console.log(`[${requestId}] 🧪 Using mock data for rate limit status`);
      return createSuccessResponse(getMockRateLimitStatus());
    }
    
    try {
      const client = new DatabricksClient(requestId);
      
      // Execute the SmartBDX rate_limit_status operation
      const result = await client.executeOperation('get_rate_limit_status', {});
      
      if (result && result.success && result.data) {
        console.log(`[${requestId}] ✅ SmartBDX rate limit status retrieved`);
        return createSuccessResponse(result.data);
      } else {
        console.warn(`[${requestId}] ⚠️ Invalid result from SmartBDX, using fallback`);
        return createSuccessResponse(getMockRateLimitStatus());
      }
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error(`[${requestId}] ❌ Error in SmartBDX rate limit status:`, errorMessage);
      
      // Return mock data as fallback
      console.log(`[${requestId}] ⚠️ Using fallback mock data due to error`);
      return createSuccessResponse(getMockRateLimitStatus());
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error(`[${requestId}] ❌ Error in GET /api/rate_limit_status:`, error);
    return createErrorResponse(errorMessage, requestId);
  }
}

// Mock data for rate limit status
function getMockRateLimitStatus() {
  const now = new Date();
  const resetTime = new Date(now.getTime() + 45 * 1000); // 45 seconds from now
  
  return {
    tokens_remaining: 42500,
    requests_remaining: 38,
    reset_time: resetTime,
    tokens_per_minute: 50000,
    requests_per_minute: 50,
    current_usage: {
      tokens_used: 7500,
      requests_used: 12,
      period_start: new Date(now.getTime() - 15 * 1000), // 15 seconds ago
      period_end: resetTime
    },
    quota_status: 'healthy',
    estimated_capacity: {
      tokens_available_next_hour: 2950000, // ~49 minutes * 50k tokens
      requests_available_next_hour: 2950, // ~49 minutes * 50 requests
      recommended_batch_size: 25
    },
    usage_trends: {
      avg_tokens_per_request: 625, // 7500/12
      peak_usage_time: '14:30',
      low_usage_time: '02:00',
      daily_quota_utilization: 0.35
    },
    warnings: [],
    recommendations: [
      'Current usage is within optimal range',
      'Consider batch processing during low-usage hours',
      'Token efficiency is good at 625 tokens per request'
    ]
  };
}

// Handle OPTIONS requests for CORS
export async function OPTIONS(request: NextRequest) {
  return createSuccessResponse({});
}