// src/utils/apiHelpers.ts
import { ApiResponse } from '../types/api';

// API Error class
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

// In-flight requests cache to prevent duplicate requests
interface PendingRequest {
  promise: Promise<any>;
  timestamp: number;
}

const pendingRequests: Record<string, PendingRequest> = {};
const PENDING_REQUEST_TTL = 2000; // 2 seconds TTL for pending requests

// Generate a cache key for a request
function getRequestCacheKey(endpoint: string, options: RequestInit): string {
  const method = options.method || 'GET';
  const body = options.body ? JSON.stringify(options.body) : '';
  return `${method}:${endpoint}:${body}`;
}

// Clean up expired pending requests
function cleanupPendingRequests(): void {
  const now = Date.now();
  Object.keys(pendingRequests).forEach(key => {
    if (now - pendingRequests[key].timestamp > PENDING_REQUEST_TTL) {
      delete pendingRequests[key];
    }
  });
}

// API request function with deduplication and retry logic
export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';
  const USE_MOCK_DATA = process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';
  
  // Use mock data if explicitly enabled
  if (USE_MOCK_DATA) {
    await new Promise(resolve => setTimeout(resolve, 500));
    return getMockData(endpoint) as T;
  }

  const config: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  };

  // Check for in-flight requests to the same endpoint
  const cacheKey = getRequestCacheKey(endpoint, config);
  cleanupPendingRequests();
  
  if (pendingRequests[cacheKey]) {
    console.log(`Reusing in-flight request for ${endpoint}`);
    return pendingRequests[cacheKey].promise as Promise<T>;
  }

  // Create new request
  let attempt = 0;
  const maxRetries = 3;
  
  const requestPromise = (async () => {
    while (attempt < maxRetries) {
      try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, config);
        
        if (!response.ok) {
          throw new ApiError(response.status, `HTTP ${response.status}: ${response.statusText}`);
        }
        
        return await response.json();
      } catch (error) {
        attempt++;
        
        if (attempt >= maxRetries) {
          throw error instanceof ApiError ? error : new ApiError(500, 'Network error');
        }
        
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
    
    throw new ApiError(500, 'Max retries exceeded');
  })();
  
  // Store the promise in the pending requests cache
  pendingRequests[cacheKey] = {
    promise: requestPromise,
    timestamp: Date.now()
  };
  
  // Clean up after the request completes
  requestPromise.finally(() => {
    delete pendingRequests[cacheKey];
  });
  
  return requestPromise as Promise<T>;
}

// Mock data function
function getMockData(endpoint: string): any {
  if (endpoint === '/files') {
    return [
      { id: 'sample1', name: 'sample1.xlsx', status: 'ready', size: 1024000, lastModified: new Date() },
      { id: 'sample2', name: 'sample2.xlsx', status: 'processing', size: 2048000, lastModified: new Date() },
      {
        id: 'bdx1',
        name: 'Bordereaux_Claims_Q1_2024.xlsx',
        status: 'ready',
        size: 1024 * 27,
        lastModified: new Date('2024-04-10'),
      },
      {
        id: 'bdx2',
        name: 'Bordereaux_Premium_Q1_2024.xlsx',
        status: 'ready',
        size: 1024 * 33,
        lastModified: new Date('2024-04-12'),
      },
    ];
  }
  
  if (endpoint.includes('/files/') && endpoint.includes('/sheets')) {
    const fileId = endpoint.split('/')[2];
    
    const mockSheets: Record<string, string[]> = {
      'sample1': ['Sheet1', 'Sheet2', 'Sheet3'],
      'sample2': ['Sheet1', 'Sheet2'],
      'bdx1': ['Claims Data', 'Claim Details', 'Claim Summary', 'Claim Analysis'],
      'bdx2': ['Premium Data', 'Premium Details', 'Premium Summary', 'Premium Analysis'],
    };
    
    return mockSheets[fileId] || ['Sheet1', 'Sheet2', 'Sheet3'];
  }
  
  if (endpoint === '/jobs') {
    return [
      { id: 'job-1', jobId: 'job-1', status: 'processing', progress: 45, fileName: 'sample1.xlsx' },
      { id: 'job-2', jobId: 'job-2', status: 'completed', progress: 100, fileName: 'sample2.xlsx' },
    ];
  }
  
  if (endpoint.includes('/jobs/') && endpoint.includes('/status')) {
    return { status: 'processing', progress: 45, jobId: 'job-123' };
  }
  
  if (endpoint === '/process') {
    return { jobId: 'job-123', status: 'submitted' };
  }
  
  return {};
}