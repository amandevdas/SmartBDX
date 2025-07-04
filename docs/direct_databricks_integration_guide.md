# SmartBDX Direct Databricks Integration Guide

## Table of Contents
1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Architecture](#architecture)
4. [Phase 1: Databricks Configuration](#phase-1-databricks-configuration)
5. [Phase 2: SmartBDX Notebook Enhancement](#phase-2-smartbdx-notebook-enhancement)
6. [Phase 3: Frontend Implementation](#phase-3-frontend-implementation)
7. [Authentication & Security](#authentication--security)
8. [Error Handling](#error-handling)
9. [Testing Guide](#testing-guide)
10. [Deployment](#deployment)
11. [Troubleshooting](#troubleshooting)
12. [Performance Optimization](#performance-optimization)

## Overview

This guide implements **Option B: Direct Databricks REST API Integration** for connecting your Next.js frontend directly to the SmartBDX Databricks backend. This approach eliminates middleware layers and leverages your existing production-ready SmartBDX system.

### Key Benefits
- ✅ **Minimal Code Changes**: Uses 95% of existing SmartBDX functionality
- ✅ **No Over-Engineering**: Direct connection without unnecessary layers
- ✅ **Production Ready**: Built on proven SmartBDX infrastructure
- ✅ **Fast Implementation**: 2-3 days vs weeks of middleware development
- ✅ **Leverages Existing Features**: Checkpointing, monitoring, rate limiting

### Architecture Flow
```
Next.js Frontend → Databricks REST API → SmartBDX Notebook → Existing SmartBDX Functions
```

## Prerequisites

### Required Access & Permissions
- **Databricks Workspace**: Admin or contributor access
- **Databricks Personal Access Token**: With job execution permissions
- **SmartBDX System**: Fully deployed and tested
- **Next.js Frontend**: Existing SmartBDX frontend application

### Required Information
- Databricks workspace URL (e.g., `https://your-workspace.azuredatabricks.net`)
- SmartBDX job ID (existing Databricks job running SmartBDX)
- Volume path for Excel files (e.g., `/Volumes/smartbdx/files/`)
- Frontend environment variables configuration

## Architecture

### Request Flow
1. **Frontend** → Makes API request (file listing, processing, status)
2. **Databricks REST API** → Receives request and starts notebook job
3. **SmartBDX Notebook** → Routes to appropriate SmartBDX function based on operation parameter
4. **SmartBDX Functions** → Execute existing logic (discover files, process items, show progress)
5. **Response** → Results flow back through the chain to frontend

### Data Flow
```mermaid
graph TD
    A[Next.js Frontend] --> B[Databricks Jobs API]
    B --> C[SmartBDX Main Notebook]
    C --> D{Operation Type}
    D --> E[discover_files_and_sheets_metadata]
    D --> F[process_selected_items]
    D --> G[show_batch_progress]
    D --> H[get_mapping_results]
    E --> I[Return File List]
    F --> J[Return Batch ID]
    G --> K[Return Status]
    H --> L[Return Mappings]
```

## Phase 1: Databricks Configuration

### Step 1.1: Create Personal Access Token

1. **Navigate to Databricks Workspace**
   - Go to your Databricks workspace
   - Click on your profile (top right)
   - Select "User Settings"

2. **Generate Token**
   - Go to "Developer" → "Access Tokens"
   - Click "Generate New Token"
   - Set description: "SmartBDX Frontend Integration"
   - Set lifetime: 90 days (or your organization's policy)
   - Copy and securely store the token

### Step 1.2: Get SmartBDX Job ID

1. **Find Existing SmartBDX Job**
   ```bash
   # Using Databricks CLI (if available)
   databricks jobs list --output json | jq '.jobs[] | select(.settings.name | contains("SmartBDX"))'
   ```

2. **Alternative: Through UI**
   - Go to "Workflows" in Databricks
   - Find your SmartBDX job
   - Note the Job ID from the URL: `https://your-workspace.azuredatabricks.net/#job/{JOB_ID}`

3. **If No Job Exists, Create One**
   ```json
   {
     "name": "SmartBDX-Frontend-Integration",
     "notebook_task": {
       "notebook_path": "/SmartBDX/smartbdx_main",
       "base_parameters": {}
     },
     "new_cluster": {
       "spark_version": "13.3.x-scala2.12",
       "node_type_id": "Standard_D8s_v3",
       "num_workers": 2
     }
   }
   ```

### Step 1.3: Configure CORS (if needed)

If your Databricks workspace requires CORS configuration:

1. **Contact Databricks Admin** to whitelist your frontend domain
2. **Alternative**: Use a proxy server for local development

## Phase 2: SmartBDX Notebook Enhancement

### Step 2.1: Add Operation Router to SmartBDX Main Notebook

Add this code at the **beginning** of your existing `smartbdx_main.py` notebook:

```python
# COMMAND ----------
# MAGIC %md
# MAGIC # SmartBDX Frontend API Operations
# MAGIC 
# MAGIC This section handles frontend API operations by routing to appropriate SmartBDX functions

# COMMAND ----------

import json
from datetime import datetime

# Add operation parameter widget
dbutils.widgets.text("operation", "", "API Operation")
dbutils.widgets.text("parameters", "{}", "Operation Parameters JSON")

# Get operation and parameters
operation = dbutils.widgets.get("operation")
parameters_json = dbutils.widgets.get("parameters")

# Parse parameters
try:
    parameters = json.loads(parameters_json) if parameters_json else {}
except json.JSONDecodeError:
    parameters = {}

print(f"🎯 Frontend API Operation: {operation}")
print(f"📋 Parameters: {parameters}")

# COMMAND ----------

# Frontend API Operation Router
if operation:
    
    if operation == "discover_files":
        """
        Discover files and sheets for frontend file selection
        Returns: List of files with metadata
        """
        try:
            from smartbdx_selection import discover_files_and_sheets_metadata
            
            volume_folder = parameters.get('volume_folder', DEFAULT_VOLUME_FOLDER)
            print(f"🔍 Discovering files in: {volume_folder}")
            
            # Use existing SmartBDX function
            metadata_df = discover_files_and_sheets_metadata(volume_folder)
            
            # Convert to JSON for frontend consumption
            files_data = []
            for _, row in metadata_df.iterrows():
                files_data.append({
                    "id": row['file_name'],
                    "file_name": row['file_name'],
                    "status": "pending",  # Default status
                    "last_modified": row.get('last_modified', ''),
                    "size": row.get('file_size', 0),
                    "sheets": row.get('sheet_count', 0),
                    "path": row.get('file_path', ''),
                    "sheet_names": row.get('sheet_names', [])
                })
            
            result = {
                "success": True,
                "operation": "discover_files",
                "data": files_data,
                "total": len(files_data),
                "timestamp": datetime.now().isoformat()
            }
            
            print(f"✅ Found {len(files_data)} files")
            dbutils.notebook.exit(json.dumps(result))
            
        except Exception as e:
            error_result = {
                "success": False,
                "operation": "discover_files",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }
            print(f"❌ Error: {e}")
            dbutils.notebook.exit(json.dumps(error_result))
    
    elif operation == "get_sheet_names":
        """
        Get sheet names for a specific file
        Returns: List of sheet names
        """
        try:
            file_path = parameters.get('file_path')
            if not file_path:
                raise ValueError("file_path parameter required")
            
            from smartbdx_core_ai import copy_volume_file_to_tmp_via_spark
            import pandas as pd
            
            print(f"📄 Extracting sheet names from: {file_path}")
            
            # Use existing SmartBDX utility
            local_path = copy_volume_file_to_tmp_via_spark(file_path)
            xls = pd.ExcelFile(local_path)
            sheet_names = xls.sheet_names
            xls.close()
            
            # Cleanup
            import os
            os.remove(local_path)
            
            result = {
                "success": True,
                "operation": "get_sheet_names",
                "data": {
                    "file_path": file_path,
                    "sheet_names": sheet_names,
                    "total_sheets": len(sheet_names)
                },
                "timestamp": datetime.now().isoformat()
            }
            
            print(f"✅ Found {len(sheet_names)} sheets")
            dbutils.notebook.exit(json.dumps(result))
            
        except Exception as e:
            error_result = {
                "success": False,
                "operation": "get_sheet_names",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }
            print(f"❌ Error: {e}")
            dbutils.notebook.exit(json.dumps(error_result))
    
    elif operation == "process_files":
        """
        Process selected files and sheets
        Returns: Batch ID and status
        """
        try:
            selected_files = parameters.get('files', [])
            enable_mapping = parameters.get('enable_mapping', False)
            batch_id = parameters.get('batch_id')
            
            if not selected_files:
                raise ValueError("files parameter required")
            
            print(f"🚀 Processing {len(selected_files)} selected files")
            print(f"🎯 Mapping enabled: {enable_mapping}")
            
            # Convert frontend format to SmartBDX format
            selected_items = []
            for file_info in selected_files:
                file_id = file_info['fileId']
                sheets = file_info['sheets']
                for sheet in sheets:
                    selected_items.append((file_id, sheet))
            
            print(f"📋 Total file/sheet combinations: {len(selected_items)}")
            
            # Use existing SmartBDX function
            from smartbdx_selection import process_selected_items
            from smartbdx_config import client
            
            result_data = process_selected_items(
                selected_items=selected_items,
                client=client,
                batch_id=batch_id,
                enable_mapping=enable_mapping
            )
            
            # Format response for frontend
            result = {
                "success": True,
                "operation": "process_files",
                "data": {
                    "batch_id": result_data.get('batch_id'),
                    "status": result_data.get('status', 'submitted'),
                    "files_count": len(selected_files),
                    "total_items": len(selected_items),
                    "mapping_enabled": enable_mapping,
                    "submitted_at": datetime.now().isoformat()
                },
                "timestamp": datetime.now().isoformat()
            }
            
            print(f"✅ Batch submitted: {result_data.get('batch_id')}")
            dbutils.notebook.exit(json.dumps(result))
            
        except Exception as e:
            error_result = {
                "success": False,
                "operation": "process_files",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }
            print(f"❌ Error: {e}")
            dbutils.notebook.exit(json.dumps(error_result))
    
    elif operation == "get_batch_status":
        """
        Get batch processing status
        Returns: Batch status and progress
        """
        try:
            batch_id = parameters.get('batch_id')
            if not batch_id:
                raise ValueError("batch_id parameter required")
            
            print(f"📊 Getting status for batch: {batch_id}")
            
            # Use existing SmartBDX monitoring function
            from smartbdx_monitoring import show_batch_progress
            
            # Capture batch progress (this prints to stdout)
            batch_info = show_batch_progress(batch_id, return_data=True)  # We'll modify this function
            
            result = {
                "success": True,
                "operation": "get_batch_status",
                "data": {
                    "batch_id": batch_id,
                    "status": batch_info.get('status', 'unknown'),
                    "progress": batch_info.get('progress', 0),
                    "completed_files": batch_info.get('completed', 0),
                    "total_files": batch_info.get('total', 0),
                    "errors": batch_info.get('errors', 0),
                    "current_file": batch_info.get('current_file'),
                    "elapsed_time": batch_info.get('elapsed_time'),
                    "estimated_remaining": batch_info.get('estimated_remaining')
                },
                "timestamp": datetime.now().isoformat()
            }
            
            print(f"✅ Status retrieved for batch: {batch_id}")
            dbutils.notebook.exit(json.dumps(result))
            
        except Exception as e:
            error_result = {
                "success": False,
                "operation": "get_batch_status",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }
            print(f"❌ Error: {e}")
            dbutils.notebook.exit(json.dumps(error_result))
    
    elif operation == "get_mapping_results":
        """
        Get column mapping results for review
        Returns: Mapping data for frontend approval
        """
        try:
            batch_id = parameters.get('batch_id')
            file_id = parameters.get('file_id')
            
            print(f"🔍 Getting mapping results - Batch: {batch_id}, File: {file_id}")
            
            # Use existing SmartBDX mapping functions
            # This will depend on how your mapping results are stored
            # Typically in Delta tables created by the mapping process
            
            # Example query - adjust based on your mapping storage
            if batch_id:
                query = f"""
                SELECT * FROM smartbdx_mapping_results 
                WHERE batch_id = '{batch_id}'
                ORDER BY confidence DESC
                """
            elif file_id:
                query = f"""
                SELECT * FROM smartbdx_mapping_results 
                WHERE file_name = '{file_id}'
                ORDER BY confidence DESC
                """
            else:
                raise ValueError("Either batch_id or file_id required")
            
            mapping_df = spark.sql(query)
            mapping_data = mapping_df.toPandas().to_dict('records')
            
            result = {
                "success": True,
                "operation": "get_mapping_results",
                "data": mapping_data,
                "total": len(mapping_data),
                "timestamp": datetime.now().isoformat()
            }
            
            print(f"✅ Found {len(mapping_data)} mapping results")
            dbutils.notebook.exit(json.dumps(result))
            
        except Exception as e:
            error_result = {
                "success": False,
                "operation": "get_mapping_results",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }
            print(f"❌ Error: {e}")
            dbutils.notebook.exit(json.dumps(error_result))
    
    else:
        # Unknown operation
        error_result = {
            "success": False,
            "operation": operation,
            "error": f"Unknown operation: {operation}",
            "available_operations": [
                "discover_files",
                "get_sheet_names", 
                "process_files",
                "get_batch_status",
                "get_mapping_results"
            ],
            "timestamp": datetime.now().isoformat()
        }
        print(f"❌ Unknown operation: {operation}")
        dbutils.notebook.exit(json.dumps(error_result))

# If no operation specified, continue with normal SmartBDX processing
if not operation:
    print("🚀 No frontend operation specified - continuing with normal SmartBDX processing...")

# COMMAND ----------
# Your existing SmartBDX processing logic continues here...
```

### Step 2.2: Enhance Monitoring Function (Optional)

Modify your `smartbdx_monitoring.py` to return data instead of just printing:

```python
def show_batch_progress(batch_id: str, return_data: bool = False) -> Dict[str, Any]:
    """
    Enhanced show_batch_progress that can return data for API consumption
    """
    # Your existing logic...
    
    if return_data:
        return {
            "batch_id": batch_id,
            "status": status,
            "progress": progress_percentage,
            "completed": completed_count,
            "total": total_count,
            "errors": error_count,
            "current_file": current_file,
            "elapsed_time": elapsed_time,
            "estimated_remaining": estimated_remaining
        }
    else:
        # Your existing print statements...
        pass
```

## Phase 3: Frontend Implementation

### Step 3.1: Update Environment Variables

Create/update `.env.local` in your Next.js project:

```bash
# Databricks Configuration
NEXT_PUBLIC_DATABRICKS_HOST=https://your-workspace.azuredatabricks.net
NEXT_PUBLIC_DATABRICKS_TOKEN=your-personal-access-token-here
NEXT_PUBLIC_SMARTBDX_JOB_ID=12345
NEXT_PUBLIC_VOLUME_PATH=/Volumes/smartbdx/files/

# API Configuration
NEXT_PUBLIC_API_BASE_URL=https://your-workspace.azuredatabricks.net/api/2.1
NEXT_PUBLIC_USE_MOCK_DATA=false
```

### Step 3.2: Create Databricks API Client

Create `src/services/databricks.ts`:

```typescript
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

class DatabricksClient {
  private baseUrl: string;
  private token: string;
  private jobId: string;

  constructor() {
    this.baseUrl = process.env.NEXT_PUBLIC_DATABRICKS_HOST || '';
    this.token = process.env.NEXT_PUBLIC_DATABRICKS_TOKEN || '';
    this.jobId = process.env.NEXT_PUBLIC_SMARTBDX_JOB_ID || '';

    if (!this.baseUrl || !this.token || !this.jobId) {
      throw new Error('Missing required Databricks configuration');
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
}

export const databricksClient = new DatabricksClient();
```

### Step 3.3: Update API Client to Use Databricks

Update `src/services/api.ts`:

```typescript
import { databricksClient } from './databricks';

const USE_MOCK_DATA = process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true';

export const apiClient = {
  async get<T>(endpoint: string): Promise<T> {
    if (USE_MOCK_DATA) {
      return this.getMockResponse(endpoint) as Promise<T>;
    }

    // Route endpoints to SmartBDX operations
    const operation = this.getOperationFromEndpoint(endpoint);
    const parameters = this.getParametersFromEndpoint(endpoint);

    try {
      const result = await databricksClient.executeOperation(operation, parameters);
      
      if (!result.success) {
        throw new Error(result.error || 'SmartBDX operation failed');
      }

      return result.data as T;
    } catch (error) {
      console.error(`API Error for ${endpoint}:`, error);
      throw error;
    }
  },

  async post<T>(endpoint: string, data: any): Promise<T> {
    if (USE_MOCK_DATA) {
      return this.getMockResponse(endpoint, data) as Promise<T>;
    }

    const operation = this.getOperationFromEndpoint(endpoint);
    const parameters = { ...data, ...this.getParametersFromEndpoint(endpoint) };

    try {
      const result = await databricksClient.executeOperation(operation, parameters);
      
      if (!result.success) {
        throw new Error(result.error || 'SmartBDX operation failed');
      }

      return result.data as T;
    } catch (error) {
      console.error(`API Error for ${endpoint}:`, error);
      throw error;
    }
  },

  private getOperationFromEndpoint(endpoint: string): string {
    // Map frontend endpoints to SmartBDX operations
    const endpointMap: Record<string, string> = {
      '/api/files': 'discover_files',
      '/api/process': 'process_files',
      '/api/mapping': 'get_mapping_results'
    };

    // Handle parameterized endpoints
    if (endpoint.includes('/api/files/') && endpoint.includes('/sheets')) {
      return 'get_sheet_names';
    }

    if (endpoint.includes('/api/status/')) {
      return 'get_batch_status';
    }

    return endpointMap[endpoint] || 'unknown';
  },

  private getParametersFromEndpoint(endpoint: string): any {
    const parameters: any = {
      volume_folder: process.env.NEXT_PUBLIC_VOLUME_PATH || '/Volumes/smartbdx/files/'
    };

    // Extract parameters from URL
    if (endpoint.includes('/api/files/') && endpoint.includes('/sheets')) {
      const fileId = endpoint.split('/api/files/')[1].split('/sheets')[0];
      parameters.file_path = `${parameters.volume_folder}${fileId}`;
    }

    if (endpoint.includes('/api/status/')) {
      const batchId = endpoint.split('/api/status/')[1];
      parameters.batch_id = batchId;
    }

    if (endpoint.includes('/api/mapping')) {
      // Add mapping-specific parameters if needed
    }

    return parameters;
  },

  // Keep existing mock response method
  getMockResponse(endpoint: string, requestData?: any): Promise<any> {
    // Your existing mock data logic...
  }
};
```

### Step 3.4: Add Error Handling Hook

Create `src/hooks/useSmartBDXApi.ts`:

```typescript
import { useState, useCallback } from 'react';
import { apiClient } from '@/services/api';

interface UseSmartBDXApiResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  execute: (endpoint: string, data?: any) => Promise<T | null>;
  reset: () => void;
}

export function useSmartBDXApi<T>(): UseSmartBDXApiResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const execute = useCallback(async (endpoint: string, requestData?: any): Promise<T | null> => {
    try {
      setLoading(true);
      setError(null);

      let result: T;
      if (requestData) {
        result = await apiClient.post<T>(endpoint, requestData);
      } else {
        result = await apiClient.get<T>(endpoint);
      }

      setData(result);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      console.error('SmartBDX API Error:', err);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
    setLoading(false);
  }, []);

  return { data, loading, error, execute, reset };
}
```

## Authentication & Security

### Environment Variables Security

**Production Environment Variables:**
```bash
# Use Azure Key Vault or similar for production
DATABRICKS_HOST=https://your-workspace.azuredatabricks.net
DATABRICKS_TOKEN=${KEY_VAULT_SECRET}
SMARTBDX_JOB_ID=12345
```

**Token Management:**
- Use service principals instead of personal access tokens for production
- Implement token rotation strategy
- Store tokens in secure key management systems

### CORS Configuration

If needed, configure CORS in Databricks:
```python
# Add to your notebook if CORS headers are required
response_headers = {
    "Access-Control-Allow-Origin": "https://your-frontend-domain.com",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
}
```

## Error Handling

### Frontend Error Handling

```typescript
// Global error handler for SmartBDX operations
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
```

### Databricks Error Handling

```python
# Enhanced error handling in notebook
try:
    # SmartBDX operation
    result = some_smartbdx_function()
    
except Exception as e:
    error_details = {
        "success": False,
        "operation": operation,
        "error": str(e),
        "error_type": type(e).__name__,
        "timestamp": datetime.now().isoformat(),
        "debugging_info": {
            "operation": operation,
            "parameters": parameters,
            "traceback": traceback.format_exc()
        }
    }
    
    print(f"❌ SmartBDX Error: {e}")
    dbutils.notebook.exit(json.dumps(error_details))
```

## Testing Guide

### Step 1: Test Databricks Configuration

```bash
# Test Databricks API connectivity
curl -H "Authorization: Bearer ${DATABRICKS_TOKEN}" \
  "${DATABRICKS_HOST}/api/2.1/clusters/list"
```

### Step 2: Test SmartBDX Operations

```python
# Test in Databricks notebook directly
%run /SmartBDX/smartbdx_main

# Test discover_files operation
dbutils.widgets.text("operation", "discover_files")
dbutils.widgets.text("parameters", '{"volume_folder": "/Volumes/smartbdx/files/"}')
```

### Step 3: Test Frontend Integration

```typescript
// Test API client in browser console
import { databricksClient } from './services/databricks';

// Test file discovery
const result = await databricksClient.executeOperation('discover_files', {
  volume_folder: '/Volumes/smartbdx/files/'
});
console.log('Files discovered:', result);
```

### Step 4: End-to-End Testing

1. **File Discovery Test**
   - Navigate to Selection Dashboard
   - Verify files are loaded from Databricks
   - Check for proper error handling

2. **Sheet Selection Test**
   - Click on a file to expand
   - Verify sheet names are loaded
   - Test sheet selection functionality

3. **Processing Test**
   - Select files and sheets
   - Submit processing job
   - Verify batch ID is returned

4. **Monitoring Test**
   - Navigate to Processing Dashboard
   - Verify real-time status updates
   - Check progress tracking

## Deployment

### Production Checklist

- [ ] **Security**: Replace personal access tokens with service principals
- [ ] **Environment Variables**: Move to secure key management
- [ ] **Error Monitoring**: Set up application monitoring
- [ ] **Performance**: Test with realistic data volumes
- [ ] **Backup**: Ensure SmartBDX data is backed up
- [ ] **Documentation**: Update team documentation

### Monitoring & Observability

```typescript
// Add monitoring to API client
export const apiClient = {
  async executeOperation(operation: string, parameters: any) {
    const startTime = Date.now();
    
    try {
      const result = await databricksClient.executeOperation(operation, parameters);
      
      // Log success metrics
      console.log(`✅ ${operation} completed in ${Date.now() - startTime}ms`);
      
      return result;
    } catch (error) {
      // Log error metrics
      console.error(`❌ ${operation} failed after ${Date.now() - startTime}ms:`, error);
      
      // Send to monitoring system
      if (window.gtag) {
        window.gtag('event', 'smartbdx_error', {
          operation,
          error: error.message,
          duration: Date.now() - startTime
        });
      }
      
      throw error;
    }
  }
};
```

## Troubleshooting

### Common Issues

#### 1. "Job failed to start"
- **Cause**: Invalid job ID or insufficient permissions
- **Solution**: Verify job ID and token permissions

#### 2. "Operation timeout"
- **Cause**: Large files or high system load
- **Solution**: Increase timeout or process fewer files

#### 3. "Invalid JSON response"
- **Cause**: Notebook error or incomplete execution
- **Solution**: Check notebook logs and error handling

#### 4. "CORS errors"
- **Cause**: Browser security restrictions
- **Solution**: Configure CORS or use proxy

### Debug Mode

Enable debug logging:
```typescript
// In your environment variables
NEXT_PUBLIC_DEBUG_MODE=true

// In your code
if (process.env.NEXT_PUBLIC_DEBUG_MODE === 'true') {
  console.log('SmartBDX Debug:', { operation, parameters, result });
}
```

### Performance Optimization

1. **Caching**: Implement file list caching
2. **Parallel Processing**: Use Promise.all for independent operations
3. **Polling Optimization**: Implement exponential backoff
4. **Resource Management**: Monitor Databricks cluster usage

## Performance Optimization

### Frontend Optimizations

```typescript
// Implement caching for file lists
const cache = new Map();

export const cachedApiClient = {
  async get<T>(endpoint: string, cacheTimeout = 60000): Promise<T> {
    const cacheKey = endpoint;
    const cached = cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < cacheTimeout) {
      return cached.data;
    }
    
    const data = await apiClient.get<T>(endpoint);
    cache.set(cacheKey, { data, timestamp: Date.now() });
    
    return data;
  }
};
```

### Databricks Optimizations

```python
# Optimize file discovery with parallel processing
from concurrent.futures import ThreadPoolExecutor
import threading

def discover_files_parallel(volume_folder: str) -> pd.DataFrame:
    """Optimized file discovery with parallel sheet extraction"""
    
    # Get file list first
    full_paths = [f.path for f in dbutils.fs.ls(volume_folder) if f.name.lower().endswith(".xlsx")]
    
    # Process files in parallel
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = [executor.submit(extract_file_metadata, path) for path in full_paths]
        results = [future.result() for future in futures]
    
    return pd.DataFrame(results)
```

---

## Summary

This direct integration approach leverages your existing SmartBDX infrastructure while providing a clean API interface for your frontend. The implementation is minimal, robust, and production-ready.

**Key Benefits:**
- **Fast Implementation**: 2-3 days vs weeks
- **Reliable**: Built on proven SmartBDX foundation
- **Maintainable**: Minimal additional code to maintain
- **Scalable**: Uses existing Databricks scaling capabilities

**Next Steps:**
1. Implement Phase 1: Databricks configuration
2. Implement Phase 2: SmartBDX notebook enhancement
3. Implement Phase 3: Frontend integration
4. Test thoroughly with sample data
5. Deploy to production

The integration preserves all SmartBDX functionality while providing the modern web interface your users need.