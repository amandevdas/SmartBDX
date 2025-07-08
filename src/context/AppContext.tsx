'use client';

import React, { createContext, useState, useContext, ReactNode, useCallback, useEffect } from 'react';
import { apiRequest } from '@/utils/apiHelpers';
import { apiClient } from '@/services/api';
import type { FileItem, JobStatus } from '@/types/api';
import { message } from 'antd';

interface AppContextType {
  isInitialFilesLoaded: boolean;
  setInitialFilesLoaded: (loaded: boolean) => void;
  files: FileItem[];
  fetchFiles: (forceRefresh?: boolean) => Promise<void>;
  filesLoading: boolean;
  filesError: string | null;
  fileSheets: { [fileId: string]: string[] };
  jobs: JobStatus[];
  addJob: (job: JobStatus) => void;
  updateJob: (updatedJob: Partial<JobStatus> & { jobId: string }) => void;
  loadJobs: () => Promise<void>;
  jobsLoading: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider = ({ children }: { children: ReactNode }) => {
  const [isInitialFilesLoaded, setInitialFilesLoaded] = useState(false);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [fileSheets, setFileSheets] = useState<{ [fileId: string]: string[] }>({});
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [jobs, setJobs] = useState<JobStatus[]>([]);
  const [jobsLoading, setJobsLoading] = useState(false);

  const fetchFiles = useCallback(async (forceRefresh = false) => {
    if (filesLoading) {
      console.log('📋 [DEDUP] Skipping fetch - already loading');
      return;
    }

    try {
      setFilesLoading(true);
      setFilesError(null);
      
      console.log(`🚀 [SINGLE] Fetching files with AI insights (forceRefresh: ${forceRefresh})`);
      
      // Use the enhanced API client for AI-powered file discovery
      const response = await apiClient.discoverFilesWithSheets() as unknown as { success: boolean, data: FileItem[] } | FileItem[];
      
      let filesList: FileItem[];
      if (Array.isArray(response)) {
        filesList = response;
      } else if (response && response.data && Array.isArray(response.data)) {
        filesList = response.data;
      } else {
        throw new Error('Invalid response format from enhanced file discovery');
      }
      
      const newFileSheets: { [fileId: string]: string[] } = {};
      const transformedFiles: FileItem[] = filesList.map((file: any) => {
        if (!file.id || !file.name) {
          console.warn('Skipping invalid file from API:', file);
          return null;
        }

        const fileId = file.id;
        if (file.sheets && Array.isArray(file.sheets)) {
            const validSheets = file.sheets
                .filter((sheet: any) => typeof sheet === 'string' && sheet.trim().length > 0)
                .map((sheet: string) => sheet.trim());
            if (validSheets.length > 0) {
                newFileSheets[fileId] = validSheets;
            }
        }

        return {
          ...file,
          id: file.id,
          name: file.name,
          status: ['ready', 'processing', 'completed', 'error'].includes(file.status) ? file.status : 'ready',
          size: typeof file.size === 'number' ? file.size : 0,
          lastModified: file.lastModified ? new Date(file.lastModified) : new Date(),
          progress: file.progress || 0,
          // Phase 1 AI enhancements - preserve from backend
          priority_score: file.priority_score || 50, // Default priority if not provided
          processing_status: file.processing_status || 'ready_for_processing',
          structure_signature: file.structure_signature,
          cache_available: file.cache_available || false,
          estimated_processing_time: file.estimated_processing_time || 120,
          ai_recommendation: file.ai_recommendation || 'medium',
          base_file_name: file.base_file_name || file.name.toLowerCase().replace(/\.[^/.]+$/, ''),
          file_size_mb: file.file_size_mb || (file.size / 1024 / 1024),
        };
      }).filter((file): file is FileItem => file !== null);

      if (Object.keys(newFileSheets).length > 0) {
        setFileSheets(prev => ({ ...prev, ...newFileSheets }));
      }

      setFiles(transformedFiles);
      
      console.log(`✅ Loaded ${transformedFiles.length} files with AI insights`);
      
      // Log AI insights for debugging
      const aiFiles = transformedFiles.filter(f => f.priority_score && f.priority_score > 0);
      console.log(`🤖 AI insights available for ${aiFiles.length} files`);
      
      if (transformedFiles.length !== filesList.length) {
        message.warning(`${filesList.length - transformedFiles.length} invalid files were filtered out`);
      }
      
    } catch (error: any) {
      console.error('Failed to fetch files with AI insights:', error);
      const errorMessage = error?.message || 'Failed to load files with AI insights. Please try again.';
      setFilesError(errorMessage);
      setFiles([]);
      message.error(errorMessage);
    } finally {
      setFilesLoading(false);
    }
  }, [filesLoading]);

  const loadJobs = useCallback(async () => {
    // STABILIZED: Use runtime state checking instead of dependency-based checking
    // Check loading state at runtime to prevent recreation loop
    if (jobsLoading) {
      console.log('📋 [DEDUP] Jobs already loading, skipping...');
      return;
    }
    
    try {
      setJobsLoading(true);
      const jobsData = await apiRequest<JobStatus[]>('/jobs');
      
      setJobs(jobsData || []);
      console.log(`✅ Loaded ${jobsData?.length || 0} jobs from Redis`);
    } catch (error) {
      console.error('❌ Error loading jobs:', error);
      message.error('Failed to load jobs from storage');
      setJobs([]);
    } finally {
      setJobsLoading(false);
    }
  }, []); // FIXED: Removed jobsLoading dependency to prevent function recreation loop

  // This effect will re-fetch jobs whenever the page becomes visible.
  // This is a simple way to handle stale state on navigation.
  useEffect(() => {
    let debounceTimer: NodeJS.Timeout;
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('🔄 [DEBOUNCED] Page is visible, reloading jobs...');
        // Debounce visibility changes to prevent rapid-fire API calls
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          loadJobs();
        }, 1000); // 1 second debounce
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      clearTimeout(debounceTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [loadJobs]);

  const addJob = useCallback((job: JobStatus) => {
    setJobs(prevJobs => {
      // Avoid adding duplicates
      if (prevJobs.some(j => j.jobId === job.jobId)) {
        return prevJobs;
      }
      return [job, ...prevJobs];
    });
  }, []);

  const updateJob = useCallback((updatedJob: any) => {
    // Update local state (Redis updates happen via polling)
    setJobs(prevJobs =>
      prevJobs.map(job => {
        if (job.jobId === updatedJob.jobId) {
          // Create a proper JobStatus object that maintains the discriminated union
          const baseJob = {
            jobId: job.jobId,
            batchId: job.batchId,
            timestamp: job.timestamp,
            files: job.files,
          };
          
          // Handle different status transitions properly
          const newStatus = updatedJob.status || job.status;
          
          switch (newStatus) {
            case 'submitted':
              return { ...baseJob, status: 'submitted' as const, message: updatedJob.message || job.message };
            case 'processing':
              return {
                ...baseJob,
                status: 'processing' as const,
                progress: updatedJob.progress || ('progress' in job ? job.progress : 0),
                message: updatedJob.message || job.message
              };
            case 'completed':
              return {
                ...baseJob,
                status: 'completed' as const,
                endTime: updatedJob.endTime || ('endTime' in job ? job.endTime : new Date().toISOString()),
                message: updatedJob.message || job.message
              };
            case 'error':
              return {
                ...baseJob,
                status: 'error' as const,
                endTime: updatedJob.endTime || ('endTime' in job ? job.endTime : new Date().toISOString()),
                error: updatedJob.error || ('error' in job ? job.error : 'Unknown error'),
                message: updatedJob.message || job.message
              };
            case 'paused':
              return {
                ...baseJob,
                status: 'paused' as const,
                progress: updatedJob.progress || ('progress' in job ? job.progress : 0),
                message: updatedJob.message || job.message
              };
            case 'cancelled':
              return {
                ...baseJob,
                status: 'cancelled' as const,
                endTime: updatedJob.endTime || ('endTime' in job ? job.endTime : new Date().toISOString()),
                message: updatedJob.message || job.message
              };
            default:
              return job;
          }
        }
        return job;
      })
    );
  }, []);

  const value = {
    isInitialFilesLoaded,
    setInitialFilesLoaded,
    files,
    fetchFiles,
    filesLoading,
    filesError,
    fileSheets,
    jobs,
    addJob,
    updateJob,
    loadJobs,
    jobsLoading,
  };

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
};

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
};