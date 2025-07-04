// src/hooks/useApi.ts
import { useState, useCallback, useEffect } from 'react';

// Import ApiError and apiRequest from utils/apiHelpers.ts
import { ApiError, apiRequest } from '../utils/apiHelpers';
export { ApiError, apiRequest };

// TypeScript interfaces are now imported from types/api.ts

// Import JobStatus from types/api.ts instead of redefining it
import type { JobStatus, FileItem, ProcessRequest } from '../types/api';
export type { JobStatus, FileItem, ProcessRequest };

// ProcessRequest is now imported from types/api.ts

// Hook interfaces
interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

interface UseApiReturn<T> extends UseApiState<T> {
  execute: (endpoint: string, options?: RequestInit) => Promise<T>;
  reset: () => void;
}

// Main useApi hook
export function useApi<T = any>(): UseApiReturn<T> {
  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    loading: false,
    error: null,
  });

  const execute = useCallback(async (endpoint: string, options?: RequestInit): Promise<T> => {
    setState(prev => ({ ...prev, loading: true, error: null }));
    
    try {
      const data = await apiRequest<T>(endpoint, options);
      setState({ data, loading: false, error: null });
      return data;
    } catch (error) {
      const errorMessage = error instanceof ApiError ? error.message : 'Request failed';
      setState(prev => ({ ...prev, loading: false, error: errorMessage }));
      throw error;
    }
  }, []);

  const reset = useCallback(() => {
    setState({ data: null, loading: false, error: null });
  }, []);

  return { ...state, execute, reset };
}

// Specialized hook for files
export function useFiles() {
  const { data, loading, error, execute } = useApi<FileItem[]>();
  
  const fetchFiles = useCallback(() => execute('/api/files'), [execute]);
  
  return { 
    files: data || [], 
    loading, 
    error, 
    fetchFiles 
  };
}

// Specialized hook for processing
export function useProcessing() {
  const { data, loading, error, execute } = useApi<any>();
  
  const submitJob = useCallback((fileData: ProcessRequest) => 
    execute('/api/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fileData)
    }), [execute]);
  
  const getBulkStatus = useCallback((jobIds: string[]) =>
    execute('/api/status/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jobIds })
    }), [execute]);
  
  return {
    jobData: data,
    loading,
    error,
    submitJob,
    getBulkStatus
  };
}

// Polling hook for real-time updates
export function usePolling<T>(
  fetcher: () => Promise<T>, 
  interval: number = 5000, 
  enabled: boolean = true
) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const poll = useCallback(async () => {
    try {
      const result = await fetcher();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Polling failed');
    }
  }, [fetcher]);

  useEffect(() => {
    if (!enabled) return;
    
    poll(); // Initial fetch
    const intervalId = setInterval(poll, interval);
    
    return () => clearInterval(intervalId);
  }, [poll, interval, enabled]);

  return { data, error, refetch: poll };
}