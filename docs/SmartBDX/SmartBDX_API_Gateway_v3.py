# Databricks notebook source
# MAGIC %md
# MAGIC # SmartBDX API Gateway v3 - Enhanced with Mapping Support
# MAGIC 
# MAGIC **Complete Operations (6 Total):**
# MAGIC - `discover_files_with_sheets` - File and sheet discovery
# MAGIC - `process_files` - Batch processing with optional mapping
# MAGIC - `get_batch_status` - Real-time batch monitoring
# MAGIC - `resume_failed_batch` - Failed batch recovery
# MAGIC - `get_mapping_results` - Retrieve column mappings for approval
# MAGIC - `approve_mappings` - Approve/reject column mappings
# MAGIC 
# MAGIC **Key Features:**
# MAGIC - Production-ready error handling
# MAGIC - Complete mapping workflow support
# MAGIC - Clean JSON responses for frontend integration
# MAGIC - Graceful degradation when modules unavailable

# COMMAND ----------

# === IMPORTS WITH ERROR HANDLING ===
import json
from datetime import datetime
import pandas as pd
import time

# Core SmartBDX imports
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
        return data
    def safe_json_serialize(data):
        return data

# Module tracking
MODULES_LOADED = {}
IMPORT_ERRORS = []

# Processing module
try:
    from smartbdx_processing import (
        azure_optimized_batch_orchestration,
        resume_failed_batch
    )
    MODULES_LOADED['processing'] = True
    print("✅ SmartBDX Processing module imported successfully")
except ImportError as e:
    MODULES_LOADED['processing'] = False
    IMPORT_ERRORS.append(f"Processing module: {str(e)}")
    print(f"❌ Processing module import failed: {e}")

# Monitoring module
try:
    from smartbdx_monitoring import (
        show_batch_progress,
        get_failed_items,
        list_all_batches
    )
    MODULES_LOADED['monitoring'] = True
    print("✅ SmartBDX Monitoring module imported successfully")
except ImportError as e:
    MODULES_LOADED['monitoring'] = False
    IMPORT_ERRORS.append(f"Monitoring module: {str(e)}")
    print(f"❌ Monitoring module import failed: {e}")

# Selection module
try:
    from smartbdx_selection import discover_files_and_sheets_metadata
    MODULES_LOADED['selection'] = True
    print("✅ SmartBDX Selection module imported successfully")
except ImportError as e:
    MODULES_LOADED['selection'] = False
    IMPORT_ERRORS.append(f"Selection module: {str(e)}")
    print(f"❌ Selection module import failed: {e}")

# Infrastructure module
try:
    from smartbdx_infrastructure import (
        BatchCheckpointManager,
        AzureOpenAIRateLimiter
    )
    MODULES_LOADED['infrastructure'] = True
    print("✅ SmartBDX Infrastructure module imported successfully")
except ImportError as e:
    MODULES_LOADED['infrastructure'] = False
    IMPORT_ERRORS.append(f"Infrastructure module: {str(e)}")
    print(f"❌ Infrastructure module import failed: {e}")

# === MAPPING MODULES (NEW) ===
try:
    from smartbdx_mapping_core import process_table_mapping
    from smartbdx_mapping_data import save_mapping_to_binder, load_all_mappings_from_binder
    from smartbdx_core_ai import load_glossary_targets
    MODULES_LOADED['mapping'] = True
    print("✅ SmartBDX Mapping modules imported successfully")
except ImportError as e:
    MODULES_LOADED['mapping'] = False
    IMPORT_ERRORS.append(f"Mapping modules: {str(e)}")
    print(f"❌ Mapping modules import failed: {e}")

# === ENHANCED MAPPING MODULES (CONDITIONAL) ===
# Add this RIGHT AFTER the existing mapping imports section

# Vector Search Client (Required for mapping)
try:
    from databricks.vector_search.client import VectorSearchClient
    VECTOR_SEARCH_AVAILABLE = True
    MODULES_LOADED['vector_search'] = True
    print("✅ Vector Search client available")
except ImportError as e:
    VectorSearchClient = None
    VECTOR_SEARCH_AVAILABLE = False
    MODULES_LOADED['vector_search'] = False
    IMPORT_ERRORS.append(f"Vector Search: {str(e)}")
    print(f"❌ Vector Search not available: {e}")

# Enhanced mapping status check
def check_mapping_readiness():
    """Check if all mapping components are available"""
    mapping_ready = (
        MODULES_LOADED.get('mapping', False) and 
        VECTOR_SEARCH_AVAILABLE and
        CONFIG_LOADED
    )
    
    status = {
        "mapping_available": mapping_ready,
        "vector_search": VECTOR_SEARCH_AVAILABLE,
        "mapping_modules": MODULES_LOADED.get('mapping', False),
        "config_loaded": CONFIG_LOADED
    }
    
    if mapping_ready:
        print("✅ All mapping components ready")
    else:
        print("⚠️ Mapping components missing:")
        for component, available in status.items():
            if not available:
                print(f"   ❌ {component}")
    
    return status

# Check mapping readiness on startup
MAPPING_STATUS = check_mapping_readiness()

# Print module status
print(f"\n📊 Module Status:")
print(f"   ✅ Loaded: {sum(MODULES_LOADED.values())}/{len(MODULES_LOADED)} modules")
if IMPORT_ERRORS:
    print(f"   ❌ Errors: {len(IMPORT_ERRORS)} import issues")
    for error in IMPORT_ERRORS[:3]:  # Show first 3 errors
        print(f"      - {error}")

# COMMAND ----------

# === UTILITY FUNCTIONS FOR MAPPING ===

