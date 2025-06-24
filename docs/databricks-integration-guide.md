# Step-by-Step Guide: Connecting SmartBDX Frontend to Databricks for Direct File and Sheet Selection

This guide provides detailed instructions for implementing the connection between your SmartBDX Next.js frontend and Databricks backend, focusing specifically on direct file and sheet selection functionality without preview. This approach streamlines the user experience by allowing users to select specific sheets for processing without generating previews first.

## 1. Setting Up Azure Function API Layer

### 1.1 Create Azure Function App and Required Endpoints

The following endpoints will be implemented:
- `listFiles`: Lists all available files from Azure Blob Storage
- `getSheetNames`: Extracts sheet names from an Excel file
- `processFiles`: Submits processing jobs to Databricks

```bash
# Install Azure Functions Core Tools if not already installed
npm install -g azure-functions-core-tools@4

# Create a new Function App project
mkdir smartbdx-api
cd smartbdx-api
func init --typescript

# Add required dependencies
npm install @azure/storage-blob @azure/cosmos @azure/identity axios exceljs
```

### 1.2 Implement File Listing API

Create a new HTTP-triggered function to list files from Azure Blob Storage:

```typescript
// listFiles/index.ts
import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import { BlobServiceClient } from "@azure/storage-blob";

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
  try {
    // Get connection string from environment variables
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const containerName = process.env.BLOB_CONTAINER_NAME || "bordereaux";
    
    // Create BlobServiceClient
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(containerName);
    
    // List blobs with metadata
    const fileList = [];
    for await (const blob of containerClient.listBlobsFlat()) {
      const blobClient = containerClient.getBlobClient(blob.name);
      const properties = await blobClient.getProperties();
      
      fileList.push({
        id: blob.name,
        file_name: blob.name,
        status: "pending", // Default status, will be updated with Databricks status
        last_modified: properties.lastModified,
        size: properties.contentLength,
        sheets: 0, // Will be populated when expanded
        url: blobClient.url
      });
    }
    
    context.res = {
      status: 200,
      body: fileList,
      headers: {
        'Content-Type': 'application/json'
      }
    };
  } catch (error) {
    context.log.error("Error listing files:", error);
    context.res = {
      status: 500,
      body: { error: "Failed to list files" }
    };
  }
};

export default httpTrigger;
```

### 1.3 Implement Sheet Names API

Create a function to extract sheet names from Excel files without generating previews:

```typescript
// getSheetNames/index.ts
import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import { BlobServiceClient } from "@azure/storage-blob";
import * as ExcelJS from 'exceljs';

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
  try {
    const fileId = context.bindingData.fileId;
    if (!fileId) {
      context.res = {
        status: 400,
        body: { error: "File ID is required" }
      };
      return;
    }
    
    // Get connection string from environment variables
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const containerName = process.env.BLOB_CONTAINER_NAME || "bordereaux";
    
    // Create BlobServiceClient
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(containerName);
    const blobClient = containerClient.getBlobClient(fileId);
    
    // Download blob to memory
    const downloadResponse = await blobClient.download();
    const readableStream = downloadResponse.readableStreamBody;
    
    // Convert stream to buffer
    const chunks = [];
    for await (const chunk of readableStream) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    
    // Use ExcelJS to read the file
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    
    // Extract sheet names
    const sheetNames = workbook.worksheets.map(sheet => sheet.name);
    
    context.res = {
      status: 200,
      body: {
        id: fileId,
        file_name: fileId,
        sheets: sheetNames.length,
        sheetNames: sheetNames
      },
      headers: {
        'Content-Type': 'application/json'
      }
    };
    
    // Note: We're only returning sheet names without any preview data
  } catch (error) {
    context.log.error("Error extracting sheet names:", error);
    context.res = {
      status: 500,
      body: { error: "Failed to extract sheet names" }
    };
  }
};

export default httpTrigger;
```

Add a function.json configuration for the getSheetNames endpoint:

```json
// getSheetNames/function.json
{
  "bindings": [
    {
      "authLevel": "function",
      "type": "httpTrigger",
      "direction": "in",
      "name": "req",
      "methods": ["get"],
      "route": "files/{fileId}/sheets"
    },
    {
      "type": "http",
      "direction": "out",
      "name": "res"
    }
  ]
}
```

### 1.4 Implement Databricks Job Submission API

Create a function to submit processing jobs to Databricks:

```typescript
// processFiles/index.ts
import { AzureFunction, Context, HttpRequest } from "@azure/functions";
import axios from "axios";
import { CosmosClient } from "@azure/cosmos";

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
  try {
    // Validate request body
    const files = req.body?.files;
    if (!files || !Array.isArray(files)) {
      context.res = {
        status: 400,
        body: { error: "Invalid request body. Expected 'files' array." }
      };
      return;
    }
    
    // Databricks API configuration
    const databricksWorkspace = process.env.DATABRICKS_WORKSPACE_URL;
    const databricksToken = process.env.DATABRICKS_API_TOKEN;
    const notebookPath = process.env.DATABRICKS_NOTEBOOK_PATH || "/SmartBDX/ProcessFiles";
    
    // Cosmos DB configuration
    const cosmosEndpoint = process.env.COSMOS_DB_ENDPOINT;
    const cosmosKey = process.env.COSMOS_DB_KEY;
    const cosmosDatabase = process.env.COSMOS_DB_DATABASE || "smartbdx";
    const cosmosContainer = process.env.COSMOS_DB_CONTAINER || "jobs";
    
    // Create Cosmos client
    const cosmosClient = new CosmosClient({ endpoint: cosmosEndpoint, key: cosmosKey });
    const database = cosmosClient.database(cosmosDatabase);
    const container = database.container(cosmosContainer);
    
    // Create job record in Cosmos DB
    const jobId = `job-${Date.now()}`;
    const jobRecord = {
      id: jobId,
      status: "submitted",
      files: files,
      startTime: new Date().toISOString(),
      completedFiles: 0,
      totalFiles: files.length,
      errors: 0
    };
    
    await container.items.create(jobRecord);
    
    // Submit job to Databricks
    const response = await axios.post(
      `${databricksWorkspace}/api/2.0/jobs/runs/submit`,
      {
        run_name: `SmartBDX Processing Job ${jobId}`,
        notebook_task: {
          notebook_path: notebookPath,
          base_parameters: {
            job_id: jobId,
            files: JSON.stringify(files)
          }
        },
        new_cluster: {
          spark_version: "10.4.x-scala2.12",
          node_type_id: "Standard_DS3_v2",
          num_workers: 2,
          spark_conf: {
            "spark.speculation": "true"
          }
        }
      },
      {
        headers: {
          "Authorization": `Bearer ${databricksToken}`,
          "Content-Type": "application/json"
        }
      }
    );
    
    // Update job record with Databricks run ID
    await container.item(jobId, jobId).patch([
      { op: "add", path: "/databricksRunId", value: response.data.run_id }
    ]);
    
    context.res = {
      status: 200,
      body: {
        jobId: jobId,
        status: "submitted",
        message: "Processing job submitted successfully"
      }
    };
  } catch (error) {
    context.log.error("Error submitting job:", error);
    context.res = {
      status: 500,
      body: { error: "Failed to submit processing job" }
    };
  }
};

export default httpTrigger;
```

## 2. Setting Up Databricks Notebooks

### 2.1 Create Main Processing Notebook

In Databricks, create a new notebook called `ProcessFiles` with the following content:

```python
# Databricks notebook source
# COMMAND ----------

# Import required libraries
import os
import json
import time
import pandas as pd
from concurrent.futures import ThreadPoolExecutor
from azure.cosmos import CosmosClient
from azure.storage.blob import BlobServiceClient

# COMMAND ----------

# Get parameters
dbutils.widgets.text("job_id", "", "Job ID")
dbutils.widgets.text("files", "", "Files JSON")

job_id = dbutils.widgets.get("job_id")
files_json = dbutils.widgets.get("files")

# Parse files JSON
files = json.loads(files_json)

# COMMAND ----------

# Configure Azure services
storage_connection_string = dbutils.secrets.get(scope="smartbdx", key="storage-connection-string")
cosmos_endpoint = dbutils.secrets.get(scope="smartbdx", key="cosmos-endpoint")
cosmos_key = dbutils.secrets.get(scope="smartbdx", key="cosmos-key")
cosmos_database = "smartbdx"
cosmos_container = "jobs"
blob_container = "bordereaux"

# Initialize clients
blob_service_client = BlobServiceClient.from_connection_string(storage_connection_string)
container_client = blob_service_client.get_container_client(blob_container)
cosmos_client = CosmosClient(cosmos_endpoint, cosmos_key)
database = cosmos_client.get_database_client(cosmos_database)
container = database.get_container_client(cosmos_container)

# COMMAND ----------

# Update job status to "processing"
container.upsert_item({
  "id": job_id,
  "status": "processing",
  "processingStartTime": time.time()
})

# COMMAND ----------

# Function to process a single file
def process_file(file_info):
  try:
    file_id = file_info["fileId"]
    selected_sheets = file_info.get("sheets", [])
    
    # Download file from Blob Storage
    blob_client = container_client.get_blob_client(file_id)
    download_stream = blob_client.download_blob()
    file_content = download_stream.readall()
    
    # Process file based on selected sheets
    if selected_sheets:
      # Read only selected sheets
      dfs = {}
      for sheet in selected_sheets:
        dfs[sheet] = pd.read_excel(file_content, sheet_name=sheet)
    else:
      # Read all sheets
      dfs = pd.read_excel(file_content, sheet_name=None)
    
    # Process each sheet (implement your SmartBDX logic here)
    results = {}
    for sheet_name, df in dfs.items():
      # Example processing - replace with your actual processing logic
      # Clean data
      df = df.fillna("")
      
      # Extract headers
      headers = df.columns.tolist()
      
      # Process data (placeholder for your actual processing)
      processed_data = {
        "rowCount": len(df),
        "columnCount": len(headers),
        "headers": headers,
        "sample": df.head(5).to_dict(orient="records")
      }
      
      results[sheet_name] = processed_data
    
    # Store results in Cosmos DB
    result_id = f"{job_id}-{file_id}"
    container.upsert_item({
      "id": result_id,
      "jobId": job_id,
      "fileId": file_id,
      "status": "completed",
      "results": results,
      "processedAt": time.time()
    })
    
    # Update job status
    query = f"SELECT * FROM c WHERE c.id = '{job_id}'"
    job = list(container.query_items(query=query, enable_cross_partition_query=True))[0]
    
    job["completedFiles"] += 1
    container.upsert_item(job)
    
    return {"fileId": file_id, "status": "completed"}
  except Exception as e:
    # Log error and update job status
    error_message = str(e)
    print(f"Error processing file {file_id}: {error_message}")
    
    # Update job error count
    query = f"SELECT * FROM c WHERE c.id = '{job_id}'"
    job = list(container.query_items(query=query, enable_cross_partition_query=True))[0]
    
    job["errors"] += 1
    container.upsert_item(job)
    
    # Store error in Cosmos DB
    result_id = f"{job_id}-{file_id}"
    container.upsert_item({
      "id": result_id,
      "jobId": job_id,
      "fileId": file_id,
      "status": "failed",
      "error": error_message,
      "processedAt": time.time()
    })
    
    return {"fileId": file_id, "status": "failed", "error": error_message}

# COMMAND ----------

# Process files in parallel
max_workers = min(10, len(files))  # Limit to 10 parallel workers
results = []

with ThreadPoolExecutor(max_workers=max_workers) as executor:
  future_to_file = {executor.submit(process_file, file): file for file in files}
  for future in future_to_file:
    try:
      result = future.result()
      results.append(result)
    except Exception as e:
      file = future_to_file[future]
      results.append({"fileId": file["fileId"], "status": "failed", "error": str(e)})

# COMMAND ----------

# Update job status to "completed"
query = f"SELECT * FROM c WHERE c.id = '{job_id}'"
job = list(container.query_items(query=query, enable_cross_partition_query=True))[0]

job["status"] = "completed" if job["errors"] == 0 else "completed_with_errors"
job["endTime"] = time.time()
job["processingTime"] = job["endTime"] - job.get("processingStartTime", job["endTime"])
job["results"] = results

container.upsert_item(job)

print(f"Job {job_id} completed with {job['errors']} errors")
```

## 3. Implementing Frontend Integration

### 3.1 Create API Service in Frontend with Sheet Selection Support

Create a new file `src/services/databricks.ts`:

```typescript
// src/services/databricks.ts
import { api } from './api';

export interface FileMeta {
  id: string;
  file_name: string;
  status: "pending" | "processing" | "completed" | "failed";
  last_modified: string;
  size: number;
  sheets: number;
  sheetNames?: string[];
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
  jobId: string;
  status: "submitted" | "processing" | "completed" | "completed_with_errors" | "failed";
  completedFiles: number;
  totalFiles: number;
  errors: number;
  processingTime?: number;
}

// Get list of files from Azure Blob Storage
export const getFiles = async (): Promise<FileMeta[]> => {
  const response = await api.get('/api/files');
  return response.data;
};

// Get sheet names
export const getSheetNames = async (fileId: string): Promise<SheetNames> => {
  const response = await api.get(`/api/files/${fileId}/sheets`);
  return response.data;
};

// Process selected files with specified sheets
export const processFiles = async (files: ProcessRequest[]): Promise<{ jobId: string }> => {
  const response = await api.post('/api/process', { files });
  return response.data;
};

// Get job status
export const getJobStatus = async (jobId: string): Promise<JobStatus> => {
  const response = await api.get(`/api/jobs/${jobId}`);
  return response.data;
};

// Get job results
export const getJobResults = async (jobId: string): Promise<any> => {
  const response = await api.get(`/api/jobs/${jobId}/results`);
  return response.data;
};
```

