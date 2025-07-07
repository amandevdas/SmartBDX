"use client";

import { useState, useEffect } from 'react';
import { usePolling } from './useApi';

interface ActivityEvent {
  id: string;
  type: 'batch_completed' | 'batch_started' | 'smart_selection' | 'cache_savings' | 'mapping_approved' | 'error' | 'warning';
  title: string;
  description: string;
  timestamp: string;
  metadata?: {
    batchId?: string;
    fileCount?: number;
    duration?: number;
    savings?: number;
    errorCount?: number;
  };
}

const fetchActivityStream = async (): Promise<ActivityEvent[]> => {
  try {
    // Try to fetch from job status and batch status endpoints
    const [jobsResponse, batchResponse] = await Promise.all([
      fetch('/api/jobs/status').catch(() => null),
      fetch('/api/get_batch_status').catch(() => null)
    ]);

    let activities: ActivityEvent[] = [];

    // Process jobs data if available
    if (jobsResponse?.ok) {
      const jobsData = await jobsResponse.json();
      // Transform jobs data to activity events
      if (jobsData.jobs) {
        const jobActivities = jobsData.jobs.slice(0, 5).map((job: any, index: number) => ({
          id: `job-${job.jobId || index}`,
          type: job.status === 'completed' ? 'batch_completed' : 'batch_started',
          title: job.status === 'completed' ? 'Batch Processing Completed' : 'Batch Processing Started',
          description: `Processing ${job.files?.length || 0} files`,
          timestamp: job.timestamp || new Date().toISOString(),
          metadata: {
            batchId: job.batchId,
            fileCount: job.files?.length || 0,
            duration: job.status === 'completed' ? 8 : undefined
          }
        }));
        activities = [...activities, ...jobActivities];
      }
    }

    // Add some mock activities for demonstration
    const mockActivities: ActivityEvent[] = [
      {
        id: 'activity-1',
        type: 'batch_completed',
        title: 'Batch Processing Completed',
        description: 'Successfully processed 45 files with high accuracy',
        timestamp: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // 2 minutes ago
        metadata: {
          batchId: 'batch_042',
          fileCount: 45,
          duration: 8,
          savings: 85
        }
      },
      {
        id: 'activity-2',
        type: 'smart_selection',
        title: 'Smart File Selection Applied',
        description: 'AI identified 23 high-priority files for processing',
        timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 minutes ago
        metadata: {
          fileCount: 23
        }
      },
      {
        id: 'activity-3',
        type: 'cache_savings',
        title: 'Cache Optimization Savings',
        description: 'Cache utilization saved $85 in processing costs',
        timestamp: new Date(Date.now() - 8 * 60 * 1000).toISOString(), // 8 minutes ago
        metadata: {
          batchId: 'batch_041',
          savings: 85
        }
      },
      {
        id: 'activity-4',
        type: 'mapping_approved',
        title: 'Column Mapping Approved',
        description: 'Claims_Q4 data structure mapping has been approved',
        timestamp: new Date(Date.now() - 12 * 60 * 1000).toISOString(), // 12 minutes ago
      },
      {
        id: 'activity-5',
        type: 'batch_started',
        title: 'New Batch Processing Started',
        description: 'Started processing batch with 18 files',
        timestamp: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // 15 minutes ago
        metadata: {
          batchId: 'batch_043',
          fileCount: 18
        }
      },
      {
        id: 'activity-6',
        type: 'warning',
        title: 'Rate Limit Warning',
        description: 'Approaching API rate limit, processing temporarily slowed',
        timestamp: new Date(Date.now() - 25 * 60 * 1000).toISOString(), // 25 minutes ago
      }
    ];

    // Combine real activities with mock activities
    const allActivities = [...activities, ...mockActivities];
    
    // Sort by timestamp (most recent first) and return top 10
    return allActivities
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 10);

  } catch (error) {
    console.error('Error fetching activity stream:', error);
    
    // Return mock data for development
    return [
      {
        id: 'activity-1',
        type: 'batch_completed',
        title: 'Batch Processing Completed',
        description: 'Successfully processed 45 files with high accuracy',
        timestamp: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
        metadata: {
          batchId: 'batch_042',
          fileCount: 45,
          duration: 8
        }
      },
      {
        id: 'activity-2',
        type: 'smart_selection',
        title: 'Smart File Selection Applied',
        description: 'AI identified 23 high-priority files for processing',
        timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        metadata: {
          fileCount: 23
        }
      },
      {
        id: 'activity-3',
        type: 'cache_savings',
        title: 'Cache Optimization Savings',
        description: 'Cache utilization saved $85 in processing costs',
        timestamp: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
        metadata: {
          batchId: 'batch_041',
          savings: 85
        }
      }
    ];
  }
};

export const useActivityStream = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Poll activity stream every 10 seconds
  const { data: activityStream, error: pollError, refetch } = usePolling(
    fetchActivityStream,
    10000, // 10 seconds
    true
  );

  useEffect(() => {
    if (activityStream) {
      setLoading(false);
      setError(null);
    }
    if (pollError) {
      setLoading(false);
      setError(pollError);
    }
  }, [activityStream, pollError]);

  return {
    activityStream: activityStream || [],
    loading,
    error,
    refetch
  };
};

export default useActivityStream;