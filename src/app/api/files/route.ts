import { NextRequest, NextResponse } from 'next/server';
import { DatabricksClient, createSuccessResponse, createErrorResponse } from '@/lib/databricks-client';

// Simple in-memory cache for the main file status list
interface CacheEntry {
  data: any;
  timestamp: number;
}
const filesStatusCache: Record<string, CacheEntry> = {};
const FILES_STATUS_CACHE_TTL = 60000; // 60 seconds

// Simple in-memory cache for individual processing status updates
interface ProcessingStatusCache {
  [fileId: string]: {
    status: string;
    lastUpdated: number;
    batchId?: string;
    progress?: number;
  };
}

const processingStatusCache: ProcessingStatusCache = {};
const STATUS_CACHE_TTL = 5000; // 5 seconds for processing status

// Cache invalidation function
function invalidateFilesCache(volumePath?: string, requestId?: string): void {
  const logPrefix = requestId ? `[${requestId}]` : '';
  if (volumePath) {
    const cacheKey = `files_status_${volumePath}`;
    delete filesStatusCache[cacheKey];
    console.log(`${logPrefix} 🗑️ Invalidated cache for volume: ${volumePath}`);
  } else {
    // Clear all cache entries
    Object.keys(filesStatusCache).forEach(key => delete filesStatusCache[key]);
    console.log(`${logPrefix} 🗑️ Cleared all files cache`);
  }
}

export async function GET(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  console.log(`[${requestId}] 📥 Received GET request to /api/files`);
  
  try {
    const { searchParams } = new URL(request.url);
    const forceRefresh = searchParams.get('refresh') === 'true';
    const volumePath = process.env.NEXT_PUBLIC_VOLUME_PATH || '/Volumes/test/bronze/raw/';
    const cacheKey = `files_status_${volumePath}`;
    
    if (forceRefresh) {
      console.log(`[${requestId}] 🔄 Force refresh requested, invalidating caches`);
      invalidateFilesCache(volumePath, requestId);
      Object.keys(processingStatusCache).forEach(key => delete processingStatusCache[key]);
    }

    // Check for a valid cached result first
    const cachedEntry = filesStatusCache[cacheKey];
    if (cachedEntry && (Date.now() - cachedEntry.timestamp < FILES_STATUS_CACHE_TTL)) {
      console.log(`[${requestId}] 🔄 Using cached files status data`);
      return createSuccessResponse(cachedEntry.data);
    }
    
    // Check if we should use mock data
    if (process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true') {
      console.log(`[${requestId}] 🧪 Using mock data for files status`);
      return createSuccessResponse(getMockFilesWithStatus());
    }
    
    try {
      const client = new DatabricksClient(requestId);
      
      // Get files with discover_files_with_sheets operation (optimized - includes sheet names)
      const filesResult = await client.executeOperation('discover_files_with_sheets', { volume_folder: volumePath });
      
      // More lenient validation - accept both direct arrays and wrapped responses
      let filesData = [];
      if (filesResult && filesResult.success && filesResult.data && Array.isArray(filesResult.data)) {
        filesData = filesResult.data;
      } else if (filesResult && Array.isArray(filesResult)) {
        // Handle direct array response
        filesData = filesResult;
      } else if (filesResult && filesResult.data && Array.isArray(filesResult.data)) {
        // Handle response without success flag
        filesData = filesResult.data;
      } else if (filesResult && filesResult.error && typeof filesResult.error === 'string') {
        // Handle case where real data is embedded as JSON string in error field
        try {
          console.log(`[${requestId}] 🔍 Attempting to parse embedded JSON from error field`);
          const parsedError = JSON.parse(filesResult.error);
          if (parsedError && parsedError.success && parsedError.data && Array.isArray(parsedError.data)) {
            console.log(`[${requestId}] ✅ Successfully extracted real data from error field`);
            filesData = parsedError.data;
          } else {
            throw new Error('Parsed error does not contain valid data structure');
          }
        } catch (parseError) {
          console.warn(`[${requestId}] ⚠️ Failed to parse embedded JSON from error field:`, parseError);
          console.warn(`[${requestId}] ⚠️ Invalid files result from SmartBDX, using fallback. Result:`, JSON.stringify(filesResult, null, 2));
          return createSuccessResponse(getMockFilesWithStatus());
        }
      } else {
        console.warn(`[${requestId}] ⚠️ Invalid files result from SmartBDX, using fallback. Result:`, JSON.stringify(filesResult, null, 2));
        return createSuccessResponse(getMockFilesWithStatus());
      }
      
      if (filesData.length === 0) {
        console.warn(`[${requestId}] ⚠️ No files found in SmartBDX result, using fallback`);
        return createSuccessResponse(getMockFilesWithStatus());
      }
      
      // Transform files data without individual status calls (OPTIMIZED - no N+1 API calls)
      const filesWithStatus = filesData.map((file: any) => {
        const fileId = Buffer.from(file.file_name || file.path).toString('base64');
        let processingStatus = 'ready';
        let progress = 0;
        let batchId = undefined;
        
        // Check cache first for any existing status
        const cached = processingStatusCache[fileId];
        if (cached && (Date.now() - cached.lastUpdated) < STATUS_CACHE_TTL) {
          processingStatus = cached.status;
          progress = cached.progress || 0;
          batchId = cached.batchId;
        }
        // Note: Removed individual get_file_status API calls to eliminate N+1 pattern
        // Files default to 'ready' status unless cached otherwise
        
        return {
          id: fileId,
          name: file.file_name || file.name,
          size: file.size || 0,
          lastModified: new Date(file.last_modified || Date.now()),
          status: processingStatus,
          progress,
          batchId,
          type: (file.file_name || file.name).endsWith('.xlsx') ?
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' :
            'application/vnd.ms-excel',
          path: file.file_name || file.path,
          sheets: file.sheets || []
        };
      });
      
      console.log(`[${requestId}] ✅ Found ${filesWithStatus.length} files with processing status`);

      // Cache the successful result
      filesStatusCache[cacheKey] = {
        data: filesWithStatus,
        timestamp: Date.now()
      };

      return createSuccessResponse(filesWithStatus);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error(`[${requestId}] ❌ Error getting files with status:`, errorMessage);
      
      // Return mock data as fallback
      console.log(`[${requestId}] ⚠️ Using fallback mock data due to error`);
      return createSuccessResponse(getMockFilesWithStatus());
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error(`[${requestId}] ❌ Error in GET /api/files:`, error);
    
    // Return mock data as fallback
    console.log(`[${requestId}] ⚠️ Using fallback mock data due to error`);
    return createSuccessResponse(getMockFilesWithStatus());
  }
}

// POST endpoint to update file processing status
export async function POST(request: NextRequest) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  console.log(`[${requestId}] 📥 Received POST request to /api/files`);
  
  try {
    const { fileId, status, progress, batchId } = await request.json();
    
    if (!fileId || !status) {
      return createErrorResponse('fileId and status are required', requestId, 400);
    }
    
    // Update cache
    processingStatusCache[fileId] = {
      status,
      lastUpdated: Date.now(),
      progress: progress || 0,
      batchId
    };
    
    console.log(`[${requestId}] ✅ Updated status for file ${fileId}: ${status}`);
    
    // Invalidate files cache to force refresh
    invalidateFilesCache(undefined, requestId);
    
    return createSuccessResponse({ 
      message: 'Status updated successfully',
      fileId,
      status,
      progress,
      batchId
    });
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error(`[${requestId}] ❌ Error updating file status:`, error);
    return createErrorResponse(errorMessage, requestId);
  }
}

