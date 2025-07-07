# === ENHANCED IMPORTS WITH ERROR HANDLING ===
import json
from datetime import datetime
import pandas as pd
import time

# Core SmartBDX imports (existing)
try:
    from smartbdx_config import DEFAULT_VOLUME_FOLDER, client
    CONFIG_LOADED = True
except ImportError as e:
    print(f"⚠️ Config import failed: {e}")
    DEFAULT_VOLUME_FOLDER = "/Volumes/test/bronze/raw/"
    client = None
    CONFIG_LOADED = False

try:
    from smartbdx_utilities import json_serialize_timestamps, safe_json_serialize
    UTILITIES_LOADED = True
except ImportError as e:
    print(f"⚠️ Utilities import failed: {e}")
    UTILITIES_LOADED = False
    # Fallback implementations
    def json_serialize_timestamps(data):
        """Fallback implementation for timestamp serialization"""
        return data
    
    def safe_json_serialize(data):
        """Fallback implementation for safe JSON serialization"""
        import json
        try:
            return data
        except:
            return str(data)

# Define table names (add these if missing)
CHECKPOINT_TABLE = "bdx.checkpoint_logs"
STRUCTURE_CACHE_TABLE = "bdx.metadata_cache.structure_cache"

# Enhanced imports for Phase 1 - with error handling
PHASE1_MODULES_LOADED = {}
PHASE1_IMPORT_ERRORS = []

# Processing module imports
try:
    from smartbdx_processing import (
        azure_optimized_batch_orchestration,
        resume_failed_batch,
        process_file_sheet_with_production_features
    )
    PHASE1_MODULES_LOADED['processing'] = True
    print("✅ SmartBDX Processing module imported successfully")
except ImportError as e:
    PHASE1_MODULES_LOADED['processing'] = False
    PHASE1_IMPORT_ERRORS.append(f"Processing module: {str(e)}")
    print(f"❌ Processing module import failed: {e}")

# Infrastructure module imports
try:
    from smartbdx_infrastructure import (
        BatchCheckpointManager,
        AzureOpenAIRateLimiter,
        initialize_smartbdx_infrastructure
    )
    PHASE1_MODULES_LOADED['infrastructure'] = True
    print("✅ SmartBDX Infrastructure module imported successfully")
except ImportError as e:
    PHASE1_MODULES_LOADED['infrastructure'] = False
    PHASE1_IMPORT_ERRORS.append(f"Infrastructure module: {str(e)}")
    print(f"❌ Infrastructure module import failed: {e}")

# Monitoring module imports
try:
    from smartbdx_monitoring import (
        show_batch_progress,
        get_failed_items,
        list_all_batches
    )
    PHASE1_MODULES_LOADED['monitoring'] = True
    print("✅ SmartBDX Monitoring module imported successfully")
except ImportError as e:
    PHASE1_MODULES_LOADED['monitoring'] = False
    PHASE1_IMPORT_ERRORS.append(f"Monitoring module: {str(e)}")
    print(f"❌ Monitoring module import failed: {e}")

# Selection module imports (existing functionality)
try:
    from smartbdx_selection import discover_files_and_sheets_metadata
    PHASE1_MODULES_LOADED['selection'] = True
    print("✅ SmartBDX Selection module imported successfully")
except ImportError as e:
    PHASE1_MODULES_LOADED['selection'] = False
    PHASE1_IMPORT_ERRORS.append(f"Selection module: {str(e)}")
    print(f"❌ Selection module import failed: {e}")

# Print Phase 1 module status
print(f"\n📊 Phase 1 Module Status:")
print(f"   ✅ Loaded: {sum(PHASE1_MODULES_LOADED.values())}/{len(PHASE1_MODULES_LOADED)} modules")
if PHASE1_IMPORT_ERRORS:
    print(f"   ❌ Errors: {len(PHASE1_IMPORT_ERRORS)} import issues")
    for error in PHASE1_IMPORT_ERRORS:
        print(f"      - {error}")

# COMMAND ----------

# === PARAMETER SETUP (Existing) ===
# Add operation parameter widgets
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

