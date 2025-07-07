import { NextRequest, NextResponse } from 'next/server';
import { DatabricksClient, createSuccessResponse, createErrorResponse } from '@/lib/databricks-client';

export async function GET(
  request: NextRequest,
  { params }: { params: { fileId: string } }
) {
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
  const { fileId } = params;
  
  console.log(`[${requestId}] 📥 Received GET request to /api/files/${fileId}/sheets`);

  try {
    // Decode the file ID (it's base64 encoded)
    const fileName = Buffer.from(fileId, 'base64').toString('utf-8');
    console.log(`[${requestId}] 🔍 Getting sheets for file: ${fileName}`);
    
    // Check if we should use mock data
    if (process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true') {
      console.log(`[${requestId}] 🧪 Using mock data for sheets`);
      const mockSheets = getMockSheets(fileName);
      return createSuccessResponse(mockSheets);
    }

    try {
      const client = new DatabricksClient(requestId);
      const result = await client.executeOperation('get_sheet_names', {
        file_path: fileName,
        volume_folder: process.env.NEXT_PUBLIC_VOLUME_PATH || '/Volumes/test/bronze/raw/'
      });

      if (!result || !result.success) {
        console.error(`[${requestId}] ❌ SmartBDX operation unsuccessful:`, result);
        return createSuccessResponse(getMockSheets(fileName));
      }

      const sheets = result.data?.sheet_names || [];
      console.log(`[${requestId}] ✅ Found ${sheets.length} sheets for file: ${fileName}`);
      
      return createSuccessResponse(sheets);
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      console.error(`[${requestId}] ❌ Error getting sheets:`, errorMessage);
      
      // Return mock data as fallback
      console.log(`[${requestId}] ⚠️ Using fallback mock data for sheets`);
      return createSuccessResponse(getMockSheets(fileName));
    }
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error(`[${requestId}] ❌ Error in GET /api/files/${fileId}/sheets:`, error);
    return createErrorResponse(errorMessage, requestId);
  }
}

// Mock data for sheet names
function getMockSheets(fileName: string): string[] {
  // Return different mock sheets based on file name patterns
  if (fileName.toLowerCase().includes('claims')) {
    return ['Claims Data', 'Claim Details', 'Summary'];
  } else if (fileName.toLowerCase().includes('premium')) {
    return ['Premium Data', 'Premium Details', 'Summary'];
  } else if (fileName.toLowerCase().includes('japanese')) {
    return ['Sheet1', 'Data', 'Summary'];
  } else {
    return ['Sheet1', 'Sheet2', 'Summary'];
  }
}

// Handle OPTIONS requests for CORS
export async function OPTIONS(request: NextRequest) {
  return createSuccessResponse({});
}