// src/services/api.ts - Minimal API client supporting only backend operations
import { apiRequest } from '../utils/apiHelpers';
import {
  FileItem,
  JobStatus,
  ProcessRequest
} from '../types/api';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

/**
 * SmartBDX API client - Only backend-supported operations
 * Backend supports exactly 6 operations from SmartBDX_API_Gateway_v3.py
 */
export const apiClient = {
  // === OPERATION 1: DISCOVER FILES WITH SHEETS ===
  
  /**
   * Discover files with sheets metadata
   * Maps to: discover_files_with_sheets backend operation
   */
  async discoverFilesWithSheets(): Promise<FileItem[]> {
    console.log('🔍 API Client: Discovering files with sheets from backend...');
    
    try {
      const response = await apiRequest<any>('/discover_files_with_sheets', {
        method: 'POST',
        body: JSON.stringify({
          parameters: {
            volume_folder: '/Volumes/test/bronze/raw/'
          }
        })
      });
      
      console.log('🔍 API Client: Raw response:', response);
      
      // Handle different response formats more robustly
      let filesData: any[] = [];
      
      // Case 1: Response is directly an array
      if (Array.isArray(response)) {
        console.log('📦 API Client: Response is direct array');
        filesData = response;
      }
      // Case 2: Response has data property with array
      else if (response?.data && Array.isArray(response.data)) {
        console.log('📦 API Client: Response has data array');
        filesData = response.data;
      }
      // Case 3: Response has success flag and data
      else if (response?.success && response?.data) {
        console.log('📦 API Client: Response has success flag');
        filesData = Array.isArray(response.data) ? response.data : [response.data];
      }
      // Case 4: Response looks like a single file object
      else if (response?.file_name || response?.name) {
        console.log('📦 API Client: Response is single file object');
        filesData = [response];
      }
      // Case 5: Warning response with empty data
      else if (response?.warning) {
        console.log('⚠️ API Client: Got warning response:', response.warning);
        filesData = response.data || [];
      }
      // Case 6: Raw response that might be files
      else if (response && typeof response === 'object') {
        console.log('📦 API Client: Attempting to parse object response');
        // Try to extract files from various possible structures
        const possibleFiles = response.files || response.discovered_files || response.results || [];
        filesData = Array.isArray(possibleFiles) ? possibleFiles : [];
      }
      
      console.log(`🔍 API Client: Extracted ${filesData.length} files from response`);
      
      // Transform and validate the files data
      const validFiles = filesData
        .filter(file => file && (file.file_name || file.name))
        .map(file => ({
          id: file.id || file.file_name || file.name,
          name: file.file_name || file.name,
          size: file.size || 0,
          lastModified: file.last_modified || file.lastModified || new Date().toISOString(),
          status: file.status || 'ready',
          sheets: file.sheet_names || file.sheets || [],
          path: file.path || '',
          type: file.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }));
      
      console.log(`✅ API Client: Returning ${validFiles.length} valid files`);
      return validFiles;
      
    } catch (error) {
      console.error('❌ API Client: Error in discoverFilesWithSheets:', error);
      
      // Check if error has response data we can use
      if (error instanceof Error && 'response' in error) {
        console.log('🔍 API Client: Checking error response for data');
      }
      
      // Return empty array instead of throwing to prevent UI crashes
      console.log('🔄 API Client: Returning empty array due to error');
      return [];
    }
  },

  // === OPERATION 2: PROCESS FILES ===
  
  /**
   * Submit processing job with mapping support
   * Maps to: process_files backend operation
   */
  async submitProcessingJob(request: ProcessRequest): Promise<{ jobId: string; status: string }> {
    console.log('🚀 API Client: Submitting processing job with mapping...');
    const response = await apiRequest<{data: {batch_id: string; status: string}}>('/process_files', {
      method: 'POST',
      body: JSON.stringify({
        parameters: {
          files: request.fileIds.map(fileId => ({
            fileId,
            sheets: request.sheetSelections?.[fileId] || []
          })),
          volume_folder: '/Volumes/test/bronze/raw/',
          enable_mapping: request.options?.enable_mapping || false
        }
      })
    });
    
    // Transform response to match expected format
    if (!response) {
      throw new Error('No response from backend');
    }
    
    const data = response?.data || response;
    const jobId = (data as any)?.batch_id || (data as any)?.jobId || `batch-${Date.now()}`;
    const status = (data as any)?.status || 'submitted';
    
    return { jobId, status };
  },

  // === OPERATION 3: GET BATCH STATUS ===
  
  /**
   * Get batch processing status
   * Maps to: get_batch_status backend operation
   */
  async getBatchStatus(batchId: string): Promise<JobStatus> {
    console.log(`📊 API Client: Getting batch status for ${batchId}...`);
    
    try {
      const response = await apiRequest<{data: any}>(`/get_batch_status/${batchId}`);
      const data = response?.data || response;
      
      if (!data) {
        throw new Error('No data in batch status response');
      }
      
      const jobStatus: any = {
        jobId: data.batch_id || data.jobId || batchId,
        status: data.status || 'processing',
        message: data.current_file || data.message || 'Processing...',
        batchId: data.batch_id || batchId,
        timestamp: data.start_time || data.timestamp || new Date().toISOString(),
        endTime: data.end_time
      };

      // Add progress only for statuses that support it
      if (data.status === 'processing' || data.status === 'paused') {
        jobStatus.progress = Math.min(Math.max(data.progress || 0, 0), 100);
      }

      return jobStatus;
    } catch (error) {
      console.warn(`Failed to get batch status for ${batchId}:`, error);
      // Return a minimal valid JobStatus instead of throwing
      return {
        jobId: batchId,
        status: 'error',
        endTime: new Date().toISOString(),
        error: 'Failed to get status from backend',
        message: 'Failed to get status from backend',
        batchId: batchId,
        timestamp: new Date().toISOString()
      };
    }
  },

  // === OPERATION 4: RESUME FAILED BATCH ===
  
  /**
   * Resume failed batch processing
   * Maps to: resume_failed_batch backend operation
   */
  async resumeFailedBatch(batchId: string): Promise<any> {
    console.log(`🔄 API Client: Resuming failed batch ${batchId}...`);
    return apiRequest('/databricks', {
      method: 'POST',
      body: JSON.stringify({
        operation: 'resume_failed_batch',
        parameters: { batch_id: batchId }
      })
    });
  },

  // === OPERATION 5: GET MAPPING RESULTS ===
  
  /**
   * Get mapping results for review
   * Maps to: get_mapping_results backend operation
   */
  async getMappingResults(batchId?: string, status?: string): Promise<any> {
    console.log(`🗂️ API Client: Getting mapping results...`);
    const params = new URLSearchParams();
    if (batchId) params.set('batch_id', batchId);
    if (status) params.set('status', status);
    
    return apiRequest(`/mapping?${params.toString()}`);
  },

  // === OPERATION 6: APPROVE MAPPINGS ===
  
  /**
   * Approve or reject mapping results
   * Maps to: approve_mappings backend operation
   */
  async approveMappings(approvalData: {
    file_name: string;
    sheet_name: string;
    approved_mappings: any[];
    rejected_mappings: any[];
    reviewed_by: string;
  }): Promise<any> {
    console.log(`✅ API Client: Approving mappings for ${approvalData.file_name}...`);
    return apiRequest('/mapping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(approvalData)
    });
  },

  // === LEGACY COMPATIBILITY (MINIMAL) ===
  
  /**
   * @deprecated Use discoverFilesWithSheets instead
   */
  async getFiles(): Promise<FileItem[]> {
    return this.discoverFilesWithSheets();
  }
};

// Export for backward compatibility
export default apiClient;

// Utility functions for common operations
export const apiUtils = {
  /**
   * Format file size for display
   */
  formatFileSize(bytes: number): string {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  },

  /**
   * Format job duration
   */
  formatDuration(startTime: Date, endTime?: Date): string {
    const end = endTime || new Date();
    const duration = end.getTime() - startTime.getTime();
    const minutes = Math.floor(duration / 60000);
    const seconds = Math.floor((duration % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  },

  /**
   * Validate file for processing
   */
  validateFile(file: FileItem): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      errors.push('File must be an Excel file (.xlsx or .xls)');
    }
    
    if (file.size > 100 * 1024 * 1024) { // 100MB limit
      errors.push('File size must be less than 100MB');
    }
    
    if (file.status === 'error') {
      errors.push('File has processing errors');
    }
    
    return {
      valid: errors.length === 0,
      errors,
    };
  },
};