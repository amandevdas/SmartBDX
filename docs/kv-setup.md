# Vercel KV Setup for SmartBDX

This guide explains how to set up Vercel KV to fix the job persistence issue in the SmartBDX application.

## Problem

The original implementation used in-memory storage for job tracking, which doesn't work in serverless environments like Vercel because:

1. Each API request is handled by a new serverless function instance
2. Memory is not shared between function instances  
3. Job data is lost when the function completes

## Solution

We've implemented **Vercel KV** (Redis-based) persistent storage to maintain job state across serverless function invocations.

## Setup Steps

### 1. Create Vercel KV Database

1. Go to your [Vercel Dashboard](https://vercel.com/dashboard)
2. Navigate to **Storage** tab
3. Click **Create Database** 
4. Select **KV** (Key-Value store)
5. Choose a name (e.g., `smartbdx-jobs`)
6. Select the same region as your deployment

### 2. Get Environment Variables

After creating the KV database, Vercel will provide these environment variables:

```bash
KV_URL=your_kv_url_here
KV_REST_API_URL=your_kv_rest_api_url_here  
KV_REST_API_TOKEN=your_kv_rest_api_token_here
KV_REST_API_READ_ONLY_TOKEN=your_kv_rest_api_read_only_token_here
```

### 3. Configure Environment Variables

**For Local Development:**
1. Copy `.env.example` to `.env.local`
2. Fill in the KV environment variables from step 2
3. Add your other environment variables (Databricks, etc.)

**For Production (Vercel):**
1. Go to your Vercel project settings
2. Navigate to **Environment Variables**
3. Add all the KV variables from step 2
4. Add your other required variables

### 4. Deploy and Test

1. Deploy your changes to Vercel
2. Test the job processing workflow:
   - Select files in `/selection`
   - Click "Process Selected"
   - Navigate to `/processing` 
   - Verify jobs appear and update properly

## How It Works

### Job Storage
- Jobs are stored in Redis with structured keys:
  - `smartbdx:job:{jobId}` - Job data
  - `smartbdx:batch:{batchId}` - Batch-to-job mapping
  - `smartbdx:jobs` - Set of all job IDs

### Data Flow
1. **Job Submission** (`/api/process`) → Store job in KV
2. **Status Polling** (`/api/jobs/status`) → Retrieve job from KV  
3. **Processing Page** → Load all jobs from KV on mount
4. **Real-time Updates** → Update both KV and local state

### Key Benefits
- ✅ **Persistent**: Jobs survive serverless function restarts
- ✅ **Consistent**: All function instances see the same data
- ✅ **Fast**: Redis-based with sub-millisecond latency
- ✅ **Scalable**: Handles multiple concurrent users
- ✅ **Reliable**: Vercel-managed infrastructure

## Troubleshooting

### Jobs Not Appearing
1. Check KV environment variables are set correctly
2. Verify KV database is in the same region as your deployment
3. Check browser console for error messages
4. Verify the `loadJobs()` function is being called

### KV Connection Issues
1. Test KV connectivity with the health check:
   ```typescript
   import { healthCheck } from '@/lib/kv-job-store';
   const isHealthy = await healthCheck();
   ```
2. Verify environment variables match your Vercel KV dashboard
3. Check Vercel deployment logs for connection errors

### Performance Considerations
- KV operations are async - ensure proper await usage
- Consider implementing connection pooling for high traffic
- Use the cleanup function to remove old jobs periodically

## API Reference

### Key Functions

```typescript
// Add a new job
await addJob(jobData, batchId, runId);

// Get all jobs
const jobs = await getAllJobs();

// Get job by ID
const job = await getJobById(jobId);

// Get job by batch ID  
const job = await getJobByBatchId(batchId);

// Update job status
await updateJob(jobId, { status: 'completed', progress: 100 });

// Cleanup old jobs
await clearOldJobs(60); // Remove jobs older than 60 minutes
```

## Migration Notes

The migration from in-memory to KV storage is backwards compatible:
- Existing job IDs and batch IDs continue to work
- No data migration required (fresh start)
- Old in-memory jobs will not appear (expected behavior)
- New jobs will persist across deployments

## Cost Considerations

Vercel KV pricing (as of 2024):
- **Hobby**: 30,000 requests/month included
- **Pro**: 500,000 requests/month included  
- **Enterprise**: Custom pricing

For typical SmartBDX usage (10-20 jobs/day), the free tier is sufficient.