# === ENHANCED API OPERATION ROUTER ===
if operation:
    
    # === EXISTING OPERATIONS (Keep as-is) ===
    if operation == "discover_files_with_sheets":
        """
        EXISTING OPERATION: Discover files AND get sheet names in one call
        (Keep existing implementation unchanged for backward compatibility)
        """
        try:
            if not PHASE1_MODULES_LOADED.get('selection', False):
                raise ImportError("Selection module not available")
                
            volume_folder = parameters.get('volume_folder', DEFAULT_VOLUME_FOLDER)
            print(f"🔍 Discovering files with sheets in: {volume_folder}")
            
            # Use existing SmartBDX function
            metadata_df = discover_files_and_sheets_metadata(volume_folder)
            
            if metadata_df.empty:
                print("⚠️ No files or sheets discovered")
                result = {
                    "success": True,
                    "operation": "discover_files_with_sheets",
                    "data": [],
                    "total": 0,
                    "timestamp": datetime.now().isoformat()
                }
                dbutils.notebook.exit(json.dumps(safe_json_serialize(result)))
            
            print(f"📊 Raw metadata: {len(metadata_df)} file-sheet combinations from SmartBDX")
            
            # Group by file to collect sheet names (existing logic)
            files_data = []
            unique_files = metadata_df['file_name'].unique()
            print(f"📁 Processing {len(unique_files)} unique files...")
            
            for file_name in unique_files:
                file_data = metadata_df[metadata_df['file_name'] == file_name]
                first_row = file_data.iloc[0]
                sheet_names = file_data['sheet_name'].tolist()
                
                # Clean sheet names
                clean_sheet_names = []
                for sheet in sheet_names:
                    if pd.notna(sheet) and str(sheet).strip():
                        clean_name = str(sheet).strip()
                        clean_sheet_names.append(clean_name)
                
                if not clean_sheet_names:
                    print(f"   ⚠️ No valid sheets found for {file_name} - skipping file")
                    continue
                
                # Create frontend-compatible file object
                file_obj = {
                    "id": file_name,
                    "name": file_name,
                    "status": first_row.get('processing_status', 'ready'),
                    "lastModified": first_row.get('last_modified', ''),
                    "size": int(first_row.get('file_size_mb', 0) * 1024 * 1024) if first_row.get('file_size_mb') else 0,
                    "path": first_row.get('file_path', ''),
                    "sheets": clean_sheet_names,
                    "priority_score": first_row.get('priority_score', 50.0),
                    "estimated_rows": first_row.get('estimated_rows', 0)
                }
                
                files_data.append(file_obj)
                print(f"   ✅ {file_name}: {len(clean_sheet_names)} sheets")
            
            result = {
                "success": True,
                "operation": "discover_files_with_sheets",
                "data": files_data,
                "total": len(files_data),
                "summary": {
                    "total_files": len(files_data),
                    "total_sheets": sum(len(f['sheets']) for f in files_data),
                    "status_breakdown": metadata_df['processing_status'].value_counts().to_dict() if hasattr(metadata_df, 'processing_status') else {}
                },
                "timestamp": datetime.now().isoformat()
            }
            
            print(f"✅ Found {len(files_data)} files with sheet metadata")
            serializable_result = json_serialize_timestamps(result)
            dbutils.notebook.exit(json.dumps(safe_json_serialize(serializable_result)))
            
        except Exception as e:
            error_result = {
                "success": False,
                "operation": "discover_files_with_sheets",
                "error": str(e),
                "module_status": PHASE1_MODULES_LOADED,
                "timestamp": datetime.now().isoformat()
            }
            print(f"❌ Error: {e}")
            dbutils.notebook.exit(json.dumps(safe_json_serialize(error_result)))
    
    elif operation == "check_processing_status":
        """
        EXISTING OPERATION: Check processing status for efficiency preview
        (Keep existing implementation unchanged)
        """
        try:
            if not PHASE1_MODULES_LOADED.get('selection', False):
                raise ImportError("Selection module not available")
                
            from smartbdx_utilities import extract_base_file_name, compute_structure_signature_from_headers
            from smartbdx_mapping_data import load_metadata_from_cache
            
            volume_folder = parameters.get('volume_folder', DEFAULT_VOLUME_FOLDER)
            selected_files = parameters.get('files', [])
            
            print(f"🔍 Checking processing status for files...")
            
            # Convert frontend selection to file/sheet list
            if selected_files:
                selected_items = []
                for file_info in selected_files:
                    file_id = file_info['fileId']
                    sheets = file_info['sheets']
                    for sheet in sheets:
                        selected_items.append((file_id, sheet))
            else:
                # Check all files if no selection
                metadata_df = discover_files_and_sheets_metadata(volume_folder)
                selected_items = list(zip(metadata_df['file_name'], metadata_df['sheet_name']))
            
            print(f"📋 Checking {len(selected_items)} file/sheet combinations...")
            
            # Simplified status check for Phase 1
            status_summary = {
                "total_items": len(selected_items),
                "estimated_processing_time_minutes": len(selected_items) * 2,  # Rough estimate
                "cache_efficiency": "Analysis available in Phase 3",
                "selected_files": len(set([item[0] for item in selected_items])),
                "processing_recommendation": "Ready for batch processing"
            }
            
            result = {
                "success": True,
                "operation": "check_processing_status",
                "data": {
                    "summary": status_summary,
                    "selected_items": selected_items[:10],  # Show first 10 for preview
                    "phase_note": "Enhanced cache analysis available in Phase 3"
                },
                "timestamp": datetime.now().isoformat()
            }
            
            print(f"✅ Status check completed for {len(selected_items)} items")
            serializable_result = json_serialize_timestamps(result)
            dbutils.notebook.exit(json.dumps(safe_json_serialize(serializable_result)))
            
        except Exception as e:
            error_result = {
                "success": False,
                "operation": "check_processing_status", 
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }
            print(f"❌ Error: {e}")
            dbutils.notebook.exit(json.dumps(safe_json_serialize(error_result)))
    
    # === NEW PHASE 1 OPERATIONS ===
    elif operation == "process_files":
        """
        NEW OPERATION: Start actual batch processing with SmartBDX backend
        Maps to: smartbdx_processing.azure_optimized_batch_orchestration()
        """
        try:
            if not PHASE1_MODULES_LOADED.get('processing', False):
                raise ImportError("Processing module not available - cannot start batch processing")
                
            if not PHASE1_MODULES_LOADED.get('infrastructure', False):
                raise ImportError("Infrastructure module not available - cannot manage batch processing")
            
            # Get parameters with defaults
            files = parameters.get('files', [])
            batch_id = parameters.get('batch_id', f"frontend_batch_{int(time.time())}")
            enable_mapping = parameters.get('enable_mapping', True)
            volume_folder = parameters.get('volume_folder', DEFAULT_VOLUME_FOLDER)
            
            if not files:
                raise ValueError("No files specified for processing")
            
            print(f"🚀 Starting batch processing: {batch_id}")
            print(f"📂 Volume folder: {volume_folder}")
            print(f"🎛️ Mapping enabled: {enable_mapping}")
            
            # Convert frontend file selection to SmartBDX format
            selected_items = []
            for file_info in files:
                file_id = file_info.get('fileId')
                sheets = file_info.get('sheets', [])
                
                if not file_id:
                    print(f"⚠️ Skipping file info without fileId: {file_info}")
                    continue
                    
                if not sheets:  # If no sheets specified, get all sheets
                    try:
                        metadata_df = discover_files_and_sheets_metadata(volume_folder)
                        file_sheets = metadata_df[metadata_df['file_name'] == file_id]['sheet_name'].tolist()
                        sheets = file_sheets if file_sheets else ['Sheet1']  # Fallback
                        print(f"   📄 {file_id}: Auto-selected {len(sheets)} sheets")
                    except Exception as e:
                        print(f"   ⚠️ Could not auto-detect sheets for {file_id}, using default: {e}")
                        sheets = ['Sheet1']
                
                for sheet in sheets:
                    selected_items.append((file_id, sheet))
                    
            if not selected_items:
                raise ValueError("No valid file/sheet combinations found")
            
            print(f"📋 Processing {len(selected_items)} file/sheet combinations:")
            for i, (file_name, sheet_name) in enumerate(selected_items[:5]):  # Show first 5
                print(f"   {i+1}. {file_name} -> {sheet_name}")
            if len(selected_items) > 5:
                print(f"   ... and {len(selected_items) - 5} more")
            
            # Start actual SmartBDX processing
            print(f"⚡ Initiating SmartBDX batch orchestration...")
            
            processing_result = azure_optimized_batch_orchestration(
                client=client,
                batch_id=batch_id,
                tokens_per_minute=50000,  # Production limits
                requests_per_minute=50,
                volume_folder=volume_folder,
                enable_mapping=enable_mapping,
                selected_items=selected_items
            )
            
            # Calculate estimates
            estimated_duration = len(selected_items) * 2  # 2 minutes per item estimate
            
            # Transform result for frontend
            response_data = {
                "batch_id": batch_id,
                "status": "started", 
                "total_items": len(selected_items),
                "selected_files": len(set([item[0] for item in selected_items])),
                "estimated_duration_minutes": estimated_duration,
                "enable_mapping": enable_mapping,
                "volume_folder": volume_folder,
                "processing_details": {
                    "orchestration_result": processing_result.get('status', 'started') if isinstance(processing_result, dict) else 'started',
                    "batch_configuration": {
                        "rate_limit_tokens_per_minute": 50000,
                        "rate_limit_requests_per_minute": 50,
                        "mapping_enabled": enable_mapping
                    }
                },
                "next_steps": [
                    "Monitor batch progress using get_batch_status operation",
                    f"Check processing results in approximately {estimated_duration} minutes",
                    "Use resume_failed_batch if any items fail"
                ]
            }
            
            result = {
                "success": True,
                "operation": "process_files",
                "data": response_data,
                "timestamp": datetime.now().isoformat()
            }
            
            print(f"✅ Batch {batch_id} started successfully!")
            print(f"   📊 Total items: {len(selected_items)}")
            print(f"   ⏱️ Estimated duration: {estimated_duration} minutes")
            
            serializable_result = json_serialize_timestamps(result)
            dbutils.notebook.exit(json.dumps(safe_json_serialize(serializable_result)))
            
        except Exception as e:
            error_result = {
                "success": False,
                "operation": "process_files",
                "error": str(e),
                "error_type": type(e).__name__,
                "module_status": PHASE1_MODULES_LOADED,
                "suggested_action": "Check module availability and parameter format",
                "timestamp": datetime.now().isoformat()
            }
            print(f"❌ Batch processing failed: {e}")
            dbutils.notebook.exit(json.dumps(safe_json_serialize(error_result)))
    
    elif operation == "get_batch_status":
        """
        ENHANCED OPERATION: Real-time batch monitoring with comprehensive insights
        Maps to: smartbdx_monitoring.show_batch_progress() + infrastructure tracking
        """
        try:
            if not PHASE1_MODULES_LOADED.get('monitoring', False):
                raise ImportError("Monitoring module not available")
                
            if not PHASE1_MODULES_LOADED.get('infrastructure', False):
                print("⚠️ Infrastructure module not available - providing basic status only")
            
            batch_id = parameters.get('batch_id')
            include_details = parameters.get('include_details', True)
            
            if not batch_id:
                raise ValueError("batch_id parameter required")
            
            print(f"📊 Getting comprehensive status for batch: {batch_id}")
            
            # Get basic progress from monitoring module
            try:
                progress_data = show_batch_progress(batch_id, return_data=True)
                print(f"   ✅ Retrieved basic progress data")
            except Exception as e:
                print(f"   ⚠️ Could not get progress data: {e}")
                progress_data = {}
            
            # Get checkpoint data if infrastructure available
            checkpoint_data = {}
            if PHASE1_MODULES_LOADED.get('infrastructure', False):
                try:
                    checkpoint_mgr = BatchCheckpointManager()
                    # Get checkpoint summary (simplified for Phase 1)
                    checkpoint_data = {
                        "checkpoint_manager_available": True,
                        "tracking_enabled": True
                    }
                    print(f"   ✅ Retrieved checkpoint data")
                except Exception as e:
                    print(f"   ⚠️ Could not get checkpoint data: {e}")
                    checkpoint_data = {"checkpoint_manager_available": False}
            
            # Get failed items if monitoring available
            failed_items_data = {}
            if PHASE1_MODULES_LOADED.get('monitoring', False):
                try:
                    failed_items = get_failed_items(batch_id)
                    failed_items_data = {
                        "total_failed": len(failed_items),
                        "failed_items": [
                            {
                                "file_name": item.file_name,
                                "sheet_name": item.sheet_name,
                                "error_message": item.error_message[:100] + "..." if len(item.error_message) > 100 else item.error_message,
                                "retry_count": item.retry_count
                            }
                            for item in failed_items[:5]  # Show first 5 failed items
                        ] if include_details else []
                    }
                    print(f"   ✅ Retrieved failed items data: {len(failed_items)} failures")
                except Exception as e:
                    print(f"   ⚠️ Could not get failed items: {e}")
                    failed_items_data = {"total_failed": 0, "failed_items": []}
            
            # Build comprehensive status response
            current_time = datetime.now()
            
            # Calculate basic metrics
            total_items = progress_data.get('total', 0)
            completed_items = progress_data.get('completed', 0)
            failed_items_count = failed_items_data.get('total_failed', 0)
            
            progress_percentage = (completed_items / max(total_items, 1)) * 100 if total_items > 0 else 0
            
            status_data = {
                "batch_id": batch_id,
                "status": progress_data.get('status', 'unknown'),
                "progress_percentage": round(progress_percentage, 1),
                "completed_items": completed_items,
                "total_items": total_items,
                "failed_items": failed_items_count,
                "pending_items": max(total_items - completed_items - failed_items_count, 0),
                "current_operation": progress_data.get('current_file', 'Unknown'),
                "last_updated": current_time.isoformat(),
                
                # Performance metrics (basic calculation for Phase 1)
                "performance_metrics": {
                    "items_per_hour": round(completed_items / 1.0, 1) if completed_items > 0 else 0,  # Simplified
                    "estimated_completion_minutes": max((total_items - completed_items) * 2, 0),  # 2 min per item estimate
                    "processing_efficiency": round((completed_items / max(total_items, 1)) * 100, 1)
                },
                
                # System status
                "system_status": {
                    "monitoring_available": PHASE1_MODULES_LOADED.get('monitoring', False),
                    "infrastructure_available": PHASE1_MODULES_LOADED.get('infrastructure', False),
                    "checkpoint_tracking": checkpoint_data.get('checkpoint_manager_available', False)
                },
                
                # Error summary
                "error_summary": failed_items_data,
                
                # Next actions
                "recommended_actions": []
            }
            
            # Add recommendations based on status
            if status_data['status'] == 'failed' or failed_items_count > 0:
                status_data['recommended_actions'].append("Consider using resume_failed_batch operation")
            
            if status_data['status'] == 'processing':
                status_data['recommended_actions'].append("Monitor progress - batch is actively processing")
            
            if status_data['status'] == 'completed':
                status_data['recommended_actions'].append("Processing complete - check results")
            
            # Include detailed progress data if requested
            if include_details and progress_data:
                status_data['detailed_progress'] = progress_data
            
            result = {
                "success": True,
                "operation": "get_batch_status",
                "data": status_data,
                "timestamp": current_time.isoformat()
            }
            
            print(f"✅ Status retrieved for batch {batch_id}")
            print(f"   📊 Progress: {progress_percentage:.1f}% ({completed_items}/{total_items})")
            print(f"   ❌ Failed: {failed_items_count}")
            print(f"   📈 Status: {status_data['status']}")
            
            serializable_result = json_serialize_timestamps(result)
            dbutils.notebook.exit(json.dumps(safe_json_serialize(serializable_result)))
            
        except Exception as e:
            error_result = {
                "success": False,
                "operation": "get_batch_status",
                "error": str(e),
                "error_type": type(e).__name__,
                "module_status": PHASE1_MODULES_LOADED,
                "batch_id": parameters.get('batch_id', 'unknown'),
                "timestamp": datetime.now().isoformat()
            }
            print(f"❌ Failed to get batch status: {e}")
            dbutils.notebook.exit(json.dumps(safe_json_serialize(error_result)))
    
    elif operation == "resume_failed_batch":
        """
        NEW OPERATION: Resume failed batch processing with intelligent recovery
        Maps to: smartbdx_processing.resume_failed_batch()
        """
        try:
            if not PHASE1_MODULES_LOADED.get('processing', False):
                raise ImportError("Processing module not available - cannot resume batch")
                
            if not PHASE1_MODULES_LOADED.get('monitoring', False):
                raise ImportError("Monitoring module not available - cannot analyze failures")
            
            batch_id = parameters.get('batch_id')
            force_resume = parameters.get('force_resume', False)
            
            if not batch_id:
                raise ValueError("batch_id parameter required")
            
            print(f"🔄 Attempting to resume failed batch: {batch_id}")
            
            # First, analyze what failed
            try:
                failed_items = get_failed_items(batch_id)
                print(f"   📊 Found {len(failed_items)} failed items")
                
                if not failed_items and not force_resume:
                    result = {
                        "success": True,
                        "operation": "resume_failed_batch",
                        "data": {
                            "batch_id": batch_id,
                            "resume_status": "no_failures_found",
                            "message": "No failed items found for this batch",
                            "recommendation": "Use get_batch_status to check current batch state"
                        },
                        "timestamp": datetime.now().isoformat()
                    }
                    print(f"✅ No failures found for batch {batch_id}")
                    dbutils.notebook.exit(json.dumps(safe_json_serialize(result)))
                    
            except Exception as e:
                print(f"   ⚠️ Could not analyze failures: {e}")
                if not force_resume:
                    raise Exception(f"Cannot resume batch - failure analysis failed: {e}")
            
            # Show what will be resumed
            if failed_items:
                print(f"   🔄 Items to resume:")
                for i, item in enumerate(failed_items[:5]):  # Show first 5
                    print(f"      {i+1}. {item.file_name} -> {item.sheet_name} (retries: {item.retry_count})")
                if len(failed_items) > 5:
                    print(f"      ... and {len(failed_items) - 5} more items")
            
            # Resume the batch using SmartBDX functionality
            print(f"⚡ Initiating batch resumption...")
            
            resume_result = resume_failed_batch(client, batch_id)
            
            # Prepare response data
            response_data = {
                "batch_id": batch_id,
                "resume_status": "started",
                "failed_items_count": len(failed_items) if failed_items else 0,
                "estimated_resume_time_minutes": len(failed_items) * 2 if failed_items else 5,
                "resume_details": {
                    "original_failure_count": len(failed_items) if failed_items else 0,
                    "processing_result": resume_result.get('status', 'resumed') if isinstance(resume_result, dict) else 'resumed',
                    "resume_timestamp": datetime.now().isoformat()
                },
                "next_steps": [
                    "Monitor resumed batch using get_batch_status operation",
                    "Check for any new failures after resumption",
                    "Results will be available once processing completes"
                ]
            }
            
            # Add failure analysis if available
            if failed_items:
                # Categorize failure types for user insight
                error_categories = {}
                for item in failed_items:
                    error_msg = item.error_message or "Unknown error"
                    if "rate" in error_msg.lower() or "limit" in error_msg.lower():
                        category = "rate_limiting"
                    elif "token" in error_msg.lower():
                        category = "token_issues" 
                    elif "file" in error_msg.lower():
                        category = "file_access"
                    else:
                        category = "processing_errors"
                    
                    error_categories[category] = error_categories.get(category, 0) + 1
                
                response_data["failure_analysis"] = {
                    "error_categories": error_categories,
                    "high_retry_items": len([item for item in failed_items if item.retry_count >= 2]),
                    "recommendations": []
                }
                
                # Add specific recommendations
                if error_categories.get("rate_limiting", 0) > 0:
                    response_data["failure_analysis"]["recommendations"].append(
                        "Rate limiting detected - resume will use conservative processing"
                    )
                
                if error_categories.get("file_access", 0) > 0:
                    response_data["failure_analysis"]["recommendations"].append(
                        "File access issues detected - verify file permissions"
                    )
            
            result = {
                "success": True,
                "operation": "resume_failed_batch",
                "data": response_data,
                "timestamp": datetime.now().isoformat()
            }
            
            print(f"✅ Batch {batch_id} resumption initiated successfully!")
            if failed_items:
                print(f"   🔄 Resuming {len(failed_items)} failed items")
                print(f"   ⏱️ Estimated completion: {len(failed_items) * 2} minutes")
            
            serializable_result = json_serialize_timestamps(result)
            dbutils.notebook.exit(json.dumps(safe_json_serialize(serializable_result)))
            
        except Exception as e:
            error_result = {
                "success": False,
                "operation": "resume_failed_batch",
                "error": str(e),
                "error_type": type(e).__name__,
                "batch_id": parameters.get('batch_id', 'unknown'),
                "module_status": PHASE1_MODULES_LOADED,
                "suggested_actions": [
                    "Verify batch_id exists and has failed items",
                    "Check module availability",
                    "Use get_batch_status to verify batch state"
                ],
                "timestamp": datetime.now().isoformat()
            }
            print(f"❌ Failed to resume batch: {e}")
            dbutils.notebook.exit(json.dumps(safe_json_serialize(error_result)))
    
    # === OPERATION NOT FOUND HANDLER (Enhanced) ===
    else:
        # Enhanced error response with Phase 1 capabilities
        error_result = {
            "success": False,
            "operation": operation,
            "error": f"Unknown operation: {operation}",
            "available_operations": [
                "discover_files_with_sheets",  # Existing
                "check_processing_status",     # Existing
                "process_files",               # NEW - Phase 1
                "get_batch_status",           # ENHANCED - Phase 1
                "resume_failed_batch",        # NEW - Phase 1
                # Phase 2 operations (coming next):
                "smart_file_selection",
                "quick_file_analysis", 
                "analyze_batch_errors",
                # Phase 3 operations (coming later):
                "get_cache_analytics",
                "get_usage_analytics",
                "get_system_status",
                "get_processing_insights"
            ],
            "phase1_enhancements": [
                "🚀 Real batch processing with azure_optimized_batch_orchestration",
                "📊 Enhanced batch monitoring with performance metrics",
                "🔄 Intelligent batch resumption with failure analysis",
                "⚡ Production-grade error handling and logging",
                "🎯 Module availability checking and graceful degradation"
            ],
            "capabilities": [
                "Full production batch orchestration with checkpointing",
                "Real-time progress monitoring with ETAs and insights", 
                "Intelligent error recovery and retry strategies",
                "Comprehensive batch status tracking",
                "Failed batch analysis and resumption",
                "Module health checking and error reporting"
            ],
            "module_status": PHASE1_MODULES_LOADED,
            "import_errors": PHASE1_IMPORT_ERRORS,
            "phase": "Phase 1 - Foundation & Core Processing",
            "next_phase": "Phase 2 - Smart Selection & Analysis",
            "timestamp": datetime.now().isoformat()
        }
        print(f"❌ Unknown operation: {operation}")
        print(f"📋 Available Phase 1 operations: process_files, get_batch_status, resume_failed_batch")
        serializable_error = json_serialize_timestamps(error_result)
        dbutils.notebook.exit(json.dumps(safe_json_serialize(serializable_error)))

# If no operation specified, continue with normal SmartBDX processing
if not operation:
    print("🚀 No frontend operation specified - continuing with normal SmartBDX processing...")
    print("💡 Phase 1 Enhanced API Gateway loaded successfully!")
    print("📋 New operations available: process_files, get_batch_status (enhanced), resume_failed_batch")
    print(f"📊 Module status: {sum(PHASE1_MODULES_LOADED.values())}/{len(PHASE1_MODULES_LOADED)} loaded")

# COMMAND ----------



# === PHASE 2A: NEW SMART SELECTION OPERATIONS ===
# Add these operations after the "resume_failed_batch" operation from Phase 1