### 3.2 Update Selection Page Component

Modify `src/app/selection/page.tsx` to integrate with Databricks:

```typescript
// Add imports
import { getFiles, getSheetNames, processFiles } from "@/services/databricks";

// Update useEffect to fetch real data
useEffect(() => {
  setLoading(true);
  
  getFiles()
    .then((data) => {
      setFiles(data);
      
      // Initialize fileSheets state
      const sheetsMap: Record<string, string[]> = {};
      data.forEach(file => {
        if (file.sheetNames) {
          sheetsMap[file.id] = file.sheetNames;
        }
      });
      
      setFileSheets(sheetsMap);
      setLoading(false);
    })
    .catch((error) => {
      notification.error({ message: 'Failed to load files.' });
      console.error("Error loading files:", error);
      setLoading(false);
    });
}, []);

// Fetch sheet names when expanding a file
const fetchSheetNames = (file: FileMeta) => {
  // If we already have sheet names, do nothing
  if (fileSheets[file.id]?.length > 0) {
    return;
  }
  
  // Otherwise, fetch the sheet names
  setLoading(true);
  
  getSheetNames(file.id)
    .then((data) => {
      // Update file with sheet names
      const updatedFile = {
        ...file,
        sheets: data.sheets,
        sheetNames: data.sheetNames
      };
      
      // Update fileSheets state
      setFileSheets(prev => ({
        ...prev,
        [file.id]: data.sheetNames
      }));
      
      setLoading(false);
    })
    .catch((error) => {
      notification.error({ message: 'Failed to load sheet names.' });
      console.error("Error loading sheet names:", error);
      setLoading(false);
    });
};

// Update handleProcess to submit to Databricks
const handleProcess = () => {
  // Prepare data with selected files and their selected sheets
  const processData = selectedRowKeys.map(fileId => ({
    fileId,
    sheets: selectedSheets[fileId as string] || [] // If no sheets selected, include all
  }));
  
  setLoading(true);
  
  processFiles(processData)
    .then((response) => {
      notification.success({
        message: `Processing ${selectedRowKeys.length} files`,
        description: `Job ID: ${response.jobId}`
      });
      
      // Redirect to processing page to monitor the job
      window.location.href = `/processing?jobId=${response.jobId}`;
    })
    .catch((error) => {
      notification.error({ message: 'Failed to start processing.' });
      console.error("Error starting processing:", error);
      setLoading(false);
    });
};
```

### 3.3 Implement Direct Sheet Selection in Expandable Rows

Modify the expandable row in the Selection page to show sheet selection without preview:

```typescript
// In src/app/selection/page.tsx
// Update the expandable prop of the Table component

expandable={{
  expandedRowRender: (record) => {
    const fileId = record.id;
    // Fetch sheet names when expanding
    fetchSheetNames(record);
    const sheets = fileSheets[fileId] || [];
    
    return (
      <div className="py-3 pl-12 pr-4 bg-gray-50">
        <div className="font-medium mb-2 text-gray-700">Select Sheets:</div>
        <div className="flex items-center gap-4">
          <Select
            mode="multiple"
            style={{ width: '80%' }}
            placeholder="Select sheets to process"
            value={selectedSheets[fileId] || []}
            onChange={(values) => handleSheetSelection(fileId, values)}
            options={sheets.map(sheet => ({ label: sheet, value: sheet }))}
            loading={loading && !sheets.length}
          />
          <Button
            type="default"
            size="small"
            onClick={() => handleSelectAllSheets(fileId)}
          >
            Select All
          </Button>
        </div>
      </div>
    );
  },
  rowExpandable: (record) => true,
  expandIcon: ({ expanded, onExpand, record }) => (
    expanded ? (
      <Button type="text" size="small" onClick={e => onExpand(record, e)} className="mr-2">
        <span className="text-blue-600">−</span>
      </Button>
    ) : (
      <Button type="text" size="small" onClick={e => onExpand(record, e)} className="mr-2">
        <span className="text-blue-600">+</span>
      </Button>
    )
  )
}}
```

