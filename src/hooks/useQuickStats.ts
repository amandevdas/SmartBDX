"use client";

import { useState, useEffect } from 'react';
import { usePolling } from './useApi';

interface QuickStatsData {
  totalFiles: number;
  activeBatches: number;
  monthlyProcessed: number;
  monthlyErrors: number;
  monthlySavings: number;
  successRate: number;
  averageProcessingTime: number;
  cacheHitRate: number;
  // Trend data
  trends?: {
    filesProcessed: number; // percentage change
    activeBatches: number;
    savings: number;
    successRate: number;
  };
}

const fetchQuickStats = async (): Promise<QuickStatsData> => {
  try {
    // Fetch from multiple endpoints and combine the data
    const [usageResponse, cacheResponse, jobsResponse] = await Promise.all([
      fetch('/api/get_usage_analytics').catch(() => null),
      fetch('/api/get_cache_analytics').catch(() => null),
      fetch('/api/jobs/status').catch(() => null)
    ]);

    let usageData = null;
    let cacheData = null;
    let jobsData = null;

    if (usageResponse?.ok) {
      usageData = await usageResponse.json();
    }
    if (cacheResponse?.ok) {
      cacheData = await cacheResponse.json();
    }
    if (jobsResponse?.ok) {
      jobsData = await jobsResponse.json();
    }

    // Combine and transform the data
    const stats: QuickStatsData = {
      totalFiles: usageData?.systemUtilization?.totalOperations || 1247,
      activeBatches: jobsData?.activeBatches?.length || 3,
      monthlyProcessed: usageData?.systemUtilization?.totalBatches || 156,
      monthlyErrors: usageData?.performanceMetrics?.failureRate * 100 || 12,
      monthlySavings: cacheData?.costOptimization?.estimatedCostSavingsUsd || 1240,
      successRate: usageData?.performanceMetrics?.completionRate || 94.2,
      averageProcessingTime: usageData?.performanceMetrics?.averageProcessingTime || 126, // seconds
      cacheHitRate: cacheData?.cacheEfficiency?.estimatedCacheHitRate || 73.5,
      trends: {
        filesProcessed: 12.5, // Mock trend data
        activeBatches: -2.1,
        savings: 18.3,
        successRate: 2.1
      }
    };

    return stats;
  } catch (error) {
    console.error('Error fetching quick stats:', error);
    
    // Return mock data for development
    return {
      totalFiles: 1247,
      activeBatches: 3,
      monthlyProcessed: 156,
      monthlyErrors: 12,
      monthlySavings: 1240,
      successRate: 94.2,
      averageProcessingTime: 126,
      cacheHitRate: 73.5,
      trends: {
        filesProcessed: 12.5,
        activeBatches: -2.1,
        savings: 18.3,
        successRate: 2.1
      }
    };
  }
};

export const useQuickStats = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Poll quick stats every 60 seconds
  const { data: quickStats, error: pollError, refetch } = usePolling(
    fetchQuickStats,
    60000, // 60 seconds
    true
  );

  useEffect(() => {
    if (quickStats) {
      setLoading(false);
      setError(null);
    }
    if (pollError) {
      setLoading(false);
      setError(pollError);
    }
  }, [quickStats, pollError]);

  return {
    quickStats,
    loading,
    error,
    refetch
  };
};

export default useQuickStats;