def create_mapping_results_table():
    """Create mapping results table for UI workflow if it doesn't exist"""
    try:
        # Get Spark session
        from pyspark.sql import SparkSession
        spark = SparkSession.getActiveSession()
        
        spark.sql("""
        CREATE TABLE IF NOT EXISTS bdx.metadata_cache.mapping_results (
            batch_id STRING,
            file_name STRING,
            sheet_name STRING,
            structure_signature STRING,
            source_column STRING,
            target_column STRING,
            confidence_score FLOAT,
            sample_values STRING,
            data_type STRING,
            description STRING,
            needs_review BOOLEAN,
            proposed_targets STRING,
            status STRING,
            created_at TIMESTAMP,
            reviewed_at TIMESTAMP,
            reviewed_by STRING
        ) USING DELTA
        """)
        print("✅ Mapping results table ready")
    except Exception as e:
        print(f"⚠️ Could not create mapping results table: {e}")

def save_mappings_for_ui_review(batch_id: str, file_name: str, sheet_name: str, 
                               mappings_for_review):
    """Save mapping results to table for UI review"""
    try:
        # Get Spark session
        from pyspark.sql import SparkSession
        spark = SparkSession.getActiveSession()
        
        if not mappings_for_review:
            print(f"⚠️ No mappings to save for {file_name}/{sheet_name}")
            return
            
        # Prepare data for insertion
        mapping_rows = []
        for mapping in mappings_for_review:
            row = {
                "batch_id": batch_id,
                "file_name": file_name,
                "sheet_name": sheet_name,
                "structure_signature": mapping.get("structure_signature", ""),
                "source_column": mapping.get("source_column", ""),
                "target_column": mapping.get("target_column", ""),
                "confidence_score": float(mapping.get("match_score", 0.0)),
                "sample_values": json.dumps(mapping.get("sample_values", [])),
                "data_type": mapping.get("data_type", ""),
                "description": mapping.get("description", ""),
                "needs_review": bool(mapping.get("needs_review", True)),
                "proposed_targets": json.dumps(mapping.get("proposed_targets", [])),
                "status": "pending",
                "created_at": datetime.now(),
                "reviewed_at": None,
                "reviewed_by": None
            }
            mapping_rows.append(row)
        
        # Create DataFrame and save
        df = spark.createDataFrame(mapping_rows)
        df.write.format("delta").mode("append").saveAsTable("bdx.metadata_cache.mapping_results")
        
        print(f"✅ Saved {len(mapping_rows)} mappings for UI review: {file_name}/{sheet_name}")
        
    except Exception as e:
        print(f"❌ Failed to save mappings for UI: {e}")

# === ENHANCED PROCESSING WITH MAPPING INTEGRATION ===

def process_table_with_mapping_integration(
    df, file_name, sheet_name, table_idx, table_meta, std_headers, 
    client, batch_id, vs_client=None, glossary_targets=None
):
    """
    Process table with optional mapping integration for UI workflow.
    
    This bridges core AI processing with mapping workflow, handling both
    enabled and disabled mapping modes gracefully.
    """
    mappings_for_review = None
    
    # Only proceed with mapping if all components are available
    if (vs_client and glossary_targets and 
        MODULES_LOADED.get('mapping', False) and 
        VECTOR_SEARCH_AVAILABLE):
        
        try:
            print(f"🗂️ Processing column mapping for {file_name}/{sheet_name} (Table {table_idx + 1})")
            
            # Import mapping function only when needed (lazy import)
            from smartbdx_mapping_core import process_table_mapping
            
            # Generate mappings using the full mapping pipeline
            mappings_for_review = process_table_mapping(
                df=df,
                file_name=file_name,
                sheet_name=sheet_name,
                table_idx=table_idx,
                table_meta=table_meta,
                std_headers=std_headers,
                glossary_targets=glossary_targets,
                client=client,
                vs_client=vs_client,
                vector_threshold=0.80,  # Confidence threshold
                llm_batch_size=10
            )
            
            # Save mappings for UI review using existing function
            if mappings_for_review:
                save_mappings_for_ui_review(
                    batch_id, file_name, sheet_name, mappings_for_review
                )
                
                # Provide summary for user
                total_mappings = len(mappings_for_review)
                high_confidence = sum(1 for m in mappings_for_review 
                                    if m.get('match_score', 0) >= 0.80)
                needs_review = sum(1 for m in mappings_for_review 
                                 if m.get('needs_review', True))
                
                print(f"✅ Saved {total_mappings} mappings:")
                print(f"   🎯 High confidence: {high_confidence}")
                print(f"   👁️ Needs review: {needs_review}")
            else:
                print(f"⚠️ No mappings generated for {file_name}/{sheet_name}")
            
        except Exception as e:
            print(f"⚠️ Mapping failed for {file_name}/{sheet_name}: {e}")
            print("   Continuing processing without mapping...")
            # Graceful degradation - continue without mapping
    
    else:
        # Mapping not enabled or components missing
        if vs_client or glossary_targets:
            print(f"ℹ️ Mapping components not ready for {file_name}/{sheet_name}")
            print(f"   Vector Search: {VECTOR_SEARCH_AVAILABLE}")
            print(f"   Mapping modules: {MODULES_LOADED.get('mapping', False)}")
    
    return mappings_for_review

def initialize_mapping_components():
    """Initialize mapping components if available"""
    vs_client = None
    glossary_targets = None
    
    if MAPPING_STATUS.get('mapping_available', False):
        try:
            # Initialize Vector Search client
            vs_client = VectorSearchClient()
            print("✅ Vector Search client initialized")
            
            # Load glossary targets
            from smartbdx_core_ai import load_glossary_targets
            glossary_targets = load_glossary_targets()
            print(f"✅ Loaded {len(glossary_targets)} glossary targets")
            
        except Exception as e:
            print(f"⚠️ Failed to initialize mapping components: {e}")
            vs_client = None
            glossary_targets = None
    
    return vs_client, glossary_targets

