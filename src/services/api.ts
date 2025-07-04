// src/services/api.ts
import { apiRequest } from '../utils/apiHelpers';
import { FileItem, JobStatus, ProcessRequest } from '../types/api';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

/**
 * Enhanced API client with better error handling and type safety
 */
export const apiClient = {
  // File operations
  async getFiles(): Promise<FileItem[]> {
    return apiRequest<FileItem[]>('/files');
  },

  async getFilePreview(fileId: string): Promise<any> {
    return apiRequest(`/files/${fileId}/preview`);
  },

  async getFileSheets(fileId: string): Promise<string[]> {
    return apiRequest<string[]>(`/files/${fileId}/sheets`);
  },

  // Processing operations
  async submitProcessingJob(request: ProcessRequest): Promise<{ jobId: string; status: string }> {
    return apiRequest('/process', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  },

  async getJobStatus(jobId: string): Promise<JobStatus> {
    return apiRequest<JobStatus>(`/status/${jobId}`);
  },

  async getAllJobs(): Promise<JobStatus[]> {
    return apiRequest<JobStatus[]>('/jobs');
  },

  // Mapping operations
  async getMappingSuggestions(fileId: string): Promise<any> {
    return apiRequest(`/mapping/${fileId}`);
  },

  async approveMappings(fileId: string, mappings: any): Promise<void> {
    return apiRequest(`/mapping/${fileId}/approve`, {
      method: 'POST',
      body: JSON.stringify(mappings),
    });
  },

  // Batch operations
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