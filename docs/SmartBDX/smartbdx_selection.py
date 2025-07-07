"""
SmartBDX Manual Selection Module (Cleaned)
==========================================

Discovery-based file and sheet selection system for SmartBDX.
Provides efficient discovery, multiple selection modes, and lazy loading.
UI functions removed - contains only core business logic.

Dependencies: smartbdx_config, smartbdx_utilities, smartbdx_infrastructure
"""

# === IMPORTS ===
import os
import re
import json
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple, Union
from collections import Counter

# Third Party
import pandas as pd
from pyspark.sql import SparkSession

# SmartBDX Modules
from smartbdx_config import (
    DEFAULT_VOLUME_FOLDER,
    CHECKPOINT_TABLE
)
from smartbdx_utilities import (
    extract_base_file_name,
    safe_view_name,
    copy_volume_file_to_tmp_via_spark
)
from smartbdx_infrastructure import BatchCheckpointManager
from smartbdx_processing import process_file_sheet_with_production_features

# Get Spark session
spark = SparkSession.getActiveSession()

  # --- dbutils Handling ---
try:
    dbutils  # type: ignore
except NameError:
    try:
        from pyspark.dbutils import DBUtils
        dbutils = DBUtils(spark)
    except Exception:
        dbutils = None

# === API OPERATIONS ===

# Get operation parameter
dbutils.widgets.text("operation", "", "Operation Type")
operation = dbutils.widgets.get("operation")

if operation == "get_sheet_names":
    # Use existing SmartBDX functions
    dbutils.widgets.text("file_path", "", "File Path")
    file_path = dbutils.widgets.get("file_path")
    
    if not file_path:
        dbutils.notebook.exit(json.dumps({"error": "file_path required"}))
    
    try:
        # Import your existing modules
        from smartbdx_core_ai import copy_volume_file_to_tmp_via_spark
        import pandas as pd
        
        # Use your existing utility function
        local_path = copy_volume_file_to_tmp_via_spark(file_path)
        xls = pd.ExcelFile(local_path)
        sheet_names = xls.sheet_names
        xls.close()
        
        # Clean up (your existing pattern)
        import os
        os.remove(local_path)
        
        print(f"✅ Extracted {len(sheet_names)} sheets from {file_path}")
        dbutils.notebook.exit(json.dumps(sheet_names))
        
    except Exception as e:
        print(f"❌ Error: {e}")
        dbutils.notebook.exit(json.dumps({"error": str(e)}))

elif operation == "list_files":
    # Use existing file listing logic
    dbutils.widgets.text("volume_path", "", "Volume Path")
    volume_path = dbutils.widgets.get("volume_path")
    
    try:
        # Your existing file listing pattern from smartbdx_core_ai.py
        full_paths = [f.path for f in dbutils.fs.ls(volume_path) if f.name.lower().endswith(".xlsx")]
        
        files = []
        for path in full_paths:
            file_info = dbutils.fs.ls(path)[0]
            files.append({
                "id": file_info.name,
                "file_name": file_info.name,
                "status": "pending",
                "last_modified": file_info.modificationTime,
                "size": file_info.size,
                "path": path
            })
        
        print(f"✅ Found {len(files)} Excel files")
        dbutils.notebook.exit(json.dumps(files))
        
    except Exception as e:
        print(f"❌ Error: {e}")
        dbutils.notebook.exit(json.dumps({"error": str(e)}))

# If no API operation, continue with normal SmartBDX processing
print("🚀 Continuing with normal SmartBDX processing...")

# === CORE DISCOVERY FUNCTIONS ===