def process_batch_with_simple_mapping(client, batch_id, volume_folder, vs_client, glossary_targets, selected_files):
    """
    Simple batch processing with mapping - only processes selected files with mapping enabled.
    Uses existing infrastructure but adds mapping step after each file.
    """
    from smartbdx_infrastructure import BatchCheckpointManager
    from smartbdx_core_ai import load_raw_excel_files
    from smartbdx_processing import process_file_sheet_with_production_features
    
    print("🚀 Processing batch with mapping enabled")
    
    # Use existing infrastructure
    checkpoint_mgr = BatchCheckpointManager()
    
    # Load only selected files (efficient)
    all_sheets = load_raw_excel_files(volume_folder)
    
    # Filter to selected files only
    file_sheets = []
    for file_name, sheets in all_sheets.items():
        if file_name in selected_files or not selected_files:  # Process all if none selected
            for sheet_name, df in sheets.items():
                file_sheets.append((file_name, sheet_name, df))
    
    print(f"📋 Processing {len(file_sheets)} file/sheet combinations with mapping")
    
    # Initialize batch
    checkpoint_mgr.start_batch(batch_id, file_sheets)
    
    # Process each file/sheet
    for file_name, sheet_name, df in file_sheets:
        print(f"📄 Processing: {file_name}/{sheet_name}")
        
        try:
            # Use existing production processing function
            process_file_sheet_with_production_features(
                file_name, sheet_name, df, client, batch_id,
                checkpoint_mgr, 
                AzureOpenAIRateLimiter(),
                enable_mapping=False  # We'll add mapping separately
            )
            
            # Add mapping AFTER standard processing
            add_mapping_to_processed_sheet(
                file_name, sheet_name, df, client, batch_id,
                vs_client, glossary_targets
            )
            
        except Exception as e:
            print(f"❌ Error processing {file_name}/{sheet_name}: {e}")
    
    # Return same format as original function
    return {
        "status": "completed",
        "batch_id": batch_id,
        "total_sheets": len(file_sheets),
        "files_processed": len(set(f[0] for f in file_sheets))
    }

def add_mapping_to_processed_sheet(file_name, sheet_name, df, client, batch_id, vs_client, glossary_targets):
    """
    Add mapping to an already processed sheet.
    This is called AFTER the standard processing is complete.
    """
    try:
        # We need to reconstruct the table metadata since the sheet was already processed
        # Simple approach: just process the standardized headers we can extract
        
        from smartbdx_core_ai import process_sheet_content_aware_with_tokens
        
        # Get the AI analysis (this is the only way to get standardized headers)
        meta_result = process_sheet_content_aware_with_tokens(
            file_name, sheet_name, df, client,
            chunk_size=min(25, len(df)),
            model_name="gpt-4.1",
            show_header_samples=False,
            show_summary_prompt=False
        )
        
        if not meta_result:
            print(f"⚠️ Could not get metadata for mapping: {file_name}/{sheet_name}")
            return
        
        tables_meta = meta_result["meta_summary"].get("tables", [])
        all_standardized_headers = meta_result.get("all_standardized_headers", [])
        
        # Process mapping for each table
        for table_idx, (table_meta, std_headers) in enumerate(zip(tables_meta, all_standardized_headers)):
            if MODULES_LOADED.get('mapping', False):
                try:
                    from smartbdx_mapping_core import process_table_mapping
                    
                    print(f"🗂️ Generating mappings for {file_name}/{sheet_name} (Table {table_idx + 1})")
                    
                    mappings_for_review = process_table_mapping(
                        df=df,
                        file_name=file_name,
                        sheet_name=sheet_name,
                        table_idx=table_idx,
                        table_meta=table_meta,
                        std_headers=std_headers,
                        glossary_targets=glossary_targets,
                        client=client,
                        vs_client=vs_client
                    )
                    
                    if mappings_for_review:
                        save_mappings_for_ui_review(batch_id, file_name, sheet_name, mappings_for_review)
                    
                except Exception as e:
                    print(f"⚠️ Mapping failed for table {table_idx}: {e}")
    
    except Exception as e:
        print(f"⚠️ Could not add mapping to {file_name}/{sheet_name}: {e}")

# COMMAND ----------

# === PARAMETER SETUP ===
# Create operation parameter widgets
dbutils.widgets.text("operation", "", "API Operation")
dbutils.widgets.text("parameters", "{}", "Operation Parameters JSON")

# Get parameters
operation = dbutils.widgets.get("operation")
parameters_json = dbutils.widgets.get("parameters")

# Parse parameters safely
try:
    parameters = json.loads(parameters_json) if parameters_json else {}
except json.JSONDecodeError:
    parameters = {}

print(f"🎯 API Operation: {operation}")
print(f"📋 Parameters: {parameters}")

# COMMAND ----------

