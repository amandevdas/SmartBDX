interface DatabricksJobResponse {
  run_id: number;
  number_in_job: number;
}

interface DatabricksRunOutput {
  notebook_output?: {
    result?: string;
    truncated?: boolean;
  };
  error?: string;
  metadata: {
    state: {
      life_cycle_state: string;
      result_state?: string;
      state_message?: string;
    };
  };
}

export interface FileMeta {
  id: string;
  file_name: string;
  status: "pending" | "processing" | "completed" | "failed";
  last_modified: string;
  size: number;
  sheets: number;
  sheetNames?: string[];
  path?: string;
}

export interface SheetNames {
  id: string;
  file_name: string;
  sheets: number;
  sheetNames: string[];
}

export interface ProcessRequest {
  fileId: string;
  sheets: string[];
}

export interface JobStatus {
  batch_id: string;
  status: "submitted" | "processing" | "completed" | "completed_with_errors" | "failed";
  progress: number;
  completed_files: number;
  total_files: number;
  errors: number;
  current_file?: string;
  elapsed_time?: string;
  estimated_remaining?: string;
}

class DatabricksClient {
  private baseUrl: string;
  private token: string;
  private jobId: string;
  private volumePath: string;

  constructor() {
    this.baseUrl = process.env.NEXT_PUBLIC_DATABRICKS_HOST || '';
    this.token = process.env.NEXT_PUBLIC_DATABRICKS_TOKEN || '';
    this.jobId = process.env.NEXT_PUBLIC_SMARTBDX_API_JOB_ID || '';
    this.volumePath = process.env.NEXT_PUBLIC_VOLUME_PATH || '/Volumes/smartbdx/files/';

    if (!this.baseUrl || !this.token || !this.jobId) {
      console.error('Missing required Databricks configuration');
    }
  }

  private async makeRequest(url: string, options: RequestInit = {}) {
    const response = await fetch(`${this.baseUrl}${url}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`Databricks API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async submitJob(operation: string, parameters: any = {}): Promise<DatabricksJobResponse> {
    const response = await this.makeRequest('/api/2.1/jobs/run-now', {
      method: 'POST',
      body: JSON.stringify({
        job_id: parseInt(this.jobId),
        notebook_params: {
          operation,
          parameters: JSON.stringify(parameters)
        }
      })
    });

    return response;
  }

  async getRunOutput(runId: number): Promise<DatabricksRunOutput> {
    return this.makeRequest(`/api/2.1/jobs/runs/get-output?run_id=${runId}`);
  }

  async waitForCompletion(runId: number, timeoutMs: number = 300000): Promise<any> {
    const startTime = Date.now();
    const pollInterval = 2000; // 2 seconds

    while (Date.now() - startTime < timeoutMs) {
      const output = await this.getRunOutput(runId);
      const state = output.metadata.state.life_cycle_state;

      if (state === 'TERMINATED') {
        if (output.metadata.state.result_state === 'SUCCESS') {
          const result = output.notebook_output?.result;
          if (result) {
            try {
              return JSON.parse(result);
            } catch (e) {
              throw new Error('Invalid JSON response from SmartBDX');
            }
          }
          throw new Error('No result from SmartBDX operation');
        } else {
          throw new Error(`SmartBDX operation failed: ${output.metadata.state.state_message || 'Unknown error'}`);
        }
      } else if (state === 'INTERNAL_ERROR' || state === 'SKIPPED') {
        throw new Error(`SmartBDX operation error: ${state}`);
      }

      // Wait before next poll
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error('SmartBDX operation timeout');
  }

  async executeOperation(operation: string, parameters: any = {}): Promise<any> {
    console.log(`🚀 Executing SmartBDX operation: ${operation}`, parameters);
    
    const jobResponse = await this.submitJob(operation, parameters);
    console.log(`⏳ Job submitted with run ID: ${jobResponse.run_id}`);
    
    const result = await this.waitForCompletion(jobResponse.run_id);
    console.log(`✅ Operation completed:`, result);
    
    return result;
  }

  // API methods that match our existing interface
  async getFiles(): Promise<FileMeta[]> {
    const result = await this.executeOperation('discover_files', {
      volume_folder: this.volumePath
    });
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to list files');
    }
    
    return result.data;
  }

  async getSheetNames(fileId: string): Promise<SheetNames> {
    const result = await this.executeOperation('get_sheet_names', {
      file_path: `${this.volumePath}${fileId}`
    });
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to extract sheet names');
    }
    
    return {
      id: fileId,
      file_name: fileId,
      sheets: result.data.total_sheets,
      sheetNames: result.data.sheet_names
    };
  }

  async processFiles(files: ProcessRequest[]): Promise<{ batch_id: string }> {
    const result = await this.executeOperation('process_files', {
      files: files.map(file => ({
        fileId: file.fileId,
        sheets: file.sheets
      })),
      enable_mapping: true
    });
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to start processing');
    }
    
    return {
      batch_id: result.data.batch_id
    };
  }

  async getJobStatus(batchId: string): Promise<JobStatus> {
    const result = await this.executeOperation('get_batch_status', {
      batch_id: batchId
    });
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to get job status');
    }
    
    return result.data;
  }

  async getJobResults(batchId: string): Promise<any> {
    const result = await this.executeOperation('get_mapping_results', {
      batch_id: batchId
    });
    
    if (!result.success) {
      throw new Error(result.error || 'Failed to get job results');
    }
    
    return result.data;
  }
}

export const databricksClient = new DatabricksClient();

// Error handling class for SmartBDX operations
export class SmartBDXError extends Error {
  constructor(
    message: string,
    public operation: string,
    public databricksError?: string
  ) {
    super(message);
    this.name = 'SmartBDXError';
  }
}

// Error handling utility
export function handleSmartBDXError(error: any, operation: string): SmartBDXError {
  if (error instanceof SmartBDXError) {
    return error;
  }

  const message = error.message || 'Unknown SmartBDX error';
  return new SmartBDXError(message, operation, error.toString());
}