def discover_files_and_sheets_metadata(volume_folder: str = DEFAULT_VOLUME_FOLDER) -> pd.DataFrame:
    """
    Fast discovery of available files and sheets with rich metadata.
    
    Discovers all Excel files and their sheets without loading content,
    providing metadata for intelligent selection decisions.
    
    Args:
        volume_folder (str): Path to Databricks volume containing Excel files
        
    Returns:
        pd.DataFrame: Rich metadata table with columns:
            - file_name: Original Excel file name
            - sheet_name: Sheet name within file
            - file_size_mb: File size in megabytes
            - last_modified: File modification timestamp
            - estimated_rows: Rough estimate of rows (from file size)
            - processing_status: Current status (completed, failed, pending, unknown)
            - base_file_name: Normalized file name for grouping
            - priority_score: Calculated priority for processing (higher = more important)
            - file_path: Full path to file
            
    Example:
        >>> metadata_df = discover_files_and_sheets_metadata()
        📊 Discovered 25 files with 87 sheets
    """
    print(f"🔍 Discovering files and sheets in: {volume_folder}")
    
    metadata_records = []
    
    if dbutils is not None:
        # Databricks environment
        try:
            file_info_list = dbutils.fs.ls(volume_folder)
            excel_files = [f for f in file_info_list if f.name.lower().endswith('.xlsx')]
            
            if not excel_files:
                print(f"⚠️ No Excel files found in {volume_folder}")
                return pd.DataFrame()
                
            print(f"📂 Found {len(excel_files)} Excel files")
            
            # Get processing status for all files
            processing_status = _get_processing_status_bulk()
            
            for file_info in excel_files:
                file_name = file_info.name
                file_size_mb = file_info.size / (1024 * 1024) if file_info.size else 0
                last_modified = datetime.fromtimestamp(file_info.modificationTime / 1000) if file_info.modificationTime else None
                
                # Get sheet names efficiently using pandas.ExcelFile
                try:
                    local_path = copy_volume_file_to_tmp_via_spark(file_info.path)
                    xl = pd.ExcelFile(local_path)
                    sheet_names = xl.sheet_names
                    xl.close()
                    
                    # Clean up temp file
                    try:
                        os.remove(local_path)
                    except:
                        pass
                        
                except Exception as e:
                    print(f"⚠️ Could not read sheets from {file_name}: {e}")
                    sheet_names = ["Sheet1"]  # Fallback
                
                base_file_name = extract_base_file_name(file_name)
                
                for sheet_name in sheet_names:
                    # Get processing status
                    status_key = (file_name, sheet_name)
                    status = processing_status.get(status_key, "unknown")
                    
                    # Calculate priority score (higher = more important)
                    priority_score = _calculate_priority_score(
                        file_name, sheet_name, file_size_mb, last_modified, status
                    )
                    
                    # Estimate rows from file size (rough heuristic)
                    estimated_rows = int(file_size_mb * 1000) if file_size_mb > 0 else 100
                    
                    metadata_records.append({
                        'file_name': file_name,
                        'sheet_name': sheet_name,
                        'file_size_mb': round(file_size_mb, 2),
                        'last_modified': last_modified,
                        'estimated_rows': estimated_rows,
                        'processing_status': status,
                        'base_file_name': base_file_name,
                        'priority_score': priority_score,
                        'file_path': file_info.path
                    })
                    
        except Exception as e:
            print(f"❌ Error discovering files: {e}")
            return pd.DataFrame()
    else:
        # Local environment fallback
        print(f"🔎 Local environment - scanning: {volume_folder}")
        if not os.path.exists(volume_folder):
            print(f"❌ Folder does not exist: {volume_folder}")
            return pd.DataFrame()
            
        for file_name in os.listdir(volume_folder):
            if file_name.lower().endswith('.xlsx'):
                file_path = os.path.join(volume_folder, file_name)
                file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
                last_modified = datetime.fromtimestamp(os.path.getmtime(file_path))
                
                try:
                    xl = pd.ExcelFile(file_path)
                    sheet_names = xl.sheet_names
                    xl.close()
                except Exception as e:
                    print(f"⚠️ Could not read sheets from {file_name}: {e}")
                    sheet_names = ["Sheet1"]
                
                base_file_name = extract_base_file_name(file_name)
                
                for sheet_name in sheet_names:
                    priority_score = _calculate_priority_score(
                        file_name, sheet_name, file_size_mb, last_modified, "unknown"
                    )
                    
                    estimated_rows = int(file_size_mb * 1000) if file_size_mb > 0 else 100
                    
                    metadata_records.append({
                        'file_name': file_name,
                        'sheet_name': sheet_name,
                        'file_size_mb': round(file_size_mb, 2),
                        'last_modified': last_modified,
                        'estimated_rows': estimated_rows,
                        'processing_status': "unknown",
                        'base_file_name': base_file_name,
                        'priority_score': priority_score,
                        'file_path': file_path
                    })
    
    if not metadata_records:
        print("⚠️ No files or sheets discovered")
        return pd.DataFrame()
    
    # Create DataFrame with rich metadata
    metadata_df = pd.DataFrame(metadata_records)
    
    # Sort by priority score (descending) and file name
    metadata_df = metadata_df.sort_values(['priority_score', 'file_name', 'sheet_name'], 
                                        ascending=[False, True, True]).reset_index(drop=True)
    
    print(f"📊 Discovered {metadata_df['file_name'].nunique()} files with {len(metadata_df)} sheets")
    print(f"📈 Status breakdown: {metadata_df['processing_status'].value_counts().to_dict()}")
    
    return metadata_df