# === CORE API OPERATIONS ===
if operation:
    
    # === OPERATION 1: DISCOVER FILES WITH SHEETS ===
    if operation == "discover_files_with_sheets":
        """
        Discover all Excel files and their sheet names in the volume folder.
        Returns structured file metadata for frontend file selection.
        """
        try:
            # Check module availability
            if not MODULES_LOADED.get('selection', False):
                raise ImportError("Selection module not available")
                
            volume_folder = parameters.get('volume_folder', DEFAULT_VOLUME_FOLDER)
            print(f"🔍 Discovering files with sheets in: {volume_folder}")
            
            # Use SmartBDX discovery function
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
            
            print(f"📊 Discovery found: {len(metadata_df)} file-sheet combinations")
            
            # Group by file to collect sheet names
            files_data = []
            unique_files = metadata_df['file_name'].unique()
            
            for file_name in unique_files:
                file_data = metadata_df[metadata_df['file_name'] == file_name]
                first_row = file_data.iloc[0]
                
                # Collect sheet names for this file
                sheet_names = file_data['sheet_name'].tolist()
                
                # Build file metadata
                file_metadata = {
                    "id": file_name,
                    "file_name": file_name,
                    "sheet_names": sheet_names,
                    "total_sheets": len(sheet_names),
                    "estimated_rows": int(file_data['estimated_rows'].sum()) if 'estimated_rows' in file_data.columns else 0,
                    "last_modified": first_row.get('last_modified', ''),
                    "processing_status": first_row.get('processing_status', 'pending')
                }
                files_data.append(file_metadata)
            
            # Sort by file name for consistent ordering
            files_data.sort(key=lambda x: x['file_name'])
            
            result = {
                "success": True,
                "operation": "discover_files_with_sheets",
                "data": files_data,
                "total": len(files_data),
                "total_sheets": sum(f['total_sheets'] for f in files_data),
                "timestamp": datetime.now().isoformat()
            }
            
            print(f"✅ Discovery complete: {len(files_data)} files, {result['total_sheets']} sheets")
            serializable_result = json_serialize_timestamps(result)
            dbutils.notebook.exit(json.dumps(safe_json_serialize(serializable_result)))
            
        except Exception as e:
            error_result = {
                "success": False,
                "operation": "discover_files_with_sheets",
                "error": str(e),
                "available_modules": MODULES_LOADED,
                "timestamp": datetime.now().isoformat()
            }
            print(f"❌ Discovery error: {e}")
            dbutils.notebook.exit(json.dumps(safe_json_serialize(error_result)))
    
    # === OPERATION 2: PROCESS FILES ===
    # === OPERATION 2: PROCESS FILES (ENHANCED WITH MAPPING) ===
    elif operation == "process_files":
        """
        Process selected files using production batch orchestration.
        Supports both new batch creation and batch resumption.
        Now includes FULL mapping support when enable_mapping=true.
        """
        try:
            # Check module availability
            if not MODULES_LOADED.get('processing', False):
                raise ImportError("Processing module not available")
            
            if not client:
                raise RuntimeError("Azure OpenAI client not available")
            
            # Get parameters
            selected_files = parameters.get('files', [])
            enable_mapping = parameters.get('enable_mapping', False)
            batch_id = parameters.get('batch_id')
            resume_batch = parameters.get('resume_batch', False)
            volume_folder = parameters.get('volume_folder', DEFAULT_VOLUME_FOLDER)
            
            # Validate inputs
            if not selected_files and not resume_batch:
                raise ValueError("files parameter required for new batch processing")
            
            print(f"🚀 Batch processing:")
            print(f"   Files: {len(selected_files) if selected_files else 'resuming existing'}")
            print(f"   Mapping enabled: {enable_mapping}")
            print(f"   Resume mode: {resume_batch}")
            print(f"   Volume folder: {volume_folder}")
            
            # Initialize mapping components if enabled
            vs_client = None
            glossary_targets = None
            mapping_initialization_status = {}
            
            if enable_mapping:
                print(f"🗂️ Initializing mapping components...")
                vs_client, glossary_targets = initialize_mapping_components()
                
                mapping_initialization_status = {
                    "vector_search_ready": vs_client is not None,
                    "glossary_loaded": glossary_targets is not None,
                    "glossary_count": len(glossary_targets) if glossary_targets else 0,
                    "mapping_modules_available": MODULES_LOADED.get('mapping', False)
                }
                
                if vs_client and glossary_targets:
                    print(f"✅ Mapping fully initialized with {len(glossary_targets)} targets")
                    
                    # Create mapping table if needed
                    try:
                        create_mapping_results_table()
                        print("✅ Mapping results table ready")
                    except Exception as e:
                        print(f"⚠️ Could not prepare mapping table: {e}")
                else:
                    print(f"⚠️ Mapping initialization incomplete - will process without mapping")
                    enable_mapping = False  # Disable if components not ready
            
            if resume_batch:
                # Resume existing batch
                if not batch_id:
                    raise ValueError("batch_id required for resume operation")
                
                print(f"🔄 Resuming batch: {batch_id}")
                result_data = resume_failed_batch(client, batch_id)
                
                result = {
                    "success": True,
                    "operation": "process_files",
                    "data": {
                        "batch_id": result_data.get('batch_id', batch_id),
                        "status": "resumed",
                        "mode": "resume_batch",
                        "mapping_enabled": enable_mapping,
                        "mapping_status": mapping_initialization_status,
                        **result_data
                    },
                    "timestamp": datetime.now().isoformat()
                }
                
            else:
                # Start new batch processing
                if not batch_id:
                    batch_id = f"api_batch_{int(time.time())}"
                
                print(f"🆕 Starting new batch: {batch_id}")
                

                # Enhanced processing with mapping support
                if enable_mapping and vs_client and glossary_targets:
                    # Custom processing WITH mapping
                    result_data = process_batch_with_simple_mapping(
                        client=client,
                        batch_id=batch_id,
                        volume_folder=volume_folder,
                        vs_client=vs_client,
                        glossary_targets=glossary_targets,
                        selected_files=selected_files
                    )
                else:
                    # Standard processing WITHOUT mapping
                    result_data = azure_optimized_batch_orchestration(
                        client=client,
                        batch_id=batch_id,
                        volume_folder=volume_folder,
                        enable_mapping=False,
                        tokens_per_minute=50000,
                        requests_per_minute=50
                    )
                
                # Enhanced mapping info collection
                mapping_info = mapping_initialization_status.copy()
                
                if enable_mapping and vs_client and glossary_targets:
                    try:
                        # Get Spark session for querying results
                        from pyspark.sql import SparkSession
                        spark = SparkSession.getActiveSession()
                        
                        # Enhanced query for detailed mapping results
                        mapping_query = f"""
                        SELECT 
                            COUNT(*) as total_mappings,
                            COUNT(CASE WHEN needs_review = true THEN 1 END) as needs_review_count,
                            COUNT(CASE WHEN target_column != 'None' AND target_column IS NOT NULL THEN 1 END) as mapped_count,
                            COUNT(DISTINCT file_name) as files_with_mappings,
                            COUNT(DISTINCT CONCAT(file_name, '_', sheet_name)) as sheets_with_mappings,
                            AVG(confidence_score) as avg_confidence,
                            MAX(confidence_score) as max_confidence,
                            MIN(confidence_score) as min_confidence
                        FROM bdx.metadata_cache.mapping_results 
                        WHERE batch_id = '{batch_id}'
                        """
                        
                        mapping_result = spark.sql(mapping_query).collect()
                        if mapping_result and mapping_result[0]['total_mappings'] > 0:
                            row = mapping_result[0]
                            mapping_info.update({
                                "total_mappings": row['total_mappings'],
                                "needs_review": row['needs_review_count'],
                                "auto_approved": row['total_mappings'] - row['needs_review_count'],
                                "mapped_columns": row['mapped_count'],
                                "unmapped_columns": row['total_mappings'] - row['mapped_count'],
                                "files_with_mappings": row['files_with_mappings'],
                                "sheets_with_mappings": row['sheets_with_mappings'],
                                "confidence_stats": {
                                    "average": round(float(row['avg_confidence'] or 0), 2),
                                    "maximum": round(float(row['max_confidence'] or 0), 2),
                                    "minimum": round(float(row['min_confidence'] or 0), 2)
                                },
                                "mapping_table_ready": True,
                                "review_required": row['needs_review_count'] > 0,
                                "next_step": "Use get_mapping_results to review mappings" if row['needs_review_count'] > 0 else "All mappings auto-approved"
                            })
                            
                            print(f"📊 Mapping Results Summary:")
                            print(f"   Total mappings: {row['total_mappings']}")
                            print(f"   Needs review: {row['needs_review_count']}")
                            print(f"   Auto-approved: {row['total_mappings'] - row['needs_review_count']}")
                            print(f"   Average confidence: {mapping_info['confidence_stats']['average']:.1f}%")
                        else:
                            mapping_info.update({
                                "total_mappings": 0,
                                "mapping_table_ready": True,
                                "message": "No mappings generated - check if files had valid columns"
                            })
                            
                    except Exception as e:
                        print(f"⚠️ Could not query mapping results: {e}")
                        mapping_info.update({
                            "mapping_table_ready": False, 
                            "error": str(e),
                            "message": "Mapping processing completed but results query failed"
                        })
                
                result = {
                    "success": True,
                    "operation": "process_files",
                    "data": {
                        "batch_id": batch_id,
                        "status": "processing",
                        "mode": "new_batch",
                        "selected_files_count": len(selected_files),
                        "enable_mapping": enable_mapping,
                        "mapping_info": mapping_info,
                        **result_data
                    },
                    "timestamp": datetime.now().isoformat()
                }
            
            print(f"✅ Processing initiated successfully")
            serializable_result = json_serialize_timestamps(result)
            dbutils.notebook.exit(json.dumps(safe_json_serialize(serializable_result)))
            
        except Exception as e:
            error_result = {
                "success": False,
                "operation": "process_files",
                "error": str(e),
                "available_modules": MODULES_LOADED,
                "client_available": client is not None,
                "mapping_status": MAPPING_STATUS,
                "timestamp": datetime.now().isoformat()
            }
            print(f"❌ Processing error: {e}")
            dbutils.notebook.exit(json.dumps(safe_json_serialize(error_result)))
    
    # === OPERATION 3: GET BATCH STATUS ===
    elif operation == "get_batch_status":
        """
        Get real-time status of batch processing with detailed progress information.
        Returns structured data suitable for frontend monitoring dashboards.
        """
        try:
            # Check module availability
            if not MODULES_LOADED.get('monitoring', False):
                raise ImportError("Monitoring module not available")
            
            batch_id = parameters.get('batch_id')
            include_details = parameters.get('include_details', True)
            
            print(f"📊 Getting batch status for: {batch_id or 'all batches'}")
            
            # Get batch progress data
            if batch_id:
                # Specific batch status
                batch_data = show_batch_progress(batch_id, return_data=True)
                
                if not batch_data or batch_data.get('status') == 'not_found':
                    result = {
                        "success": False,
                        "operation": "get_batch_status",
                        "error": f"Batch '{batch_id}' not found",
                        "timestamp": datetime.now().isoformat()
                    }
                else:
                    # Enhance with additional details if requested
                    if include_details and batch_data.get('errors', 0) > 0:
                        try:
                            failed_items = get_failed_items(batch_id)
                            batch_data['failed_items_details'] = failed_items
                        except Exception as e:
                            print(f"⚠️ Could not get failed items: {e}")
                    
                    result = {
                        "success": True,
                        "operation": "get_batch_status",
                        "data": batch_data,
                        "timestamp": datetime.now().isoformat()
                    }
            else:
                # All batches overview
                all_batches_data = show_batch_progress(return_data=True)
                
                result = {
                    "success": True,
                    "operation": "get_batch_status",
                    "data": {
                        "all_batches": all_batches_data,
                        "batch_count": len(all_batches_data.get('batches', [])) if isinstance(all_batches_data, dict) else 0
                    },
                    "timestamp": datetime.now().isoformat()
                }
            
            print(f"✅ Status retrieved successfully")
            serializable_result = json_serialize_timestamps(result)
            dbutils.notebook.exit(json.dumps(safe_json_serialize(serializable_result)))
            
        except Exception as e:
            error_result = {
                "success": False,
                "operation": "get_batch_status",
                "error": str(e),
                "available_modules": MODULES_LOADED,
                "timestamp": datetime.now().isoformat()
            }
            print(f"❌ Status error: {e}")
            dbutils.notebook.exit(json.dumps(safe_json_serialize(error_result)))
    
    # === OPERATION 4: RESUME FAILED BATCH ===
    elif operation == "resume_failed_batch":
        """
        Resume a batch that has failed items, with intelligent failure analysis.
        Shows failure details before resuming processing.
        """
        try:
            # Check module availability
            if not MODULES_LOADED.get('processing', False) or not MODULES_LOADED.get('monitoring', False):
                missing_modules = []
                if not MODULES_LOADED.get('processing', False):
                    missing_modules.append('processing')
                if not MODULES_LOADED.get('monitoring', False):
                    missing_modules.append('monitoring')
                raise ImportError(f"Required modules not available: {missing_modules}")
            
            if not client:
                raise RuntimeError("Azure OpenAI client not available")
            
            batch_id = parameters.get('batch_id')
            force_resume = parameters.get('force_resume', False)
            
            if not batch_id:
                raise ValueError("batch_id parameter required")
            
            print(f"🔄 Resuming failed batch: {batch_id}")
            
            # Get current batch status
            batch_status = show_batch_progress(batch_id, return_data=True)
            
            if not batch_status or batch_status.get('status') == 'not_found':
                raise ValueError(f"Batch '{batch_id}' not found")
            
            # Check if batch actually needs resuming
            if batch_status.get('status') == 'completed' and not force_resume:
                result = {
                    "success": True,
                    "operation": "resume_failed_batch",
                    "data": {
                        "batch_id": batch_id,
                        "status": "already_completed",
                        "message": "Batch is already completed. Use force_resume=true to reprocess.",
                        "batch_status": batch_status
                    },
                    "timestamp": datetime.now().isoformat()
                }
            else:
                # Show failed items before resuming
                failed_count = batch_status.get('errors', 0)
                pending_count = batch_status.get('pending', 0)
                
                print(f"📋 Batch analysis:")
                print(f"   Failed items: {failed_count}")
                print(f"   Pending items: {pending_count}")
                
                if failed_count > 0:
                    try:
                        failed_items = get_failed_items(batch_id)
                        print(f"   Failed items details available")
                    except Exception as e:
                        print(f"   ⚠️ Could not get failed items details: {e}")
                        failed_items = None
                
                # Resume the batch
                print(f"🚀 Resuming batch processing...")
                resume_result = resume_failed_batch(client, batch_id)
                
                result = {
                    "success": True,
                    "operation": "resume_failed_batch",
                    "data": {
                        "batch_id": batch_id,
                        "status": "resumed",
                        "pre_resume_status": batch_status,
                        "failed_items_count": failed_count,
                        "pending_items_count": pending_count,
                        **resume_result
                    },
                    "timestamp": datetime.now().isoformat()
                }
            
            print(f"✅ Resume operation completed")
            serializable_result = json_serialize_timestamps(result)
            dbutils.notebook.exit(json.dumps(safe_json_serialize(serializable_result)))
            
        except Exception as e:
            error_result = {
                "success": False,
                "operation": "resume_failed_batch",
                "error": str(e),
                "available_modules": MODULES_LOADED,
                "client_available": client is not None,
                "timestamp": datetime.now().isoformat()
            }
            print(f"❌ Resume error: {e}")
            dbutils.notebook.exit(json.dumps(safe_json_serialize(error_result)))
    
    # === OPERATION 5: GET MAPPING RESULTS (NEW) ===
    elif operation == "get_mapping_results":
        """
        Get mapping results for UI review and approval workflow.
        Returns pending mappings generated during processing with enable_mapping=true.
        """
        try:
            # Get Spark session
            from pyspark.sql import SparkSession
            spark = SparkSession.getActiveSession()
            
            # Get parameters
            batch_id = parameters.get('batch_id')
            file_name = parameters.get('file_name')
            status_filter = parameters.get('status', 'pending')
            
            print(f"📋 Getting mapping results:")
            print(f"   Batch ID: {batch_id or 'all'}")
            print(f"   File: {file_name or 'all'}")
            print(f"   Status: {status_filter}")
            
            # Build query conditions
            conditions = [f"status = '{status_filter}'"]
            if batch_id:
                conditions.append(f"batch_id = '{batch_id}'")
            if file_name:
                conditions.append(f"file_name = '{file_name}'")
            
            where_clause = " AND ".join(conditions)
            
            # Query mapping results
            query = f"""
            SELECT * FROM bdx.metadata_cache.mapping_results 
            WHERE {where_clause}
            ORDER BY file_name, sheet_name, source_column
            """
            
            result_df = spark.sql(query)
            mappings = []
            
            for row in result_df.collect():
                mapping = {
                    "id": f"{row['file_name']}_{row['sheet_name']}_{row['source_column']}",
                    "batch_id": row['batch_id'],
                    "file_name": row['file_name'],
                    "sheet_name": row['sheet_name'],
                    "source_column": row['source_column'],
                    "target_column": row['target_column'],
                    "confidence": float(row['confidence_score']) if row['confidence_score'] else 0.0,
                    "sample_values": json.loads(row['sample_values']) if row['sample_values'] else [],
                    "data_type": row['data_type'] or "",
                    "description": row['description'] or "",
                    "needs_review": bool(row['needs_review']),
                    "proposed_targets": json.loads(row['proposed_targets']) if row['proposed_targets'] else [],
                    "status": row['status'],
                    "created_at": row['created_at'].isoformat() if row['created_at'] else None,
                    "reviewed_at": row['reviewed_at'].isoformat() if row['reviewed_at'] else None
                }
                mappings.append(mapping)
            
            # Group by file for summary
            files_summary = {}
            for mapping in mappings:
                file_key = f"{mapping['file_name']}_{mapping['sheet_name']}"
                if file_key not in files_summary:
                    files_summary[file_key] = {
                        "file_name": mapping['file_name'],
                        "sheet_name": mapping['sheet_name'],
                        "batch_id": mapping['batch_id'],
                        "total_columns": 0,
                        "high_confidence": 0,
                        "needs_review": 0,
                        "status": mapping['status']
                    }
                
                files_summary[file_key]["total_columns"] += 1
                if mapping['confidence'] >= 0.8:
                    files_summary[file_key]["high_confidence"] += 1
                if mapping['needs_review']:
                    files_summary[file_key]["needs_review"] += 1
            
            result = {
                "success": True,
                "operation": "get_mapping_results",
                "data": {
                    "mappings": mappings,
                    "files_summary": list(files_summary.values()),
                    "total_mappings": len(mappings),
                    "total_files": len(files_summary),
                    "status_filter": status_filter
                },
                "timestamp": datetime.now().isoformat()
            }
            
            print(f"✅ Retrieved {len(mappings)} mappings from {len(files_summary)} files")
            serializable_result = json_serialize_timestamps(result)
            dbutils.notebook.exit(json.dumps(safe_json_serialize(serializable_result)))
            
        except Exception as e:
            error_result = {
                "success": False,
                "operation": "get_mapping_results",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }
            print(f"❌ Mapping results error: {e}")
            dbutils.notebook.exit(json.dumps(safe_json_serialize(error_result)))
    
    # === OPERATION 6: APPROVE MAPPINGS (NEW) ===
    elif operation == "approve_mappings":
        """
        Approve or reject mapping results from UI.
        Updates mapping status and saves approved mappings to persistent storage.
        """
        try:
            # Check module availability
            if not MODULES_LOADED.get('mapping', False):
                raise ImportError("Mapping modules not available")
            
            # Get Spark session
            from pyspark.sql import SparkSession
            spark = SparkSession.getActiveSession()
            
            # Get parameters
            file_name = parameters.get('file_name')
            sheet_name = parameters.get('sheet_name')
            approved_mappings = parameters.get('approved_mappings', [])
            rejected_mappings = parameters.get('rejected_mappings', [])
            reviewed_by = parameters.get('reviewed_by', 'api_user')
            
            if not file_name or not sheet_name:
                raise ValueError("file_name and sheet_name are required")
            
            print(f"📋 Approving mappings for {file_name}/{sheet_name}:")
            print(f"   Approved: {len(approved_mappings)}")
            print(f"   Rejected: {len(rejected_mappings)}")
            
            approved_count = 0
            rejected_count = 0
            current_time = datetime.now()
            
            # Process approved mappings
            for mapping in approved_mappings:
                try:
                    source_col = mapping.get('source_column')
                    target_col = mapping.get('target_column')
                    structure_sig = mapping.get('structure_signature', '')
                    
                    if source_col and target_col:
                        # Save to persistent mapping binder
                        save_mapping_to_binder(
                            base_file_name=file_name,
                            sheet_name=sheet_name,
                            structure_signature=structure_sig,
                            source_column=source_col,
                            target_column=target_col,
                            mapped_by=reviewed_by,
                            notes=f"UI approved with confidence {mapping.get('confidence', 0):.2f}"
                        )
                        
                        # Update status in mapping_results table
                        spark.sql(f"""
                        UPDATE bdx.metadata_cache.mapping_results 
                        SET status = 'approved', 
                            reviewed_at = '{current_time.isoformat()}',
                            reviewed_by = '{reviewed_by}'
                        WHERE file_name = '{file_name}' 
                          AND sheet_name = '{sheet_name}'
                          AND source_column = '{source_col}'
                        """)
                        
                        approved_count += 1
                        
                except Exception as e:
                    print(f"⚠️ Failed to approve mapping {source_col}: {e}")
            
            # Process rejected mappings
            for source_col in rejected_mappings:
                try:
                    spark.sql(f"""
                    UPDATE bdx.metadata_cache.mapping_results 
                    SET status = 'rejected',
                        reviewed_at = '{current_time.isoformat()}',
                        reviewed_by = '{reviewed_by}'
                    WHERE file_name = '{file_name}' 
                      AND sheet_name = '{sheet_name}'
                      AND source_column = '{source_col}'
                    """)
                    rejected_count += 1
                except Exception as e:
                    print(f"⚠️ Failed to reject mapping {source_col}: {e}")
            
            result = {
                "success": True,
                "operation": "approve_mappings",
                "data": {
                    "file_name": file_name,
                    "sheet_name": sheet_name,
                    "approved_count": approved_count,
                    "rejected_count": rejected_count,
                    "total_processed": approved_count + rejected_count,
                    "reviewed_by": reviewed_by
                },
                "timestamp": datetime.now().isoformat()
            }
            
            print(f"✅ Mapping approval complete: {approved_count} approved, {rejected_count} rejected")
            serializable_result = json_serialize_timestamps(result)
            dbutils.notebook.exit(json.dumps(safe_json_serialize(serializable_result)))
            
        except Exception as e:
            error_result = {
                "success": False,
                "operation": "approve_mappings",
                "error": str(e),
                "timestamp": datetime.now().isoformat()
            }
            print(f"❌ Mapping approval error: {e}")
            dbutils.notebook.exit(json.dumps(safe_json_serialize(error_result)))
    
    # === UNKNOWN OPERATION ===
    else:
        error_result = {
            "success": False,
            "operation": operation,
            "error": f"Unknown operation: {operation}",
            "available_operations": [
                "discover_files_with_sheets",
                "process_files", 
                "get_batch_status",
                "resume_failed_batch",
                "get_mapping_results",
                "approve_mappings"
            ],
            "timestamp": datetime.now().isoformat()
        }
        print(f"❌ Unknown operation: {operation}")
        dbutils.notebook.exit(json.dumps(safe_json_serialize(error_result)))