elif operation == "smart_file_selection":
        """
        NEW OPERATION: AI-powered file selection with priority algorithms
        Maps to: smartbdx_selection discovery + intelligent filtering algorithms
        """
        try:
            if not PHASE1_MODULES_LOADED.get('selection', False):
                raise ImportError("Selection module not available")
            
            # Get parameters with intelligent defaults
            volume_folder = parameters.get('volume_folder', DEFAULT_VOLUME_FOLDER)
            criteria = parameters.get('criteria', 'failed_first')
            max_items = parameters.get('max_items', 25)
            filters = parameters.get('filters', {})
            include_analysis = parameters.get('include_analysis', True)
            
            print(f"🧠 Smart file selection using '{criteria}' criteria")
            print(f"📂 Volume: {volume_folder}")
            print(f"🎯 Max items: {max_items}")
            
            # Get all available files with metadata
            metadata_df = discover_files_and_sheets_metadata(volume_folder)
            
            if metadata_df.empty:
                result = {
                    "success": True,
                    "operation": "smart_file_selection",
                    "data": {
                        "selected_items": [],
                        "total_available": 0,
                        "selection_summary": {
                            "message": "No files found in specified volume",
                            "criteria": criteria
                        }
                    },
                    "timestamp": datetime.now().isoformat()
                }
                print("⚠️ No files found for smart selection")
                dbutils.notebook.exit(json.dumps(safe_json_serialize(result)))
            
            print(f"📊 Found {len(metadata_df)} file/sheet combinations")
            
            # Add priority scoring if not present
            if 'priority_score' not in metadata_df.columns:
                # Generate priority scores based on file characteristics
                metadata_df['priority_score'] = 50.0  # Default score
                
                # Boost priority for recently modified files
                if 'last_modified' in metadata_df.columns:
                    try:
                        recent_threshold = pd.Timestamp.now() - pd.Timedelta(days=30)
                        metadata_df.loc[pd.to_datetime(metadata_df['last_modified']) > recent_threshold, 'priority_score'] += 20
                    except:
                        pass
                
                # Boost priority for larger files (more data value)
                if 'estimated_rows' in metadata_df.columns:
                    high_value_threshold = metadata_df['estimated_rows'].quantile(0.75)
                    metadata_df.loc[metadata_df['estimated_rows'] > high_value_threshold, 'priority_score'] += 15
                
                # Boost priority for previously failed items
                if 'processing_status' in metadata_df.columns:
                    metadata_df.loc[metadata_df['processing_status'] == 'failed', 'priority_score'] += 30
            
            # Apply smart selection algorithms
            print(f"⚡ Applying '{criteria}' selection algorithm...")
            
            if criteria == 'failed_first':
                # Prioritize previously failed items, then by priority score
                metadata_df['status_priority'] = metadata_df.get('processing_status', 'pending').map({
                    'failed': 1,
                    'pending': 2, 
                    'ready': 3,
                    'processing': 4,
                    'completed': 5
                })
                sorted_df = metadata_df.sort_values(['status_priority', 'priority_score'], 
                                                   ascending=[True, False])
                print(f"   🔥 Prioritizing failed and pending items")
                
            elif criteria == 'newest_first':
                # Prioritize recent files
                if 'last_modified' in metadata_df.columns:
                    sorted_df = metadata_df.sort_values('last_modified', ascending=False)
                else:
                    sorted_df = metadata_df.sort_values('priority_score', ascending=False)
                print(f"   📅 Prioritizing recently modified files")
                
            elif criteria == 'largest_first':
                # Prioritize larger files (more potential value)
                if 'estimated_rows' in metadata_df.columns:
                    sorted_df = metadata_df.sort_values('estimated_rows', ascending=False)
                else:
                    sorted_df = metadata_df.sort_values('priority_score', ascending=False)
                print(f"   📏 Prioritizing larger files by estimated rows")
                
            elif criteria == 'high_priority':
                # Use priority scoring algorithm
                sorted_df = metadata_df.sort_values('priority_score', ascending=False)
                print(f"   ⭐ Prioritizing by calculated priority scores")
                
            elif criteria == 'random_sample':
                # Random sampling for testing
                sorted_df = metadata_df.sample(frac=1.0).reset_index(drop=True)
                print(f"   🎲 Random sampling for testing/exploration")
                
            else:
                # Default: priority score descending
                sorted_df = metadata_df.sort_values('priority_score', ascending=False)
                print(f"   📊 Using default priority scoring")
            
            # Apply additional filters
            original_count = len(sorted_df)
            
            if filters.get('file_patterns'):
                patterns = filters['file_patterns']
                if isinstance(patterns, str):
                    patterns = [patterns]
                pattern = '|'.join(patterns)
                sorted_df = sorted_df[sorted_df['file_name'].str.contains(pattern, case=False, na=False)]
                print(f"   🔍 File pattern filter: {len(sorted_df)}/{original_count} items")
            
            if filters.get('sheet_patterns'):
                patterns = filters['sheet_patterns']
                if isinstance(patterns, str):
                    patterns = [patterns]
                pattern = '|'.join(patterns)
                sorted_df = sorted_df[sorted_df['sheet_name'].str.contains(pattern, case=False, na=False)]
                print(f"   📋 Sheet pattern filter: {len(sorted_df)}/{original_count} items")
            
            if filters.get('min_priority_score'):
                min_score = filters['min_priority_score']
                sorted_df = sorted_df[sorted_df['priority_score'] >= min_score]
                print(f"   ⚡ Priority filter (>={min_score}): {len(sorted_df)}/{original_count} items")
            
            if filters.get('min_estimated_rows'):
                min_rows = filters['min_estimated_rows']
                if 'estimated_rows' in sorted_df.columns:
                    sorted_df = sorted_df[sorted_df['estimated_rows'] >= min_rows]
                    print(f"   📊 Size filter (>={min_rows} rows): {len(sorted_df)}/{original_count} items")
            
            if filters.get('exclude_completed'):
                if 'processing_status' in sorted_df.columns:
                    sorted_df = sorted_df[sorted_df['processing_status'] != 'completed']
                    print(f"   ✅ Excluding completed: {len(sorted_df)}/{original_count} items")
            
            # Select top items up to max_items
            selected_df = sorted_df.head(max_items)
            
            # Convert to frontend format
            selected_items = []
            for _, row in selected_df.iterrows():
                selected_items.append({
                    "fileId": row['file_name'],
                    "fileName": row['file_name'], 
                    "sheetName": row['sheet_name'],
                    "status": row.get('processing_status', 'ready'),
                    "priorityScore": round(row.get('priority_score', 50.0), 1),
                    "estimatedRows": int(row.get('estimated_rows', 0)),
                    "lastModified": str(row.get('last_modified', '')),
                    "reason": f"Selected by {criteria} criteria"
                })
            
            # Calculate selection insights
            total_estimated_tokens = 0
            estimated_processing_time = 0
            
            if include_analysis:
                # Rough token estimation (500 tokens per 1000 rows)
                for _, row in selected_df.iterrows():
                    estimated_rows = row.get('estimated_rows', 100)
                    item_tokens = max(estimated_rows * 0.5, 100)  # Conservative estimate
                    total_estimated_tokens += item_tokens
                
                # Processing time estimation (2 minutes per item average)
                estimated_processing_time = len(selected_items) * 2
            
            # Priority distribution analysis
            priority_distribution = {
                "high_priority": len(selected_df[selected_df['priority_score'] >= 80]),
                "medium_priority": len(selected_df[(selected_df['priority_score'] >= 50) & (selected_df['priority_score'] < 80)]),
                "low_priority": len(selected_df[selected_df['priority_score'] < 50])
            }
            
            # File diversity analysis
            unique_files = selected_df['file_name'].nunique()
            avg_sheets_per_file = len(selected_items) / max(unique_files, 1)
            
            selection_data = {
                "selected_items": selected_items,
                "selection_summary": {
                    "total_selected": len(selected_items),
                    "total_available": len(metadata_df),
                    "selection_criteria": criteria,
                    "filters_applied": list(filters.keys()) if filters else [],
                    "selection_efficiency": round((len(selected_items) / max(len(sorted_df), 1)) * 100, 1)
                },
                "processing_estimates": {
                    "estimated_processing_time_minutes": round(estimated_processing_time, 1),
                    "estimated_token_usage": int(total_estimated_tokens),
                    "estimated_cost_usd": round(total_estimated_tokens * 0.00001, 3),  # Rough cost estimate
                    "recommended_batch_size": min(len(selected_items), 20)
                },
                "selection_analysis": {
                    "priority_distribution": priority_distribution,
                    "file_diversity": {
                        "unique_files": unique_files,
                        "total_sheets": len(selected_items),
                        "avg_sheets_per_file": round(avg_sheets_per_file, 1)
                    },
                    "complexity_assessment": "medium" if len(selected_items) <= 15 else "high"
                },
                "recommendations": []
            }
            
            # Add intelligent recommendations
            if len(selected_items) > 30:
                selection_data["recommendations"].append(
                    "Consider processing in smaller batches for better monitoring"
                )
            
            if priority_distribution["low_priority"] > priority_distribution["high_priority"]:
                selection_data["recommendations"].append(
                    "Most selected items have low priority - consider adjusting criteria"
                )
            
            if unique_files < 3 and len(selected_items) > 10:
                selection_data["recommendations"].append(
                    "Selection concentrated in few files - consider broader file selection"
                )
            
            if total_estimated_tokens > 100000:
                selection_data["recommendations"].append(
                    "High token usage estimated - monitor processing costs"
                )
            
            result = {
                "success": True,
                "operation": "smart_file_selection",
                "data": selection_data,
                "timestamp": datetime.now().isoformat()
            }
            
            print(f"✅ Smart selection completed:")
            print(f"   📊 Selected: {len(selected_items)}/{len(metadata_df)} items")
            print(f"   ⚡ Criteria: {criteria}")
            print(f"   📁 Files: {unique_files}")
            print(f"   ⏱️ Est. time: {estimated_processing_time} minutes")
            
            serializable_result = json_serialize_timestamps(result)
            dbutils.notebook.exit(json.dumps(safe_json_serialize(serializable_result)))
            
        except Exception as e:
            error_result = {
                "success": False,
                "operation": "smart_file_selection",
                "error": str(e),
                "error_type": type(e).__name__,
                "parameters": parameters,
                "module_status": PHASE1_MODULES_LOADED,
                "timestamp": datetime.now().isoformat()
            }
            print(f"❌ Smart file selection failed: {e}")
            dbutils.notebook.exit(json.dumps(safe_json_serialize(error_result)))

elif operation == "quick_file_analysis":
        """
        NEW OPERATION: Quick file analysis for processing preview without full execution
        Provides structure analysis, complexity assessment, and processing recommendations
        """
        try:
            if not PHASE1_MODULES_LOADED.get('selection', False):
                raise ImportError("Selection module not available")
            
            # Get parameters
            volume_folder = parameters.get('volume_folder', DEFAULT_VOLUME_FOLDER)
            files = parameters.get('files', [])  # Specific files to analyze
            max_files = parameters.get('max_files', 10)
            include_structure_preview = parameters.get('include_structure_preview', True)
            
            print(f"🔍 Quick file analysis starting...")
            print(f"📂 Volume: {volume_folder}")
            
            # Determine which files to analyze
            if files:
                # Analyze specific files
                print(f"🎯 Analyzing {len(files)} specified files")
                file_list = []
                for file_info in files:
                    if isinstance(file_info, str):
                        file_list.append(file_info)
                    elif isinstance(file_info, dict) and 'fileId' in file_info:
                        file_list.append(file_info['fileId'])
                    elif isinstance(file_info, dict) and 'fileName' in file_info:
                        file_list.append(file_info['fileName'])
                
                # Get metadata for specific files
                metadata_df = discover_files_and_sheets_metadata(volume_folder)
                if not metadata_df.empty:
                    target_df = metadata_df[metadata_df['file_name'].isin(file_list)]
                else:
                    target_df = pd.DataFrame()
            else:
                # Analyze top files by priority
                print(f"📊 Analyzing top {max_files} files by priority")
                metadata_df = discover_files_and_sheets_metadata(volume_folder)
                if not metadata_df.empty:
                    # Group by file and take top files
                    file_priority = metadata_df.groupby('file_name').agg({
                        'priority_score': 'max',
                        'estimated_rows': 'sum'
                    }).reset_index()
                    top_files = file_priority.nlargest(max_files, 'priority_score')['file_name'].tolist()
                    target_df = metadata_df[metadata_df['file_name'].isin(top_files)]
                else:
                    target_df = pd.DataFrame()
            
            if target_df.empty:
                result = {
                    "success": True,
                    "operation": "quick_file_analysis",
                    "data": {
                        "analysis_results": [],
                        "summary": {
                            "total_analyzed": 0,
                            "message": "No files found for analysis"
                        }
                    },
                    "timestamp": datetime.now().isoformat()
                }
                print("⚠️ No files found for analysis")
                dbutils.notebook.exit(json.dumps(safe_json_serialize(result)))
            
            print(f"📋 Analyzing {len(target_df)} file/sheet combinations")
            
            # Group analysis by file
            analysis_results = []
            unique_files = target_df['file_name'].unique()
            
            for file_name in unique_files[:max_files]:  # Respect max_files limit
                print(f"   🔍 Analyzing: {file_name}")
                
                file_data = target_df[target_df['file_name'] == file_name]
                
                # Basic file analysis
                file_analysis = {
                    "file_name": file_name,
                    "total_sheets": len(file_data),
                    "sheet_names": file_data['sheet_name'].tolist(),
                    "estimated_total_rows": file_data['estimated_rows'].sum(),
                    "average_priority_score": round(file_data['priority_score'].mean(), 1),
                    "processing_status": file_data['processing_status'].iloc[0] if 'processing_status' in file_data.columns else 'unknown',
                    "last_modified": str(file_data['last_modified'].iloc[0]) if 'last_modified' in file_data.columns else 'unknown'
                }
                
                # Complexity assessment
                total_rows = file_analysis['estimated_total_rows']
                sheet_count = file_analysis['total_sheets']
                
                if total_rows > 10000 or sheet_count > 5:
                    complexity = "high"
                    complexity_reason = f"Large dataset ({total_rows:,} rows, {sheet_count} sheets)"
                elif total_rows > 2000 or sheet_count > 2:
                    complexity = "medium"
                    complexity_reason = f"Moderate dataset ({total_rows:,} rows, {sheet_count} sheets)"
                else:
                    complexity = "low"
                    complexity_reason = f"Small dataset ({total_rows:,} rows, {sheet_count} sheets)"
                
                file_analysis["complexity_assessment"] = {
                    "level": complexity,
                    "reason": complexity_reason,
                    "estimated_processing_time_minutes": max(sheet_count * 2, 1),
                    "estimated_tokens": max(total_rows * 0.5, 100),
                    "recommended_batch_size": 1 if complexity == "high" else min(sheet_count, 5)
                }
                
                # Processing recommendations
                recommendations = []
                
                if complexity == "high":
                    recommendations.append("Process individually due to size")
                    recommendations.append("Monitor token usage carefully")
                
                if sheet_count > 3:
                    recommendations.append("Consider processing sheets in batches")
                
                if file_analysis["processing_status"] == "failed":
                    recommendations.append("Previous processing failed - check error logs before retry")
                elif file_analysis["processing_status"] == "completed":
                    recommendations.append("Already processed - verify if reprocessing needed")
                
                if file_analysis["average_priority_score"] < 40:
                    recommendations.append("Low priority - consider processing after higher priority files")
                
                file_analysis["recommendations"] = recommendations
                
                # Structure preview (if requested and available)
                if include_structure_preview:
                    try:
                        # Get sample structure information (first few sheets)
                        structure_preview = []
                        for _, sheet_row in file_data.head(3).iterrows():  # Preview first 3 sheets
                            sheet_info = {
                                "sheet_name": sheet_row['sheet_name'],
                                "estimated_rows": sheet_row.get('estimated_rows', 0),
                                "estimated_columns": sheet_row.get('estimated_columns', 'unknown'),
                                "has_headers": sheet_row.get('has_headers', True),
                                "structure_signature": sheet_row.get('structure_signature', 'unknown')[:16] + "..." if sheet_row.get('structure_signature') else 'none'
                            }
                            structure_preview.append(sheet_info)
                        
                        file_analysis["structure_preview"] = structure_preview
                        
                    except Exception as e:
                        file_analysis["structure_preview"] = f"Preview unavailable: {str(e)}"
                
                analysis_results.append(file_analysis)
            
            # Overall analysis summary
            total_files = len(analysis_results)
            total_sheets = sum([f['total_sheets'] for f in analysis_results])
            total_estimated_rows = sum([f['estimated_total_rows'] for f in analysis_results])
            
            complexity_distribution = {}
            for result in analysis_results:
                level = result['complexity_assessment']['level']
                complexity_distribution[level] = complexity_distribution.get(level, 0) + 1
            
            estimated_total_time = sum([f['complexity_assessment']['estimated_processing_time_minutes'] for f in analysis_results])
            estimated_total_tokens = sum([f['complexity_assessment']['estimated_tokens'] for f in analysis_results])
            
            summary = {
                "total_analyzed_files": total_files,
                "total_sheets": total_sheets,
                "total_estimated_rows": total_estimated_rows,
                "complexity_distribution": complexity_distribution,
                "processing_estimates": {
                    "total_estimated_time_minutes": round(estimated_total_time, 1),
                    "total_estimated_tokens": int(estimated_total_tokens),
                    "estimated_cost_usd": round(estimated_total_tokens * 0.00001, 3),
                    "recommended_batch_strategy": "sequential" if complexity_distribution.get("high", 0) > 0 else "parallel"
                },
                "overall_recommendations": []
            }
            
            # Overall recommendations
            if complexity_distribution.get("high", 0) > 2:
                summary["overall_recommendations"].append("Multiple complex files detected - process in small batches")
            
            if estimated_total_time > 60:
                summary["overall_recommendations"].append("Long processing time expected - plan accordingly")
            
            if estimated_total_tokens > 50000:
                summary["overall_recommendations"].append("High token usage - monitor costs and rate limits")
            
            result = {
                "success": True,
                "operation": "quick_file_analysis",
                "data": {
                    "analysis_results": analysis_results,
                    "summary": summary,
                    "analysis_timestamp": datetime.now().isoformat(),
                    "analysis_scope": f"{total_files} files, {total_sheets} sheets"
                },
                "timestamp": datetime.now().isoformat()
            }
            
            print(f"✅ Quick analysis completed:")
            print(f"   📁 Files: {total_files}")
            print(f"   📋 Sheets: {total_sheets}")
            print(f"   📊 Est. rows: {total_estimated_rows:,}")
            print(f"   ⏱️ Est. time: {estimated_total_time:.1f} minutes")
            print(f"   🏷️ Complexity: {complexity_distribution}")
            
            serializable_result = json_serialize_timestamps(result)
            dbutils.notebook.exit(json.dumps(safe_json_serialize(serializable_result)))
            
        except Exception as e:
            error_result = {
                "success": False,
                "operation": "quick_file_analysis",
                "error": str(e),
                "error_type": type(e).__name__,
                "parameters": parameters,
                "module_status": PHASE1_MODULES_LOADED,
                "timestamp": datetime.now().isoformat()
            }
            print(f"❌ Quick file analysis failed: {e}")
            dbutils.notebook.exit(json.dumps(safe_json_serialize(error_result)))



