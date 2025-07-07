'use client';

import { useState, useEffect } from 'react';
import { useSmartBDXApi } from '@/hooks/useSmartBDXApi';
import CostOptimization from '@/components/analytics/CostOptimization';
import PerformanceMetrics from '@/components/analytics/PerformanceMetrics';
import PredictiveInsights from '@/components/analytics/PredictiveInsights';

export default function AnalyticsPage() {
  const [selectedTab, setSelectedTab] = useState('cost-optimization');
  const [refreshInterval, setRefreshInterval] = useState<NodeJS.Timeout | null>(null);

  const cacheAnalytics = useSmartBDXApi();
  const usageAnalytics = useSmartBDXApi();
  const processingInsights = useSmartBDXApi();

  // Load analytics data
  useEffect(() => {
    const loadAnalytics = async () => {
      try {
        await Promise.all([
          cacheAnalytics.execute('get_cache_analytics'),
          usageAnalytics.execute('get_usage_analytics'),
          processingInsights.execute('get_processing_insights')
        ]);
      } catch (error) {
        console.error('Error loading analytics:', error);
      }
    };

    loadAnalytics();

    // Set up auto-refresh every 5 minutes
    const interval = setInterval(loadAnalytics, 5 * 60 * 1000);
    setRefreshInterval(interval);

    return () => {
      if (interval) clearInterval(interval);
    };
  }, []);

  const handleRefresh = async () => {
    try {
      await Promise.all([
        cacheAnalytics.execute('get_cache_analytics'),
        usageAnalytics.execute('get_usage_analytics'),
        processingInsights.execute('get_processing_insights')
      ]);
    } catch (error) {
      console.error('Error refreshing analytics:', error);
    }
  };

  const isLoading = cacheAnalytics.loading || usageAnalytics.loading || processingInsights.loading;
  const hasError = cacheAnalytics.error || usageAnalytics.error || processingInsights.error;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Analytics Dashboard</h1>
              <p className="text-gray-600 mt-2">
                Comprehensive insights into system performance, cost optimization, and predictive analytics
              </p>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={handleRefresh}
                disabled={isLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                <svg className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>{isLoading ? 'Refreshing...' : 'Refresh'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Error State */}
        {hasError && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center">
              <svg className="w-5 h-5 text-red-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <h3 className="text-red-800 font-medium">Error Loading Analytics</h3>
                <p className="text-red-600 text-sm mt-1">
                  {cacheAnalytics.error || usageAnalytics.error || processingInsights.error}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="mb-8">
          <div className="border-b border-gray-200">
            <nav className="flex space-x-8">
              <button
                onClick={() => setSelectedTab('cost-optimization')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  selectedTab === 'cost-optimization'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Cost Optimization
              </button>
              <button
                onClick={() => setSelectedTab('performance-metrics')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  selectedTab === 'performance-metrics'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Performance Metrics
              </button>
              <button
                onClick={() => setSelectedTab('predictive-insights')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  selectedTab === 'predictive-insights'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Predictive Insights
              </button>
            </nav>
          </div>
        </div>

        {/* Content Area */}
        <div className="space-y-6">
          {selectedTab === 'cost-optimization' && (
            <CostOptimization 
              data={cacheAnalytics.data} 
              loading={cacheAnalytics.loading} 
              error={cacheAnalytics.error}
            />
          )}
          
          {selectedTab === 'performance-metrics' && (
            <PerformanceMetrics 
              data={usageAnalytics.data} 
              loading={usageAnalytics.loading} 
              error={usageAnalytics.error}
            />
          )}
          
          {selectedTab === 'predictive-insights' && (
            <PredictiveInsights 
              data={processingInsights.data} 
              loading={processingInsights.loading} 
              error={processingInsights.error}
            />
          )}
        </div>

        {/* Auto-refresh Status */}
        <div className="mt-8 text-center text-sm text-gray-500">
          Auto-refresh every 5 minutes • Last updated: {new Date().toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}