def _get_processing_status_bulk() -> Dict[Tuple[str, str], str]:
    """
    Get processing status for all file/sheet combinations efficiently.
    
    Returns:
        Dict mapping (file_name, sheet_name) -> status
    """
    try:
        # Query checkpoint table for latest status of each file/sheet
        status_df = spark.sql(f"""
        WITH latest_status AS (
            SELECT 
                file_name,
                sheet_name,
                status,
                ROW_NUMBER() OVER (
                    PARTITION BY file_name, sheet_name 
                    ORDER BY started_at DESC
                ) as rn
            FROM {CHECKPOINT_TABLE}
        )
        SELECT file_name, sheet_name, status
        FROM latest_status 
        WHERE rn = 1
        """)
        
        status_dict = {}
        for row in status_df.collect():
            status_dict[(row.file_name, row.sheet_name)] = row.status
            
        return status_dict
        
    except Exception as e:
        print(f"⚠️ Could not query processing status: {e}")
        return {}

def _calculate_priority_score(file_name: str, sheet_name: str, file_size_mb: float, 
                            last_modified: Optional[datetime], status: str) -> float:
    """
    Calculate priority score for processing order.
    
    Higher scores = higher priority for processing.
    """
    score = 50.0  # Base score
    
    # Status-based scoring (failed items get highest priority)
    status_scores = {
        'failed': 100,
        'pending': 80, 
        'processing': 20,
        'completed': 10,
        'unknown': 60
    }
    score += status_scores.get(status, 50)
    
    # File size scoring (larger files = higher priority, but cap it)
    if file_size_mb > 0:
        size_score = min(file_size_mb * 5, 50)  # Cap at 50 points
        score += size_score
    
    # Recency scoring (newer files = higher priority)
    if last_modified:
        days_old = (datetime.now() - last_modified).days
        if days_old <= 7:
            score += 30  # Very recent
        elif days_old <= 30:
            score += 20  # Recent
        elif days_old <= 90:
            score += 10  # Somewhat recent
        # Older files get no bonus
    
    # Sheet name scoring (prioritize summary/main sheets)
    priority_sheet_patterns = [
        r'summary', r'main', r'data', r'total', r'consolidated', 
        r'overview', r'dashboard', r'report'
    ]
    for pattern in priority_sheet_patterns:
        if re.search(pattern, sheet_name.lower()):
            score += 15
            break
    
    return round(score, 1)

# === CORE SELECTION FUNCTIONS ===

