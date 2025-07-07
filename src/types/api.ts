// src/types/api.ts

// =============================================================================
// CORE API RESPONSE TYPES
// =============================================================================

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
  timestamp: string;
}

export interface ApiError {
  error: string;
  code: string;
  details?: Record<string, unknown>;
  timestamp: string;
  requestId?: string;
}

export type ApiResult<T> = ApiResponse<T> | ApiError;

// =============================================================================
// FILE AND PROCESSING TYPES
// =============================================================================

// Base file information (always available)
export interface BaseFileItem {
  id: string;
  name: string;
  size: number;
  lastModified: string; // ISO string from API
  type?: string;
  path?: string;
}

// Enhanced file information (from AI backend)
export interface EnhancedFileMetadata {
  priority_score?: number;
  processing_status?: string;
  structure_signature?: string;
  cache_available?: boolean;
  estimated_processing_time?: number;
  ai_recommendation?: 'high_priority' | 'cache_available' | 'skip';
  base_file_name?: string;
  file_size_mb?: number;
}

// Combined file item (used in UI)
export interface FileItem extends BaseFileItem, EnhancedFileMetadata {
  status: FileStatus;
  progress?: number;
  batchId?: string;
  sheets?: string[];
}

// File status type
export type FileStatus = 'ready' | 'processing' | 'completed' | 'error';

// =============================================================================
// JOB AND BATCH PROCESSING TYPES
// =============================================================================

// Base job information
interface BaseJobStatus {
  jobId: string;
  batchId?: string;
  timestamp: string;
  files?: ProcessedFile[];
}

// Discriminated union for job status
export type JobStatus = BaseJobStatus & (
  | { status: 'submitted'; message?: string }
  | { status: 'processing'; progress: number; message?: string }
  | { status: 'completed'; endTime: string; message?: string }
  | { status: 'error'; endTime: string; error: string; message?: string }
  | { status: 'paused'; progress: number; message?: string }
  | { status: 'cancelled'; endTime: string; message?: string }
);

// Enhanced job information (from backend)
export interface EnhancedJobInfo {
  rate_limit_status?: RateLimitInfo;
  checkpoint_data?: CheckpointInfo;
  cost_estimate?: CostInfo;
  cache_utilization?: number;
}

export interface ProcessedFile {
  id: string;
  name: string;
  sheets: string[];
  status?: FileStatus;
}

// =============================================================================
// BACKEND INTEGRATION TYPES
// =============================================================================

export interface RateLimitInfo {
  tokens_remaining: number;
  requests_remaining: number;
  reset_time: string; // ISO string
  tokens_per_minute: number;
  requests_per_minute: number;
}

export interface CheckpointInfo {
  completed_items: number;
  failed_items: number;
  pending_items: number;
  total_items: number;
  can_resume: boolean;
}

export interface CostInfo {
  estimated_tokens: number;
  estimated_cost_usd: number;
  cache_savings: number;
  cache_hit_rate: number;
}

// =============================================================================
// ANALYTICS AND MONITORING TYPES
// =============================================================================

export interface BatchAnalytics {
  cache_hit_rate: number;
  cost_savings_from_cache: number;
  tokens_consumed: number;
  processing_efficiency: ProcessingEfficiency;
  error_patterns: ErrorPattern[];
  batch_summary: BatchSummary;
}

export interface ProcessingEfficiency {
  sheets_per_hour: number;
  error_rate: number;
  avg_processing_time: number;
  throughput_trend: number;
}

export interface ErrorPattern {
  error_type: string;
  count: number;
  recent_occurrences: string[]; // ISO strings
  suggested_fix?: string;
}

export interface BatchSummary {
  total_files: number;
  total_sheets: number;
  completed_files: number;
  failed_files: number;
  start_time: string; // ISO string
  end_time?: string; // ISO string
  duration_minutes?: number;
}

// =============================================================================
// COLUMN MAPPING TYPES
// =============================================================================

export interface ColumnMapping {
  source_column: string;
  target_column: string;
  confidence: number;
  mapping_source: 'vector_search' | 'llm_enhanced' | 'manual';
  vector_similarity_score?: number;
  llm_reasoning?: string;
  examples: string[];
  needs_human_review: boolean;
  approved?: boolean;
  reviewed_by?: string;
  review_date?: string; // ISO string
}

// =============================================================================
// AI SELECTION AND OPTIMIZATION TYPES
// =============================================================================

export interface SmartFileSelection {
  recommended_files: string[];
  priority_ranking: FilePriority[];
  cost_optimization: CostOptimization;
  cache_opportunities: CacheOpportunity[];
}

export interface FilePriority {
  file_id: string;
  priority_score: number;
  priority_reason: string;
  processing_urgency: 'urgent' | 'high' | 'medium' | 'low';
}

export interface CostOptimization {
  total_estimated_cost: number;
  potential_savings: number;
  cache_recommendations: string[];
}

export interface CacheOpportunity {
  file_id: string;
  cache_available: boolean;
  structure_signature: string;
  estimated_time_saved: number;
  cost_saved: number;
}

// =============================================================================
// REQUEST TYPES
// =============================================================================

export interface ProcessRequest {
  fileIds: string[];
  sheetSelections?: Record<string, string[]>;
  options?: ProcessingOptions;
}

export interface ProcessingOptions {
  priority?: 'low' | 'normal' | 'high';
  enable_mapping?: boolean;
  max_parallelism?: number;
  chunk_size?: number;
}

export interface SheetInfo {
  sheets: string[];
  fileId: string;
  fileName: string;
}

// =============================================================================
// TYPE GUARDS AND UTILITIES
// =============================================================================

export function isApiError(response: ApiResult<any>): response is ApiError {
  return 'error' in response;
}

export function isJobCompleted(job: JobStatus): job is JobStatus & { status: 'completed' } {
  return job.status === 'completed';
}

export function isJobFailed(job: JobStatus): job is JobStatus & { status: 'error' } {
  return job.status === 'error';
}

export function isJobActive(job: JobStatus): boolean {
  return ['submitted', 'processing'].includes(job.status);
}

// =============================================================================
// VALIDATION SCHEMAS (for runtime validation)
// =============================================================================

export const FILE_STATUSES = ['ready', 'processing', 'completed', 'error'] as const;
export const JOB_STATUSES = ['submitted', 'processing', 'completed', 'error', 'paused', 'cancelled'] as const;
export const AI_RECOMMENDATIONS = ['high_priority', 'cache_available', 'skip'] as const;
export const MAPPING_SOURCES = ['vector_search', 'llm_enhanced', 'manual'] as const;