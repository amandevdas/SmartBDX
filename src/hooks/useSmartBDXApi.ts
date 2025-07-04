import { useState, useCallback } from 'react';
import { legacyApiClient } from '@/services/api';
import { apiRequest } from '@/utils/apiHelpers';

interface UseSmartBDXApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  execute: (endpoint: string, data?: any) => Promise<T | null>;
  reset: () => void;
}

/**
 * Enhanced API hook for SmartBDX API
 * @returns API hook with data, loading, error states and execute/reset functions
 */
export function useSmartBDXApi<T>(): UseSmartBDXApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(async (endpoint: string, requestData?: any): Promise<T | null> => {
    try {
      setLoading(true);
      setError(null);

      let result: T;
      if (requestData) {
        // Use legacyApiClient for backward compatibility
        result = await legacyApiClient.post<T>(endpoint, requestData);
      } else {
        // Use legacyApiClient for backward compatibility
        result = await legacyApiClient.get<T>(endpoint);
      }

      setData(result);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('SmartBDX API Error:', err);
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