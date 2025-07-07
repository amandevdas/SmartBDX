# SmartBDX JSON Serialization Fix

## 🔍 Problem Identified

**Root Cause**: `Object of type int64 is not JSON serializable`

The SmartBDX backend is returning numpy `int64` types which cannot be directly serialized to JSON. This causes ALL operations to fail and fall back to mock data.

## ✅ Solution

The SmartBDX utilities module already has a `safe_json_serialize()` function that handles this exact issue, but it's not being used consistently.

### Quick Fix Required

In the SmartBDX notebook/Python code, find any instances of:

```python
# PROBLEMATIC CODE (causes the error):
return json.dumps(result)
```

And replace with:

```python
# FIXED CODE (handles numpy types):
from smartbdx_utilities import safe_json_serialize
return (safe_json_serialize(resujson.dumpslt))
```

## 🎯 Specific Locations to Fix

### 1. In `smartbdx_selection.py` - `discover_files_and_sheets_metadata()`

**Current problematic pattern:**
```python
def discover_files_and_sheets_metadata():
    # ... processing code ...
    result = {
        "priority_score": np.int64(95),  # This causes JSON error!
        "file_size": file_info.size,     # Also numpy int64
        # ... other fields
    }
    return json.dumps(result)  # FAILS HERE
```

**Fixed version:**
```python
def discover_files_and_sheets_metadata():
    # ... processing code ...
    result = {
        "priority_score": int(95),       # Convert to Python int
        "file_size": int(file_info.size), # Convert to Python int
        # ... other fields
    }
    # OR use safe_json_serialize:
    return json.dumps(safe_json_serialize(result))
```

### 2. In API Gateway/Main Handler

**Look for patterns like:**
```python
# In the main operation handler
def execute_operation(operation, parameters):
    if operation == "discover_files_with_sheets":
        result = discover_files_and_sheets_metadata(...)
        return json.dumps(result)  # ADD safe_json_serialize HERE
```

**Fix:**
```python
def execute_operation(operation, parameters):
    if operation == "discover_files_with_sheets":
        result = discover_files_and_sheets_metadata(...)
        return json.dumps(safe_json_serialize(result))  # FIXED
```

## 🧪 Test the Fix

After applying the fix, test with:

```bash
curl -X POST http://localhost:3000/api/test-databricks
```

**Expected before fix:**
```json
{"success":false,"error":"Object of type int64 is not JSON serializable"}
```

**Expected after fix:**
```json
{"success":true,"data":[{"id":"real-001","name":"actual_file.xlsx",...}]}
```

## 🚀 Alternative: Type Conversion at Source

Instead of using `safe_json_serialize()`, you can also fix by converting types at the source:

```python
# Convert numpy types to Python types immediately
metadata_records.append({
    'priority_score': int(priority_score),  # np.int64 -> int
    'file_size_mb': float(file_size_mb),    # np.float64 -> float
    'estimated_rows': int(estimated_rows),   # np.int64 -> int
    # ... other fields
})
```

## 📋 Implementation Steps

1. **Locate the SmartBDX notebook** (likely `SmartBDX_API_Gateway_v2.ipynb`)
2. **Find the JSON serialization points** (search for `json.dumps`)
3. **Import the fix**: `from smartbdx_utilities import safe_json_serialize`
4. **Wrap the data**: `json.dumps(safe_json_serialize(result))`
5. **Test the fix** using the curl command above

## 🎉 Expected Result

After applying this fix:
- ✅ Real file data will be returned instead of mock data
- ✅ All SmartBDX operations will work correctly
- ✅ The frontend will display actual files from the Databricks volume
- ✅ AI insights and metadata will flow through properly

## 🔧 Example Working Code

Here's the complete fixed pattern:

```python
from smartbdx_utilities import safe_json_serialize
import json

def discover_files_with_sheets(volume_folder="/Volumes/test/bronze/raw/"):
    try:
        # ... existing SmartBDX logic ...
        metadata_df = discover_files_and_sheets_metadata(volume_folder)
        
        # Convert to response format with type safety
        files_data = []
        for _, row in metadata_df.iterrows():
            file_data = {
                "id": f"file-{len(files_data)+1:03d}",
                "name": str(row['file_name']),
                "priority_score": int(row['priority_score']),  # Fix here
                "file_size_mb": float(row['file_size_mb']),    # Fix here
                # ... other fields with proper type conversion
            }
            files_data.append(file_data)
        
        result = {
            "success": True,
            "data": files_data,
            "timestamp": datetime.now().isoformat()
        }
        
        # Critical fix: Use safe serialization
        return json.dumps(safe_json_serialize(result))
        
    except Exception as e:
        error_result = {
            "success": False,
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }
        return json.dumps(safe_json_serialize(error_result))
```

This fix will resolve the dummy data issue and enable real SmartBDX functionality!