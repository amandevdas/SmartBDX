// src/types/api.ts

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
  error?: string;
}

export interface FileItem {
  id: string;
  name: string;
  status: 'ready' | 'processing' | 'completed' | 'error';
  size: number;
  lastModified?: Date;
  type?: string;
  path?: string;
  progress?: number;
  batchId?: string;
}

export interface ProcessedFile {
  id: string;
  name: string;
  sheets: string[];
}

export interface JobStatus {
  jobId: string;
  status: 'submitted' | 'processing' | 'completed' | 'error' | 'paused' | 'cancelled';
  progress?: number;
  message?: string;
  batchId?: string;
  timestamp?: string;
  endTime?: string;
  files?: ProcessedFile[];
}

export interface ProcessRequest {
  fileIds: string[];
  sheetSelections?: Record<string, string[]>;
  options?: Record<string, any>;
}

export interface SheetInfo {
  sheets: string[];
  fileId: string;
  fileName: string;
}