def select_by_patterns(metadata_df: pd.DataFrame,
                      file_patterns: Optional[List[str]] = None,
                      sheet_patterns: Optional[List[str]] = None,
                      date_range: Optional[Tuple[str, str]] = None,
                      status_filter: Optional[str] = None,
                      priority_mode: Optional[str] = None,
                      max_items: Optional[int] = None,
                      exclude_patterns: Optional[List[str]] = None) -> List[Tuple[str, str]]:
    """
    Flexible pattern-based selection with multiple criteria.
    
    Args:
        metadata_df (pd.DataFrame): Metadata from discovery
        file_patterns (List[str], optional): File name patterns (supports wildcards)
        sheet_patterns (List[str], optional): Sheet name patterns 
        date_range (Tuple[str, str], optional): Date range (start, end) as YYYY-MM-DD
        status_filter (str, optional): Status filter (completed, failed, pending, etc.)
        priority_mode (str, optional): Priority mode (failed_first, newest_first, etc.)
        max_items (int, optional): Maximum items to return
        exclude_patterns (List[str], optional): Patterns to exclude
        
    Returns:
        List[Tuple[str, str]]: Filtered (file_name, sheet_name) tuples
        
    Example:
        >>> selected = select_by_patterns(
        ...     metadata_df,
        ...     file_patterns=["Premium_Report_*.xlsx", "Claims_*.xlsx"],
        ...     sheet_patterns=["Summary", "Q1*"],
        ...     status_filter="failed",
        ...     max_items=20
        ... )
    """
    filtered_df = metadata_df.copy()
    
    print(f"🔍 Starting with {len(filtered_df)} items")
    
    # File pattern filtering
    if file_patterns:
        file_mask = pd.Series(False, index=filtered_df.index)
        for pattern in file_patterns:
            # Convert glob pattern to regex
            regex_pattern = pattern.replace('*', '.*').replace('?', '.')
            file_mask |= filtered_df['file_name'].str.match(regex_pattern, case=False)
        filtered_df = filtered_df[file_mask]
        print(f"📁 After file pattern filter: {len(filtered_df)} items")
    
    # Sheet pattern filtering
    if sheet_patterns:
        sheet_mask = pd.Series(False, index=filtered_df.index)
        for pattern in sheet_patterns:
            regex_pattern = pattern.replace('*', '.*').replace('?', '.')
            sheet_mask |= filtered_df['sheet_name'].str.match(regex_pattern, case=False)
        filtered_df = filtered_df[sheet_mask]
        print(f"📄 After sheet pattern filter: {len(filtered_df)} items")
    
    # Date range filtering
    if date_range and 'last_modified' in filtered_df.columns:
        start_date, end_date = date_range
        start_dt = datetime.strptime(start_date, '%Y-%m-%d')
        end_dt = datetime.strptime(end_date, '%Y-%m-%d') + timedelta(days=1)
        filtered_df = filtered_df[
            (filtered_df['last_modified'] >= start_dt) & 
            (filtered_df['last_modified'] < end_dt)
        ]
        print(f"📅 After date filter: {len(filtered_df)} items")
    
    # Status filtering
    if status_filter:
        filtered_df = filtered_df[filtered_df['processing_status'] == status_filter]
        print(f"🎯 After status filter ({status_filter}): {len(filtered_df)} items")
    
    # Exclude patterns
    if exclude_patterns:
        for exclude_pattern in exclude_patterns:
            regex_pattern = exclude_pattern.replace('*', '.*').replace('?', '.')
            excluded_files = filtered_df['file_name'].str.match(regex_pattern, case=False)
            excluded_sheets = filtered_df['sheet_name'].str.match(regex_pattern, case=False)
            filtered_df = filtered_df[~(excluded_files | excluded_sheets)]
        print(f"🚫 After exclude patterns: {len(filtered_df)} items")
    
    # Priority-based sorting
    if priority_mode:
        if priority_mode == "failed_first":
            filtered_df = filtered_df.sort_values(['processing_status', 'priority_score'], 
                                                ascending=[False, False])
        elif priority_mode == "newest_first":
            if 'last_modified' in filtered_df.columns:
                filtered_df = filtered_df.sort_values('last_modified', ascending=False)
        elif priority_mode == "largest_first":
            filtered_df = filtered_df.sort_values('file_size_mb', ascending=False)
        elif priority_mode == "high_priority_only":
            filtered_df = filtered_df[filtered_df['priority_score'] >= 100]
        
        print(f"⭐ Applied priority mode: {priority_mode}")
    
    # Limit results
    if max_items and len(filtered_df) > max_items:
        filtered_df = filtered_df.head(max_items)
        print(f"🔢 Limited to {max_items} items")
    
    # Convert to selection list
    selected_items = list(zip(filtered_df['file_name'], filtered_df['sheet_name']))
    
    print(f"✅ Final selection: {len(selected_items)} items")
    return selected_items

def select_by_criteria(metadata_df: pd.DataFrame,
                      priority: str = "failed_first",
                      max_items: Optional[int] = None,
                      exclude_completed: bool = True,
                      min_priority_score: float = 50.0) -> List[Tuple[str, str]]:
    """
    Intelligent selection based on processing history and criteria.
    
    Args:
        metadata_df (pd.DataFrame): Metadata from discovery
        priority (str): Priority strategy (failed_first, newest_first, largest_first)
        max_items (int, optional): Maximum items to select
        exclude_completed (bool): Whether to exclude completed items
        min_priority_score (float): Minimum priority score threshold
        
    Returns:
        List[Tuple[str, str]]: Smart selection of (file_name, sheet_name) tuples
        
    Example:
        >>> # Get failed items first, up to 25 items
        >>> selected = select_by_criteria(
        ...     metadata_df, 
        ...     priority="failed_first", 
        ...     max_items=25
        ... )
    """
    print(f"🧠 Smart selection with priority: {priority}")
    
    smart_df = metadata_df.copy()
    
    # Exclude completed items if requested
    if exclude_completed:
        smart_df = smart_df[smart_df['processing_status'] != 'completed']
        print(f"✅ Excluded completed items: {len(smart_df)} remaining")
    
    # Apply minimum priority score
    smart_df = smart_df[smart_df['priority_score'] >= min_priority_score]
    print(f"⭐ Applied min priority score ({min_priority_score}): {len(smart_df)} remaining")
    
    # Apply priority strategy
    if priority == "failed_first":
        # Prioritize failed > pending > unknown, then by priority score
        status_order = {'failed': 0, 'pending': 1, 'unknown': 2, 'processing': 3, 'completed': 4}
        smart_df['status_rank'] = smart_df['processing_status'].map(status_order)
        smart_df = smart_df.sort_values(['status_rank', 'priority_score'], 
                                      ascending=[True, False])
        
    elif priority == "newest_first":
        if 'last_modified' in smart_df.columns:
            smart_df = smart_df.sort_values('last_modified', ascending=False)
        else:
            smart_df = smart_df.sort_values('priority_score', ascending=False)
            
    elif priority == "largest_first":
        smart_df = smart_df.sort_values(['file_size_mb', 'priority_score'], 
                                      ascending=[False, False])
    else:
        # Default: sort by priority score
        smart_df = smart_df.sort_values('priority_score', ascending=False)
    
    # Limit results
    if max_items:
        smart_df = smart_df.head(max_items)
        print(f"🔢 Limited to top {max_items} items")
    
    selected_items = list(zip(smart_df['file_name'], smart_df['sheet_name']))
    
    print(f"🎯 Smart selection complete: {len(selected_items)} items")
    return selected_items