## 4. Setting Up Real-time Updates with SignalR

### 4.1 Create SignalR Service

In Azure Portal, create a new SignalR Service instance.

### 4.2 Create SignalR Negotiation Function

```typescript
// negotiateSignalR/index.ts
import { AzureFunction, Context, HttpRequest } from "@azure/functions";

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
  context.res = {
    body: {
      url: process.env.SIGNALR_SERVICE_URL,
      accessToken: process.env.SIGNALR_ACCESS_TOKEN
    }
  };
};

export default httpTrigger;
```

### 4.3 Create Job Status Update Function

```typescript
// jobStatusUpdate/index.ts
import { AzureFunction, Context } from "@azure/functions";

const cosmosDBTrigger: AzureFunction = async function (context: Context, documents: any[]): Promise<void> {
  if (documents && documents.length > 0) {
    for (const document of documents) {
      if (document.status) {
        // Send status update via SignalR
        context.bindings.signalRMessages = [{
          target: "jobStatusUpdate",
          arguments: [document]
        }];
        
        context.log(`Job status update sent for job ${document.id}`);
      }
    }
  }
};

export default cosmosDBTrigger;
```

### 4.4 Add SignalR Client to Frontend

Install SignalR client:

```bash
npm install @microsoft/signalr
```

Create a new file `src/services/signalr.ts`:

```typescript
// src/services/signalr.ts
import * as signalR from "@microsoft/signalr";
import { api } from "./api";

let connection: signalR.HubConnection | null = null;

export const initializeSignalR = async (): Promise<signalR.HubConnection> => {
  if (connection) return connection;
  
  // Get SignalR connection info
  const response = await api.get("/api/negotiateSignalR");
  const { url, accessToken } = response.data;
  
  // Create connection
  connection = new signalR.HubConnectionBuilder()
    .withUrl(`${url}/api`, {
      accessTokenFactory: () => accessToken
    })
    .withAutomaticReconnect()
    .build();
  
  // Start connection
  await connection.start();
  console.log("SignalR connected");
  
  return connection;
};

export const subscribeToJobUpdates = (
  jobId: string,
  callback: (update: any) => void
): () => void => {
  if (!connection) {
    console.error("SignalR not initialized");
    return () => {};
  }
  
  // Subscribe to job updates
  connection.on("jobStatusUpdate", (update) => {
    if (update.id === jobId) {
      callback(update);
    }
  });
  
  // Return unsubscribe function
  return () => {
    connection?.off("jobStatusUpdate");
  };
};

export const closeSignalR = async (): Promise<void> => {
  if (connection) {
    await connection.stop();
    connection = null;
    console.log("SignalR disconnected");
  }
};
```

## 5. Implementing Sheet Selection State Management

Add state management for tracking selected sheets:

```typescript
// In src/app/selection/page.tsx
// Add these state variables

// State for tracking sheet names for each file
const [fileSheets, setFileSheets] = useState<Record<string, string[]>>({});

// State for tracking selected sheets for each file
const [selectedSheets, setSelectedSheets] = useState<Record<string, string[]>>({});

// Handle sheet selection
const handleSheetSelection = (fileId: string, selectedSheetNames: string[]) => {
  setSelectedSheets(prev => ({
    ...prev,
    [fileId]: selectedSheetNames
  }));
};

// Handle select all sheets
const handleSelectAllSheets = (fileId: string) => {
  const allSheets = fileSheets[fileId] || [];
  setSelectedSheets(prev => ({
    ...prev,
    [fileId]: [...allSheets]
  }));
};
```

## 6. Deployment and Configuration

### 5.1 Deploy Azure Functions

```bash
# Build and deploy Azure Functions
cd smartbdx-api
func azure functionapp publish smartbdx-api
```

### 5.2 Deploy Databricks Notebooks

1. In Databricks workspace, create a folder called "SmartBDX"
2. Upload the ProcessFiles notebook to this folder
3. Set up Databricks secrets for Azure Storage and Cosmos DB access

### 5.3 Deploy Frontend

```bash
# Build and deploy Next.js frontend
cd smartbdx-frontend
npm run build
# Deploy to Azure Web App or your preferred hosting
```

## 7. Testing the Integration

### 7.1 Testing the File and Sheet Selection

1. Navigate to the Selection Dashboard
2. Verify files are loaded from Azure Blob Storage
3. Expand a file to see and select sheets
   - Confirm sheet names are loaded correctly
   - Test selecting individual sheets
   - Test the "Select All" button
