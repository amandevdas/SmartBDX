import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './auth';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

// For demo purposes, we'll use mock data
const USE_MOCK_DATA = true;

/**
 * API client for making requests to the backend
 */
export const apiClient = {
  /**
   * Make a GET request to the API
   * @param endpoint - API endpoint
   * @param options - Request options
   * @returns Promise with response data
   */
  async get<T>(endpoint: string, options = {}): Promise<T> {
    if (USE_MOCK_DATA) {
      return this.getMockResponse(endpoint) as Promise<T>;
    }
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...await this.getAuthHeaders(),
      },
      ...options,
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    return response.json();
  },
  
  /**
   * Make a POST request to the API
   * @param endpoint - API endpoint
   * @param data - Request body data
   * @param options - Request options
   * @returns Promise with response data
   */
  async post<T>(endpoint: string, data: any, options = {}): Promise<T> {
    if (USE_MOCK_DATA) {
      return this.getMockResponse(endpoint, data) as Promise<T>;
    }
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...await this.getAuthHeaders(),
      },
      body: JSON.stringify(data),
      ...options,
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    return response.json();
  },
  
  /**
   * Get authentication headers for API requests
   * @returns Promise with headers object
   */
  async getAuthHeaders(): Promise<Record<string, string>> {
    const { getToken } = useAuth();
    const token = getToken();
    
    return token ? { Authorization: `Bearer ${token}` } : {};
  },
  
  /**
   * Get mock response for API requests
   * @param endpoint - API endpoint
   * @param requestData - Request body data
   * @returns Promise with mock response data
   */
  getMockResponse(endpoint: string, requestData?: any): Promise<any> {
    // This would be replaced with more comprehensive mock data in a real implementation
    const mockData: Record<string, any> = {
      '/api/files': [
        { id: "1", file_name: "Q1_2023_Claims.xlsx", status: "completed", last_modified: "2023-04-15", size: 1024 * 25, sheets: 3 },
        { id: "2", file_name: "Q2_2023_Claims.xlsx", status: "completed", last_modified: "2023-07-20", size: 1024 * 32, sheets: 3 },
        { id: "3", file_name: "Q3_2023_Claims.xlsx", status: "processing", last_modified: "2023-10-10", size: 1024 * 28, sheets: 3 },
        { id: "4", file_name: "Q4_2023_Claims.xlsx", status: "pending", last_modified: "2024-01-05", size: 1024 * 30, sheets: 3 },
        { id: "5", file_name: "Annual_Summary_2023.xlsx", status: "failed", last_modified: "2024-01-15", size: 1024 * 45, sheets: 5 },
        { id: "6", file_name: "Policy_Renewals_2024.xlsx", status: "pending", last_modified: "2024-01-20", size: 1024 * 38, sheets: 4 },
        { id: "7", file_name: "Premium_Calculations_Q1_2024.xlsx", status: "pending", last_modified: "2024-02-01", size: 1024 * 22, sheets: 2 },
      ],
      '/api/status': [
        {
          id: "batch-001",
          status: "processing",
          startTime: new Date(Date.now() - 1000 * 60 * 15).toISOString(), // 15 minutes ago
          completedFiles: 12,
          totalFiles: 20,
          errors: 0,
          parallelism: 4,
          estimatedTimeRemaining: 600, // 10 minutes
        },
        {
          id: "batch-002",
          status: "paused",
          startTime: new Date(Date.now() - 1000 * 60 * 45).toISOString(), // 45 minutes ago
          completedFiles: 5,
          totalFiles: 15,
          errors: 2,
          parallelism: 2,
        },
        {
          id: "batch-003",
          status: "completed",
          startTime: new Date(Date.now() - 1000 * 60 * 120).toISOString(), // 2 hours ago
          completedFiles: 10,
          totalFiles: 10,
          errors: 0,
          parallelism: 4,
        },
      ],
      '/api/mapping': [
        {
          id: "file-001",
          file_name: "Q1_2023_Claims.xlsx",
          status: "pending",
          confidence: 0.85,
          column_count: 12,
          mapped_columns: 10,
          last_modified: "2023-04-15",
        },
        {
          id: "file-002",
          file_name: "Q2_2023_Claims.xlsx",
          status: "pending",
          confidence: 0.92,
          column_count: 12,
          mapped_columns: 12,
          last_modified: "2023-07-20",
        },
        {
          id: "file-003",
          file_name: "Q3_2023_Claims.xlsx",
          status: "approved",
          confidence: 0.78,
          column_count: 12,
          mapped_columns: 11,
          last_modified: "2023-10-10",
        },
      ],
    };
    
    // Handle POST requests to specific endpoints
    if (requestData && endpoint === '/api/process') {
      return Promise.resolve({ success: true, batchId: `batch-${Date.now()}` });
    }
    
    return Promise.resolve(mockData[endpoint] || { message: 'No mock data available for this endpoint' });
  },
};

/**
 * Custom hook for making API requests
 * @param endpoint - API endpoint
 * @returns Object with data, loading state, error, and refetch function
 */
export function useApi<T>(endpoint: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  
  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiClient.get<T>(endpoint);
      setData(response);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to fetch data'));
    } finally {
      setLoading(false);
    }
  }, [endpoint]);
  
  useEffect(() => {
    fetchData();
  }, [fetchData]);
  
  return { data, loading, error, refetch: fetchData };
}