# === HELPER FUNCTIONS FOR ENHANCED FILTERING ===

def _apply_enhanced_filtering(metadata_df: pd.DataFrame, selected_files: List[str], 
                            selected_sheets: List[str], processing_mode: str, 
                            max_items: int) -> List[Tuple[str, str]]:
    """Apply enhanced filtering logic based on selections and processing mode."""
    
    # Filter by file and sheet selections
    filtered_df = metadata_df[
        (metadata_df['file_name'].isin(selected_files)) &
        (metadata_df['sheet_name'].isin(selected_sheets))
    ].copy()
    
    print(f"🔍 After file/sheet filter: {len(filtered_df)} items")
    
    # Apply processing mode filter
    if processing_mode == "failed_only":
        filtered_df = filtered_df[filtered_df['processing_status'] == 'failed']
    elif processing_mode == "failed_and_pending":
        filtered_df = filtered_df[filtered_df['processing_status'].isin(['failed', 'pending'])]
    elif processing_mode == "pending_only":
        filtered_df = filtered_df[filtered_df['processing_status'] == 'pending']
    elif processing_mode == "high_priority":
        filtered_df = filtered_df[filtered_df['priority_score'] >= 80]
    elif processing_mode == "smart_selection":
        # Smart selection: failed first, then high priority, then pending
        filtered_df = filtered_df[
            (filtered_df['processing_status'].isin(['failed', 'pending'])) |
            (filtered_df['priority_score'] >= 80)
        ]
    # "all" mode: no additional filtering
    
    print(f"🎯 After processing mode filter ({processing_mode}): {len(filtered_df)} items")
    
    # Smart sorting
    status_priority = {'failed': 0, 'pending': 1, 'unknown': 2, 'processing': 3, 'completed': 4}
    filtered_df['status_rank'] = filtered_df['processing_status'].map(status_priority)
    filtered_df = filtered_df.sort_values(['status_rank', 'priority_score'], ascending=[True, False])
    
    # Apply max items limit
    if max_items > 0 and len(filtered_df) > max_items:
        filtered_df = filtered_df.head(max_items)
        print(f"🔢 Limited to top {max_items} items")
    
    return list(zip(filtered_df['file_name'], filtered_df['sheet_name']))

def _apply_quick_filter_preset(quick_filter: str) -> List[Tuple[str, str]]:
    """Apply quick filter presets for common scenarios."""
    metadata_df = discover_files_and_sheets_metadata()
    
    if metadata_df.empty:
        return []
    
    preset = quick_filter.split(' →')[0].strip()
    
    if preset == "🔥 failed_urgent":
        # All failed items
        selected = select_by_criteria(
            metadata_df,
            priority="failed_first",
            exclude_completed=True
        )
        print(f"⚡ Quick Filter: Selected {len(selected)} failed items")
        
    elif preset == "⚡ pending_batch":
        # All pending items
        filtered_df = metadata_df[metadata_df['processing_status'] == 'pending']
        selected = list(zip(filtered_df['file_name'], filtered_df['sheet_name']))
        print(f"⚡ Quick Filter: Selected {len(selected)} pending items")
        
    elif preset == "📊 last_week":
        # Files from last 7 days
        from datetime import datetime, timedelta
        week_ago = datetime.now() - timedelta(days=7)
        recent_df = metadata_df[metadata_df['last_modified'] >= week_ago]
        selected = list(zip(recent_df['file_name'], recent_df['sheet_name']))
        print(f"⚡ Quick Filter: Selected {len(selected)} items from last week")
        
    elif preset == "⭐ high_priority":
        # High priority items
        high_priority_df = metadata_df[metadata_df['priority_score'] >= 80]
        selected = list(zip(high_priority_df['file_name'], high_priority_df['sheet_name']))
        print(f"⚡ Quick Filter: Selected {len(selected)} high-priority items")
        
    elif preset == "🧪 test_sample":
        # Small test batch
        selected = select_by_criteria(
            metadata_df,
            priority="failed_first",
            max_items=5
        )
        print(f"⚡ Quick Filter: Selected {len(selected)} items for testing")
        
    else:
        selected = []
    
    return selected

