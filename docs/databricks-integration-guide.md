# Step-by-Step Guide: Connecting SmartBDX Frontend to Databricks with a Centralized Client

This guide provides detailed instructions for the connection between the SmartBDX Next.js frontend and the Databricks backend. The architecture uses a centralized `DatabricksClient` to abstract away the complexities of API interactions, providing a robust, maintainable, and testable integration layer.

## Implementation Status

The current implementation uses a sophisticated, multi-layered approach:

1.  **Primary: Real Databricks API Integration via `DatabricksClient`**
    *   A central client (`/src/lib/databricks-client.ts`) manages all communication with the Databricks Jobs API.
    *   API routes in Next.js are lean and delegate all logic to this client.
    *   Supports asynchronous job submission, polling for completion, and robust error handling.

2.  **Fallback 1: Server-Side Mock Data & Fallback Logic**
    *   The `/api/databricks` route can automatically return mock data if real API calls fail or time out, ensuring frontend stability.
    *   This is controlled by the `NEXT_PUBLIC_ALLOW_FALLBACK` environment variable.

3.  **Fallback 2: Client-Side Mock Data**
    *   Controlled via the `NEXT_PUBLIC_USE_MOCK_DATA` environment variable.
    *   Bypasses all server-side API calls, which is ideal for isolated frontend development and testing.

## 1. Environment Configuration

Create or update `.env.local` in your Next.js project. The configuration is split between server-side and client-side variables.

```bash
# --- General Settings ---
# Enables mock data across the entire application, bypassing real API calls.
NEXT_PUBLIC_USE_MOCK_DATA=false
# Allows the server to fallback to mock data if a real API call fails.
NEXT_PUBLIC_ALLOW_FALLBACK=true

# --- Databricks Connection (Server-Side) ---
# These are used by the DatabricksClient and should NOT have the NEXT_PUBLIC_ prefix.
DATABRICKS_HOST=https://your-workspace.azuredatabricks.net/
DATABRICKS_TOKEN=your-personal-access-token
SMARTBDX_API_JOB_ID=your-job-id

# --- Frontend Configuration ---
# The volume path in Databricks where bordereaux files are stored.
NEXT_PUBLIC_VOLUME_PATH=/Volumes/test/bronze/raw/
# The base URL for the application's internal API.
NEXT_PUBLIC_API_URL=/api
```

## 2. The `DatabricksClient` Abstraction

The core of the integration is the `DatabricksClient` class located at `src/lib/databricks-client.ts`. This class is responsible for:

*   **Authentication**: Automatically adds the Databricks token to all requests.
*   **Job Submission**: Provides an `executeOperation` method that submits a request to a single, unified Databricks job.
*   **Asynchronous Polling**: Implements a `waitForCompletion` method that polls the Databricks API until a job is complete.
*   **Error Handling**: Includes logic for retries and timeouts.
*   **Output Retrieval**: Handles the complexity of retrieving results from single-task and multi-task jobs.

This centralized client means that the API routes themselves do not contain any complex `fetch` logic.

## 3. API Route Implementation

The API routes in `src/app/api/` are now simple and delegate all work to the `DatabricksClient`.

### 3.1. Generic Databricks Endpoint: `/api/databricks`

This is the main entry point for most Databricks operations. It receives a POST request specifying the `operation` and `parameters`, and passes them to the `DatabricksClient`.

```typescript
// src/app/api/databricks/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { DatabricksClient, createSuccessResponse, createErrorResponse } from '@/lib/databricks-client';

export async function POST(request: NextRequest) {
  const requestId = `req_${Date.now()}`;
  console.log(`[${requestId}] 📥 Received POST request to /api/databricks`);

  try {
    const { operation, parameters } = await request.json();

    if (process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true') {
      console.log(`[${requestId}] 🧪 Using mock data for operation: ${operation}`);
      const mockData = getMockDataForOperation(operation, parameters);
      return createSuccessResponse(mockData);
    }

    const client = new DatabricksClient(requestId);
    const result = await client.executeOperation(operation, parameters || {});

    if (!result || !result.success) {
      // Fallback logic can be triggered here
    }

    return createSuccessResponse(result.data);
  } catch (error) {
    // Error handling and fallback logic
  }
}
```

### 3.2. File & Status Endpoints

The other endpoints like `/api/files` and `/api/files/status` are built on top of the generic `/api/databricks` endpoint. They call specific operations like `discover_files` and `discover_files_with_sheets`.

**File Listing (`/api/files/route.ts`)**

This route uses the `discover_files` operation and implements an in-memory cache to speed up repeated requests.

```typescript
// src/app/api/files/route.ts (Simplified)
const client = new DatabricksClient(requestId);
const result = await client.executeOperation('discover_files', { volume_folder: volumePath });

// Transform result and cache it
const files = transform(result.data);
cache[cacheKey] = { data: files, timestamp: Date.now() };

return createSuccessResponse(files);
```

**Processing Endpoint (`/api/process/route.ts`)**

This endpoint submits a job asynchronously using `client.submitJob` and immediately returns a `jobId` to the frontend. The frontend can then use this ID to poll the `/api/status/[jobId]` endpoint.

```typescript
// src/app/api/process/route.ts (Simplified)
const client = new DatabricksClient(requestId);
const jobResponse = await client.submitJob('process_files', processData);

return createSuccessResponse({
  jobId: `job-${jobResponse.run_id}`,
  status: 'submitted',
});
```

**Status Polling (`/api/status/[jobId]/route.ts`)**

This route takes a `jobId`, extracts the `runId`, and uses `client.getRunDetails` to check the status of the job.

```typescript
// src/app/api/status/[jobId]/route.ts (Simplified)
const client = new DatabricksClient(requestId);
const runDetails = await client.getRunDetails(runId);

const statusResponse = {
  status: mapDatabricksState(runDetails.state.life_cycle_state),
  // ... other details
};

// If completed, get the output
if (statusResponse.status === 'completed') {
  const output = await client.getRunOutput(runId);
  statusResponse.result = JSON.parse(output.notebook_output.result);
}

return createSuccessResponse(statusResponse);
```

## 4. Frontend Integration

The frontend uses a custom `apiRequest` helper in `src/utils/apiHelpers.ts` which handles request deduplication and retries. The UI components call these API routes via custom hooks (e.g., `useSmartBDXApi`).

This setup ensures a clean separation of concerns:
-   **Components**: Manage UI state.
-   **Hooks**: Manage API state (loading, data, error).
-   **API Routes**: Act as a thin gateway to the `DatabricksClient`.
-   **`DatabricksClient`**: Handles all the complexity of Databricks communication.

## 5. Troubleshooting

### Databricks API Connectivity
1.  **Check Databricks Token**: Ensure your token has "Can Manage" permissions on the job specified by `SMARTBDX_API_JOB_ID`.
2.  **Verify Workspace URL**: Confirm the `DATABRICKS_HOST` is correct.
3.  **Check Volume Path**: Ensure the `NEXT_PUBLIC_VOLUME_PATH` exists and contains Excel files.

### API Route Issues
1.  **Check Environment Variables**: Ensure all required environment variables are set and accessible where needed (server vs. client).
2.  **Review Server Logs**: The extensive logging in the API routes and `DatabricksClient` will provide detailed information on any errors.

This architecture provides a highly robust and maintainable solution for integrating the SmartBDX frontend with a powerful Databricks backend.