# === GATEWAY INFO (No operation specified) ===
if not operation:
    print("🎉 SmartBDX API Gateway v3 - Enhanced with Mapping Support")
    print("=" * 60)
    print("📊 SYSTEM OVERVIEW:")
    print(f"   ✅ Total Operations: 6 (Core + Mapping Operations)")
    print(f"   📦 Modules Loaded: {sum(MODULES_LOADED.values())}/{len(MODULES_LOADED)}")
    print(f"   🚀 Status: {'Production Ready' if sum(MODULES_LOADED.values()) >= 4 else 'Limited'}")
    print(f"   ⚙️  Configuration: {'Available' if CONFIG_LOADED else 'Limited'}")
    print("")
    print("🔧 AVAILABLE OPERATIONS:")
    print("   📁 discover_files_with_sheets - File and sheet discovery")
    print("   🚀 process_files - Batch processing with optional mapping")
    print("   📊 get_batch_status - Real-time batch monitoring")
    print("   🔄 resume_failed_batch - Failed batch recovery")
    print("   🗂️  get_mapping_results - Retrieve column mappings for approval")
    print("   ✅ approve_mappings - Approve/reject column mappings")
    print("")
    print("💡 MAPPING WORKFLOW:")
    print("   1. Process files with enable_mapping=true")
    print("   2. Use get_mapping_results to retrieve mappings")
    print("   3. Use approve_mappings to save user decisions")
    print("")
    print("🔗 Frontend Integration Ready!")
    
    # Initialize mapping table
    try:
        create_mapping_results_table()
    except Exception as e:
        print(f"⚠️ Could not initialize mapping table: {e}")
    
    # Also show module status
    if IMPORT_ERRORS:
        print(f"\n⚠️  IMPORT ISSUES ({len(IMPORT_ERRORS)}):")
        for error in IMPORT_ERRORS:
            print(f"   - {error}")
        print("   (Some operations may be limited)")

