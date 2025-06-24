"""
SmartBDX Manual Selection Module
===============================

Discovery-based file and sheet selection system for SmartBDX.
Provides efficient discovery, multiple selection modes, and lazy loading.
Enhanced with visual dropdown interfaces and smart pre-selection.

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
from IPython.display import display, HTML

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

# === DISCOVERY FUNCTIONS ===

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
        >>> display(metadata_df)
        # Shows rich table in Databricks with sorting/filtering
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

# === SELECTION FUNCTIONS ===

def create_selection_widget(metadata_df: pd.DataFrame) -> None:
    """
    Create interactive Databricks widgets for file/sheet selection.
    
    Creates multi-select widgets for interactive selection with rich display
    and filtering options.
    
    Args:
        metadata_df (pd.DataFrame): Metadata from discover_files_and_sheets_metadata()
        
    Usage:
        >>> metadata_df = discover_files_and_sheets_metadata()
        >>> create_selection_widget(metadata_df)
        # Creates interactive widgets in Databricks
        >>> selected = get_widget_selections()
    """
    if dbutils is None:
        print("❌ Widgets only available in Databricks environment")
        return
    
    print("🎛️ Creating interactive selection widgets...")
    
    # Remove existing widgets
    try:
        dbutils.widgets.removeAll()
    except:
        pass
    
    # Status filter widget
    status_options = ["all"] + list(metadata_df['processing_status'].unique())
    dbutils.widgets.dropdown("status_filter", "all", status_options, 
                            "🎯 Filter by Status")
    
    # File pattern widget
    dbutils.widgets.text("file_pattern", "", "📁 File Pattern (e.g., Premium_*)")
    
    # Sheet pattern widget  
    dbutils.widgets.text("sheet_pattern", "", "📄 Sheet Pattern (e.g., Summary)")
    
    # Max items widget
    dbutils.widgets.text("max_items", "50", "🔢 Max Items to Select")
    
    # Priority filter widget
    priority_options = ["all", "high_priority_only", "failed_first", "newest_first"]
    dbutils.widgets.dropdown("priority_mode", "failed_first", priority_options,
                            "⭐ Priority Mode")
    
    print("✅ Widgets created! Use the dropdowns above to filter, then run get_widget_selections()")
    
    # Display rich metadata table
    display_selection_table(metadata_df)

def get_widget_selections() -> List[Tuple[str, str]]:
    """
    Get selections from Databricks widgets and return filtered items.
    
    Returns:
        List[Tuple[str, str]]: List of (file_name, sheet_name) tuples
    """
    if dbutils is None:
        print("❌ Widgets only available in Databricks environment")
        return []
    
    try:
        # Get widget values
        status_filter = dbutils.widgets.get("status_filter")
        file_pattern = dbutils.widgets.get("file_pattern") 
        sheet_pattern = dbutils.widgets.get("sheet_pattern")
        max_items = int(dbutils.widgets.get("max_items") or 50)
        priority_mode = dbutils.widgets.get("priority_mode")
        
        # Re-discover with current filters (fresh data)
        metadata_df = discover_files_and_sheets_metadata()
        
        # Apply filters
        selected_items = select_by_patterns(
            metadata_df,
            file_patterns=[file_pattern] if file_pattern else None,
            sheet_patterns=[sheet_pattern] if sheet_pattern else None,
            status_filter=status_filter if status_filter != "all" else None,
            priority_mode=priority_mode if priority_mode != "all" else None,
            max_items=max_items
        )
        
        print(f"✅ Widget selection returned {len(selected_items)} items")
        return selected_items
        
    except Exception as e:
        print(f"❌ Error getting widget selections: {e}")
        return []

# === ENHANCED DROPDOWN FUNCTIONS ===

def create_enhanced_dropdown_interface(volume_folder: str = DEFAULT_VOLUME_FOLDER) -> pd.DataFrame:
    """
    Enhanced dropdown interface with visual status indicators and smart pre-selection.
    
    Improves on the existing create_selection_widget() with:
    - Visual status indicators in dropdown options
    - Smart pre-selection of high-priority items
    - Better organization and filtering
    - Priority-based sorting
    
    Args:
        volume_folder (str): Path to Databricks volume containing Excel files
        
    Returns:
        pd.DataFrame: Enhanced metadata for selections
    """
    if dbutils is None:
        print("❌ Enhanced widgets only available in Databricks environment")
        return pd.DataFrame()
    
    print("🧠 Creating Enhanced Dropdown Selection Interface...")
    
    # Remove existing widgets
    try:
        dbutils.widgets.removeAll()
    except:
        pass
    
    # Discover files with metadata
    print("🔍 Discovering files and enhanced metadata...")
    metadata_df = discover_files_and_sheets_metadata(volume_folder)
    
    if metadata_df.empty:
        print("❌ No files discovered")
        return metadata_df
    
    # === ENHANCED FILE DROPDOWN WITH STATUS INDICATORS ===
    file_options_with_status = _create_enhanced_file_options(metadata_df)
    
    # Smart pre-selection: prioritize failed/pending files
    pre_selected_files = _get_smart_file_preselection(metadata_df, max_preselect=8)
    
    dbutils.widgets.multiselect(
        name="enhanced_files",
        defaultValue=",".join(pre_selected_files),
        choices=file_options_with_status,
        label="📁 Select Files (Smart Pre-selection with Status)"
    )
    
    # === ENHANCED SHEET DROPDOWN WITH PRIORITY INDICATORS ===
    sheet_options_with_priority = _create_enhanced_sheet_options(metadata_df)
    
    # Smart pre-selection: prioritize summary/main sheets
    pre_selected_sheets = _get_smart_sheet_preselection(metadata_df)
    
    dbutils.widgets.multiselect(
        name="enhanced_sheets",
        defaultValue=",".join(pre_selected_sheets),
        choices=sheet_options_with_priority,
        label="📄 Select Sheets (Priority Pre-selection)"
    )
    
    # === ENHANCED FILTER OPTIONS ===
    
    # Processing mode with descriptions
    processing_modes = [
        "🔥 failed_only → Only process failed items",
        "⚡ failed_and_pending → Failed + pending items", 
        "⏳ pending_only → Only pending items",
        "⭐ high_priority → High priority score (≥80)",
        "🎯 smart_selection → AI-recommended items",
        "📊 all → Everything selected"
    ]
    
    dbutils.widgets.dropdown(
        name="enhanced_processing_mode",
        defaultValue="⚡ failed_and_pending → Failed + pending items",
        choices=processing_modes,
        label="🎯 Processing Strategy"
    )
    
    # Smart max items with recommendations
    recommended_max = min(25, len(metadata_df[metadata_df['processing_status'].isin(['failed', 'pending'])]))
    if recommended_max == 0:
        recommended_max = min(10, len(metadata_df))
    
    dbutils.widgets.text(
        name="enhanced_max_items",
        defaultValue=str(recommended_max),
        label=f"🔢 Max Items (Recommended: {recommended_max})"
    )
    
    # Quick filter presets
    quick_filters = [
        "🎯 custom → Use selections above",
        "🔥 failed_urgent → All failed items (urgent)",
        "⚡ pending_batch → All pending items", 
        "📊 last_week → Files from last 7 days",
        "⭐ high_priority → Priority score ≥ 80",
        "🧪 test_sample → Small test batch (5 items)"
    ]
    
    dbutils.widgets.dropdown(
        name="quick_filter_preset",
        defaultValue="🎯 custom → Use selections above",
        choices=quick_filters,
        label="⚡ Quick Filter Presets"
    )
    
    print("\n✅ Enhanced Dropdown Interface Created!")
    print("🎯 Key Features:")
    print("   📁 Files: Pre-selected high-priority items with status indicators")
    print("   📄 Sheets: Priority sheets auto-selected (Summary, Total, Main, etc.)")
    print("   🎯 Processing: Smart recommendations based on your data")
    print("   ⚡ Quick Filters: One-click common scenarios")
    
    print("\n📋 Usage:")
    print("1. Review pre-selections above (smart defaults applied)")
    print("2. Adjust selections using dropdowns")
    print("3. Run: selected = get_enhanced_dropdown_selections()")
    print("4. Run: result = process_selected_items(client, selected)")
    
    # Display enhanced summary
    _display_enhanced_summary(metadata_df)
    
    return metadata_df

def get_enhanced_dropdown_selections() -> List[Tuple[str, str]]:
    """
    Get selections from enhanced dropdown interface with smart processing.
    
    Processes enhanced dropdown selections with:
    - Status indicator parsing
    - Smart filtering logic
    - Quick preset handling
    - Validation and error checking
    
    Returns:
        List[Tuple[str, str]]: Selected (file_name, sheet_name) combinations
    """
    if dbutils is None:
        print("❌ Enhanced widgets only available in Databricks environment")
        return []
    
    try:
        # Get widget values
        selected_files_enhanced = dbutils.widgets.get("enhanced_files")
        selected_sheets_enhanced = dbutils.widgets.get("enhanced_sheets")
        processing_mode_enhanced = dbutils.widgets.get("enhanced_processing_mode")
        max_items_str = dbutils.widgets.get("enhanced_max_items")
        quick_filter = dbutils.widgets.get("quick_filter_preset")
        
        print("🧠 Enhanced Dropdown Selections:")
        print(f"   Quick Filter: {quick_filter.split(' →')[0]}")
        print(f"   Processing Mode: {processing_mode_enhanced.split(' →')[0]}")
        
        # Handle quick filter presets
        if not quick_filter.startswith("🎯 custom"):
            print("⚡ Applying quick filter preset...")
            return _apply_quick_filter_preset(quick_filter)
        
        # Parse enhanced selections
        selected_files = _parse_enhanced_file_selections(selected_files_enhanced)
        selected_sheets = _parse_enhanced_sheet_selections(selected_sheets_enhanced)
        
        # Parse processing mode
        processing_mode = processing_mode_enhanced.split(' →')[0].replace('🔥 ', '').replace('⚡ ', '').replace('⏳ ', '').replace('⭐ ', '').replace('🎯 ', '').replace('📊 ', '').strip()
        
        # Parse max items
        try:
            max_items = int(max_items_str) if max_items_str.strip() else 25
        except:
            max_items = 25
        
        print(f"   Files Selected: {len(selected_files)}")
        print(f"   Sheets Selected: {len(selected_sheets)}")
        print(f"   Max Items: {max_items}")
        
        if not selected_files or not selected_sheets:
            print("⚠️ No valid selections made")
            return []
        
        # Get fresh metadata for filtering
        metadata_df = discover_files_and_sheets_metadata()
        
        # Apply enhanced filtering
        selected_combinations = _apply_enhanced_filtering(
            metadata_df, selected_files, selected_sheets, processing_mode, max_items
        )
        
        print(f"✅ {len(selected_combinations)} combinations ready for processing")
        
        if selected_combinations:
            _display_selection_preview(selected_combinations, metadata_df)
        
        return selected_combinations
        
    except Exception as e:
        print(f"❌ Error getting enhanced selections: {e}")
        return []

# === ENHANCED HELPER FUNCTIONS ===

def _create_enhanced_file_options(metadata_df: pd.DataFrame) -> List[str]:
    """Create file dropdown options with visual status indicators."""
    file_options = []
    
    for file_name in sorted(metadata_df['file_name'].unique()):
        file_data = metadata_df[metadata_df['file_name'] == file_name]
        
        # Determine primary status for file
        status_counts = file_data['processing_status'].value_counts()
        max_priority = file_data['priority_score'].max()
        
        # Status icon logic
        if 'failed' in status_counts:
            icon = "🔥"  # Fire for failed (urgent)
            priority = 1
        elif 'pending' in status_counts:
            icon = "⚡"  # Lightning for pending
            priority = 2
        elif status_counts.get('completed', 0) == len(file_data):
            icon = "✅"  # Check for fully completed
            priority = 4
        else:
            icon = "📋"  # Default
            priority = 3
        
        # Add priority indicator for high-priority files
        if max_priority >= 100:
            icon = f"{icon}⭐"  # Add star for high priority
            priority = max(1, priority - 1)  # Boost priority
        
        # Create display name
        display_name = f"{icon} {file_name}"
        file_options.append((priority, display_name, file_name))
    
    # Sort by priority (urgent first)
    file_options.sort(key=lambda x: x[0])
    
    return [x[1] for x in file_options]

def _create_enhanced_sheet_options(metadata_df: pd.DataFrame) -> List[str]:
    """Create sheet dropdown options with priority indicators."""
    sheet_options = []
    
    # Priority sheet patterns
    priority_patterns = [
        r'summary', r'total', r'main', r'data', r'overview', 
        r'dashboard', r'report', r'consolidated', r'master'
    ]
    
    for sheet_name in sorted(metadata_df['sheet_name'].unique()):
        # Check if it's a priority sheet
        is_priority = any(re.search(pattern, sheet_name.lower()) for pattern in priority_patterns)
        
        # Count failed/pending items for this sheet
        sheet_data = metadata_df[metadata_df['sheet_name'] == sheet_name]
        failed_count = len(sheet_data[sheet_data['processing_status'] == 'failed'])
        pending_count = len(sheet_data[sheet_data['processing_status'] == 'pending'])
        
        if is_priority:
            if failed_count > 0:
                icon = "🔥⭐"  # Priority + failed
                priority = 1
            elif pending_count > 0:
                icon = "⚡⭐"  # Priority + pending
                priority = 2
            else:
                icon = "⭐"   # Priority
                priority = 3
        else:
            if failed_count > 0:
                icon = "🔥"   # Failed
                priority = 4
            elif pending_count > 0:
                icon = "⚡"   # Pending
                priority = 5
            else:
                icon = "📄"   # Regular
                priority = 6
        
        display_name = f"{icon} {sheet_name}"
        sheet_options.append((priority, display_name, sheet_name))
    
    # Sort by priority
    sheet_options.sort(key=lambda x: x[0])
    
    return [x[1] for x in sheet_options]

def _get_smart_file_preselection(metadata_df: pd.DataFrame, max_preselect: int = 8) -> List[str]:
    """Smart pre-selection of high-priority files."""
    # Priority order: failed > pending > high_priority > recent
    priority_files = []
    
    # Get file options with status
    file_options = _create_enhanced_file_options(metadata_df)
    
    # Pre-select up to max_preselect high-priority files
    for display_name in file_options[:max_preselect]:
        if any(indicator in display_name for indicator in ["🔥", "⚡", "⭐"]):
            priority_files.append(display_name)
    
    return priority_files

def _get_smart_sheet_preselection(metadata_df: pd.DataFrame) -> List[str]:
    """Smart pre-selection of priority sheets."""
    priority_sheets = []
    
    # Get sheet options with priority indicators
    sheet_options = _create_enhanced_sheet_options(metadata_df)
    
    # Pre-select priority sheets (those with stars or high-priority indicators)
    for display_name in sheet_options:
        if "⭐" in display_name or display_name.startswith("🔥"):
            priority_sheets.append(display_name)
    
    # Limit to reasonable number
    return priority_sheets[:10]

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

def _display_enhanced_summary(metadata_df: pd.DataFrame) -> None:
    """Display enhanced summary with visual indicators."""
    print("\n🧠 Enhanced Selection Summary:")
    
    # Status breakdown with icons
    status_counts = metadata_df['processing_status'].value_counts()
    print("📊 Status Breakdown:")
    for status, count in status_counts.items():
        if status == 'failed':
            icon = "🔥"
        elif status == 'pending':
            icon = "⚡"
        elif status == 'completed':
            icon = "✅"
        else:
            icon = "📋"
        print(f"   {icon} {status.title()}: {count} items")
    
    # Priority analysis
    high_priority = len(metadata_df[metadata_df['priority_score'] >= 80])
    urgent_items = len(metadata_df[metadata_df['processing_status'].isin(['failed', 'pending'])])
    
    print(f"\n⭐ Priority Analysis:")
    print(f"   🔥 Urgent (failed/pending): {urgent_items} items")
    print(f"   ⭐ High Priority (score ≥80): {high_priority} items")
    print(f"   📊 Total Available: {len(metadata_df)} items")
    
    # Top priority files preview
    if high_priority > 0:
        top_files = metadata_df[metadata_df['priority_score'] >= 80].groupby('file_name')['priority_score'].max().sort_values(ascending=False).head(3)
        print(f"\n🎯 Top Priority Files:")
        for file_name, score in top_files.items():
            print(f"   🔥 {file_name} (score: {score})")

def _display_selection_preview(selected_combinations: List[Tuple[str, str]], 
                             metadata_df: pd.DataFrame) -> None:
    """Display preview of selected items."""
    if len(selected_combinations) <= 10:
        print("\n📋 Selected Items Preview:")
        for i, (file_name, sheet_name) in enumerate(selected_combinations, 1):
            # Get status for this combination
            item_data = metadata_df[
                (metadata_df['file_name'] == file_name) & 
                (metadata_df['sheet_name'] == sheet_name)
            ]
            
            if not item_data.empty:
                status = item_data.iloc[0]['processing_status']
                score = item_data.iloc[0]['priority_score']
                
                if status == 'failed':
                    icon = "🔥"
                elif status == 'pending':
                    icon = "⚡"
                else:
                    icon = "📋"
                
                print(f"   {i:2d}. {icon} {file_name} | {sheet_name} (score: {score})")
    else:
        print(f"\n📋 Selected {len(selected_combinations)} items (too many to preview)")
        
        # Show breakdown by status
        status_breakdown = {}
        for file_name, sheet_name in selected_combinations:
            item_data = metadata_df[
                (metadata_df['file_name'] == file_name) & 
                (metadata_df['sheet_name'] == sheet_name)
            ]
            if not item_data.empty:
                status = item_data.iloc[0]['processing_status']
                status_breakdown[status] = status_breakdown.get(status, 0) + 1
        
        print("   Status breakdown of selections:")
        for status, count in status_breakdown.items():
            if status == 'failed':
                icon = "🔥"
            elif status == 'pending':
                icon = "⚡"
            else:
                icon = "📋"
            print(f"     {icon} {status}: {count} items")

def display_selection_table(metadata_df: pd.DataFrame, max_display: int = 100) -> None:
    """
    Display rich metadata table for visual selection.
    
    Args:
        metadata_df (pd.DataFrame): Metadata to display
        max_display (int): Maximum rows to display
    """
    display_df = metadata_df.head(max_display).copy()
    
    # Format for better display
    if 'last_modified' in display_df.columns:
        display_df['last_modified'] = display_df['last_modified'].dt.strftime('%Y-%m-%d %H:%M')
    
    # Add selection helper column
    display_df['select_key'] = display_df['file_name'] + " | " + display_df['sheet_name']
    
    # Reorder columns for better UX
    column_order = [
        'select_key', 'processing_status', 'priority_score', 
        'file_size_mb', 'estimated_rows', 'last_modified', 
        'base_file_name'
    ]
    display_df = display_df[[col for col in column_order if col in display_df.columns]]
    
    print(f"📊 Showing top {len(display_df)} items (sorted by priority):")
    display(display_df)

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

def interactive_selection_workflow(volume_folder: str = DEFAULT_VOLUME_FOLDER) -> None:
    """
    Interactive workflow for Databricks notebooks.
    
    Example:
        >>> interactive_selection_workflow()
        # Creates widgets and displays selection table
        # User interacts with widgets
        # Then run: selected = get_widget_selections()
    """
    print("🎛️ Interactive Selection Workflow")
    print("1. Discovering files and sheets...")
    
    metadata_df = discover_files_and_sheets_metadata(volume_folder)
    
    if metadata_df.empty:
        print("❌ No files found")
        return
    
    print("2. Creating selection interface...")
    create_selection_widget(metadata_df)
    
    print("\n📋 Next steps:")
    print("   1. Use the widgets above to filter your selection")
    print("   2. Review the table below") 
    print("   3. Run: selected = get_widget_selections()")
    print("   4. Run: result = process_selected_items(client, selected)")

def enhanced_quick_workflow(volume_folder: str = DEFAULT_VOLUME_FOLDER) -> None:
    """
    Enhanced quick workflow with better UI.
    
    Example:
        >>> enhanced_quick_workflow()
        # Creates enhanced dropdowns with smart pre-selection
        # User adjusts selections
        # Then run: selected = get_enhanced_dropdown_selections()
        # Finally: result = process_selected_items(client, selected)
    """
    print("🧠 Enhanced SmartBDX Selection Workflow")
    metadata_df = create_enhanced_dropdown_interface(volume_folder)
    
    if not metadata_df.empty:
        print("\n📋 Enhanced Workflow Ready!")
        print("1. ⬆️ Review smart pre-selections above")
        print("2. 🎛️ Adjust using enhanced dropdowns") 
        print("3. ⚡ Try quick filter presets for common scenarios")
        print("4. 📝 Run: selected = get_enhanced_dropdown_selections()")
        print("5. 🚀 Run: result = process_selected_items(client, selected)")

# === MODULE INFORMATION ===

def get_selection_status() -> Dict[str, Any]:
    """Get selection module status and capabilities."""
    return {
        "module": "smartbdx_selection",
        "version": "1.1 (Enhanced)",
        "functions": [
            "discover_files_and_sheets_metadata", "create_selection_widget",
            "select_by_patterns", "select_by_criteria", "load_selected_files_only",
            "process_selected_items", "quick_select_and_process"
        ],
        "enhanced_functions": [
            "create_enhanced_dropdown_interface", "get_enhanced_dropdown_selections",
            "enhanced_quick_workflow"
        ],
        "features": [
            "Visual status indicators", "Smart pre-selection", "Quick filter presets",
            "Priority-based sorting", "Enhanced UI elements"
        ],
        "dependencies": ["smartbdx_config", "smartbdx_utilities", "smartbdx_infrastructure"],
        "status": "ready"
    }

def get_enhanced_selection_status() -> Dict[str, Any]:
    """Get enhanced selection module status and capabilities."""
    return {
        "module": "smartbdx_selection (enhanced)",
        "version": "1.1",
        "enhanced_functions": [
            "create_enhanced_dropdown_interface", "get_enhanced_dropdown_selections",
            "enhanced_quick_workflow"
        ],
        "features": [
            "Visual status indicators", "Smart pre-selection", "Quick filter presets",
            "Priority-based sorting", "Enhanced UI elements"
        ],
        "status": "ready"
    }

print("✅ SmartBDX Selection module loaded successfully")
print("💡 Try: interactive_selection_workflow() for guided selection")
print("🧠 Try: enhanced_quick_workflow() for the enhanced experience")
