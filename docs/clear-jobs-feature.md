# Clear All Jobs Feature - Development Only

## Overview
The "Clear All Jobs" feature is designed exclusively for development environments to help developers quickly reset the processing dashboard during testing and development.

## Security & Environment Protection

### Backend Protection (`/api/jobs/clear`)
- **Environment Check**: Only executes in `NODE_ENV === 'development'`
- **Production Block**: Returns 403 Forbidden in production/staging environments
- **Logging**: All attempts are logged with environment information

### Frontend Protection
- **UI Visibility**: Clear button only appears when `process.env.NODE_ENV === 'development'`
- **Double Protection**: Even if UI is bypassed, backend will reject non-development requests

## Usage

### In Development
```bash
# API Direct Call
curl -X DELETE http://localhost:3000/api/jobs/clear

# UI: Red "Clear All Jobs" button appears in processing dashboard header
```

### In Production
- **UI**: No clear button visible
- **API**: Returns error `"Clear all jobs is only available in development mode"`

## Implementation Details

### Files Modified
- `src/lib/redis-job-store.ts` - Added `clearAllJobs()` function
- `src/app/api/jobs/clear/route.ts` - Environment-protected API endpoint
- `src/app/processing/page.tsx` - Development-only UI button

### Environment Detection
```javascript
// Backend
if (process.env.NODE_ENV !== 'development') {
  return NextResponse.json({ error: '...' }, { status: 403 });
}

// Frontend
{jobs.length > 0 && process.env.NODE_ENV === 'development' && (
  <ClearButton />
)}
```

## Benefits
- **Development Efficiency**: Quick dashboard reset during testing
- **Production Safety**: Zero risk of accidental data loss in production
- **Clean Testing**: Start with fresh state for each test cycle
- **Data Preservation**: All job history preserved in production environments