# === LOADING FUNCTIONS ===

def load_selected_files_only(volume_folder: str, 
                            selected_items: List[Tuple[str, str]]) -> Dict[str, Dict[str, pd.DataFrame]]:
    """
    Efficiently load only the selected file/sheet combinations.
    
    Reuses existing loading logic but filters to only load what's needed.
    Much more efficient than loading everything then filtering.
    
    Args:
        volume_folder (str): Path to Databricks volume
        selected_items (List[Tuple[str, str]]): List of (file_name, sheet_name) tuples
        
    Returns:
        Dict[str, Dict[str, pd.DataFrame]]: Loaded data in {file: {sheet: df}} format
        
    Example:
        >>> selected = [("Report_Q1.xlsx", "Summary"), ("Report_Q1.xlsx", "Details")]
        >>> loaded_data = load_selected_files_only(volume_folder, selected)
        📂 Loading 1 files with 2 selected sheets...
        ✅ Loaded Report_Q1.xlsx with 2 sheets
    """
    if not selected_items:
        print("⚠️ No items selected for loading")
        return {}
    
    # Group selections by file
    files_to_load = {}
    for file_name, sheet_name in selected_items:
        if file_name not in files_to_load:
            files_to_load[file_name] = []
        files_to_load[file_name].append(sheet_name)
    
    print(f"📂 Loading {len(files_to_load)} files with {len(selected_items)} selected sheets...")
    
    loaded_data = {}
    
    for file_name, sheet_names in files_to_load.items():
        print(f"\n📄 Loading file: {file_name}")
        
        if dbutils is not None:
            # Databricks environment
            file_path = f"{volume_folder}/{file_name}" if not volume_folder.endswith('/') else f"{volume_folder}{file_name}"
            
            try:
                local_path = copy_volume_file_to_tmp_via_spark(file_path)
                xl = pd.ExcelFile(local_path)
                
                file_sheets = {}
                for sheet_name in sheet_names:
                    if sheet_name in xl.sheet_names:
                        print(f"  📋 Loading sheet: {sheet_name}")
                        df = pd.read_excel(xl, sheet_name=sheet_name, header=None)
                        
                        # Clean data (same as original loading logic)
                        if not df.empty:
                            df = df.applymap(lambda x: str(x).strip().replace("\n", " ").replace("\r", " ") if pd.notna(x) else None)
                        
                        file_sheets[sheet_name] = df
                    else:
                        print(f"  ⚠️ Sheet '{sheet_name}' not found in {file_name}")
                
                xl.close()
                loaded_data[file_name] = file_sheets
                
                # Clean up temp file
                try:
                    os.remove(local_path)
                except:
                    pass
                    
                print(f"  ✅ Loaded {file_name} with {len(file_sheets)} sheets")
                
            except Exception as e:
                print(f"  ❌ Failed to load {file_name}: {e}")
        else:
            # Local environment
            file_path = os.path.join(volume_folder, file_name)
            
            try:
                xl = pd.ExcelFile(file_path)
                
                file_sheets = {}
                for sheet_name in sheet_names:
                    if sheet_name in xl.sheet_names:
                        print(f"  📋 Loading sheet: {sheet_name}")
                        df = pd.read_excel(xl, sheet_name=sheet_name, header=None)
                        
                        # Clean data
                        if not df.empty:
                            df = df.applymap(lambda x: str(x).strip().replace("\n", " ").replace("\r", " ") if pd.notna(x) else None)
                        
                        file_sheets[sheet_name] = df
                    else:
                        print(f"  ⚠️ Sheet '{sheet_name}' not found in {file_name}")
                
                xl.close()
                loaded_data[file_name] = file_sheets
                print(f"  ✅ Loaded {file_name} with {len(file_sheets)} sheets")
                
            except Exception as e:
                print(f"  ❌ Failed to load {file_name}: {e}")
    
    total_sheets_loaded = sum(len(sheets) for sheets in loaded_data.values())
    print(f"\n🎉 Loading complete: {len(loaded_data)} files, {total_sheets_loaded} sheets")
    
    return loaded_data

# === PROCESSING INTEGRATION ===