4. Select multiple files and configure different sheet selections for each
5. Click "Process Selected" to submit the job
6. Verify you're redirected to the Processing Dashboard
7. Confirm real-time updates are working as the job progresses

### 7.2 Verifying Sheet Selection in Databricks

1. Monitor the Databricks job execution
2. Verify that only the selected sheets are being processed for each file
3. Check the Cosmos DB job records to confirm the correct sheet selections were passed
4. Validate the processing results to ensure they match the selected sheets

### 7.3 End-to-End Testing

1. Upload new Excel files with multiple sheets to Azure Blob Storage
2. Refresh the Selection Dashboard and verify the new files appear
3. Test the complete workflow from selection to processing
4. Verify the results in the monitoring dashboard match the selected sheets

## 8. Conclusion and Best Practices

This guide has outlined a comprehensive approach to implementing direct sheet selection for Excel files in the SmartBDX application, connecting the Next.js frontend to the Databricks backend through Azure Functions.

### Key Benefits of Direct Sheet Selection

1. **Improved Performance**: By eliminating the preview step, the application processes files more efficiently
2. **Reduced Resource Usage**: Only loading sheet names instead of preview data reduces memory and bandwidth consumption
3. **Streamlined User Experience**: Users can quickly select sheets without waiting for preview generation
4. **Focused Processing**: Only selected sheets are processed, saving computational resources in Databricks

### Best Practices for Sheet Selection Implementation

1. **Lazy Loading**: Only fetch sheet names when a file is expanded, not on initial load
2. **Caching**: Cache sheet names after they're fetched to avoid redundant API calls
3. **Clear UI**: Provide clear visual feedback about which sheets are selected
4. **Default Selection**: Consider implementing smart defaults based on sheet naming patterns
5. **Validation**: Ensure at least one sheet is selected before processing
6. **Error Handling**: Implement robust error handling for sheet extraction failures

By following this guide, you've implemented a direct sheet selection approach that improves performance and user experience while maintaining all the functionality needed for effective bordereaux processing.

## 9. Code Changes to Remove Preview Functionality

To complete the removal of preview functionality, the following code changes were made:

### 9.1 Remove FilePreviewModal Component

The `FilePreviewModal` component was removed and replaced with a more focused `SheetSelectionModal` that only handles sheet selection without preview:

```typescript
// src/components/selection/SheetSelectionModal.tsx
"use client";

import { useState, useEffect } from "react";
import { Modal, Spin, Alert, Select, Button } from "antd";

interface SheetSelectionModalProps {
  file: FileMeta | null;
  visible: boolean;
  onClose: () => void;
  onSelectSheets: (fileId: string, sheets: string[]) => void;
  selectedSheets: string[];
}

export const SheetSelectionModal = ({
  file,
  visible,
  onClose,
  onSelectSheets,
  selectedSheets
}: SheetSelectionModalProps) => {
  // Component implementation that focuses only on sheet selection
  // without generating or displaying previews
}
```

### 9.2 Update Selection Page Component

The Selection page component was updated to remove all preview-related functionality:

1. Remove imports:
```typescript
// Remove EyeOutlined icon and FilePreviewModal
import { SearchOutlined, FileExcelOutlined, StarOutlined } from "@ant-design/icons";
```

2. Remove preview-related state:
```typescript
// Remove these state variables
const [previewFile, setPreviewFile] = useState<FileMeta | null>(null);
const [previewVisible, setPreviewVisible] = useState(false);
```

3. Remove preview handler:
```typescript
// Remove this function
const handlePreview = (file: FileMeta) => {
  setPreviewFile(file);
  setPreviewVisible(true);
};
```

4. Remove Actions column with Preview button:
```typescript
// Remove the entire Actions column that contained the Preview button
{
  title: "Actions",
  key: "actions",
  width: 100,
  render: (_, record) => (
    <Button
      icon={<EyeOutlined />}
      onClick={() => handlePreview(record)}
      type="text"
      className="text-gray-500 hover:text-blue-600"
    >
      Preview
    </Button>
  ),
},
```

5. Remove FilePreviewModal from the component:
```typescript
// Remove this section
<FilePreviewModal
  file={previewFile}
  visible={previewVisible}
  onClose={() => setPreviewVisible(false)}
/>
```

These changes ensure that the application no longer offers preview functionality and instead focuses entirely on direct sheet selection through the expandable rows in the file list.