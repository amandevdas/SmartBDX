import { NextResponse } from 'next/server';

/**
 * Creates a successful API response with the provided data
 */
export function createSuccessResponse(data: any, requestId?: string, status: number = 200): NextResponse {
  const logPrefix = requestId ? `[${requestId}]` : '';
  console.log(`${logPrefix} ✅ Creating success response`);
  
  return NextResponse.json({
    success: true,
    data
  }, { status });
}

/**
 * Creates an error API response with the provided message
 */
export function createErrorResponse(message: string, requestId?: string, status: number = 500, extra?: any): NextResponse {
  const logPrefix = requestId ? `[${requestId}]` : '';
  console.log(`${logPrefix} ❌ Creating error response: ${message}`);
  
  const responseBody: any = {
    success: false,
    error: message
  };
  
  // Add extra properties if provided
  if (extra) {
    Object.assign(responseBody, extra);
  }
  
  return NextResponse.json(responseBody, { status });
}

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

const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY = 1000;
const CONCURRENT_BATCH_LIMIT = 10; // Limit concurrent API calls

export class DatabricksClient {
  private baseUrl: string;
  private token: string;
  private jobId: string;
  private requestId: string;

  constructor(requestId?: string) {
    this.baseUrl = process.env.DATABRICKS_HOST || '';
    this.token = process.env.DATABRICKS_TOKEN || '';
    this.jobId = process.env.SMARTBDX_API_JOB_ID || '';
    this.requestId = requestId || `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

    if (!this.baseUrl || !this.token || !this.jobId) {
      console.error(`[${this.requestId}] Missing Databricks configuration:`, {
        hasHost: !!this.baseUrl,
        hasToken: !!this.token,
        hasJobId: !!this.jobId
      });
      throw new Error('Missing required Databricks configuration');
    }
  }

  private async makeRequest(url: string, options: RequestInit = {}, retryCount = 0): Promise<any> {
    const fullUrl = `${this.baseUrl}${url}`;
    console.log(`[${this.requestId}] 🔗 Making request to: ${fullUrl} (attempt ${retryCount + 1}/${MAX_RETRIES + 1})`);
    
    try {
      const response = await fetch(fullUrl, {
        ...options,
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
          'X-Request-ID': this.requestId,
          ...options.headers,
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorData: any = {};
        console.error(`[${this.requestId}] ❌ Databricks API error: ${response.status} ${response.statusText}`, errorText);
        try {
          errorData = JSON.parse(errorText);
          console.error(`[${this.requestId}] ❌ Parsed error data:`, errorData);
        } catch (e) {
          console.error(`[${this.requestId}] ❌ Failed to parse error response as JSON.`);
        }
        
        const isRetryable =
          response.status === 429 || // Too Many Requests
          response.status === 503 || // Service Unavailable
          response.status === 504;   // Gateway Timeout
        
        if (isRetryable && retryCount < MAX_RETRIES) {
          const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount) + Math.random() * 1000;
          console.log(`[${this.requestId}] ⏱️ Retrying after ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.makeRequest(url, options, retryCount + 1);
        }
        