def process_selected_items(client: Any,
                         selected_items: List[Tuple[str, str]],
                         volume_folder: str = DEFAULT_VOLUME_FOLDER,
                         batch_id: Optional[str] = None,
                         enable_mapping: bool = False,
                         **kwargs) -> Dict[str, Any]:
    """
    Process selected items using existing SmartBDX pipeline.
    
    Full integration with existing infrastructure:
    - Checkpoints and batch tracking
    - Rate limiting for Azure OpenAI
    - Error handling and retry logic
    - Optional column mapping
    
    Args:
        client: Azure OpenAI client instance
        selected_items (List[Tuple[str, str]]): Items to process
        volume_folder (str): Source volume folder
        batch_id (str, optional): Batch ID for tracking
        enable_mapping (bool): Enable column mapping
        **kwargs: Additional arguments for processing
        
    Returns:
        Dict[str, Any]: Processing results with status and metrics
        
    Example:
        >>> selected = select_by_criteria(metadata_df, "failed_first", max_items=10)
        >>> result = process_selected_items(client, selected)
        🚀 Processing 10 selected items...
        ✅ Batch processing complete!
    """
    from smartbdx_infrastructure import AzureOpenAIRateLimiter
    import time
    
    if not selected_items:
        print("⚠️ No items to process")
        return {"status": "no_items", "message": "No items selected"}
    
    print(f"🚀 Processing {len(selected_items)} selected items...")
    
    # Initialize infrastructure
    checkpoint_mgr = BatchCheckpointManager()
    rate_limiter = AzureOpenAIRateLimiter()
    
    # Generate batch ID if not provided
    if not batch_id:
        batch_id = f"selected_batch_{int(time.time())}"
    
    print(f"🎯 Batch ID: {batch_id}")
    
    # Load only selected files
    loaded_data = load_selected_files_only(volume_folder, selected_items)
    
    if not loaded_data:
        print("❌ No data loaded - cannot proceed")
        return {"status": "error", "message": "No data loaded"}
    
    # Prepare file/sheet combinations for processing  
    file_sheets = []
    for file_name, sheet_name in selected_items:
        if file_name in loaded_data and sheet_name in loaded_data[file_name]:
            df = loaded_data[file_name][sheet_name]
            file_sheets.append((file_name, sheet_name, df))
        else:
            print(f"⚠️ Could not find {file_name}/{sheet_name} in loaded data")
    
    if not file_sheets:
        print("❌ No valid file/sheet combinations to process")
        return {"status": "error", "message": "No valid items to process"}
    
    print(f"📋 Processing {len(file_sheets)} file/sheet combinations")
    
    # Initialize batch in checkpoint system
    checkpoint_mgr.start_batch(batch_id, file_sheets)
    
    # Process each item
    start_time = time.time()
    
    for i, (file_name, sheet_name, df) in enumerate(file_sheets, 1):
        print(f"\n📋 [{i}/{len(file_sheets)}] Processing: {file_name}/{sheet_name}")
        
        # Use existing production processing function
        process_file_sheet_with_production_features(
            file_name, sheet_name, df, client, batch_id,
            checkpoint_mgr, rate_limiter, enable_mapping
        )
        
        # Progress reporting
        if i % 5 == 0 or i == len(file_sheets):
            progress_pct = (i / len(file_sheets)) * 100
            elapsed = (time.time() - start_time) / 60
            rate = (i / elapsed) * 60 if elapsed > 0 else 0
            print(f"📊 Progress: {i}/{len(file_sheets)} ({progress_pct:.1f}%)")
            print(f"⏱️  Rate: {rate:.1f} sheets/hour")
    
    # Final reporting
    total_time = time.time() - start_time
    total_minutes = total_time / 60
    avg_rate = (len(file_sheets) / total_minutes) * 60 if total_minutes > 0 else 0
    
    print(f"\n🎉 Selected batch {batch_id} processing complete!")
    print(f"⏱️  Total time: {total_minutes:.1f} minutes")
    print(f"📊 Average rate: {avg_rate:.1f} sheets/hour")
    
    # Show final batch summary
    checkpoint_mgr.get_batch_summary(batch_id)
    
    return {
        "status": "completed",
        "batch_id": batch_id,
        "total_items": len(file_sheets),
        "selected_items": len(selected_items),
        "processing_time_minutes": total_minutes,
        "average_rate_sheets_per_hour": avg_rate,
        "files_processed": len(set(f[0] for f in file_sheets))
    }

# === CONVENIENCE FUNCTIONS ===