// Mock data with various processing statuses
function getMockFilesWithStatus() {
  return [
    {
      id: Buffer.from('/Volumes/test/bronze/raw/Bordereaux_Claims_Q1_2023.xlsx').toString('base64'),
      name: 'Bordereaux_Claims_Q1_2023.xlsx',
      status: 'completed',
      progress: 100,
      size: 1024 * 25,
      lastModified: new Date('2023-04-15'),
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      path: '/Volumes/test/bronze/raw/Bordereaux_Claims_Q1_2023.xlsx',
      sheets: ['Claims Data', 'Claim Details', 'Summary'],
      batchId: 'batch-001'
    },
    {
      id: Buffer.from('/Volumes/test/bronze/raw/Bordereaux_Claims_Q2_2023.xlsx').toString('base64'),
      name: 'Bordereaux_Claims_Q2_2023.xlsx',
      status: 'processing',
      progress: 65,
      size: 1024 * 32,
      lastModified: new Date('2023-07-20'),
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      path: '/Volumes/test/bronze/raw/Bordereaux_Claims_Q2_2023.xlsx',
      sheets: ['Claims Data', 'Claim Details', 'Summary'],
      batchId: 'batch-002'
    },
    {
      id: Buffer.from('/Volumes/test/bronze/raw/Bordereaux_Premium_Q3_2023.xlsx').toString('base64'),
      name: 'Bordereaux_Premium_Q3_2023.xlsx',
      status: 'ready',
      progress: 0,
      size: 1024 * 28,
      lastModified: new Date('2023-10-10'),
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      path: '/Volumes/test/bronze/raw/Bordereaux_Premium_Q3_2023.xlsx',
      sheets: ['Premium Data', 'Premium Details', 'Summary']
    },
    {
      id: Buffer.from('/Volumes/test/bronze/raw/Japanese_CHAR_medium_jan26.xlsx').toString('base64'),
      name: 'Japanese_CHAR_medium_jan26.xlsx',
      status: 'error',
      progress: 0,
      size: 26048,
      lastModified: new Date('2024-04-17'),
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      path: '/Volumes/test/bronze/raw/Japanese_CHAR_medium_jan26.xlsx',
      sheets: ['Sheet1', 'Data', 'Summary'],
      batchId: 'batch-003'
    }
  ];
}

// Handle OPTIONS requests for CORS
export async function OPTIONS(request: NextRequest) {
  return createSuccessResponse({});
}