# COMMAND ----------

# === VALIDATION SUMMARY ===
print("\n" + "="*60)
print("📋 SMARTBDX API GATEWAY ENHANCED VALIDATION SUMMARY")
print("="*60)

validation_results = {
    "total_operations": 6,
    "modules_required": 5,
    "modules_loaded": sum(MODULES_LOADED.values()),
    "config_status": "loaded" if CONFIG_LOADED else "limited",
    "client_status": "available" if client else "unavailable",
    "operations_status": {}
}

# Check each operation's requirements
operations_check = {
    "discover_files_with_sheets": MODULES_LOADED.get('selection', False),
    "process_files": MODULES_LOADED.get('processing', False) and client is not None,
    "get_batch_status": MODULES_LOADED.get('monitoring', False),
    "resume_failed_batch": MODULES_LOADED.get('processing', False) and MODULES_LOADED.get('monitoring', False) and client is not None,
    "get_mapping_results": True,  # Uses Spark SQL - always available
    "approve_mappings": MODULES_LOADED.get('mapping', False)
}

for op, status in operations_check.items():
    validation_results["operations_status"][op] = "ready" if status else "limited"
    status_icon = "✅" if status else "❌"
    print(f"{status_icon} {op}: {'Ready' if status else 'Limited functionality'}")

