// src/services/api.ts
import { apiRequest } from '../utils/apiHelpers';
import {
  FileItem,
  JobStatus,
  ProcessRequest,
  BatchAnalytics,
  ColumnMapping,
  SmartFileSelection,
  RateLimitInfo,
  CheckpointInfo,
  CostInfo
} from '../types/api';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

/**
 * SmartBDX API client with full backend integration
 * Replaces mock data with real Databricks backend endpoints
 */
export const apiClient = {
  // === FILE DISCOVERY & METADATA ===
  
  /**
   * Discover files with rich metadata from backend
   * Maps to: smartbdx_selection.discover_files_and_sheets_metadata()
   */
  async discoverFilesWithSheets(): Promise<FileItem[]> {
    console.log('🔍 API Client: Discovering files with AI insights from Databricks...');
    const response = await apiRequest<{data: FileItem[]}>('/discover_files_with_sheets', {
      method: 'POST',
      body: JSON.stringify({
        parameters: {
          volume_folder: '/Volumes/test/bronze/raw/',
          include_metadata: true,
          calculate_priority: true,
          check_cache_status: true
        }
      })
    });
    
    // Handle both direct array and wrapped response formats
    if (Array.isArray(response)) {
      return response;
    } else if (response && response.data && Array.isArray(response.data)) {
      return response.data;
    } else {
      console.warn('Invalid response format from discover_files_with_sheets:', response);
      return [];
    }
  },

  /**
   * Check processing status and get cache recommendations
   * Maps to: smartbdx_infrastructure.BatchCheckpointManager
   */
  async checkProcessingStatus(fileIds: string[]): Promise<any> {
    console.log('📊 API Client: Checking processing status via Databricks...');
    return apiRequest(`/check_processing_status?fileIds=${fileIds.join(',')}`);
  },

  // === LEGACY FILE OPERATIONS (Updated) ===
  
  async getFiles(): Promise<FileItem[]> {
    // Use the new discovery endpoint but maintain backward compatibility
    return this.discoverFilesWithSheets();
  },

  async getFilePreview(fileId: string): Promise<any> {
    return apiRequest(`/files/${fileId}/preview`);
  },

  async getFileSheets(fileId: string): Promise<string[]> {
    return apiRequest<string[]>(`/files/${fileId}/sheets`);
  },

  // === SMART SELECTION & AI RECOMMENDATIONS ===
  
  /**
   * Get AI-powered file selection recommendations
   * Maps to: smartbdx_selective_processing()
   */
  async getSmartFileSelection(options: {
    file_patterns?: string[];
    sheet_patterns?: string[];
    max_items?: number;
    priority_mode?: 'failed_first' | 'newest_first' | 'largest_first';
  }): Promise<SmartFileSelection> {
    console.log('🧠 API Client: Getting smart file selection via Databricks...');
    const response = await apiRequest<{data: SmartFileSelection}>('/smart_file_selection', {
      method: 'POST',
      body: JSON.stringify({
        parameters: {
          ...options,
          volume_folder: '/Volumes/test/bronze/raw/',
          criteria: options.priority_mode || 'failed_first'
        }
      })
    });
    
    // Handle wrapped response format
    if (response && typeof response === 'object' && 'data' in response) {
      return (response as {data: SmartFileSelection}).data;
    }
    return response as SmartFileSelection;
  },

  /**
   * Get batch processing strategy recommendations
   * Maps to: smartbdx_processing.azure_optimized_batch_orchestration()
   */
  async suggestBatchStrategy(fileIds: string[]): Promise<any> {
    return apiRequest('/databricks', {
      method: 'POST',
      body: JSON.stringify({
        operation: 'suggest_batch_strategy',
        parameters: { file_ids: fileIds }
      })
    });
  },

  // === PROCESSING OPERATIONS ===
  
  /**
   * Submit processing job with SmartBDX backend
   * Maps to: smartbdx_processing.quick_start_production_batch()
   */
  async submitProcessingJob(request: ProcessRequest): Promise<{ jobId: string; status: string }> {
    console.log('🚀 API Client: Submitting processing job via Databricks...');
    const response = await apiRequest<{data: {batch_id: string; status: string}}>('/process_files', {
      method: 'POST',
      body: JSON.stringify({
        parameters: {
          files: request.fileIds.map(fileId => ({
            fileId,
            sheets: request.sheetSelections?.[fileId] || []
          })),
          volume_folder: '/Volumes/test/bronze/raw/',
          enable_mapping: true,
          enable_cache: true,
          batch_options: request.options
        }
      })
    });
    
    // Transform response to match expected format with better error handling
    if (!response) {
      throw new Error('No response from backend');
    }
    
    const data = response?.data || response;
    
    // Ensure we always have a jobId - handle both batch_id and jobId formats
    const jobId = (data as any)?.batch_id || (data as any)?.jobId || `batch-${Date.now()}`;
    const status = (data as any)?.status || 'submitted';
    
    return {
      jobId,
      status
    };
  },

  /**
   * Get real-time batch status with checkpoint information
   * Maps to: smartbdx_monitoring.show_batch_progress()
   */
  async getBatchStatus(batchId: string): Promise<JobStatus> {
    console.log(`📊 API Client: Getting batch status for ${batchId} via Databricks...`);
    
    try {
      const response = await apiRequest<{data: any}>(`/get_batch_status/${batchId}`);
      
      // Transform backend response to JobStatus format with better error handling
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
        endTime: data.end_time,
        // Enhanced backend data (optional)
        rate_limit_status: data.rate_limit_status,
        checkpoint_data: data.checkpoint_data,
        cost_estimate: data.cost_estimate,
        cache_utilization: data.cache_utilization
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

  async getJobStatus(jobId: string): Promise<JobStatus> {
    return apiRequest<JobStatus>(`/status/${jobId}`);
  },

  async getAllJobs(): Promise<JobStatus[]> {
    return apiRequest<JobStatus[]>('/jobs');
  },

  /**
   * Resume failed batch processing
   * Maps to: smartbdx_processing.resume_failed_batch()
   */
  async resumeBatch(batchId: string): Promise<any> {
    return apiRequest('/databricks', {
      method: 'POST',
      body: JSON.stringify({
        operation: 'resume_batch',
        parameters: { batch_id: batchId }
      })
    });
  },

  // === MAPPING OPERATIONS ===
  
  /**
   * Get enhanced mapping suggestions with vector similarity
   * Maps to: smartbdx_mapping_core.process_table_mapping()
   */
  async getMappingSuggestions(fileId: string): Promise<ColumnMapping[]> {
    console.log(`🗺️ API Client: Getting mapping suggestions for ${fileId} via Databricks...`);
    const response = await apiRequest<{data: ColumnMapping[]}>('/databricks', {
      method: 'POST',
      body: JSON.stringify({
        operation: 'get_mapping_suggestions',
        parameters: {
          file_id: fileId,
          volume_folder: '/Volumes/test/bronze/raw/',
          include_vector_scores: true,
          include_llm_reasoning: true,
          include_examples: true
        }
      })
    });
    
    // Handle wrapped response format
    if (response && typeof response === 'object' && 'data' in response) {
      return (response as {data: ColumnMapping[]}).data;
    }
    return response as ColumnMapping[];
  },

  async approveMappings(fileId: string, mappings: ColumnMapping[]): Promise<void> {
    return apiRequest(`/mapping/${fileId}/approve`, {
      method: 'POST',
      body: JSON.stringify({
        operation: 'approve_mappings',
        parameters: {
          file_id: fileId,
          mappings: mappings
        }
      })
    });
  },

  // === ANALYTICS & MONITORING ===
  
  /**
   * Get cache analytics for cost optimization
   * Maps to: smartbdx_infrastructure cache utilization tracking
   */
  async getCacheAnalytics(): Promise<any> {
    console.log('📊 API Client: Getting cache analytics via Databricks...');
    const response = await apiRequest<{data: any}>('/databricks', {
      method: 'POST',
      body: JSON.stringify({
        operation: 'get_cache_analytics',
        parameters: {
          include_trends: true,
          include_savings: true,
          include_recommendations: true
        }
      })
    });
    
    // Handle wrapped response format
    return response?.data || response;
  },

  /**
   * Get usage analytics and performance metrics
   * Maps to: smartbdx_monitoring system metrics
   */
  async getUsageAnalytics(): Promise<any> {
    return apiRequest('/databricks', {
      method: 'POST',
      body: JSON.stringify({
        operation: 'get_usage_analytics',
        parameters: {
          include_performance: true,
          include_costs: true,
          include_trends: true
        }
      })
    });
  },

  /**
   * Analyze batch errors with AI insights
   * Maps to: smartbdx_monitoring.get_failed_items()
   */
  async analyzeBatchErrors(batchId: string): Promise<any> {
    return apiRequest('/databricks', {
      method: 'POST',
      body: JSON.stringify({
        operation: 'analyze_batch_errors',
        parameters: {
          batch_id: batchId,
          include_patterns: true,
          include_suggestions: true
        }
      })
    });
  },

  // === BATCH HISTORY & MANAGEMENT ===
  
  async getBatchHistory(): Promise<any[]> {
    return apiRequest('/batches');
  },

  async downloadResults(jobId: string): Promise<Blob> {
    const response = await fetch(`${API_BASE_URL}/results/${jobId}/download`);
    if (!response.ok) {
      throw new Error(`Download failed: ${response.statusText}`);
    }
    return response.blob();
  },

  // === SYSTEM STATUS ===
  
  /**
   * Get system health and capabilities
   * Maps to: smartbdx_main.validate_system_health()
   */
  async getSystemStatus(): Promise<any> {
    return apiRequest('/databricks', {
      method: 'POST',
      body: JSON.stringify({
        operation: 'get_system_status',
        parameters: {}
      })
    });
  },

  /**
   * Get current rate limiting status
   * Maps to: smartbdx_infrastructure.AzureOpenAIRateLimiter
   */
  async getRateLimitStatus(): Promise<RateLimitInfo> {
    return apiRequest<RateLimitInfo>('/rate_limit_status');
  }
};

/**
 * Legacy compatibility wrapper - can be removed after migration
 * @deprecated Use apiClient instead
 */
export const legacyApiClient = {
  async get<T>(endpoint: string, options = {}): Promise<T> {
    console.warn('Using legacy API client. Migrate to new apiClient.');
    return apiRequest<T>(endpoint, { ...options, method: 'GET' });
  },

  async post<T>(endpoint: string, data: any, options = {}): Promise<T> {
    console.warn('Using legacy API client. Migrate to new apiClient.');
    return apiRequest<T>(endpoint, {
      ...options,
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Mock response helper for backward compatibility
  getMockResponse(endpoint: string, requestData?: any): any {
    // File listing mock
    if (endpoint === '/api/files') {
      return [
        {
          id: 'file1',
          name: 'bordereaux_sample_1.xlsx',
          status: 'ready',
          size: 1024000,
          lastModified: new Date('2024-01-15'),
        },
        {
          id: 'file2', 
          name: 'reinsurance_data_q4.xlsx',
          status: 'processing',
          size: 2048000,
          lastModified: new Date('2024-01-16'),
        },
        {
          id: 'file3',
          name: 'claims_report_2024.xlsx', 
          status: 'completed',
          size: 3072000,
          lastModified: new Date('2024-01-17'),
        },
        {
          id: 'file4',
          name: 'premium_calculations.xlsx',
          status: 'error',
          size: 1536000,
          lastModified: new Date('2024-01-18'),
        },
      ];
    }

    // Job status mock
    if (endpoint.includes('/api/status/')) {
      const jobId = endpoint.split('/').pop();
      return {
        jobId,
        status: Math.random() > 0.3 ? 'processing' : 'completed',
        progress: Math.floor(Math.random() * 100),
        message: 'Processing headers and mapping columns...',
      };
    }

    // Process submission mock
    if (endpoint === '/api/process') {
      return {
        jobId: `job-${Date.now()}`,
        status: 'submitted',
        message: 'Job submitted successfully',
      };
    }

    // Mapping suggestions mock
    if (endpoint.includes('/api/mapping/')) {
      return {
        suggestions: [
          { source: 'Policy Number', target: 'policy_id', confidence: 0.95 },
          { source: 'Premium Amount', target: 'premium_value', confidence: 0.87 },
          { source: 'Effective Date', target: 'effective_date', confidence: 0.92 },
        ],
      };
    }

    // Default empty response
    return {};
  },

  // Auth headers helper (placeholder)
  async getAuthHeaders(): Promise<Record<string, string>> {
    // TODO: Implement actual auth token retrieval
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
    return token ? { Authorization: `Bearer ${token}` } : {};
  },
};

// Export both for compatibility during migration
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