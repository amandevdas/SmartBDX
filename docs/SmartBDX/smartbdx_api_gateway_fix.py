"""
SmartBDX API Gateway Fix
=======================

Fix for JSON serialization error in SmartBDX discover_files_with_sheets operation.
This patch ensures all numpy int64 types are properly converted before JSON serialization.
"""

import json
import pandas as pd
import numpy as np
from datetime import datetime
from decimal import Decimal
from smartbdx_utilities import safe_json_serialize

def fixed_discover_files_and_sheets_metadata(volume_folder: str = "/Volumes/test/bronze/raw/"):
    """
    Fixed version of discover_files_and_sheets_metadata that properly handles JSON serialization.
    
    This fixes the "Object of type int64 is not JSON serializable" error by ensuring
    all numpy types are converted to Python types before JSON serialization.
    """
    from smartbdx_selection import discover_files_and_sheets_metadata
    
    try:
        # Call the original function
        metadata_df = discover_files_and_sheets_metadata(volume_folder)
        
        if metadata_df.empty:
            return {
                "success": False,
                "operation": "discover_files_with_sheets", 
                "error": "No files found in volume",
                "timestamp": datetime.now().isoformat()
            }
        
        # Convert DataFrame to dict and ensure all types are JSON-serializable
        files_data = []
        for _, row in metadata_df.iterrows():
            file_data = {
                "id": f"file-{len(files_data)+1:03d}",
                "name": str(row['file_name']),
                "status": "ready",
                "size": int(row['file_size_mb'] * 1024 * 1024) if pd.notna(row['file_size_mb']) else 0,
                "lastModified": row['last_modified'].isoformat() if pd.notna(row['last_modified']) else datetime.now().isoformat(),
                "priority_score": int(row['priority_score']) if pd.notna(row['priority_score']) else 50,
                "processing_status": str(row['processing_status']),
                "structure_signature": str(row['structure_signature']) if pd.notna(row['structure_signature']) else 'unknown',
                "cache_available": bool(row.get('cache_available', False)),
                "estimated_processing_time": int(row.get('estimated_rows', 120)),
                "ai_recommendation": str(row.get('processing_status', 'medium')).replace('failed', 'high_priority').replace('pending', 'medium'),
                "base_file_name": str(row['base_file_name']),
                "file_size_mb": float(row['file_size_mb']) if pd.notna(row['file_size_mb']) else 0.0,
                "type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "path": str(row['file_path']),
                "sheets": ["Sheet1"]  # Placeholder - would need separate call to get actual sheets
            }
            files_data.append(file_data)
        
        result = {
            "success": True,
            "operation": "discover_files_with_sheets",
            "data": files_data,
            "timestamp": datetime.now().isoformat()
        }
        
        # Use safe serialization to ensure no numpy types remain
        result = safe_json_serialize(result)
        
        return result
        
    except Exception as e:
        error_result = {
            "success": False,
            "operation": "discover_files_with_sheets",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }
        return safe_json_serialize(error_result)

def fixed_operation_handler(operation: str, parameters: dict):
    """
    Fixed operation handler that ensures all responses are properly JSON serialized.
    
    This is the main fix - it wraps any operation result with safe_json_serialize
    to prevent numpy int64 serialization errors.
    """
    
    try:
        if operation == "discover_files_with_sheets":
            result = fixed_discover_files_and_sheets_metadata(
                parameters.get('volume_folder', '/Volumes/test/bronze/raw/')
            )
        else:
            # For other operations, return error
            result = {
                "success": False,
                "operation": operation,
                "error": f"Operation {operation} not implemented in fix",
                "timestamp": datetime.now().isoformat()
            }
        
        # Critical fix: Always use safe_json_serialize before returning
        return safe_json_serialize(result)
        
    except Exception as e:
        error_result = {
            "success": False,
            "operation": operation,
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }
        return safe_json_serialize(error_result)

# Test function to verify the fix
def test_json_serialization_fix():
    """Test that the fix properly handles numpy types."""
    
    # Create test data with numpy types that would cause the original error
    test_data = {
        "priority_score": np.int64(95),
        "file_size": np.int64(1024000),
        "estimated_time": np.int32(120),
        "cache_available": np.bool_(True),
        "timestamp": pd.Timestamp.now()
    }
    
    # This would fail with original json.dumps:
    # json.dumps(test_data)  # Error: Object of type int64 is not JSON serializable
    
    # But works with safe_json_serialize:
    safe_data = safe_json_serialize(test_data)
    json_str = json.dumps(safe_data)
    
    print("✅ JSON serialization fix verified!")
    print(f"Safe data: {safe_data}")
    return True

if __name__ == "__main__":
    test_json_serialization_fix()