# Overall system health
operational_ops = sum(1 for status in operations_check.values() if status)
health_percentage = (operational_ops / 6) * 100

print(f"\n🏥 SYSTEM HEALTH: {health_percentage:.0f}%")
if health_percentage >= 80:
    print("✅ System is production-ready with mapping support")
elif health_percentage >= 60:
    print("⚠️ System functional - some mapping features limited")
else:
    print("❌ System requires attention")

print(f"\n📈 READY OPERATIONS: {operational_ops}/6")
print(f"📦 MODULE STATUS: {validation_results['modules_loaded']}/5 loaded")
print(f"⚙️  CONFIG STATUS: {validation_results['config_status']}")
print(f"🔗 CLIENT STATUS: {validation_results['client_status']}")
print(f"🗂️  MAPPING SUPPORT: {'Enabled' if MODULES_LOADED.get('mapping', False) else 'Limited'}")

if IMPORT_ERRORS:
    print(f"\n🔧 TO FIX ISSUES:")
    print("   1. Ensure all SmartBDX modules are uploaded to workspace")
    print("   2. Check Azure OpenAI client configuration")
    print("   3. Verify Delta table access permissions")
    print("   4. Check mapping module dependencies")
    print("   5. Restart cluster if needed")

print("\n✨ SmartBDX API Gateway v3 Enhanced - Validation Complete")
print("🎯 New Features: Column mapping workflow with UI approval system")