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
/**
 * Enhanced API client with proper error handling and response format handling
 */
export const apiClient = {
  /**
   * Internal method to handle API calls with proper error handling
   */
  async call<T>(operation: string, parameters: any = {}): Promise<T> {
    try {
      console.log(`🔍 API Client: Calling ${operation} with parameters:`, parameters);
      
      const response = await apiRequest<any>(`/${operation}`, {
        method: 'POST',
        body: JSON.stringify({ parameters })
      });
      
      console.log(`📊 API Client: Raw response from ${operation}:`, response);
      
      // Handle backend wrapper structure
      if (response?.success === false) {
        throw new Error(response.error || `${operation} failed`);
      }
      
      // Extract data from wrapper structure
      if (response?.success && response?.data) {
        console.log(`✅ API Client: Successfully extracted data from ${operation}`);
        return response.data;
      }
      
      // Handle direct response (fallback)
      if (response && typeof response === 'object' && !response.success) {
        console.log(`📦 API Client: Using direct response from ${operation}`);
        return response;
      }
      
      throw new Error(`Invalid response format from ${operation}`);
      
    } catch (error) {
      console.error(`❌ API Client: Error in ${operation}:`, error);
      throw error;
    }
  },

  // === OPERATION 1: DISCOVER FILES WITH SHEETS ===
  async discoverFilesWithSheets(): Promise<FileItem[]> {
    try {
      const data = await this.call<any[]>('discover_files_with_sheets', {
        volume_folder: '/Volumes/test/bronze/raw/'
      });
      
      if (!Array.isArray(data)) {
        console.warn('📦 API Client: Expected array, got:', typeof data);
        return [];
      }
      
      // Transform and validate the files data
      const validFiles = data
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
      return [];
    }
  },

  // === OPERATION 2: PROCESS FILES ===
  async submitProcessingJob(request: ProcessRequest): Promise<{ jobId: string; status: string }> {
    try {
      const data = await this.call<any>('process_files', {
        files: request.fileIds.map(fileId => ({
          fileId,
          sheets: request.sheetSelections?.[fileId] || []
        })),
        volume_folder: '/Volumes/test/bronze/raw/',
        enable_mapping: request.options?.enable_mapping || false
      });
      
      const jobId = data?.batch_id || data?.jobId || `batch-${Date.now()}`;
      const status = data?.status || 'submitted';
      
      console.log(`✅ API Client: Job submitted successfully - ${jobId}`);
      return { jobId, status };
      
    } catch (error) {
      console.error('❌ API Client: Error in submitProcessingJob:', error);
      throw error;
    }
  },

  // === OPERATION 3: GET BATCH STATUS ===
  async getBatchStatus(batchId: string): Promise<JobStatus> {
    try {
      const data = await this.call<any>('get_batch_status', { batch_id: batchId });
      
      // Check if batch is completed
      const isCompleted = data.status === 'completed' || data.status === 'finished';
      
      const jobStatus: JobStatus = {
        jobId: data.batch_id || data.jobId || batchId,
        status: this.mapBackendStatus(data.status || 'processing'),
        message: data.current_file || data.message || 'Processing...',
        batchId: data.batch_id || batchId,
        timestamp: data.start_time || data.timestamp || new Date().toISOString(),
        ...(data.end_time && { endTime: data.end_time }),
        ...(data.progress !== undefined && { progress: Math.min(Math.max(data.progress, 0), 100) })
      } as JobStatus;

      return jobStatus;
      
    } catch (error) {
      console.warn(`Failed to get batch status for ${batchId}:`, error);
      // Return error status instead of throwing
      return {
        jobId: batchId,
        status: 'error',
        endTime: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Failed to get status from backend',
        message: 'Failed to get status from backend',
        batchId: batchId,
        timestamp: new Date().toISOString()
      };
    }
  },

  /**
   * Map backend status values to frontend status values
   */
  mapBackendStatus(backendStatus: string): 'submitted' | 'processing' | 'completed' | 'error' | 'paused' | 'cancelled' {
    switch (backendStatus?.toLowerCase()) {
      case 'completed':
      case 'finished':
      case 'success':
        return 'completed';
      case 'processing':
      case 'running':
      case 'in_progress':
        return 'processing';
      case 'submitted':
      case 'queued':
        return 'submitted';
      case 'paused':
      case 'suspended':
        return 'paused';
      case 'cancelled':
      case 'canceled':
      case 'stopped':
        return 'cancelled';
      case 'error':
      case 'failed':
      case 'failure':
      default:
        return 'error';
    }
  },

  // === OPERATION 4: RESUME FAILED BATCH ===
  async resumeFailedBatch(batchId: string): Promise<any> {
    try {
      return await this.call<any>('resume_failed_batch', { batch_id: batchId });
    } catch (error) {
      console.error(`❌ API Client: Error resuming batch ${batchId}:`, error);
      throw error;
    }
  },

  // === OPERATION 5: GET MAPPING RESULTS ===
  async getMappingResults(batchId?: string, status?: string): Promise<any> {
    try {
      const params: any = {};
      if (batchId) params.batch_id = batchId;
      if (status) params.status = status;
      
      return await this.call<any>('get_mapping_results', params);
    } catch (error) {
      console.error('❌ API Client: Error getting mapping results:', error);
      throw error;
    }
  },

  // === OPERATION 6: APPROVE MAPPINGS ===
  async approveMappings(approvalData: {
    file_name: string;
    sheet_name: string;
    approved_mappings: any[];
    rejected_mappings: any[];
    reviewed_by: string;
  }): Promise<any> {
    try {
      return await this.call<any>('approve_mappings', approvalData);
    } catch (error) {
      console.error(`❌ API Client: Error approving mappings for ${approvalData.file_name}:`, error);
      throw error;
    }
  },

  // === LEGACY COMPATIBILITY ===
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