def quick_select_and_process(volume_folder: str = DEFAULT_VOLUME_FOLDER,
                           priority: str = "failed_first",
                           max_items: int = 10,
                           enable_mapping: bool = False) -> Dict[str, Any]:
    """
    One-command discovery, selection, and processing.
    
    Example:
        >>> result = quick_select_and_process(
        ...     priority="failed_first", 
        ...     max_items=5
        ... )
    """
    from smartbdx_config import client
    
    print("🚀 Quick Select and Process")
    
    # Discovery
    metadata_df = discover_files_and_sheets_metadata(volume_folder)
    
    if metadata_df.empty:
        return {"status": "no_files", "message": "No files discovered"}
    
    # Smart selection
    selected_items = select_by_criteria(
        metadata_df, 
        priority=priority, 
        max_items=max_items
    )
    
    if not selected_items:
        return {"status": "no_selection", "message": "No items selected"}
    
    # Process
    result = process_selected_items(
        client, selected_items, volume_folder,
        enable_mapping=enable_mapping
    )
    
    return result

# === PARSING HELPER FUNCTIONS ===

def _parse_enhanced_file_selections(selected_files_str: str) -> List[str]:
    """Parse file selections and extract actual file names from display names."""
    if not selected_files_str.strip():
        return []
    
    selected_files = []
    for display_name in selected_files_str.split(','):
        display_name = display_name.strip()
        if display_name:
            # Extract actual file name by removing icons
            clean_name = re.sub(r'^[🔥⚡✅📋⭐]+\s+', '', display_name)
            selected_files.append(clean_name)
    
    return selected_files

def _parse_enhanced_sheet_selections(selected_sheets_str: str) -> List[str]:
    """Parse sheet selections and extract actual sheet names from display names."""
    if not selected_sheets_str.strip():
        return []
    
    selected_sheets = []
    for display_name in selected_sheets_str.split(','):
        display_name = display_name.strip()
        if display_name:
            # Extract actual sheet name by removing icons
            clean_name = re.sub(r'^[🔥⚡📄⭐]+\s+', '', display_name)
            selected_sheets.append(clean_name)
    
    return selected_sheets

def _get_smart_file_preselection(metadata_df: pd.DataFrame, max_preselect: int = 8) -> List[str]:
    """Smart pre-selection of high-priority files."""
    # Priority order: failed > pending > high_priority > recent
    priority_files = []
    
    # Get files with failed status first
    failed_files = metadata_df[metadata_df['processing_status'] == 'failed']['file_name'].unique()
    priority_files.extend(failed_files[:max_preselect//2])
    
    # Get files with pending status
    if len(priority_files) < max_preselect:
        pending_files = metadata_df[metadata_df['processing_status'] == 'pending']['file_name'].unique()
        remaining_slots = max_preselect - len(priority_files)
        priority_files.extend([f for f in pending_files if f not in priority_files][:remaining_slots])
    
    # Get high priority files
    if len(priority_files) < max_preselect:
        high_priority_files = metadata_df[metadata_df['priority_score'] >= 90]['file_name'].unique()
        remaining_slots = max_preselect - len(priority_files)
        priority_files.extend([f for f in high_priority_files if f not in priority_files][:remaining_slots])
    
    return priority_files[:max_preselect]

def _get_smart_sheet_preselection(metadata_df: pd.DataFrame) -> List[str]:
    """Smart pre-selection of priority sheets."""
    priority_patterns = [
        r'summary', r'total', r'main', r'data', r'overview', 
        r'dashboard', r'report', r'consolidated', r'master'
    ]
    
    priority_sheets = []
    all_sheets = metadata_df['sheet_name'].unique()
    
    # First, get sheets that match priority patterns
    for sheet_name in all_sheets:
        is_priority = any(re.search(pattern, sheet_name.lower()) for pattern in priority_patterns)
        if is_priority:
            priority_sheets.append(sheet_name)
    
    # Then, get sheets with failed status
    failed_sheets = metadata_df[metadata_df['processing_status'] == 'failed']['sheet_name'].unique()
    for sheet in failed_sheets:
        if sheet not in priority_sheets:
            priority_sheets.append(sheet)
    
    # Limit to reasonable number
    return priority_sheets[:10]

print("✅ SmartBDX Selection module (cleaned) loaded successfully")
print("🔧 Available functions:")
print("   📊 discover_files_and_sheets_metadata() - Core discovery")
print("   🎯 select_by_patterns() - Pattern-based selection")
print("   🧠 select_by_criteria() - Smart criteria-based selection")
print("   📂 load_selected_files_only() - Efficient loading")
print("   🚀 process_selected_items() - Full processing pipeline")
print("   ⚡ quick_select_and_process() - One-command workflow")