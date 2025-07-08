// src/utils/navigationHelpers.ts
import { JobStatus } from '@/types/api';

/**
 * Check if a job should trigger auto-navigation to mapping page
 */
export function shouldNavigateToMapping(job: JobStatus): boolean {
  // Only navigate when job is actually completed (not just processing)
  if (job.status !== 'completed') {
    return false;
  }

  // Additional checks can be added here based on backend response
  // For example, check if mapping is enabled and review is required
  return true;
}

/**
 * Check if polling should continue for a job
 */
export function shouldContinuePolling(job: JobStatus): boolean {
  const activeStatuses = ['submitted', 'processing'];
  return activeStatuses.includes(job.status);
}

/**
 * Check if a job has finished (either successfully or with error)
 */
export function isJobFinished(job: JobStatus): boolean {
  const finishedStatuses = ['completed', 'error', 'cancelled'];
  return finishedStatuses.includes(job.status);
}

/**
 * Get user-friendly status message
 */
export function getStatusMessage(job: JobStatus): string {
  switch (job.status) {
    case 'submitted':
      return job.message || 'Job submitted and queued for processing';
    case 'processing':
      return job.message || 'Processing files...';
    case 'completed':
      return job.message || 'Processing completed successfully';
    case 'error':
      return job.error || job.message || 'Processing failed';
    case 'paused':
      return job.message || 'Job paused';
    case 'cancelled':
      return job.message || 'Job cancelled';
    default:
      return 'Unknown status';
  }
}

/**
 * Check if retry is available for a job
 */
export function canRetryJob(job: JobStatus): boolean {
  return job.status === 'error';
}