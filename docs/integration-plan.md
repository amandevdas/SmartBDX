# SmartBDX Integration Plan: Performance-Optimized Azure Architecture

Based on your requirements for performance and scalability, with files already stored in Azure Blob Storage, I've designed an integration architecture that optimizes for processing 10-20 Excel files (5-50MB each) in parallel while leveraging your existing Azure infrastructure.

## 1. Architecture Overview

```mermaid
graph TD
    A[Next.js Frontend<br>Azure Web App] --> |API Requests| B[Azure API Management]
    B --> |REST API| C[Azure Functions<br>API Layer]
    C --> |Job Submission| D[Databricks Jobs API]
    D --> E[SmartBDX Python Backend<br>on Databricks]
    
    F[Azure Blob Storage] --> |File Access| E
    F --> |Metadata & Previews| C
    
    E --> |Results & Status| G[Azure Cosmos DB]
    G --> |Status Updates| C
    C --> |Status & Results| B
    B --> |API Responses| A
    
    H[Azure Event Grid] --> |Status Notifications| I[Azure SignalR Service]
    I --> |Real-time Updates| A
    E --> |Job Status Events| H
```

## 2. Key Components

### 2.1 Azure API Management
- Serves as the central gateway for all API requests
- Provides API versioning, documentation, and security
- Handles request throttling and caching for improved performance
- Enables monitoring and analytics for API usage

### 2.2 Azure Functions (API Layer)
- Lightweight, serverless API implementation
- Handles API requests from the frontend
- Translates between REST API and Databricks Jobs API
- Manages job submission and status tracking
- Provides file metadata and preview generation

### 2.3 Databricks Jobs API Integration
- Submits SmartBDX processing jobs to Databricks
- Configures job parameters and cluster settings
- Enables parallel processing of multiple files
- Provides job monitoring and control

### 2.4 Azure Blob Storage Integration
- Central storage for all Excel files
- Shared access between frontend and Databricks
- SAS token generation for secure frontend access
- Efficient file access patterns for Databricks

### 2.5 Azure Cosmos DB
- Stores processing results and status information
- Provides low-latency access to job status
- Enables efficient querying of processing history
- Scales to handle high throughput requirements

### 2.6 Real-time Updates with Event Grid and SignalR
- Event Grid captures job status changes
- SignalR pushes real-time updates to frontend
- Provides immediate feedback on processing status
- Reduces need for polling and improves UX

## 3. Integration Workflows

### 3.1 File Discovery and Selection

```mermaid
sequenceDiagram
    participant Frontend as Next.js Frontend
    participant API as Azure Functions API
    participant Storage as Azure Blob Storage
    participant Databricks as Databricks
    
    Frontend->>API: GET /api/files
    API->>Storage: List blobs in container
    Storage->>API: Return file metadata
    API->>Databricks: Get processing status for files
    Databricks->>API: Return status information
    API->>Frontend: Return combined file metadata with status
    
    Frontend->>API: GET /api/files/{fileId}/preview
    API->>Storage: Get file content (limited preview)
    Storage->>API: Return file content
    API->>Frontend: Return formatted preview data
```

### 3.2 Processing Selected Files

```mermaid
sequenceDiagram
    participant Frontend as Next.js Frontend
    participant API as Azure Functions API
    participant Databricks as Databricks Jobs API
    participant Storage as Azure Blob Storage
    participant Cosmos as Cosmos DB
    participant SignalR as SignalR Service
    
    Frontend->>API: POST /api/process (with file/sheet selections)
    API->>Databricks: Submit job with selected files/sheets
    Databricks->>API: Return job ID
    API->>Cosmos: Create job record with status="submitted"
    API->>Frontend: Return job ID and initial status
    
    Databricks->>Storage: Read selected files
    Databricks->>Databricks: Process files with SmartBDX
    Databricks->>Cosmos: Update job status="processing"
    Cosmos->>SignalR: Trigger status update
    SignalR->>Frontend: Push status update
    
    Databricks->>Cosmos: Store processing results
    Databricks->>Cosmos: Update job status="completed"
    Cosmos->>SignalR: Trigger completion notification
    SignalR->>Frontend: Push completion notification
    
    Frontend->>API: GET /api/jobs/{jobId}/results
    API->>Cosmos: Get job results
    Cosmos->>API: Return results data
    API->>Frontend: Return formatted results
```

## 4. Performance Optimizations

### 4.1 Parallel Processing in Databricks
- Implement ThreadPoolExecutor for parallel file processing
- Configure optimal thread count based on file sizes
- Use thread-local storage for Azure OpenAI clients
- Implement rate limiting to prevent API throttling

### 4.2 Efficient File Access
- Use Spark for initial file access from Blob Storage
- Implement memory-mapped file reading for large Excel files
- Selectively load only required sheets
- Implement chunked processing for very large files

### 4.3 Optimized API Responses
- Implement pagination for large result sets
- Use response compression for faster data transfer
- Cache frequently accessed metadata
- Implement efficient JSON serialization

### 4.4 Frontend Optimizations
- Use virtualized lists for displaying large file collections
- Implement progressive loading of file previews
- Use WebSockets for real-time status updates
- Optimize rendering of large data tables

## 5. Implementation Roadmap

### Phase 1: Core API Layer (2 weeks)
- Set up Azure Functions app
- Implement file listing and preview APIs
- Create Databricks job submission endpoints
- Set up basic status tracking

### Phase 2: Databricks Integration (2 weeks)
- Create Databricks notebooks for processing
- Implement parallel processing optimizations
- Set up job monitoring and status updates
- Test with sample files

### Phase 3: Frontend Integration (2 weeks)
- Update API client in frontend
- Implement real-time status updates
- Enhance file selection UI
- Add job monitoring views

### Phase 4: Performance Optimization (1 week)
- Implement caching strategies
- Optimize file access patterns
- Add pagination for large result sets
- Performance testing and tuning

### Phase 5: Testing and Deployment (1 week)
- End-to-end testing
- Load testing with realistic file sizes
- Deployment to Azure production environment
- Documentation and knowledge transfer

## 6. Conclusion

This integration plan provides a performance-optimized architecture for connecting your Next.js frontend with the Databricks-based SmartBDX backend. By leveraging Azure services like Functions, API Management, Cosmos DB, and SignalR, we can create a scalable solution that efficiently processes 10-20 Excel files (5-50MB each) in parallel.

The architecture is designed to:
- Maximize performance through parallel processing
- Provide real-time status updates to users
- Efficiently handle file access from Azure Blob Storage
- Scale to accommodate growing workloads
- Integrate seamlessly with your existing Azure infrastructure