        throw new Error(`Databricks API error: ${response.status} ${response.statusText}${
          errorData.message ? ` - ${errorData.message}` : ''
        }`);
      }

      return response.json();
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes('Databricks API error')) {
        console.error(`[${this.requestId}] 🌐 Network or parsing error:`, error);
        
        if (retryCount < MAX_RETRIES) {
          const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount) + Math.random() * 1000;
          console.log(`[${this.requestId}] ⏱️ Retrying after ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.makeRequest(url, options, retryCount + 1);
        }
      }
      
      throw error;
    }
  }

  async submitJob(operation: string, parameters: any = {}): Promise<DatabricksJobResponse> {
    console.log(`[${this.requestId}] 🚀 Submitting job with operation: ${operation}`, parameters);
    
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

    console.log(`[${this.requestId}] ✅ Job submitted successfully: ${response.run_id}`);
    return response;
  }

  async getRunDetails(runId: number): Promise<any> {
    return this.makeRequest(`/api/2.1/jobs/runs/get?run_id=${runId}`);
  }

  async getRunOutput(runId: number): Promise<DatabricksRunOutput> {
    return this.makeRequest(`/api/2.1/jobs/runs/get-output?run_id=${runId}`);
  }

  async getRunStatus(runId: number): Promise<any> {
    console.log(`[${this.requestId}] 📊 Checking status for runId: ${runId}`);
    return this.makeRequest(`/api/2.1/jobs/runs/get?run_id=${runId}`);
  }

  /**
   * NEW: Get batch run status for multiple run IDs
   * Since Databricks doesn't have a native batch API, we use concurrent requests
   */
  async getBatchRunStatus(runIds: string[]): Promise<Record<string, any>> {
    console.log(`[${this.requestId}] 📊 Getting batch status for ${runIds.length} runs`);
    
    if (runIds.length === 0) {
      return {};
    }

    try {
      // Convert string runIds to numbers for Databricks API
      const numericRunIds = runIds.map(id => {
        const numericId = parseInt(id, 10);
        if (isNaN(numericId)) {
          console.warn(`[${this.requestId}] ⚠️ Invalid runId: ${id}`);
          return null;
        }
        return numericId;
      }).filter(id => id !== null) as number[];

      if (numericRunIds.length === 0) {
        console.warn(`[${this.requestId}] ⚠️ No valid numeric run IDs found`);
        return {};
      }

      // Create batch requests
      const batchRequests = numericRunIds.map(async (runId) => {
        try {
          const runDetails = await this.getRunDetails(runId);
          return { runId: runId.toString(), data: runDetails };
        } catch (error) {
          console.warn(`[${this.requestId}] ⚠️ Failed to get status for run ${runId}:`, error);
          return { runId: runId.toString(), data: null };
        }
      });

      // Execute requests with concurrency limit
      const results: Record<string, any> = {};
      
      // Process in batches to avoid overwhelming the API
      for (let i = 0; i < batchRequests.length; i += CONCURRENT_BATCH_LIMIT) {
        const batch = batchRequests.slice(i, i + CONCURRENT_BATCH_LIMIT);
        
        try {
          const batchResults = await Promise.all(batch);
          
          for (const result of batchResults) {
            results[result.runId] = result.data;
          }
          
          // Small delay between batches to be respectful to the API
          if (i + CONCURRENT_BATCH_LIMIT < batchRequests.length) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } catch (error) {
          console.error(`[${this.requestId}] ❌ Error processing batch ${i / CONCURRENT_BATCH_LIMIT + 1}:`, error);
          // Continue with next batch even if this one fails
        }
      }

      const successCount = Object.values(results).filter(data => data !== null).length;
      console.log(`[${this.requestId}] ✅ Retrieved status for ${successCount}/${runIds.length} runs`);
      
      return results;
      
    } catch (error) {
      console.error(`[${this.requestId}] ❌ Error getting batch run status:`, error);
      throw error;
    }
  }

  // Get task output - kept for backward compatibility
  async getTaskOutput(runId: number, taskKey: string): Promise<any> {
    try {
      return await this.makeRequest(`/api/2.1/jobs/runs/get-output?run_id=${runId}&task_key=${taskKey}`);
    } catch (error) {
      console.error(`[${this.requestId}] ❌ Error getting task output for ${taskKey}:`, error);
      throw error;
    }
  }

  // Get all task outputs for a multi-task job
  async getAllTaskOutputs(runId: number, taskKeys: string[]): Promise<any[]> {
    console.log(`[${this.requestId}] 🔍 Getting outputs for all ${taskKeys.length} tasks`);
    
    const outputs = [];
    for (const taskKey of taskKeys) {
      try {
        const output = await this.getTaskOutput(runId, taskKey);
        outputs.push(output);
      } catch (error) {
        console.warn(`[${this.requestId}] ⚠️ Failed to get output for task ${taskKey}:`, error);
        // Continue with other tasks even if one fails
      }
    }
    
    return outputs;
  }

  // Get run details with task runs
  async getRunDetailsWithTasks(runId: number): Promise<any> {
    try {
      const details = await this.makeRequest(`/api/2.1/jobs/runs/get?run_id=${runId}&include_task_runs=true`);
      return details;
    } catch (error) {
      console.error(`[${this.requestId}] ❌ Error getting run details with tasks:`, error);
      throw error;
    }
  }

  // Get individual task run IDs from a job run
  async getTaskRunIds(runId: number): Promise<{taskKey: string, taskRunId: number}[]> {
    try {
      const details = await this.getRunDetailsWithTasks(runId);
      console.log(`[${this.requestId}] 🔍 Run details structure:`, JSON.stringify(details, null, 2));
      
      // Check multiple possible locations for task runs
      let taskRuns = details.task_runs || details.tasks || [];
      
      if (taskRuns.length === 0) {
        // Try to find task runs in the state or other nested structures
        if (details.state && details.state.task_runs) {
          taskRuns = details.state.task_runs;
        } else if (details.run && details.run.task_runs) {
          taskRuns = details.run.task_runs;
        }
      }
      
      if (taskRuns.length === 0) {
        console.warn(`[${this.requestId}] ⚠️ No task runs found for job ${runId} in any expected location`);
        return [];
      }
      
      console.log(`[${this.requestId}] ✅ Found ${taskRuns.length} task runs`);
      
      return taskRuns.map((taskRun: any) => ({
        taskKey: taskRun.task_key || taskRun.key || 'unknown',
        taskRunId: taskRun.run_id || taskRun.id || taskRun.task_run_id
      })).filter((tr: any) => tr.taskRunId); // Filter out invalid entries
    } catch (error) {
      console.error(`[${this.requestId}] ❌ Error getting task run IDs:`, error);
      return [];
    }
  }

  // Get output for a specific task run
  async getTaskRunOutput(taskRunId: number): Promise<any> {
    try {
      return await this.makeRequest(`/api/2.1/jobs/runs/get-output?run_id=${taskRunId}`);
    } catch (error) {
      console.error(`[${this.requestId}] ❌ Error getting task run output for ${taskRunId}:`, error);
      return null;
    }
  }

  // Try alternative methods to get job output
  async tryAlternativeOutputRetrieval(runId: number): Promise<string | null> {
    console.log(`[${this.requestId}] 🔄 Trying alternative output retrieval methods for job ${runId}`);
    
    // Method 1: Try to get the run details with full information
    try {
      console.log(`[${this.requestId}] 🔍 Method 1: Getting full run details`);
      const fullDetails = await this.makeRequest(`/api/2.1/jobs/runs/get?run_id=${runId}&include_task_runs=true&include_history=true`);
      
      // Check if there's output directly in the run details
      if (fullDetails.notebook_output && fullDetails.notebook_output.result) {
        console.log(`[${this.requestId}] ✅ Found output in run details notebook_output`);
        return fullDetails.notebook_output.result;
      }
      
      // Check if there's output in the state
      if (fullDetails.state && fullDetails.state.notebook_output && fullDetails.state.notebook_output.result) {
        console.log(`[${this.requestId}] ✅ Found output in run state notebook_output`);
        return fullDetails.state.notebook_output.result;
      }
      
      // Check task runs in the full details
      if (fullDetails.task_runs && fullDetails.task_runs.length > 0) {
        for (const taskRun of fullDetails.task_runs) {
          // Try to get output from each task run's state
          if (taskRun.state && taskRun.state.notebook_output && taskRun.state.notebook_output.result) {
            console.log(`[${this.requestId}] ✅ Found output in task run ${taskRun.task_key} state`);
            return taskRun.state.notebook_output.result;
          }
          
          // Try to get output directly from task run
          if (taskRun.notebook_output && taskRun.notebook_output.result) {
            console.log(`[${this.requestId}] ✅ Found output in task run ${taskRun.task_key} notebook_output`);
            return taskRun.notebook_output.result;
          }
        }
      }
    } catch (error) {
      console.warn(`[${this.requestId}] ⚠️ Method 1 failed:`, error);
    }
    
    // Method 2: Try to get output using the original run ID (sometimes works for single-task jobs)
    try {
      console.log(`[${this.requestId}] 🔍 Method 2: Trying direct output retrieval`);
      const directOutput = await this.makeRequest(`/api/2.1/jobs/runs/get-output?run_id=${runId}`);
      
      if (directOutput.notebook_output && directOutput.notebook_output.result) {
        console.log(`[${this.requestId}] ✅ Found output via direct retrieval`);
        return directOutput.notebook_output.result;
      }
    } catch (error) {
      console.warn(`[${this.requestId}] ⚠️ Method 2 failed (expected for multi-task jobs):`, error);
    }
    
    // Method 3: Try to list and get outputs from all runs in the job
    try {
      console.log(`[${this.requestId}] 🔍 Method 3: Trying to list job runs`);
      const jobDetails = await this.makeRequest(`/api/2.1/jobs/get?job_id=${this.jobId}`);
      
      if (jobDetails.settings && jobDetails.settings.tasks) {
        console.log(`[${this.requestId}] 🔍 Found job with ${jobDetails.settings.tasks.length} tasks`);
        
        // For each task, try to find recent successful runs
        for (const task of jobDetails.settings.tasks) {
          try {
            const taskKey = task.task_key;
            console.log(`[${this.requestId}] 🔍 Checking task: ${taskKey}`);
            
            // Try to get recent runs for this job
            const runsResponse = await this.makeRequest(`/api/2.1/jobs/runs/list?job_id=${this.jobId}&limit=10&run_type=JOB_RUN`);
            
            if (runsResponse.runs) {
              // Find the current run and try to get its task output
              const currentRun = runsResponse.runs.find((run: any) => run.run_id === runId);
              if (currentRun && currentRun.task_runs) {
                for (const taskRun of currentRun.task_runs) {
                  if (taskRun.task_key === taskKey && taskRun.state && taskRun.state.result_state === 'SUCCESS') {
                    try {
                      const taskOutput = await this.getTaskRunOutput(taskRun.run_id);
                      if (taskOutput && taskOutput.notebook_output && taskOutput.notebook_output.result) {
                        console.log(`[${this.requestId}] ✅ Found output via task run listing for ${taskKey}`);
                        return taskOutput.notebook_output.result;
                      }
                    } catch (taskError) {
                      console.warn(`[${this.requestId}] ⚠️ Failed to get task output for ${taskKey}:`, taskError);
                    }
                  }
                }
              }
            }
          } catch (taskError) {
            console.warn(`[${this.requestId}] ⚠️ Failed to process task ${task.task_key}:`, taskError);
          }
        }
      }
    } catch (error) {
      console.warn(`[${this.requestId}] ⚠️ Method 3 failed:`, error);
    }
    
    console.warn(`[${this.requestId}] ❌ All alternative output retrieval methods failed`);
    return null;
  }

  // Extract result from task runs
  extractResultFromTaskRuns(runDetails: any): string | null {
    console.log(`[${this.requestId}] 🔍 Extracting result from task runs:`, JSON.stringify(runDetails, null, 2));
    
    // Check multiple possible locations for task runs
    let taskRuns = runDetails.task_runs || runDetails.tasks || [];
    
    if (taskRuns.length === 0) {
      console.warn(`[${this.requestId}] ⚠️ No task runs found in run details`);
      return null;
    }

    console.log(`[${this.requestId}] 🔍 Found ${taskRuns.length} task runs to examine`);

    // Try to find a completed task with output
    for (const taskRun of taskRuns) {
      console.log(`[${this.requestId}] 🔍 Examining task run:`, JSON.stringify(taskRun, null, 2));
      
      if (taskRun.state && taskRun.state.result_state === 'SUCCESS') {
        try {
          // For notebook tasks - check multiple possible locations
          if (taskRun.state.notebook_output && taskRun.state.notebook_output.result) {
            console.log(`[${this.requestId}] ✅ Found notebook output in state.notebook_output.result`);
            return taskRun.state.notebook_output.result;
          }
          
          // Check if notebook output is directly in the task run
          if (taskRun.notebook_output && taskRun.notebook_output.result) {
            console.log(`[${this.requestId}] ✅ Found notebook output in notebook_output.result`);
            return taskRun.notebook_output.result;
          }
          
          // Check for result in different locations
          if (taskRun.state.result) {
            console.log(`[${this.requestId}] ✅ Found result in state.result`);
            return taskRun.state.result;
          }
          
          if (taskRun.result) {
            console.log(`[${this.requestId}] ✅ Found result in result`);
            return taskRun.result;
          }
          
          // Check for output in task run details
          if (taskRun.output && taskRun.output.result) {
            console.log(`[${this.requestId}] ✅ Found result in output.result`);
            return taskRun.output.result;
          }
          
        } catch (err) {
          const error = err as Error;
          console.warn(`[${this.requestId}] ⚠️ Failed to extract result from task ${taskRun.task_key}:`, error.message);
        }
      }
    }
    
    console.warn(`[${this.requestId}] ⚠️ No valid result found in any task run`);
    return null;
  }

  async waitForCompletion(runId: number, timeoutMs: number = 480000): Promise<any> {
    const startTime = Date.now();
    const pollInterval = 5000; // 5 seconds
    let attempts = 0;
    const maxAttempts = 96; // 8 minutes worth of polling
    let taskKeys: string[] = [];

    console.log(`[${this.requestId}] ⏳ Waiting for job ${runId} to complete...`);

    while (Date.now() - startTime < timeoutMs && attempts < maxAttempts) {
      attempts++;
      console.log(`[${this.requestId}] 🔄 Checking job status (attempt ${attempts})...`);
      
      try {
        const runDetails = await this.getRunDetails(runId);
        const state = runDetails.state.life_cycle_state;
        
        console.log(`[${this.requestId}] 📊 Job ${runId} state: ${state}`);

        // Check if this is a multi-task job (only on first attempt)
        if (attempts === 1) {
          if (runDetails.tasks && runDetails.tasks.length > 0) {
            taskKeys = runDetails.tasks.map((task: any) => task.task_key);
            console.log(`[${this.requestId}] 📝 Job tasks detected: ${taskKeys.join(', ')}`);
          }
        }

        if (state === 'TERMINATED') {
          if (runDetails.state.result_state === 'SUCCESS') {
            let result: any = null;

            // For multi-task jobs, use the task runs approach
            if (taskKeys.length > 0) {
              console.log(`[${this.requestId}] 🔍 Getting task run IDs for multi-task job`);
              try {
                // Get individual task run IDs
                const taskRuns = await this.getTaskRunIds(runId);
                
                if (taskRuns.length > 0) {
                  console.log(`[${this.requestId}] 🔍 Found ${taskRuns.length} task runs, getting outputs individually`);
                  
                  // Try to get output from each task run individually
                  for (const taskRun of taskRuns) {
                    try {
                      console.log(`[${this.requestId}] 🔍 Getting output for task run ${taskRun.taskRunId} (${taskRun.taskKey})`);
                      const output = await this.getTaskRunOutput(taskRun.taskRunId);
                      
                      if (output && output.notebook_output && output.notebook_output.result) {
                        result = output.notebook_output.result;
                        console.log(`[${this.requestId}] ✅ Successfully got output from task ${taskRun.taskKey}`);
                        break; // Found a valid result, no need to check other tasks
                      }
                    } catch (err) {
                      console.warn(`[${this.requestId}] ⚠️ Failed to get output for task run ${taskRun.taskRunId}:`, err);
                      // Continue to next task run
                    }
                  }
                } else {
                  // Fallback to extracting from task runs in the detailed run
                  console.log(`[${this.requestId}] ⚠️ No task run IDs found, trying to extract from detailed run`);
                  const detailedRun = await this.getRunDetailsWithTasks(runId);
                  result = this.extractResultFromTaskRuns(detailedRun);
                }
                
                // If still no result, try the legacy approach as a last resort
                if (!result) {
                  console.log(`[${this.requestId}] ⚠️ No result from individual task runs, trying legacy approach`);
                  try {
                    // Try getting outputs for all task keys
                    const outputs = await this.getAllTaskOutputs(runId, taskKeys);
                    
                    // Find the first output with a result
                    for (const output of outputs) {
                      if (output && output.notebook_output && output.notebook_output.result) {
                        result = output.notebook_output.result;
                        break;
                      }
                    }
                  } catch (err) {
                    console.warn(`[${this.requestId}] ⚠️ Legacy approach also failed:`, err);
                  }
                }
                
                // If still no result, try alternative output retrieval methods
                if (!result) {
                  console.log(`[${this.requestId}] 🔄 Trying alternative output retrieval methods`);
                  result = await this.tryAlternativeOutputRetrieval(runId);
                }
              } catch (err) {
                const error = err as Error;
                console.warn(`[${this.requestId}] ❌ Failed to get task run details:`, error.message);
              }
            } else {
              // Fallback for jobs without explicit tasks
              console.log(`[${this.requestId}] 🔍 Attempting direct job output (no tasks found)`);
              try {
                const output = await this.getRunOutput(runId);
                result = output.notebook_output?.result;
              } catch (err) {
                const error = err as Error;
                console.warn(`[${this.requestId}] ⚠️ Direct job output failed:`, error.message);
                
                // Try alternative methods for single-task jobs too
                console.log(`[${this.requestId}] 🔄 Trying alternative output retrieval for single-task job`);
                result = await this.tryAlternativeOutputRetrieval(runId);
              }
            }

            if (result) {
              try {
                console.log(`[${this.requestId}] 🔍 Raw result from Databricks:`, result.substring(0, 500));
                const parsedResult = JSON.parse(result);
                console.log(`[${this.requestId}] ✅ Job ${runId} completed successfully with parsed result:`, parsedResult);
                return parsedResult;
              } catch (e) {
                console.error(`[${this.requestId}] ❌ Invalid JSON response from SmartBDX. Raw result:`, result);
                console.error(`[${this.requestId}] ❌ JSON parse error:`, e);
                
                // Try to return the raw result if it's not valid JSON
                if (typeof result === 'string' && result.trim()) {
                  console.log(`[${this.requestId}] 🔄 Attempting to return raw string result`);
                  return { success: true, data: result, raw_response: true };
                }
                
                throw new Error(`Invalid JSON response from SmartBDX: ${e}`);
              }
            }
            
            // If we reach here with a SUCCESS state but no result, log more details
            console.error(`[${this.requestId}] ❌ No valid output found for completed job ${runId}`);
            console.error(`[${this.requestId}] 🔍 Run details state:`, runDetails.state);
            console.error(`[${this.requestId}] 🔍 Task keys found:`, taskKeys);
            
            // Return a basic success response to avoid 500 error
            console.log(`[${this.requestId}] 🔄 Returning basic success response to avoid 500 error`);
            return {
              success: true,
              data: [],
              warning: 'Job completed successfully but no output was found in expected format',
              debug_info: {
                runId,
                state: runDetails.state,
                taskKeys
              }
            };
          } else {
            const errorMsg = runDetails.state.state_message || 'Unknown error';
            console.error(`[${this.requestId}] ❌ Job ${runId} failed:`, errorMsg);
            throw new Error(`SmartBDX operation failed: ${errorMsg}`);
          }
        } else if (state === 'INTERNAL_ERROR' || state === 'SKIPPED') {
          console.error(`[${this.requestId}] ❌ Job ${runId} error state:`, state);
          throw new Error(`SmartBDX operation error: ${state}`);
        }

        // Wait before next poll
        await new Promise(resolve => setTimeout(resolve, pollInterval));
      } catch (error) {
        if (error instanceof Error && error.message.includes('not found')) {
          console.warn(`[${this.requestId}] ⚠️ Job ${runId} not found, retrying...`);
          if(attempts > 3) { // If not found after 3 attempts, throw error
             throw new Error('Job not found after multiple attempts');
          }
        } else if (error instanceof Error && error.message.includes('SmartBDX')) {
          throw error; // Re-throw SmartBDX specific errors
        }
        
        console.warn(`[${this.requestId}] ⚠️ Error checking job status (attempt ${attempts}):`, error);
        // Add a small delay before retrying to avoid spamming the API
        await new Promise(resolve => setTimeout(resolve, pollInterval + Math.random() * 1000));
      }
    }

    // If we've reached the maximum number of attempts, throw timeout error
    if (attempts >= maxAttempts) {
      console.error(`[${this.requestId}] ❌ Maximum polling attempts (${maxAttempts}) reached`);
      throw new Error(`SmartBDX operation timeout after ${maxAttempts} attempts`);
    }
    
    // Otherwise, it's a genuine timeout
    throw new Error(`SmartBDX operation timeout after ${timeoutMs}ms`);
  }

  async executeOperation(operation: string, parameters: any = {}): Promise<any> {
    console.log(`[${this.requestId}] 🎯 Executing SmartBDX operation: ${operation}`, parameters);
    
    const jobResponse = await this.submitJob(operation, parameters);
    const result = await this.waitForCompletion(jobResponse.run_id);
    
    console.log(`[${this.requestId}] 🎉 Operation ${operation} completed successfully`);
    return result;
  }
  
  // Mock data removed - all operations must use real backend

  /**
   * NEW: Get single run status (wrapper for consistency)
   */
  async getSingleRunStatus(runId: string): Promise<any> {
    const numericRunId = parseInt(runId, 10);
    if (isNaN(numericRunId)) {
      throw new Error(`Invalid runId: ${runId}`);
    }
    return this.getRunStatus(numericRunId);
  }

  /**
   * NEW: Health check method to verify Databricks connectivity
   */
  async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy', message: string }> {
    try {
      // Try to get job details to verify connectivity
      await this.makeRequest(`/api/2.1/jobs/get?job_id=${this.jobId}`);
      return { status: 'healthy', message: 'Databricks connection is healthy' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { status: 'unhealthy', message: `Databricks connection failed: ${errorMessage}` };
    }
  }

  /**
   * NEW: Get job configuration
   */
  async getJobConfig(): Promise<any> {
    try {
      return await this.makeRequest(`/api/2.1/jobs/get?job_id=${this.jobId}`);
    } catch (error) {
      console.error(`[${this.requestId}] ❌ Error getting job configuration:`, error);
      throw error;
    }
  }

  /**
   * NEW: Cancel a running job
   */
  async cancelRun(runId: number): Promise<void> {
    try {
      await this.makeRequest('/api/2.1/jobs/runs/cancel', {
        method: 'POST',
        body: JSON.stringify({ run_id: runId })
      });
      console.log(`[${this.requestId}] ✅ Job run ${runId} cancelled successfully`);
    } catch (error) {
      console.error(`[${this.requestId}] ❌ Error cancelling job run ${runId}:`, error);
      throw error;
    }
  }

  /**
   * NEW: Get recent job runs
   */
  async getRecentRuns(limit: number = 25): Promise<any> {
    try {
      return await this.makeRequest(`/api/2.1/jobs/runs/list?job_id=${this.jobId}&limit=${limit}&run_type=JOB_RUN`);
    } catch (error) {
      console.error(`[${this.requestId}] ❌ Error getting recent runs:`, error);
      throw error;
    }
  }
}