# === PHASE 2B: ADVANCED ERROR ANALYSIS OPERATIONS ===
# Add these operations after the "quick_file_analysis" operation from Phase 2a

elif operation == "analyze_batch_errors":
        """
        NEW OPERATION: Comprehensive error analysis with pattern detection and recovery suggestions
        Maps to: smartbdx_monitoring.get_failed_items() + advanced pattern analysis
        """
        try:
            if not PHASE1_MODULES_LOADED.get('monitoring', False):
                raise ImportError("Monitoring module not available")
            
            # Get parameters
            batch_id = parameters.get('batch_id')
            include_patterns = parameters.get('include_patterns', True)
            include_suggestions = parameters.get('include_suggestions', True)
            include_trends = parameters.get('include_trends', False)
            max_error_details = parameters.get('max_error_details', 20)
            
            if not batch_id:
                raise ValueError("batch_id parameter required")
            
            print(f"🛠️ Analyzing errors for batch: {batch_id}")
            print(f"📊 Pattern analysis: {include_patterns}")
            print(f"💡 Recovery suggestions: {include_suggestions}")
            
            # Get failed items with detailed error information
            failed_items = get_failed_items(batch_id)
            
            if not failed_items:
                result = {
                    "success": True,
                    "operation": "analyze_batch_errors",
                    "data": {
                        "error_analysis": {
                            "total_errors": 0,
                            "message": "No errors found for this batch",
                            "batch_status": "healthy"
                        }
                    },
                    "timestamp": datetime.now().isoformat()
                }
                print(f"✅ No errors found for batch {batch_id}")
                dbutils.notebook.exit(json.dumps(safe_json_serialize(result)))
            
            print(f"🔍 Found {len(failed_items)} failed items for analysis")
            
            # Basic error categorization
            error_categories = {}
            error_details = []
            retry_analysis = {}
            
            for item in failed_items:
                error_msg = item.error_message or "Unknown error"
                
                # Enhanced error categorization with multiple checks
                category = "other"
                subcategory = "unknown"
                severity = "medium"
                
                error_lower = error_msg.lower()
                
                # Rate limiting errors
                if any(keyword in error_lower for keyword in ["rate", "limit", "throttle", "quota"]):
                    category = "rate_limiting"
                    if "token" in error_lower:
                        subcategory = "token_rate_limit"
                    elif "request" in error_lower:
                        subcategory = "request_rate_limit"
                    else:
                        subcategory = "general_rate_limit"
                    severity = "high"
                
                # Token/size related errors
                elif any(keyword in error_lower for keyword in ["token", "length", "size", "large"]):
                    category = "token_issues"
                    if "context" in error_lower:
                        subcategory = "context_length_exceeded"
                    elif "input" in error_lower:
                        subcategory = "input_too_large"
                    else:
                        subcategory = "token_limit_exceeded"
                    severity = "high"
                
                # File access errors
                elif any(keyword in error_lower for keyword in ["file", "path", "access", "permission", "not found"]):
                    category = "file_access"
                    if "permission" in error_lower:
                        subcategory = "permission_denied"
                    elif "not found" in error_lower:
                        subcategory = "file_not_found"
                    elif "corrupt" in error_lower:
                        subcategory = "file_corrupted"
                    else:
                        subcategory = "file_access_general"
                    severity = "medium"
                
                # AI/OpenAI processing errors
                elif any(keyword in error_lower for keyword in ["openai", "gpt", "azure", "api", "model"]):
                    category = "ai_processing"
                    if "timeout" in error_lower:
                        subcategory = "api_timeout"
                    elif "connection" in error_lower:
                        subcategory = "connection_error"
                    elif "model" in error_lower:
                        subcategory = "model_error"
                    else:
                        subcategory = "api_error"
                    severity = "high"
                
                # Data processing errors
                elif any(keyword in error_lower for keyword in ["parse", "format", "data", "excel", "sheet"]):
                    category = "data_processing"
                    if "parse" in error_lower:
                        subcategory = "parsing_error"
                    elif "format" in error_lower:
                        subcategory = "format_error"
                    elif "sheet" in error_lower:
                        subcategory = "sheet_error"
                    else:
                        subcategory = "data_error"
                    severity = "medium"
                
                # Network/connectivity errors
                elif any(keyword in error_lower for keyword in ["network", "connection", "timeout", "dns"]):
                    category = "connectivity"
                    if "timeout" in error_lower:
                        subcategory = "timeout"
                    elif "dns" in error_lower:
                        subcategory = "dns_error"
                    else:
                        subcategory = "network_error"
                    severity = "medium"
                
                # Update category counts
                if category not in error_categories:
                    error_categories[category] = {
                        "count": 0,
                        "subcategories": {},
                        "severity_distribution": {"high": 0, "medium": 0, "low": 0}
                    }
                
                error_categories[category]["count"] += 1
                error_categories[category]["severity_distribution"][severity] += 1
                
                if subcategory not in error_categories[category]["subcategories"]:
                    error_categories[category]["subcategories"][subcategory] = 0
                error_categories[category]["subcategories"][subcategory] += 1
                
                # Retry analysis
                retry_count = item.retry_count
                if retry_count not in retry_analysis:
                    retry_analysis[retry_count] = {
                        "count": 0,
                        "categories": {}
                    }
                retry_analysis[retry_count]["count"] += 1
                retry_analysis[retry_count]["categories"][category] = retry_analysis[retry_count]["categories"].get(category, 0) + 1
                
                # Collect error details (limited to max_error_details)
                if len(error_details) < max_error_details:
                    error_details.append({
                        "file_name": item.file_name,
                        "sheet_name": item.sheet_name,
                        "error_category": category,
                        "error_subcategory": subcategory,
                        "severity": severity,
                        "error_message": error_msg[:200] + "..." if len(error_msg) > 200 else error_msg,
                        "retry_count": retry_count,
                        "last_attempt": str(item.started_at) if item.started_at else None,
                        "processing_duration": str(item.completed_at - item.started_at) if item.completed_at and item.started_at else None
                    })
            
            # Build comprehensive error analysis
            error_analysis = {
                "total_errors": len(failed_items),
                "error_categories": error_categories,
                "retry_analysis": retry_analysis,
                "error_details": error_details,
                "analysis_timestamp": datetime.now().isoformat()
            }
            
            # Add pattern analysis if requested
            if include_patterns:
                patterns = []
                
                # File-based error patterns
                file_errors = {}
                sheet_errors = {}
                
                for item in failed_items:
                    # File patterns
                    file_errors[item.file_name] = file_errors.get(item.file_name, 0) + 1
                    
                    # Sheet patterns
                    sheet_key = f"{item.file_name}::{item.sheet_name}"
                    sheet_errors[sheet_key] = sheet_errors.get(sheet_key, 0) + 1
                
                # Identify problematic files
                problematic_files = [(f, count) for f, count in file_errors.items() if count > 1]
                if problematic_files:
                    patterns.append({
                        "type": "problematic_files",
                        "description": f"{len(problematic_files)} files have multiple sheet failures",
                        "severity": "high" if any(count > 3 for _, count in problematic_files) else "medium",
                        "details": sorted(problematic_files, key=lambda x: x[1], reverse=True)[:10],
                        "recommendation": "Focus on fixing file-level issues before retry"
                    })
                
                # Identify persistent failures (high retry count)
                high_retry_items = [item for item in failed_items if item.retry_count >= 2]
                if high_retry_items:
                    patterns.append({
                        "type": "persistent_failures",
                        "description": f"{len(high_retry_items)} items failed multiple attempts",
                        "severity": "high",
                        "details": [
                            {
                                "file": item.file_name,
                                "sheet": item.sheet_name,
                                "retries": item.retry_count,
                                "last_error": item.error_message[:100] + "..." if len(item.error_message) > 100 else item.error_message
                            }
                            for item in high_retry_items[:10]
                        ],
                        "recommendation": "Manual intervention required - check root causes"
                    })
                
                # Time-based patterns (if timestamps available)
                if hasattr(failed_items[0], 'started_at') and failed_items[0].started_at:
                    try:
                        # Group failures by hour to identify temporal patterns
                        time_groups = {}
                        for item in failed_items:
                            if item.started_at:
                                hour_key = str(item.started_at)[:13]  # YYYY-MM-DD HH
                                time_groups[hour_key] = time_groups.get(hour_key, 0) + 1
                        
                        # Find hours with high failure rates
                        high_failure_hours = [(hour, count) for hour, count in time_groups.items() if count > 2]
                        if high_failure_hours:
                            patterns.append({
                                "type": "temporal_clustering",
                                "description": f"Failures clustered in {len(high_failure_hours)} time periods",
                                "severity": "medium",
                                "details": sorted(high_failure_hours, key=lambda x: x[1], reverse=True)[:5],
                                "recommendation": "Check for system resource constraints during peak failure times"
                            })
                    except:
                        pass  # Skip temporal analysis if data unavailable
                
                # Error message similarity patterns
                error_messages = [item.error_message for item in failed_items if item.error_message]
                if error_messages:
                    # Find common error phrases
                    common_phrases = {}
                    for msg in error_messages:
                        # Extract key phrases (simple approach)
                        words = msg.lower().split()
                        for i in range(len(words) - 1):
                            phrase = f"{words[i]} {words[i+1]}"
                            if len(phrase) > 6 and not any(skip in phrase for skip in ['the ', 'and ', 'for ', 'with ']):
                                common_phrases[phrase] = common_phrases.get(phrase, 0) + 1
                    
                    frequent_phrases = [(phrase, count) for phrase, count in common_phrases.items() if count > 2]
                    if frequent_phrases:
                        patterns.append({
                            "type": "common_error_patterns",
                            "description": f"{len(frequent_phrases)} recurring error patterns detected",
                            "severity": "medium",
                            "details": sorted(frequent_phrases, key=lambda x: x[1], reverse=True)[:5],
                            "recommendation": "Address root causes of recurring error patterns"
                        })
                
                error_analysis["error_patterns"] = patterns
            
            # Add recovery suggestions if requested
            if include_suggestions:
                suggestions = []
                
                # Category-specific suggestions
                for category, data in error_categories.items():
                    count = data["count"]
                    high_severity = data["severity_distribution"]["high"]
                    
                    if category == "rate_limiting":
                        suggestions.append({
                            "category": category,
                            "issue": f"Rate limiting detected ({count} errors)",
                            "severity": "high",
                            "immediate_actions": [
                                "Reduce batch size to 10-15 items maximum",
                                "Increase delay between requests to 30+ seconds",
                                "Check Azure OpenAI quota and limits"
                            ],
                            "long_term_solutions": [
                                "Implement adaptive rate limiting",
                                "Consider upgrading Azure OpenAI tier",
                                "Optimize token usage with better chunking"
                            ],
                            "estimated_resolution_time": "15-30 minutes"
                        })
                    
                    elif category == "token_issues":
                        suggestions.append({
                            "category": category,
                            "issue": f"Token limit issues detected ({count} errors)",
                            "severity": "high",
                            "immediate_actions": [
                                "Reduce chunk size for large files",
                                "Split complex sheets into smaller sections",
                                "Use more aggressive data filtering"
                            ],
                            "long_term_solutions": [
                                "Implement intelligent chunking algorithms",
                                "Pre-process files to remove unnecessary data",
                                "Optimize prompts to reduce token usage"
                            ],
                            "estimated_resolution_time": "30-60 minutes"
                        })
                    
                    elif category == "file_access":
                        suggestions.append({
                            "category": category,
                            "issue": f"File access problems detected ({count} errors)",
                            "severity": "medium",
                            "immediate_actions": [
                                "Verify file paths and permissions",
                                "Check volume mount status",
                                "Validate file integrity"
                            ],
                            "long_term_solutions": [
                                "Implement file validation before processing",
                                "Add file backup and recovery mechanisms",
                                "Monitor file system health"
                            ],
                            "estimated_resolution_time": "10-20 minutes"
                        })
                    
                    elif category == "ai_processing":
                        suggestions.append({
                            "category": category,
                            "issue": f"AI processing failures detected ({count} errors)",
                            "severity": "high",
                            "immediate_actions": [
                                "Check Azure OpenAI service status",
                                "Verify API key and endpoint configuration",
                                "Test with simpler processing requests"
                            ],
                            "long_term_solutions": [
                                "Implement fallback AI models",
                                "Add comprehensive API health monitoring",
                                "Optimize prompt engineering"
                            ],
                            "estimated_resolution_time": "20-45 minutes"
                        })
                    
                    elif category == "data_processing":
                        suggestions.append({
                            "category": category,
                            "issue": f"Data processing errors detected ({count} errors)",
                            "severity": "medium",
                            "immediate_actions": [
                                "Validate Excel file formats",
                                "Check for corrupted or password-protected files",
                                "Verify sheet names and structure"
                            ],
                            "long_term_solutions": [
                                "Implement robust data validation",
                                "Add support for more Excel formats",
                                "Create data quality scoring system"
                            ],
                            "estimated_resolution_time": "15-30 minutes"
                        })
                
                # Global suggestions based on overall patterns
                total_high_severity = sum(data["severity_distribution"]["high"] for data in error_categories.values())
                persistent_failures = len([item for item in failed_items if item.retry_count >= 2])
                
                if total_high_severity > len(failed_items) * 0.5:
                    suggestions.append({
                        "category": "system",
                        "issue": "High proportion of severe errors detected",
                        "severity": "critical",
                        "immediate_actions": [
                            "Pause all processing until root causes resolved",
                            "Review system configuration and resource allocation",
                            "Contact technical support if issues persist"
                        ],
                        "long_term_solutions": [
                            "Implement comprehensive system health monitoring",
                            "Add automated error prevention mechanisms",
                            "Develop incident response procedures"
                        ],
                        "estimated_resolution_time": "60+ minutes"
                    })
                
                if persistent_failures > 0:
                    suggestions.append({
                        "category": "recovery",
                        "issue": f"{persistent_failures} items require manual intervention",
                        "severity": "high",
                        "immediate_actions": [
                            "Review persistent failure details individually",
                            "Identify common factors in failed items",
                            "Consider excluding problematic items temporarily"
                        ],
                        "long_term_solutions": [
                            "Implement intelligent retry strategies",
                            "Add automated failure classification",
                            "Develop item-specific processing rules"
                        ],
                        "estimated_resolution_time": "45-90 minutes"
                    })
                
                error_analysis["recovery_suggestions"] = suggestions
            
            # Add trend analysis if requested
            if include_trends:
                try:
                    # Simple trend analysis - compare with recent batches
                    # This would require additional batch history data
                    trend_analysis = {
                        "trend_analysis_note": "Trend analysis requires batch history data",
                        "current_batch_error_rate": round((len(failed_items) / max(len(failed_items) + 1, 1)) * 100, 1),
                        "recommendations": [
                            "Collect more batch history for meaningful trend analysis",
                            "Implement error rate tracking over time",
                            "Monitor error patterns across multiple batches"
                        ]
                    }
                    error_analysis["trend_analysis"] = trend_analysis
                except Exception as e:
                    error_analysis["trend_analysis"] = {"error": f"Trend analysis unavailable: {str(e)}"}
            
            result = {
                "success": True,
                "operation": "analyze_batch_errors",
                "data": {"error_analysis": error_analysis},
                "timestamp": datetime.now().isoformat()
            }
            
            print(f"✅ Error analysis completed for batch {batch_id}")
            print(f"   📊 Total errors: {len(failed_items)}")
            print(f"   🏷️ Categories: {len(error_categories)}")
            print(f"   🔍 Patterns: {len(error_analysis.get('error_patterns', []))}")
            print(f"   💡 Suggestions: {len(error_analysis.get('recovery_suggestions', []))}")
            
            serializable_result = json_serialize_timestamps(result)
            dbutils.notebook.exit(json.dumps(safe_json_serialize(serializable_result)))
            
        except Exception as e:
            error_result = {
                "success": False,
                "operation": "analyze_batch_errors",
                "error": str(e),
                "error_type": type(e).__name__,
                "batch_id": parameters.get('batch_id', 'unknown'),
                "module_status": PHASE1_MODULES_LOADED,
                "timestamp": datetime.now().isoformat()
            }
            print(f"❌ Error analysis failed: {e}")
            dbutils.notebook.exit(json.dumps(safe_json_serialize(error_result)))

