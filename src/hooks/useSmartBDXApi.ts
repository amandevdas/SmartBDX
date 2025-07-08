import { useState, useCallback } from 'react';
import { apiClient } from '@/services/api';
import { apiRequest } from '@/utils/apiHelpers';

interface UseSmartBDXApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  execute: (endpoint: string, data?: any) => Promise<T | null>;
  reset: () => void;
}

/**
 * Enhanced API hook for SmartBDX API - Only backend-supported operations
 * @returns API hook with data, loading, error states and execute/reset functions
 */
export function useSmartBDXApi<T>(): UseSmartBDXApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(async (operation: string, requestData?: any): Promise<T | null> => {
    try {
      setLoading(true);
      setError(null);

      console.log(`🔄 SmartBDX API Hook: Executing ${operation}...`);

      let result: T;
      
      // Route to appropriate apiClient method based on operation - ONLY SUPPORTED OPERATIONS
      switch (operation) {
        case 'discover_files_with_sheets':
          result = await apiClient.discoverFilesWithSheets() as T;
          break;
        case 'process_files':
          result = await apiClient.submitProcessingJob(requestData) as T;
          break;
        case 'get_batch_status':
          result = await apiClient.getBatchStatus(requestData?.batch_id) as T;
          break;
        case 'resume_failed_batch':
          result = await apiClient.resumeFailedBatch(requestData?.batch_id) as T;
          break;
        case 'get_mapping_results':
          result = await apiClient.getMappingResults(requestData?.batch_id, requestData?.status) as T;
          break;
        case 'approve_mappings':
          result = await apiClient.approveMappings(requestData) as T;
          break;
        default:
          // Fallback to direct API request for custom operations
          result = await apiRequest<T>('/databricks', {
            method: 'POST',
            body: JSON.stringify({
              operation,
              parameters: requestData
            })
          });
          break;
      }

      setData(result);
      console.log(`✅ SmartBDX API Hook: ${operation} completed successfully`);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error(`❌ SmartBDX API Hook Error (${operation}):`, err);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setLoading(false);
  }, []);

  return { data, loading, error, execute, reset };
}