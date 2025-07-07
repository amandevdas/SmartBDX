# Phase 1 Testing Guide - SmartBDX Frontend Integration

## 🧪 Testing Overview

This guide helps you test the Phase 1 implementation of the SmartBDX Frontend Integration Plan. Phase 1 focused on core integration foundation including enhanced data models, API client overhaul, authentication enhancement, and backend integration.

## 🚀 Quick Test Access

### Interactive Test Suite
Navigate to: **`/test/phase1`** in your browser

This page provides a comprehensive interactive test suite that validates all Phase 1 components.

## 📋 Manual Testing Checklist

### 1. Environment Setup
- [ ] Set `NEXT_PUBLIC_API_URL` environment variable
- [ ] Configure `NEXT_PUBLIC_USE_MOCK_DATA=true` for development testing
- [ ] Restart the development server after environment changes

### 2. Authentication Testing
- [ ] Navigate to `/login` and test authentication flow
- [ ] Verify user data includes enhanced fields (roles, tenant, expiresAt)
- [ ] Check localStorage for `smartbdx_user` object with enhanced structure
- [ ] Test logout functionality

### 3. API Client Testing
- [ ] Open browser developer tools (Network tab)
- [ ] Navigate to any page that loads data (Selection, Processing, etc.)
- [ ] Verify API requests include new headers:
  - `Authorization: Bearer [token]`
  - `X-API-Source: smartbdx-frontend`
  - `X-User-Tenant: [tenant]`
  - `X-User-Roles: [roles]`

### 4. Data Model Validation
Check that components can handle enhanced data structures:

**Selection Page** (`/selection`):
- [ ] FileItem objects include `priority_score`, `cache_available`, `ai_recommendation`
- [ ] No TypeScript errors in console
- [ ] Data displays properly (even if mock data)

**Processing Page** (`/processing`):
- [ ] JobStatus includes `rate_limit_status`, `checkpoint_data`, `cost_estimate`
- [ ] Progress tracking works with enhanced structure

**Mapping Page** (`/mapping`):
- [ ] ColumnMapping includes `mapping_source`, `vector_similarity_score`, `needs_human_review`
- [ ] Confidence scores display correctly

### 5. Error Handling Testing
- [ ] Try accessing pages without authentication
- [ ] Test with invalid file IDs or malformed requests
- [ ] Verify graceful error messages and retry logic
- [ ] Check console for proper error logging

## 🔧 Backend Integration Testing

### Mock Mode Testing (Development)
Set `NEXT_PUBLIC_USE_MOCK_DATA=true`:

1. **Start the application**: `npm run dev`
2. **Navigate to test page**: `http://localhost:3000/test/phase1`
3. **Run test suite**: Click "Run All Tests"
4. **Verify results**: All tests should pass in mock mode

Expected mock mode behavior:
- ✅ Data models validate correctly
- ✅ API endpoints return mock data (with 500ms delay)
- ✅ Authentication works with mock user
- ✅ Error handling catches expected errors

### Real Backend Testing (Production-Ready)
Set `NEXT_PUBLIC_USE_MOCK_DATA=false`:

1. **Configure backend URL**: Set `NEXT_PUBLIC_API_URL=https://your-databricks-workspace.com`
2. **Test authentication**: Real Azure AD integration
3. **Test API endpoints**: Should return actual SmartBDX backend data
4. **Monitor network requests**: Verify correct backend integration

Expected real backend behavior:
- 🔗 API calls go to actual Databricks backend
- 🔐 Authentication uses real Azure AD tokens
- 📊 Data reflects actual file discovery and processing status
- ⚡ Real-time updates from batch processing

## 📊 Test Results Interpretation

### ✅ Success Criteria
- All data model interfaces validate without TypeScript errors
- API client endpoints are callable (may timeout in mock mode)
- Authentication service stores and retrieves enhanced user data
- Error handling catches and reports errors appropriately

### ⚠️ Expected Limitations in Mock Mode
- API timeouts are normal (real backend not available)
- Some endpoints return placeholder data
- Real-time features use simulated updates

### ❌ Failure Indicators
- TypeScript compilation errors
- Authentication data not persisting
- API requests missing required headers
- Components crashing with enhanced data structures

## 🐛 Troubleshooting

### Common Issues

**TypeScript Errors**:
- Check that all new interfaces are properly imported
- Verify type assertions for enhanced user properties
- Ensure components handle optional enhanced fields

**API Request Issues**:
- Verify environment variables are set correctly
- Check browser developer tools for request headers
- Confirm authentication token is being sent

**Authentication Problems**:
- Clear localStorage: `localStorage.clear()`
- Check if mock user data structure matches interface
- Verify authentication context is wrapping the application

**Data Display Issues**:
- Check if components handle enhanced data fields gracefully
- Verify fallback values for optional fields
- Test with both mock and undefined data

### Debug Commands

```bash
# Check environment variables
echo $NEXT_PUBLIC_API_URL
echo $NEXT_PUBLIC_USE_MOCK_DATA

# Clear browser storage
# In browser console:
localStorage.clear()
sessionStorage.clear()

# Check network requests
# In browser developer tools > Network tab
# Look for requests with enhanced headers
```

## 🎯 Success Validation

Phase 1 is successfully implemented when:

1. **✅ All tests pass** in the interactive test suite
2. **✅ Enhanced data models** work without errors
3. **✅ API client** sends requests with proper authentication headers
4. **✅ Authentication service** handles enhanced user data
5. **✅ Error handling** works gracefully in both mock and real modes

## 📈 Phase 2 Readiness

Once Phase 1 testing is complete, you're ready for Phase 2 implementation:

- **Smart File Selection UI**: Priority indicators and cache status
- **Real-time Batch Monitoring**: Checkpoint display and progress tracking
- **Enhanced Mapping Interface**: Vector similarity and LLM insights
- **Cost Optimization Dashboard**: Cache analytics and recommendations

## 🔗 Quick Links

- **Test Suite**: `/test/phase1`
- **Implementation Summary**: [`docs/phase1-implementation-summary.md`](./phase1-implementation-summary.md)
- **Integration Plan**: [`docs/frontend-integration-plan.md`](./frontend-integration-plan.md)
- **Selection Page**: `/selection`
- **Processing Page**: `/processing`
- **Mapping Page**: `/mapping`
- **Monitoring Page**: `/monitoring`

---

**Status**: Ready for Phase 1 Testing ✅  
**Next**: Phase 2 Implementation upon successful testing  
**Support**: Check browser console and network tab for debugging