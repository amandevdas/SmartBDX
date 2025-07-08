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
const PENDING_REQUEST_TTL = 1000; // 1 second TTL for pending requests (reduced to allow more frequent requests)
const PROCESS_FILES_TTL = 2000; // 2 seconds TTL for process_files operations (reduced to prevent blocking)

// Generate a cache key for a request
function getRequestCacheKey(endpoint: string, options: RequestInit): string {
  const method = options.method || 'GET';
  let body = '';
  
  // For POST requests, create a normalized key based on operation type
  if (options.body) {
    try {
      const parsedBody = JSON.parse(options.body as string);
      // For file discovery operations, ignore minor parameter differences
      if (endpoint === '/discover_files_with_sheets') {
        body = 'file_discovery';
      } else if (endpoint === '/smart_file_selection') {
        body = 'smart_selection';
      } else if (endpoint === '/process_files') {
        // For process_files, include timestamp to allow rapid submissions
        const fileIds = parsedBody.parameters?.files?.map((f: any) => f.fileId).sort().join(',') || '';
        const timestamp = Math.floor(Date.now() / 2000); // 2-second buckets for deduplication
        body = `process_files:${fileIds}:${timestamp}`;
      } else {
        body = JSON.stringify(parsedBody);
      }
    } catch {
      body = options.body as string;
    }
  }
  
  return `${method}:${endpoint}:${body}`;
}

// Clean up expired pending requests
function cleanupPendingRequests(): void {
  const now = Date.now();
  Object.keys(pendingRequests).forEach(key => {
    const request = pendingRequests[key];
    // Use different TTL for process_files operations
    const ttl = key.includes('process_files') ? PROCESS_FILES_TTL : PENDING_REQUEST_TTL;
    
    if (now - request.timestamp > ttl) {
      console.log(`🧹 [CLEANUP] Removing expired request: ${key} (age: ${now - request.timestamp}ms)`);
      delete pendingRequests[key];
    }
  });
}

// Get authentication headers for API requests
async function getAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'X-API-Source': 'smartbdx-frontend',
    'X-Client-Version': '1.0.0'
  };

  // Get token from localStorage (enhanced auth service stores full user object)
  if (typeof window !== 'undefined') {
    const storedUser = localStorage.getItem('smartbdx_user');
    if (storedUser) {
      try {
        const user = JSON.parse(storedUser);
        if (user.token) {
          headers['Authorization'] = `Bearer ${user.token}`;
          headers['X-User-Tenant'] = user.tenant || 'default';
          headers['X-User-Roles'] = (user.roles || []).join(',');
          
          // Check token expiry
          const expiresAt = new Date(user.expiresAt);
          const now = new Date();
          if (expiresAt <= now) {
            console.warn('Token expired, may need refresh');
            headers['X-Token-Status'] = 'expired';
          }
        }
      } catch (error) {
        console.error('Error parsing stored user:', error);
      }
    }
  }
  
  return headers;
}

// API request function with deduplication and retry logic
export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

  // Get authentication headers
  const authHeaders = await getAuthHeaders();

  const config: RequestInit = {
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...options.headers,
    },
    ...options,
  };

  // Check for in-flight requests to the same endpoint
  const cacheKey = getRequestCacheKey(endpoint, config);
  cleanupPendingRequests();
  
  if (pendingRequests[cacheKey]) {
    const age = Date.now() - pendingRequests[cacheKey].timestamp;
    console.log(`🔄 [DEDUP] Reusing in-flight request for ${endpoint} (key: ${cacheKey.substring(0, 50)}..., age: ${age}ms)`);
    
    // Special logging for process_files to help track duplicate submissions
    if (endpoint === '/process_files') {
      console.warn(`🚨 [PROCESS_FILES] Duplicate submission detected and blocked! Age: ${age}ms`);
    }
    
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
  
  // Special logging for process_files to help track submissions
  if (endpoint === '/process_files') {
    console.log(`🔒 [PROCESS_FILES] Request cached for deduplication (key: ${cacheKey.substring(0, 50)}...)`);
  }
  
  // Clean up after the request completes
  requestPromise.finally(() => {
    delete pendingRequests[cacheKey];
  });
  
  return requestPromise as Promise<T>;
}

// Mock data removed - all data must come from real backend APIs