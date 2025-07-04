'use client';

import React, { createContext, useState, useContext, ReactNode, useCallback, useEffect } from 'react';
import { apiRequest } from '@/hooks/useApi';
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
      console.log('📋 Skipping fetch - already loading');
      return;
    }

    try {
      setFilesLoading(true);
      setFilesError(null);
      
      const endpoint = forceRefresh ? '/files?refresh=true' : '/files';
      const response = await apiRequest<FileItem[]>(endpoint);
      
      let filesList: FileItem[];
      if (Array.isArray(response)) {
        filesList = response;
      } else {
        throw new Error('Invalid response format from status endpoint');
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
        };
      }).filter((file): file is FileItem => file !== null);

      if (Object.keys(newFileSheets).length > 0) {
        setFileSheets(prev => ({ ...prev, ...newFileSheets }));
      }

      setFiles(transformedFiles);
      
      if (transformedFiles.length !== filesList.length) {
        message.warning(`${filesList.length - transformedFiles.length} invalid files were filtered out`);
      }
      
    } catch (error: any) {
      console.error('Failed to fetch files:', error);
      const errorMessage = error?.message || 'Failed to load files. Please try again.';
      setFilesError(errorMessage);
      setFiles([]);
      message.error(errorMessage);
    } finally {
      setFilesLoading(false);
    }
  }, [filesLoading]);

  const loadJobs = useCallback(async () => {
    if (jobsLoading) return;
    
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
  }, [jobsLoading]);

  // This effect will re-fetch jobs whenever the page becomes visible.
  // This is a simple way to handle stale state on navigation.
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        console.log('🔄 Page is visible, reloading jobs...');
        loadJobs();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
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

  const updateJob = useCallback((updatedJob: Partial<JobStatus> & { jobId: string }) => {
    // Update local state (Redis updates happen via polling)
    setJobs(prevJobs =>
      prevJobs.map(job =>
        job.jobId === updatedJob.jobId ? { ...job, ...updatedJob } : job
      )
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