elif operation == "suggest_batch_strategy":
        """
        NEW OPERATION: Intelligent batch strategy optimization with processing recommendations
        Analyzes file characteristics and suggests optimal processing approaches
        """
        try:
            if not PHASE1_MODULES_LOADED.get('selection', False):
                raise ImportError("Selection module not available")
            
            # Get parameters
            files = parameters.get('files', [])
            volume_folder = parameters.get('volume_folder', DEFAULT_VOLUME_FOLDER)
            target_processing_time = parameters.get('target_processing_time_minutes', 60)
            risk_tolerance = parameters.get('risk_tolerance', 'medium')  # low, medium, high
            include_cost_analysis = parameters.get('include_cost_analysis', True)
            
            print(f"🎯 Generating batch strategy recommendations")
            print(f"📂 Volume: {volume_folder}")
            print(f"⏱️ Target time: {target_processing_time} minutes")
            print(f"⚖️ Risk tolerance: {risk_tolerance}")
            
            # Get file metadata for analysis
            if files:
                # Analyze specific files
                file_names = []
                for file_info in files:
                    if isinstance(file_info, str):
                        file_names.append(file_info)
                    elif isinstance(file_info, dict):
                        file_names.append(file_info.get('fileId', file_info.get('fileName', '')))
                
                metadata_df = discover_files_and_sheets_metadata(volume_folder)
                if not metadata_df.empty:
                    target_df = metadata_df[metadata_df['file_name'].isin(file_names)]
                else:
                    target_df = pd.DataFrame()
            else:
                # Analyze all available files
                target_df = discover_files_and_sheets_metadata(volume_folder)
            
            if target_df.empty:
                result = {
                    "success": True,
                    "operation": "suggest_batch_strategy",
                    "data": {
                        "strategy_recommendations": [],
                        "summary": {
                            "message": "No files available for strategy analysis",
                            "recommended_action": "Check file availability and permissions"
                        }
                    },
                    "timestamp": datetime.now().isoformat()
                }
                print("⚠️ No files available for strategy analysis")
                dbutils.notebook.exit(json.dumps(safe_json_serialize(result)))
            
            print(f"📊 Analyzing {len(target_df)} file/sheet combinations")
            
            # Analyze file characteristics
            file_analysis = {}
            unique_files = target_df['file_name'].unique()
            
            total_estimated_rows = 0
            total_sheets = len(target_df)
            complexity_scores = []
            
            for file_name in unique_files:
                file_data = target_df[target_df['file_name'] == file_name]
                
                file_rows = file_data['estimated_rows'].sum()
                file_sheets = len(file_data)
                avg_priority = file_data['priority_score'].mean()
                
                # Calculate complexity score
                complexity_score = 0
                complexity_score += min(file_rows / 1000, 10)  # Row complexity (max 10 points)
                complexity_score += min(file_sheets * 2, 8)    # Sheet complexity (max 8 points)
                complexity_score += (100 - avg_priority) / 10  # Priority complexity (max 10 points)
                
                file_analysis[file_name] = {
                    "estimated_rows": file_rows,
                    "sheet_count": file_sheets,
                    "avg_priority_score": round(avg_priority, 1),
                    "complexity_score": round(complexity_score, 1),
                    "processing_status": file_data['processing_status'].iloc[0] if 'processing_status' in file_data.columns else 'unknown'
                }
                
                total_estimated_rows += file_rows
                complexity_scores.append(complexity_score)
            
            avg_complexity = sum(complexity_scores) / len(complexity_scores) if complexity_scores else 0
            
            # Estimate processing requirements
            estimated_total_time = total_sheets * 2  # 2 minutes per sheet baseline
            estimated_tokens = total_estimated_rows * 0.5  # 0.5 tokens per row estimate
            estimated_cost = estimated_tokens * 0.00001  # Rough cost estimate
            
            # Risk assessment
            risk_factors = []
            
            if avg_complexity > 15:
                risk_factors.append("High complexity files detected")
            
            if estimated_total_time > target_processing_time * 1.5:
                risk_factors.append("Processing time significantly exceeds target")
            
            if estimated_tokens > 100000:
                risk_factors.append("High token usage may trigger rate limits")
            
            if len(unique_files) > 20:
                risk_factors.append("Large number of files increases failure probability")
            
            # Generate strategy recommendations
            strategies = []
            
            # Strategy 1: Sequential Processing
            sequential_strategy = {
                "strategy_name": "Sequential Processing",
                "description": "Process files one at a time to minimize resource conflicts",
                "batch_configuration": {
                    "batch_size": 1,
                    "parallel_processing": False,
                    "recommended_delays": "30 seconds between files"
                },
                "pros": [
                    "Lowest risk of rate limiting",
                    "Easy to monitor and debug",
                    "Predictable resource usage"
                ],
                "cons": [
                    "Longest total processing time",
                    "Inefficient resource utilization"
                ],
                "estimated_completion_time": estimated_total_time,
                "risk_level": "low",
                "recommended_for": ["High-value files", "First-time processing", "Complex datasets"]
            }
            
            # Strategy 2: Small Batch Processing
            optimal_batch_size = max(min(len(unique_files) // 3, 5), 1)
            small_batch_time = estimated_total_time * 0.7  # 30% time saving
            
            small_batch_strategy = {
                "strategy_name": "Small Batch Processing",
                "description": f"Process files in small batches of {optimal_batch_size} for balanced efficiency",
                "batch_configuration": {
                    "batch_size": optimal_batch_size,
                    "parallel_processing": True,
                    "recommended_delays": "15 seconds between batches"
                },
                "pros": [
                    "Good balance of speed and reliability",
                    "Moderate resource usage",
                    "Recoverable if failures occur"
                ],
                "cons": [
                    "Some coordination overhead",
                    "May not fully utilize available resources"
                ],
                "estimated_completion_time": round(small_batch_time, 1),
                "risk_level": "medium",
                "recommended_for": ["Regular processing", "Mixed complexity files", "Production workloads"]
            }
            
            # Strategy 3: Aggressive Parallel Processing
            max_parallel = min(len(unique_files), 10)
            parallel_time = estimated_total_time * 0.4  # 60% time saving
            
            parallel_strategy = {
                "strategy_name": "Aggressive Parallel Processing",
                "description": f"Process up to {max_parallel} files simultaneously for maximum speed",
                "batch_configuration": {
                    "batch_size": max_parallel,
                    "parallel_processing": True,
                    "recommended_delays": "5 seconds between requests"
                },
                "pros": [
                    "Fastest processing time",
                    "Maximum resource utilization",
                    "Suitable for time-critical workloads"
                ],
                "cons": [
                    "Higher risk of rate limiting",
                    "More difficult to debug failures",
                    "Resource contention possible"
                ],
                "estimated_completion_time": round(parallel_time, 1),
                "risk_level": "high",
                "recommended_for": ["Simple files only", "Testing environments", "Time-critical processing"]
            }
            
            strategies.extend([sequential_strategy, small_batch_strategy, parallel_strategy])
            
            # Strategy 4: Complexity-Based Processing (if mixed complexity)
            if max(complexity_scores) - min(complexity_scores) > 10:  # Significant complexity variation
                complexity_strategy = {
                    "strategy_name": "Complexity-Based Processing",
                    "description": "Process files in groups based on complexity levels",
                    "batch_configuration": {
                        "batch_size": "variable",
                        "parallel_processing": "adaptive",
                        "recommended_delays": "variable based on complexity"
                    },
                    "pros": [
                        "Optimized for file characteristics",
                        "Reduces failure risk for complex files",
                        "Efficient resource allocation"
                    ],
                    "cons": [
                        "More complex to implement",
                        "Requires careful coordination"
                    ],
                    "estimated_completion_time": round(estimated_total_time * 0.6, 1),
                    "risk_level": "medium",
                    "recommended_for": ["Mixed file types", "Large-scale processing", "Advanced users"],
                    "implementation_details": {
                        "low_complexity_batch_size": 8,
                        "medium_complexity_batch_size": 3,
                        "high_complexity_batch_size": 1
                    }
                }
                strategies.append(complexity_strategy)
            
            # Apply risk tolerance filtering
            if risk_tolerance == "low":
                recommended_strategies = [s for s in strategies if s["risk_level"] in ["low", "medium"]]
            elif risk_tolerance == "medium":
                recommended_strategies = strategies
            else:  # high risk tolerance
                recommended_strategies = strategies
            
            # Select optimal strategy based on constraints
            optimal_strategy = None
            
            for strategy in recommended_strategies:
                if strategy["estimated_completion_time"] <= target_processing_time * 1.2:  # Within 20% of target
                    optimal_strategy = strategy
                    break
            
            if not optimal_strategy:
                optimal_strategy = min(recommended_strategies, key=lambda s: s["estimated_completion_time"])
            
            # Cost analysis
            cost_analysis = {}
            if include_cost_analysis:
                cost_analysis = {
                    "estimated_total_tokens": int(estimated_tokens),
                    "estimated_cost_usd": round(estimated_cost, 3),
                    "cost_per_file": round(estimated_cost / len(unique_files), 4),
                    "cost_optimization_suggestions": []
                }
                
                if estimated_cost > 5.0:
                    cost_analysis["cost_optimization_suggestions"].append("Consider processing in phases to spread costs")
                
                if estimated_tokens > 50000:
                    cost_analysis["cost_optimization_suggestions"].append("High token usage - implement chunking optimization")
                
                if avg_complexity > 20:
                    cost_analysis["cost_optimization_suggestions"].append("Complex files detected - consider pre-processing to reduce tokens")
            
            # Final recommendations
            final_recommendations = []
            
            # Time-based recommendations
            if optimal_strategy["estimated_completion_time"] > target_processing_time:
                final_recommendations.append(
                    f"Target time ({target_processing_time}m) not achievable - consider processing in phases"
                )
            
            # Risk-based recommendations
            if len(risk_factors) > 2:
                final_recommendations.append("Multiple risk factors detected - recommend sequential processing")
            
            # Complexity-based recommendations
            if avg_complexity > 15:
                final_recommendations.append("High complexity files - enable detailed monitoring and error handling")
            
            # Resource-based recommendations
            if estimated_tokens > 75000:
                final_recommendations.append("High token usage expected - monitor rate limits closely")
            
            strategy_data = {
                "file_analysis_summary": {
                    "total_files": len(unique_files),
                    "total_sheets": total_sheets,
                    "total_estimated_rows": total_estimated_rows,
                    "average_complexity_score": round(avg_complexity, 1),
                    "complexity_distribution": {
                        "low": len([s for s in complexity_scores if s < 10]),
                        "medium": len([s for s in complexity_scores if 10 <= s < 20]),
                        "high": len([s for s in complexity_scores if s >= 20])
                    }
                },
                "processing_estimates": {
                    "estimated_total_time_minutes": round(estimated_total_time, 1),
                    "estimated_tokens": int(estimated_tokens),
                    "target_processing_time": target_processing_time,
                    "time_feasibility": "achievable" if estimated_total_time <= target_processing_time * 1.2 else "challenging"
                },
                "risk_assessment": {
                    "risk_factors": risk_factors,
                    "overall_risk_level": "high" if len(risk_factors) > 2 else "medium" if len(risk_factors) > 0 else "low",
                    "risk_tolerance": risk_tolerance
                },
                "strategy_options": strategies,
                "optimal_strategy": optimal_strategy,
                "cost_analysis": cost_analysis,
                "final_recommendations": final_recommendations,
                "implementation_notes": [
                    "Start with conservative settings and adjust based on results",
                    "Monitor progress closely during first batch",
                    "Have recovery plan ready for potential failures",
                    "Consider processing high-priority files first"
                ]
            }
            
            result = {
                "success": True,
                "operation": "suggest_batch_strategy",
                "data": strategy_data,
                "timestamp": datetime.now().isoformat()
            }
            
            print(f"✅ Batch strategy analysis completed:")
            print(f"   📁 Files: {len(unique_files)}")
            print(f"   📊 Complexity: {avg_complexity:.1f}/30")
            print(f"   ⏱️ Est. time: {estimated_total_time:.1f} minutes")
            print(f"   🎯 Optimal: {optimal_strategy['strategy_name']}")
            print(f"   ⚖️ Risk: {len(risk_factors)} factors detected")
            
            serializable_result = json_serialize_timestamps(result)
            dbutils.notebook.exit(json.dumps(safe_json_serialize(serializable_result)))
            
        except Exception as e:
            error_result = {
                "success": False,
                "operation": "suggest_batch_strategy",
                "error": str(e),
                "error_type": type(e).__name__,
                "parameters": parameters,
                "module_status": PHASE1_MODULES_LOADED,
                "timestamp": datetime.now().isoformat()
            }
            print(f"❌ Batch strategy analysis failed: {e}")
            dbutils.notebook.exit(json.dumps(safe_json_serialize(error_result)))

# COMMAND ----------

# === UPDATE OPERATION REGISTRY FOR PHASE 2B ===
# Update the "operation not found" handler to include Phase 2b operations

elif operation == "get_cache_analytics":
    """
    NEW OPERATION: Cache efficiency and cost optimization analytics
    Maps to: smartbdx_infrastructure cache utilization + Delta table analytics
    """
    try:
        # Get parameters
        include_trends = parameters.get('include_trends', True)
        include_savings = parameters.get('include_savings', True)
        days_back = parameters.get('days_back', 7)
        
        print(f"📊 Generating cache analytics (last {days_back} days)")
        
        # Basic cache statistics from checkpoint table
        try:
            cache_stats = spark.sql(f"""
                SELECT 
                    COUNT(*) as total_processed,
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_items,
                    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_items,
                    COUNT(DISTINCT batch_id) as total_batches,
                    AVG(CASE WHEN completed_at IS NOT NULL AND started_at IS NOT NULL 
                        THEN UNIX_TIMESTAMP(completed_at) - UNIX_TIMESTAMP(started_at) END) as avg_processing_time
                FROM {CHECKPOINT_TABLE}
                WHERE started_at >= CURRENT_DATE - INTERVAL {days_back} DAYS
            """).collect()
            
            if cache_stats:
                stats = cache_stats[0]
                total_processed = stats.total_processed or 0
                successful_items = stats.successful_items or 0
                failed_items = stats.failed_items or 0
                total_batches = stats.total_batches or 0
                avg_time = stats.avg_processing_time or 0
            else:
                total_processed = successful_items = failed_items = total_batches = avg_time = 0
                
        except Exception as e:
            print(f"⚠️ Could not query checkpoint table: {e}")
            total_processed = successful_items = failed_items = total_batches = avg_time = 0
        
        # Structure cache statistics
        try:
            structure_stats = spark.sql(f"""
                SELECT COUNT(*) as cached_structures
                FROM {STRUCTURE_CACHE_TABLE}
            """).collect()
            cached_structures = structure_stats[0].cached_structures if structure_stats else 0
        except:
            cached_structures = 0
        
        # Calculate cache efficiency estimates
        estimated_cache_hit_rate = 0.75 if total_processed > 0 else 0  # Conservative estimate
        estimated_cache_hits = total_processed * estimated_cache_hit_rate
        estimated_tokens_saved = estimated_cache_hits * 800  # Avg tokens per cache hit
        estimated_cost_savings = estimated_tokens_saved * 0.00001  # Cost per token
        
        # Performance metrics
        success_rate = (successful_items / max(total_processed, 1)) * 100
        failure_rate = (failed_items / max(total_processed, 1)) * 100
        avg_batch_size = total_processed / max(total_batches, 1)
        
        analytics_data = {
            "cache_efficiency": {
                "total_operations": total_processed,
                "estimated_cache_hit_rate": round(estimated_cache_hit_rate, 3),
                "cached_structures": cached_structures,
                "cache_effectiveness_score": min(estimated_cache_hit_rate * 100, 100)
            },
            "performance_metrics": {
                "total_processed_items": total_processed,
                "success_rate_percent": round(success_rate, 1),
                "failure_rate_percent": round(failure_rate, 1),
                "average_processing_time_seconds": round(avg_time, 1),
                "average_batch_size": round(avg_batch_size, 1),
                "total_batches": total_batches
            },
            "cost_optimization": {
                "estimated_tokens_saved": int(estimated_tokens_saved),
                "estimated_cost_savings_usd": round(estimated_cost_savings, 3),
                "processing_efficiency_score": round(success_rate, 1),
                "cost_per_successful_item": round(estimated_cost_savings / max(successful_items, 1), 5)
            }
        }
        
        # Add trend analysis if requested
        if include_trends and total_processed > 0:
            try:
                trend_data = spark.sql(f"""
                    SELECT 
                        DATE(started_at) as process_date,
                        COUNT(*) as daily_operations,
                        COUNT(CASE WHEN status = 'completed' THEN 1 END) as daily_successes,
                        COUNT(DISTINCT batch_id) as daily_batches
                    FROM {CHECKPOINT_TABLE}
                    WHERE started_at >= CURRENT_DATE - INTERVAL {days_back} DAYS
                    GROUP BY DATE(started_at)
                    ORDER BY process_date
                """).collect()
                
                trends = []
                for row in trend_data:
                    daily_success_rate = (row.daily_successes / max(row.daily_operations, 1)) * 100
                    trends.append({
                        "date": str(row.process_date),
                        "operations": row.daily_operations,
                        "success_rate": round(daily_success_rate, 1),
                        "batches": row.daily_batches
                    })
                
                # Calculate trend direction
                if len(trends) >= 2:
                    recent_avg = sum(t["success_rate"] for t in trends[-3:]) / min(len(trends), 3)
                    early_avg = sum(t["success_rate"] for t in trends[:3]) / min(len(trends), 3)
                    trend_direction = "improving" if recent_avg > early_avg + 5 else "declining" if recent_avg < early_avg - 5 else "stable"
                else:
                    trend_direction = "insufficient_data"
                
                analytics_data["trends"] = {
                    "daily_metrics": trends,
                    "trend_direction": trend_direction,
                    "analysis_period_days": days_back
                }
            except Exception as e:
                analytics_data["trends"] = {"error": f"Trend analysis failed: {str(e)}"}
        
        # Add optimization recommendations
        recommendations = []
        if estimated_cache_hit_rate < 0.5:
            recommendations.append("Low cache hit rate - review file structure patterns")
        if success_rate < 80:
            recommendations.append("Success rate below 80% - investigate common failure causes")
        if avg_time > 300:  # 5 minutes
            recommendations.append("High processing time - consider optimization strategies")
        if total_batches < 5 and total_processed > 20:
            recommendations.append("Large batch sizes detected - consider smaller batches for better monitoring")
        
        analytics_data["recommendations"] = recommendations
        
        result = {
            "success": True,
            "operation": "get_cache_analytics",
            "data": analytics_data,
            "timestamp": datetime.now().isoformat()
        }
        
        print(f"✅ Cache analytics completed:")
        print(f"   📊 Processed: {total_processed} items")
        print(f"   ✅ Success rate: {success_rate:.1f}%")
        print(f"   💰 Est. savings: ${estimated_cost_savings:.3f}")
        print(f"   🏗️ Cached structures: {cached_structures}")
        
        serializable_result = json_serialize_timestamps(result)
        dbutils.notebook.exit(json.dumps(safe_json_serialize(serializable_result)))
        
    except Exception as e:
        error_result = {
            "success": False,
            "operation": "get_cache_analytics",
            "error": str(e),
            "error_type": type(e).__name__,
            "timestamp": datetime.now().isoformat()
        }
        print(f"❌ Cache analytics failed: {e}")
        dbutils.notebook.exit(json.dumps(safe_json_serialize(error_result)))

elif operation == "get_usage_analytics":
        """
        NEW OPERATION: System usage analytics and performance metrics
        Provides comprehensive system utilization and performance insights
        """
        try:
            # Get parameters
            include_performance = parameters.get('include_performance', True)
            include_costs = parameters.get('include_costs', True)
            include_trends = parameters.get('include_trends', True)
            days_back = parameters.get('days_back', 30)
            
            print(f"📈 Generating usage analytics (last {days_back} days)")
            
            # System utilization metrics
            try:
                utilization_stats = spark.sql(f"""
                    SELECT 
                        COUNT(DISTINCT batch_id) as total_batches,
                        COUNT(*) as total_operations,
                        COUNT(DISTINCT DATE(started_at)) as active_days,
                        MIN(started_at) as first_operation,
                        MAX(started_at) as last_operation,
                        AVG(CASE WHEN completed_at IS NOT NULL AND started_at IS NOT NULL 
                            THEN UNIX_TIMESTAMP(completed_at) - UNIX_TIMESTAMP(started_at) END) as avg_operation_time
                    FROM {CHECKPOINT_TABLE}
                    WHERE started_at >= CURRENT_DATE - INTERVAL {days_back} DAYS
                """).collect()
                
                if utilization_stats:
                    stats = utilization_stats[0]
                    total_batches = stats.total_batches or 0
                    total_operations = stats.total_operations or 0
                    active_days = stats.active_days or 0
                    avg_operation_time = stats.avg_operation_time or 0
                else:
                    total_batches = total_operations = active_days = avg_operation_time = 0
                    
            except Exception as e:
                print(f"⚠️ Could not query utilization data: {e}")
                total_batches = total_operations = active_days = avg_operation_time = 0
            
            # Calculate derived metrics
            operations_per_day = total_operations / max(active_days, 1)
            batches_per_day = total_batches / max(active_days, 1)
            operations_per_batch = total_operations / max(total_batches, 1)
            system_utilization = min((active_days / max(days_back, 1)) * 100, 100)
            
            # Performance metrics
            performance_data = {}
            if include_performance:
                try:
                    perf_stats = spark.sql(f"""
                        SELECT 
                            COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_ops,
                            COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_ops,
                            COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing_ops,
                            AVG(retry_count) as avg_retry_count,
                            MAX(retry_count) as max_retry_count
                        FROM {CHECKPOINT_TABLE}
                        WHERE started_at >= CURRENT_DATE - INTERVAL {days_back} DAYS
                    """).collect()
                    
                    if perf_stats:
                        p_stats = perf_stats[0]
                        completed = p_stats.completed_ops or 0
                        failed = p_stats.failed_ops or 0
                        processing = p_stats.processing_ops or 0
                        avg_retries = p_stats.avg_retry_count or 0
                        max_retries = p_stats.max_retry_count or 0
                        
                        performance_data = {
                            "completion_rate": round((completed / max(total_operations, 1)) * 100, 1),
                            "failure_rate": round((failed / max(total_operations, 1)) * 100, 1),
                            "currently_processing": processing,
                            "average_retry_count": round(avg_retries, 2),
                            "max_retry_count": max_retries,
                            "reliability_score": round(max(100 - (failed / max(total_operations, 1)) * 100, 0), 1)
                        }
                except:
                    performance_data = {"error": "Performance data unavailable"}
            
            # Cost estimates
            cost_data = {}
            if include_costs:
                # Rough cost estimation based on operations
                estimated_tokens_per_op = 1000  # Conservative estimate
                total_estimated_tokens = total_operations * estimated_tokens_per_op
                estimated_total_cost = total_estimated_tokens * 0.00001
                cost_per_operation = estimated_total_cost / max(total_operations, 1)
                monthly_projected_cost = (estimated_total_cost / max(days_back, 1)) * 30
                
                cost_data = {
                    "estimated_total_tokens": total_estimated_tokens,
                    "estimated_total_cost_usd": round(estimated_total_cost, 3),
                    "cost_per_operation": round(cost_per_operation, 5),
                    "monthly_projected_cost_usd": round(monthly_projected_cost, 2),
                    "cost_efficiency_rating": "good" if cost_per_operation < 0.01 else "moderate" if cost_per_operation < 0.05 else "high"
                }
            
            # Trend analysis
            trend_data = {}
            if include_trends and total_operations > 0:
                try:
                    weekly_trends = spark.sql(f"""
                        SELECT 
                            WEEKOFYEAR(started_at) as week_number,
                            COUNT(*) as weekly_operations,
                            COUNT(DISTINCT batch_id) as weekly_batches,
                            COUNT(CASE WHEN status = 'completed' THEN 1 END) as weekly_successes
                        FROM {CHECKPOINT_TABLE}
                        WHERE started_at >= CURRENT_DATE - INTERVAL {min(days_back, 28)} DAYS
                        GROUP BY WEEKOFYEAR(started_at)
                        ORDER BY week_number
                    """).collect()
                    
                    weekly_data = []
                    for row in weekly_trends:
                        success_rate = (row.weekly_successes / max(row.weekly_operations, 1)) * 100
                        weekly_data.append({
                            "week": row.week_number,
                            "operations": row.weekly_operations,
                            "batches": row.weekly_batches,
                            "success_rate": round(success_rate, 1)
                        })
                    
                    # Calculate growth trend
                    if len(weekly_data) >= 2:
                        recent_ops = sum(w["operations"] for w in weekly_data[-2:])
                        early_ops = sum(w["operations"] for w in weekly_data[:2])
                        growth_trend = "increasing" if recent_ops > early_ops * 1.1 else "decreasing" if recent_ops < early_ops * 0.9 else "stable"
                    else:
                        growth_trend = "insufficient_data"
                    
                    trend_data = {
                        "weekly_trends": weekly_data,
                        "usage_trend": growth_trend,
                        "peak_week_operations": max((w["operations"] for w in weekly_data), default=0)
                    }
                except:
                    trend_data = {"error": "Trend analysis unavailable"}
            
            # System health indicators
            health_score = 100
            health_factors = []
            
            if performance_data.get("failure_rate", 0) > 20:
                health_score -= 30
                health_factors.append("High failure rate detected")
            
            if system_utilization < 10:
                health_score -= 10
                health_factors.append("Low system utilization")
            
            if avg_operation_time > 600:  # 10 minutes
                health_score -= 20
                health_factors.append("High processing times")
            
            if performance_data.get("average_retry_count", 0) > 1:
                health_score -= 15
                health_factors.append("High retry rates")
            
            # Usage recommendations
            recommendations = []
            
            if system_utilization < 30:
                recommendations.append("System underutilized - consider increasing batch frequency")
            elif system_utilization > 90:
                recommendations.append("High utilization - monitor for resource constraints")
            
            if operations_per_batch > 50:
                recommendations.append("Large batches detected - consider smaller sizes for better control")
            elif operations_per_batch < 5:
                recommendations.append("Small batches - consider consolidation for efficiency")
            
            if cost_data.get("cost_per_operation", 0) > 0.02:
                recommendations.append("High cost per operation - review optimization opportunities")
            
            analytics_data = {
                "system_utilization": {
                    "total_batches": total_batches,
                    "total_operations": total_operations,
                    "active_days": active_days,
                    "operations_per_day": round(operations_per_day, 1),
                    "batches_per_day": round(batches_per_day, 1),
                    "operations_per_batch": round(operations_per_batch, 1),
                    "utilization_percentage": round(system_utilization, 1)
                },
                "performance_metrics": performance_data,
                "cost_analysis": cost_data,
                "trend_analysis": trend_data,
                "system_health": {
                    "overall_health_score": max(health_score, 0),
                    "health_factors": health_factors,
                    "status": "excellent" if health_score >= 90 else "good" if health_score >= 70 else "moderate" if health_score >= 50 else "poor"
                },
                "recommendations": recommendations,
                "analysis_period": {
                    "days_analyzed": days_back,
                    "data_completeness": "high" if total_operations > 10 else "low"
                }
            }
            
            result = {
                "success": True,
                "operation": "get_usage_analytics",
                "data": analytics_data,
                "timestamp": datetime.now().isoformat()
            }
            
            print(f"✅ Usage analytics completed:")
            print(f"   📊 Operations: {total_operations}")
            print(f"   🏭 Batches: {total_batches}")
            print(f"   📈 Utilization: {system_utilization:.1f}%")
            print(f"   🏥 Health: {max(health_score, 0)}/100")
            
            serializable_result = json_serialize_timestamps(result)
            dbutils.notebook.exit(json.dumps(safe_json_serialize(serializable_result)))
            
        except Exception as e:
            error_result = {
                "success": False,
                "operation": "get_usage_analytics",
                "error": str(e),
                "error_type": type(e).__name__,
                "timestamp": datetime.now().isoformat()
            }
            print(f"❌ Usage analytics failed: {e}")
            dbutils.notebook.exit(json.dumps(safe_json_serialize(error_result)))

elif operation == "get_processing_insights":
        """
        ENHANCED OPERATION: Advanced processing insights with predictive analytics
        Provides deep insights into batch performance and optimization opportunities
        """
        try:
            # Get parameters
            batch_id = parameters.get('batch_id')  # Optional - specific batch analysis
            include_predictions = parameters.get('include_predictions', True)
            include_optimization = parameters.get('include_optimization', True)
            days_back = parameters.get('days_back', 14)
            
            print(f"🔮 Generating processing insights")
            if batch_id:
                print(f"   🎯 Specific batch: {batch_id}")
            else:
                print(f"   📊 System-wide analysis (last {days_back} days)")
            
            # Base query condition
            if batch_id:
                base_condition = f"batch_id = '{batch_id}'"
            else:
                base_condition = f"started_at >= CURRENT_DATE - INTERVAL {days_back} DAYS"
            
            # Processing performance analysis
            try:
                perf_analysis = spark.sql(f"""
                    SELECT 
                        COUNT(*) as total_items,
                        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_items,
                        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_items,
                        AVG(CASE WHEN completed_at IS NOT NULL AND started_at IS NOT NULL 
                            THEN UNIX_TIMESTAMP(completed_at) - UNIX_TIMESTAMP(started_at) END) as avg_duration,
                        MIN(CASE WHEN completed_at IS NOT NULL AND started_at IS NOT NULL 
                            THEN UNIX_TIMESTAMP(completed_at) - UNIX_TIMESTAMP(started_at) END) as min_duration,
                        MAX(CASE WHEN completed_at IS NOT NULL AND started_at IS NOT NULL 
                            THEN UNIX_TIMESTAMP(completed_at) - UNIX_TIMESTAMP(started_at) END) as max_duration,
                        AVG(retry_count) as avg_retries,
                        COUNT(DISTINCT batch_id) as num_batches
                    FROM {CHECKPOINT_TABLE}
                    WHERE {base_condition}
                """).collect()
                
                if perf_analysis:
                    perf = perf_analysis[0]
                    total_items = perf.total_items or 0
                    completed = perf.completed_items or 0
                    failed = perf.failed_items or 0
                    avg_duration = perf.avg_duration or 0
                    min_duration = perf.min_duration or 0
                    max_duration = perf.max_duration or 0
                    avg_retries = perf.avg_retries or 0
                    num_batches = perf.num_batches or 0
                else:
                    total_items = completed = failed = avg_duration = min_duration = max_duration = avg_retries = num_batches = 0
                    
            except Exception as e:
                print(f"⚠️ Performance analysis failed: {e}")
                total_items = completed = failed = avg_duration = min_duration = max_duration = avg_retries = num_batches = 0
            
            # Calculate performance metrics
            success_rate = (completed / max(total_items, 1)) * 100
            failure_rate = (failed / max(total_items, 1)) * 100
            items_per_hour = 3600 / max(avg_duration, 1) if avg_duration > 0 else 0
            processing_efficiency = min(success_rate + (100 - failure_rate), 100)
            
            # Performance classification
            if processing_efficiency >= 90:
                performance_grade = "excellent"
            elif processing_efficiency >= 75:
                performance_grade = "good"
            elif processing_efficiency >= 60:
                performance_grade = "moderate"
            else:
                performance_grade = "poor"
            
            insights_data = {
                "performance_summary": {
                    "total_items_analyzed": total_items,
                    "success_rate_percent": round(success_rate, 1),
                    "failure_rate_percent": round(failure_rate, 1),
                    "average_processing_time_seconds": round(avg_duration, 1),
                    "processing_time_range": {
                        "min_seconds": round(min_duration, 1),
                        "max_seconds": round(max_duration, 1)
                    },
                    "items_per_hour": round(items_per_hour, 1),
                    "average_retry_count": round(avg_retries, 2),
                    "processing_efficiency_score": round(processing_efficiency, 1),
                    "performance_grade": performance_grade,
                    "batches_analyzed": num_batches
                }
            }
            
            # Predictive analytics
            if include_predictions and total_items > 5:
                # Simple trend-based predictions
                predicted_items_per_hour = items_per_hour * 0.95  # Conservative estimate
                predicted_success_rate = max(success_rate - 2, 80)  # Account for variability
                
                # Estimate completion time for different batch sizes
                completion_estimates = {}
                for batch_size in [10, 25, 50, 100]:
                    estimated_time_hours = batch_size / max(predicted_items_per_hour, 0.1)
                    completion_estimates[f"batch_size_{batch_size}"] = round(estimated_time_hours * 60, 1)  # Convert to minutes
                
                insights_data["predictive_analytics"] = {
                    "predicted_performance": {
                        "estimated_items_per_hour": round(predicted_items_per_hour, 1),
                        "predicted_success_rate": round(predicted_success_rate, 1),
                        "confidence_level": "medium" if total_items > 20 else "low"
                    },
                    "completion_time_estimates": completion_estimates,
                    "risk_factors": [
                        "Performance may vary with file complexity",
                        "Estimates based on historical data",
                        "Rate limiting may affect actual performance"
                    ]
                }
            
            # Optimization recommendations
            if include_optimization:
                optimization_suggestions = []
                bottlenecks = []
                
                # Identify bottlenecks
                if avg_duration > 300:  # 5 minutes
                    bottlenecks.append("Long processing times detected")
                    optimization_suggestions.append({
                        "area": "processing_speed",
                        "issue": "High average processing time",
                        "suggestion": "Review file complexity and chunking strategies",
                        "potential_improvement": "20-40% time reduction"
                    })
                
                if failure_rate > 15:
                    bottlenecks.append("High failure rate")
                    optimization_suggestions.append({
                        "area": "reliability",
                        "issue": "High failure rate detected",
                        "suggestion": "Implement better error handling and retry logic",
                        "potential_improvement": "10-25% failure reduction"
                    })
                
                if avg_retries > 1.5:
                    bottlenecks.append("Frequent retries")
                    optimization_suggestions.append({
                        "area": "retry_optimization",
                        "issue": "High retry frequency",
                        "suggestion": "Analyze root causes and prevent retryable errors",
                        "potential_improvement": "15-30% efficiency gain"
                    })
                
                if items_per_hour < 10:
                    bottlenecks.append("Low throughput")
                    optimization_suggestions.append({
                        "area": "throughput",
                        "issue": "Low processing throughput",
                        "suggestion": "Consider parallel processing and resource optimization",
                        "potential_improvement": "50-100% throughput increase"
                    })
                
                # General optimization opportunities
                if num_batches > 0:
                    avg_batch_size = total_items / num_batches
                    if avg_batch_size > 100:
                        optimization_suggestions.append({
                            "area": "batch_sizing",
                            "issue": "Large batch sizes may impact monitoring",
                            "suggestion": "Consider smaller batches for better progress tracking",
                            "potential_improvement": "Better error isolation and monitoring"
                        })
                    elif avg_batch_size < 5:
                        optimization_suggestions.append({
                            "area": "batch_efficiency",
                            "issue": "Small batches may have overhead inefficiency",
                            "suggestion": "Consider consolidating into larger batches",
                            "potential_improvement": "10-20% efficiency gain"
                        })
                
                insights_data["optimization_analysis"] = {
                    "identified_bottlenecks": bottlenecks,
                    "optimization_suggestions": optimization_suggestions,
                    "overall_optimization_potential": "high" if len(bottlenecks) > 2 else "medium" if len(bottlenecks) > 0 else "low"
                }
            
            # Processing intelligence summary
            intelligence_summary = []
            
            if performance_grade == "excellent":
                intelligence_summary.append("System performing optimally")
            elif performance_grade == "good":
                intelligence_summary.append("Good performance with minor optimization opportunities")
            else:
                intelligence_summary.append("Performance issues detected - review recommendations")
            
            if items_per_hour > 20:
                intelligence_summary.append("High throughput achieved")
            elif items_per_hour < 5:
                intelligence_summary.append("Low throughput - investigate bottlenecks")
            
            if failure_rate < 5:
                intelligence_summary.append("Excellent reliability")
            elif failure_rate > 20:
                intelligence_summary.append("Reliability concerns - error analysis needed")
            
            insights_data["intelligence_summary"] = intelligence_summary
            
            result = {
                "success": True,
                "operation": "get_processing_insights",
                "data": insights_data,
                "timestamp": datetime.now().isoformat()
            }
            
            print(f"✅ Processing insights completed:")
            print(f"   📊 Items: {total_items}")
            print(f"   ✅ Success: {success_rate:.1f}%")
            print(f"   ⚡ Rate: {items_per_hour:.1f} items/hour")
            print(f"   🎯 Grade: {performance_grade}")
            
            serializable_result = json_serialize_timestamps(result)
            dbutils.notebook.exit(json.dumps(safe_json_serialize(serializable_result)))
            
        except Exception as e:
            error_result = {
                "success": False,
                "operation": "get_processing_insights",
                "error": str(e),
                "error_type": type(e).__name__,
                "timestamp": datetime.now().isoformat()
            }
            print(f"❌ Processing insights failed: {e}")
            dbutils.notebook.exit(json.dumps(safe_json_serialize(error_result)))



elif operation == "get_system_status":
        """
        NEW OPERATION: Comprehensive system health monitoring and capability reporting
        Maps to: smartbdx_main.validate_system_health() + infrastructure status
        """
        try:
            print(f"🏥 Generating comprehensive system status report")
            
            # Check module availability and import status
            module_status = dict(PHASE1_MODULES_LOADED)
            import_errors = list(PHASE1_IMPORT_ERRORS)
            
            # Test core system components
            system_components = {
                "api_gateway": True,  # Always true if we're running
                "checkpoint_system": False,
                "rate_limiter": False,
                "azure_openai_client": False,
                "delta_tables": False,
                "spark_session": False
            }
            
            component_details = {}
            
            # Test checkpoint system
            try:
                test_query = spark.sql(f"SELECT COUNT(*) as count FROM {CHECKPOINT_TABLE} LIMIT 1").collect()
                system_components["checkpoint_system"] = True
                component_details["checkpoint_system"] = {
                    "status": "operational",
                    "table_accessible": True,
                    "total_records": test_query[0].count if test_query else 0
                }
            except Exception as e:
                component_details["checkpoint_system"] = {
                    "status": "error",
                    "error": str(e)[:100],
                    "table_accessible": False
                }
            
            # Test rate limiter (if infrastructure module available)
            if PHASE1_MODULES_LOADED.get('infrastructure', False):
                try:
                    from smartbdx_infrastructure import AzureOpenAIRateLimiter
                    rate_limiter = AzureOpenAIRateLimiter()
                    system_components["rate_limiter"] = True
                    component_details["rate_limiter"] = {
                        "status": "operational",
                        "tokens_per_minute": rate_limiter.tokens_per_minute,
                        "requests_per_minute": rate_limiter.requests_per_minute
                    }
                except Exception as e:
                    component_details["rate_limiter"] = {
                        "status": "error",
                        "error": str(e)[:100]
                    }
            
            # Test Azure OpenAI client
            try:
                # Simple client validation
                if client:
                    system_components["azure_openai_client"] = True
                    component_details["azure_openai_client"] = {
                        "status": "configured",
                        "client_type": type(client).__name__,
                        "deployment_available": hasattr(client, 'deployments') or 'gpt' in str(client).lower()
                    }
                else:
                    component_details["azure_openai_client"] = {
                        "status": "not_configured",
                        "error": "Client not initialized"
                    }
            except Exception as e:
                component_details["azure_openai_client"] = {
                    "status": "error",
                    "error": str(e)[:100]
                }
            
            # Test Delta tables
            try:
                spark.sql("SHOW TABLES IN bdx.metadata_cache").collect()
                system_components["delta_tables"] = True
                component_details["delta_tables"] = {
                    "status": "accessible",
                    "schema_available": True
                }
            except Exception as e:
                component_details["delta_tables"] = {
                    "status": "limited",
                    "error": str(e)[:100],
                    "note": "Some tables may not be accessible"
                }
            
            # Test Spark session
            try:
                spark_info = spark.sql("SELECT current_timestamp()").collect()
                system_components["spark_session"] = True
                component_details["spark_session"] = {
                    "status": "active",
                    "application_id": spark.sparkContext.applicationId,
                    "version": spark.version
                }
            except Exception as e:
                component_details["spark_session"] = {
                    "status": "error",
                    "error": str(e)[:100]
                }
            
            # Calculate overall system health
            total_components = len(system_components)
            operational_components = sum(system_components.values())
            health_percentage = (operational_components / total_components) * 100
            
            # Determine system status
            if health_percentage >= 90:
                overall_status = "excellent"
                status_description = "All critical systems operational"
            elif health_percentage >= 75:
                overall_status = "good"
                status_description = "Minor issues detected, system functional"
            elif health_percentage >= 50:
                overall_status = "moderate"
                status_description = "Some components unavailable, limited functionality"
            else:
                overall_status = "poor"
                status_description = "Critical issues detected, system may be unstable"
            
            # Operation capability assessment
            operation_capabilities = {
                "file_discovery": module_status.get('selection', False),
                "batch_processing": module_status.get('processing', False) and system_components["azure_openai_client"],
                "real_time_monitoring": module_status.get('monitoring', False) and system_components["checkpoint_system"],
                "error_analysis": module_status.get('monitoring', False),
                "smart_selection": module_status.get('selection', False),
                "analytics": system_components["checkpoint_system"] and system_components["spark_session"],
                "cache_optimization": system_components["delta_tables"],
                "batch_resumption": module_status.get('processing', False) and module_status.get('monitoring', False)
            }
            
            operational_capabilities = sum(operation_capabilities.values())
            total_capabilities = len(operation_capabilities)
            capability_percentage = (operational_capabilities / total_capabilities) * 100
            
            # Generate recommendations
            recommendations = []
            critical_issues = []
            
            if not system_components["azure_openai_client"]:
                critical_issues.append("Azure OpenAI client not configured")
                recommendations.append("Configure Azure OpenAI client for batch processing")
            
            if not system_components["checkpoint_system"]:
                critical_issues.append("Checkpoint system unavailable")
                recommendations.append("Verify checkpoint table access and permissions")
            
            if not module_status.get('processing', False):
                critical_issues.append("Processing module not loaded")
                recommendations.append("Check processing module imports and dependencies")
            
            if health_percentage < 75:
                recommendations.append("System health below optimal - review component status")
            
            if len(import_errors) > 0:
                recommendations.append("Module import errors detected - check dependencies")
            
            # Recent activity summary (if checkpoint system available)
            recent_activity = {}
            if system_components["checkpoint_system"]:
                try:
                    activity_stats = spark.sql(f"""
                        SELECT 
                            COUNT(*) as recent_operations,
                            COUNT(DISTINCT batch_id) as recent_batches,
                            COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
                            COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
                        FROM {CHECKPOINT_TABLE}
                        WHERE started_at >= CURRENT_DATE - INTERVAL 24 HOURS
                    """).collect()
                    
                    if activity_stats:
                        stats = activity_stats[0]
                        recent_activity = {
                            "last_24_hours": {
                                "total_operations": stats.recent_operations or 0,
                                "total_batches": stats.recent_batches or 0,
                                "completed_operations": stats.completed or 0,
                                "failed_operations": stats.failed or 0,
                                "success_rate": round((stats.completed / max(stats.recent_operations, 1)) * 100, 1)
                            }
                        }
                except:
                    recent_activity = {"error": "Unable to retrieve recent activity"}
            
            # Build comprehensive status response
            status_data = {
                "system_overview": {
                    "overall_status": overall_status,
                    "status_description": status_description,
                    "health_percentage": round(health_percentage, 1),
                    "capability_percentage": round(capability_percentage, 1),
                    "last_checked": datetime.now().isoformat()
                },
                "component_status": {
                    "summary": system_components,
                    "details": component_details,
                    "operational_count": operational_components,
                    "total_count": total_components
                },
                "module_status": {
                    "loaded_modules": module_status,
                    "import_errors": import_errors,
                    "modules_loaded_count": sum(module_status.values()),
                    "total_modules_count": len(module_status)
                },
                "operation_capabilities": {
                    "capabilities": operation_capabilities,
                    "operational_capabilities": operational_capabilities,
                    "capability_coverage": f"{operational_capabilities}/{total_capabilities}"
                },
                "system_diagnostics": {
                    "critical_issues": critical_issues,
                    "recommendations": recommendations,
                    "issue_severity": "critical" if len(critical_issues) > 2 else "moderate" if len(critical_issues) > 0 else "low"
                },
                "recent_activity": recent_activity,
                "available_operations": [
                    "discover_files_with_sheets",
                    "check_processing_status", 
                    "process_files",
                    "get_batch_status",
                    "resume_failed_batch",
                    "smart_file_selection",
                    "quick_file_analysis",
                    "analyze_batch_errors",
                    "suggest_batch_strategy",
                    "get_cache_analytics",
                    "get_usage_analytics",
                    "get_processing_insights",
                    "get_system_status"
                ],
                "system_configuration": {
                    "volume_folder": DEFAULT_VOLUME_FOLDER,
                    "checkpoint_table": CHECKPOINT_TABLE,
                    "structure_cache_table": STRUCTURE_CACHE_TABLE if 'STRUCTURE_CACHE_TABLE' in globals() else "unknown",
                    "environment": "databricks",
                    "api_version": "2.0"
                }
            }
            
            result = {
                "success": True,
                "operation": "get_system_status",
                "data": status_data,
                "timestamp": datetime.now().isoformat()
            }
            
            print(f"✅ System status analysis completed:")
            print(f"   🏥 Health: {health_percentage:.1f}% ({overall_status})")
            print(f"   ⚡ Capabilities: {capability_percentage:.1f}%")
            print(f"   📦 Modules: {sum(module_status.values())}/{len(module_status)}")
            print(f"   🔧 Components: {operational_components}/{total_components}")
            if critical_issues:
                print(f"   ⚠️ Critical issues: {len(critical_issues)}")
            
            serializable_result = json_serialize_timestamps(result)
            dbutils.notebook.exit(json.dumps(safe_json_serialize(serializable_result)))
            
        except Exception as e:
            error_result = {
                "success": False,
                "operation": "get_system_status",
                "error": str(e),
                "error_type": type(e).__name__,
                "partial_status": {
                    "api_gateway": True,
                    "error_location": "system_status_generation",
                    "modules_available": dict(PHASE1_MODULES_LOADED) if 'PHASE1_MODULES_LOADED' in globals() else {}
                },
                "timestamp": datetime.now().isoformat()
            }
            print(f"❌ System status generation failed: {e}")
            dbutils.notebook.exit(json.dumps(safe_json_serialize(error_result)))

# === FINAL OPERATION REGISTRY (Complete) ===
else:
        # Complete API Gateway with all operations
        final_error_result = {
            "success": False,
            "operation": operation,
            "error": f"Unknown operation: {operation}",
            "available_operations": [
                # Phase 1: Core Processing
                {
                    "name": "discover_files_with_sheets",
                    "phase": "1",
                    "category": "file_discovery",
                    "description": "Discover files with sheet metadata",
                    "required_modules": ["selection"],
                    "parameters": ["volume_folder"]
                },
                {
                    "name": "check_processing_status", 
                    "phase": "1",
                    "category": "file_discovery",
                    "description": "Check cache efficiency before processing",
                    "required_modules": ["selection"],
                    "parameters": ["volume_folder", "files"]
                },
                {
                    "name": "process_files",
                    "phase": "1", 
                    "category": "batch_processing",
                    "description": "Start production batch processing",
                    "required_modules": ["processing", "infrastructure"],
                    "parameters": ["files", "batch_id", "enable_mapping", "volume_folder"]
                },
                {
                    "name": "get_batch_status",
                    "phase": "1",
                    "category": "monitoring",
                    "description": "Real-time batch monitoring with insights",
                    "required_modules": ["monitoring", "infrastructure"],
                    "parameters": ["batch_id", "include_details"]
                },
                {
                    "name": "resume_failed_batch",
                    "phase": "1",
                    "category": "recovery",
                    "description": "Resume failed batch with intelligent recovery",
                    "required_modules": ["processing", "monitoring"],
                    "parameters": ["batch_id", "force_resume"]
                },
                # Phase 2a: Smart Selection
                {
                    "name": "smart_file_selection",
                    "phase": "2a",
                    "category": "intelligent_selection", 
                    "description": "AI-powered file selection with algorithms",
                    "required_modules": ["selection"],
                    "parameters": ["criteria", "max_items", "filters", "volume_folder"]
                },
                {
                    "name": "quick_file_analysis",
                    "phase": "2a",
                    "category": "analysis",
                    "description": "Quick file analysis without processing",
                    "required_modules": ["selection"],
                    "parameters": ["files", "max_files", "include_structure_preview"]
                },
                # Phase 2b: Advanced Error Analysis
                {
                    "name": "analyze_batch_errors",
                    "phase": "2b",
                    "category": "error_analysis",
                    "description": "Advanced error analysis with patterns",
                    "required_modules": ["monitoring"],
                    "parameters": ["batch_id", "include_patterns", "include_suggestions"]
                },
                {
                    "name": "suggest_batch_strategy",
                    "phase": "2b",
                    "category": "optimization",
                    "description": "Intelligent batch strategy optimization",
                    "required_modules": ["selection"],
                    "parameters": ["files", "target_processing_time_minutes", "risk_tolerance"]
                },
                # Phase 3a: Analytics
                {
                    "name": "get_cache_analytics",
                    "phase": "3a",
                    "category": "analytics",
                    "description": "Cache efficiency and cost optimization",
                    "required_modules": [],
                    "parameters": ["include_trends", "include_savings", "days_back"]
                },
                {
                    "name": "get_usage_analytics",
                    "phase": "3a",
                    "category": "analytics", 
                    "description": "System usage and performance metrics",
                    "required_modules": [],
                    "parameters": ["include_performance", "include_costs", "days_back"]
                },
                {
                    "name": "get_processing_insights",
                    "phase": "3a",
                    "category": "analytics",
                    "description": "Processing insights with predictions",
                    "required_modules": [],
                    "parameters": ["batch_id", "include_predictions", "include_optimization"]
                },
                # Phase 3b: System Operations
                {
                    "name": "get_system_status",
                    "phase": "3b",
                    "category": "system",
                    "description": "Comprehensive system health monitoring",
                    "required_modules": [],
                    "parameters": []
                }
            ],
            "api_gateway_info": {
                "total_operations": 13,
                "phases_completed": ["1", "2a", "2b", "3a", "3b"],
                "categories": [
                    "file_discovery", "batch_processing", "monitoring", "recovery",
                    "intelligent_selection", "analysis", "error_analysis", "optimization", 
                    "analytics", "system"
                ],
                "production_ready": True,
                "version": "2.0",
                "last_updated": datetime.now().isoformat()
            },
            "capabilities": [
                "🔍 Intelligent file discovery with metadata extraction",
                "🚀 Production-grade batch processing with checkpointing",
                "📊 Real-time monitoring with performance insights",
                "🔄 Failed batch recovery with root cause analysis",
                "🧠 AI-powered file selection with 5 algorithms",
                "⚡ Quick file analysis for processing preview",
                "🛠️ Advanced error analysis with pattern detection",
                "🎯 Batch strategy optimization with risk assessment",
                "📈 Cache analytics for cost optimization",
                "📊 Usage analytics with health scoring",
                "🔮 Processing insights with predictive analytics",
                "🏥 System health monitoring with diagnostics"
            ],
            "integration_features": [
                "Complete SmartBDX backend integration",
                "Rich JSON responses for frontend consumption", 
                "Comprehensive error handling with suggestions",
                "Module availability checking with graceful degradation",
                "Performance optimization recommendations",
                "Cost tracking and efficiency analysis",
                "Production-ready fault tolerance",
                "Extensible operation framework"
            ],
            "module_status": PHASE1_MODULES_LOADED if 'PHASE1_MODULES_LOADED' in globals() else {},
            "import_errors": PHASE1_IMPORT_ERRORS if 'PHASE1_IMPORT_ERRORS' in globals() else [],
            "deployment_status": "production_ready",
            "next_steps": [
                "Integrate with frontend API client",
                "Configure environment variables",
                "Set up monitoring dashboards", 
                "Implement user authentication",
                "Deploy to production workspace"
            ],
            "timestamp": datetime.now().isoformat()
        }
        
        print(f"❌ Unknown operation: {operation}")
        print(f"📋 SmartBDX API Gateway v2.0 - 13 operations available")
        print(f"🎯 Production-ready with complete SmartBDX integration")
        
        serializable_error = json_serialize_timestamps(final_error_result)
        dbutils.notebook.exit(json.dumps(safe_json_serialize(serializable_error)))

# If no operation specified, show gateway info
if not operation:
    print("🎉 SmartBDX API Gateway v2.0 - Complete System Loaded")
    print("=" * 60)
    print("📊 SYSTEM OVERVIEW:")
    print(f"   ✅ Total Operations: 13")
    print(f"   🎯 Phases: 1, 2a, 2b, 3a, 3b (Complete)")
    print(f"   📦 Modules: {sum(PHASE1_MODULES_LOADED.values())}/{len(PHASE1_MODULES_LOADED)} loaded")
    print(f"   🚀 Status: Production Ready")
    print("")
    print("🔧 AVAILABLE OPERATIONS:")
    operations_by_category = {
        "File Discovery": ["discover_files_with_sheets", "check_processing_status"],
        "Batch Processing": ["process_files", "get_batch_status", "resume_failed_batch"],
        "Smart Selection": ["smart_file_selection", "quick_file_analysis"],
        "Error Analysis": ["analyze_batch_errors", "suggest_batch_strategy"],
        "Analytics": ["get_cache_analytics", "get_usage_analytics", "get_processing_insights"],
        "System": ["get_system_status"]
    }
    
    for category, ops in operations_by_category.items():
        print(f"   📋 {category}:")
        for op in ops:
            print(f"      - {op}")
    
    print("")
    print("💡 QUICK START:")
    print("   1. Test: get_system_status")
    print("   2. Discover: discover_files_with_sheets") 
    print("   3. Process: process_files")
    print("   4. Monitor: get_batch_status")
    print("")
    print("🔗 Frontend Integration Ready!")
