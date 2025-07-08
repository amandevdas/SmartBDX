// DEPRECATED: This file is deprecated in favor of redis-job-store.ts
// This is kept for backward compatibility but should not be used in new code.

// Re-export from the main job store
export { 
  addJob, 
  getAllJobs, 
  getJobById, 
  getJobByBatchId, 
  clearAllJobs as clearOldJobs 
} from './redis-job-store';