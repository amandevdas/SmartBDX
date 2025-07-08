// DEPRECATED: This file is deprecated in favor of redis-job-store.ts
// This is kept for backward compatibility but should not be used in new code.

// Re-export from the main job store
export { 
  addJob, 
  getAllJobs, 
  getJobById, 
  getJobByBatchId, 
  updateJob,
  clearAllJobs as clearOldJobs,
  getJobStats as getJobsStats
} from './redis-job-store';

// Mock healthCheck for backward compatibility
export const healthCheck = async (): Promise<boolean> => {
  console.warn('healthCheck is deprecated, use main redis-job-store.ts instead');
  return true;
};