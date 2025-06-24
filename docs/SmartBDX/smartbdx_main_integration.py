# === INTEGRATION CODE FOR smartbdx_main.py ===
# Add these functions to the existing smartbdx_main.py module

def smartbdx_interactive_selection() -> Dict[str, Any]:
    """
    Interactive selection mode for Databricks notebooks.
    
    Provides widget-based selection interface with rich metadata display
    for manual file/sheet selection and processing.
    
    Returns:
        Dict[str, Any]: System initialization status
        
    Example:
        >>> system = smartbdx_interactive_selection()
        🎛️ Interactive Selection Workflow
        # Creates widgets and displays selection table
        # User then runs: selected = get_widget_selections()
        # Then: result = process_selected_items(client, selected)
    """
    print("🎛️ SmartBDX Interactive Selection Mode")
    
    # Initialize system first
    system = initialize_smartbdx_system(verbose=True)
    
    if system["status"] != "ready":
        print("❌ System initialization failed - cannot start interactive mode")
        return system
    
    try:
        from smartbdx_selection import interactive_selection_workflow
        interactive_selection_workflow()
        
        print("\n📋 Interactive Selection Ready!")
        print("Next steps:")
        print("1. Use widgets above to filter your selection")
        print("2. Run: selected = get_widget_selections()")
        print("3. Run: result = process_selected_items(client, selected)")
        
        system["mode"] = "interactive_selection"
        return system
        
    except ImportError as e:
        print(f"❌ Selection module not available: {e}")
        system["status"] = "error"
        system["errors"].append("smartbdx_selection module not found")
        return system

def smartbdx_quick_retry(max_items: int = 20) -> Dict[str, Any]:
    """
    Quick retry of failed processing items.
    
    One-command retry of failed items with smart prioritization:
    - Prioritizes failed items first
    - Excludes completed items
    - Limits to reasonable batch size
    
    Args:
        max_items (int): Maximum items to retry (default: 20)
        
    Returns:
        Dict[str, Any]: Processing results
        
    Example:
        >>> result = smartbdx_quick_retry(max_items=10)
        🔄 SmartBDX Quick Retry - Processing failed items
        🧠 Smart selection with priority: failed_first
        🚀 Processing 7 selected items...
        🎉 Selected batch completed!
    """
    print(f"🔄 SmartBDX Quick Retry - Processing failed items (max: {max_items})")
    
    # Initialize system
    system = initialize_smartbdx_system(verbose=False)
    
    if system["status"] != "ready":
        print("❌ System initialization failed - cannot retry")
        return system
    
    try:
        from smartbdx_selection import quick_select_and_process
        
        result = quick_select_and_process(
            priority="failed_first",
            max_items=max_items,
            enable_mapping=False  # Disable mapping for speed
        )
        
        # Combine system and processing results
        complete_result = {
            **system,
            **result,
            "execution_type": "quick_retry",
            "retry_limit": max_items
        }
        
        return complete_result
        
    except ImportError as e:
        print(f"❌ Selection module not available: {e}")
        return {"status": "error", "message": "Selection module not found"}

def smartbdx_selective_processing(
    file_patterns: Optional[List[str]] = None,
    sheet_patterns: Optional[List[str]] = None,
    max_items: int = 50,
    priority: str = "failed_first"
) -> Dict[str, Any]:
    """
    Pattern-based selective processing with full system integration.
    
    Provides programmatic file/sheet selection with pattern matching
    and full integration with SmartBDX infrastructure.
    
    Args:
        file_patterns (List[str], optional): File name patterns (supports wildcards)
        sheet_patterns (List[str], optional): Sheet name patterns  
        max_items (int): Maximum items to process (default: 50)
        priority (str): Priority mode (failed_first, newest_first, largest_first)
        
    Returns:
        Dict[str, Any]: Processing results with selection metadata
        
    Example:
        >>> result = smartbdx_selective_processing(
        ...     file_patterns=["Premium_*.xlsx", "Claims_*.xlsx"],
        ...     sheet_patterns=["Summary", "Q1*"],
        ...     max_items=25
        ... )
    """
    print("🎯 SmartBDX Selective Processing")
    print(f"   File patterns: {file_patterns}")
    print(f"   Sheet patterns: {sheet_patterns}")
    print(f"   Max items: {max_items}")
    print(f"   Priority: {priority}")
    
    # Initialize system
    system = initialize_smartbdx_system(verbose=False)
    
    if system["status"] != "ready":
        print("❌ System initialization failed")
        return system
    
    try:
        from smartbdx_selection import (
            discover_files_and_sheets_metadata,
            select_by_patterns, 
            process_selected_items
        )
        from smartbdx_config import client
        
        # Discovery
        print("🔍 Discovering files and sheets...")
        metadata_df = discover_files_and_sheets_metadata()
        
        if metadata_df.empty:
            return {"status": "no_files", "message": "No files discovered"}
        
        # Pattern-based selection
        print("🔍 Applying selection patterns...")
        selected_items = select_by_patterns(
            metadata_df,
            file_patterns=file_patterns,
            sheet_patterns=sheet_patterns,
            priority_mode=priority,
            max_items=max_items,
            exclude_patterns=["*test*", "*temp*", "*backup*"]  # Smart defaults
        )
        
        if not selected_items:
            return {"status": "no_selection", "message": "No items matched patterns"}
        
        # Process selection
        result = process_selected_items(client, selected_items)
        
        # Enhanced result with selection metadata
        enhanced_result = {
            **result,
            "selection_metadata": {
                "file_patterns": file_patterns,
                "sheet_patterns": sheet_patterns,
                "priority_mode": priority,
                "total_discovered": len(metadata_df),
                "total_selected": len(selected_items)
            },
            "execution_type": "selective_processing"
        }
        
        return enhanced_result
        
    except ImportError as e:
        print(f"❌ Selection module not available: {e}")
        return {"status": "error", "message": "Selection module not found"}

def smartbdx_discovery_mode() -> pd.DataFrame:
    """
    Discovery-only mode for file/sheet exploration.
    
    Fast discovery of all files and sheets with rich metadata
    for manual review and selection planning.
    
    Returns:
        pd.DataFrame: Rich metadata table
        
    Example:
        >>> metadata_df = smartbdx_discovery_mode()
        📊 Discovered 25 files with 87 sheets
        >>> display(metadata_df)  # In Databricks
        >>> # Manual review, then select items for processing
    """
    print("🔍 SmartBDX Discovery Mode - File and Sheet Exploration")
    
    try:
        from smartbdx_selection import discover_files_and_sheets_metadata, display_selection_table
        
        metadata_df = discover_files_and_sheets_metadata()
        
        if metadata_df.empty:
            print("❌ No files discovered")
            return metadata_df
        
        print("📊 Discovery complete! Displaying metadata table...")
        display_selection_table(metadata_df, max_display=100)
        
        print("\n💡 Next steps:")
        print("1. Review the table above")
        print("2. Copy file/sheet names for manual selection")
        print("3. Use smartbdx_selective_processing() or process_selected_items()")
        
        return metadata_df
        
    except ImportError as e:
        print(f"❌ Selection module not available: {e}")
        return pd.DataFrame()

# === UPDATE TO EXISTING FUNCTIONS ===

def smartbdx_status_report() -> None:
    """
    Enhanced status report including selection capabilities.
    """
    print("=" * 60)
    print("📊 SMARTBDX SYSTEM STATUS REPORT")
    print("=" * 60)
    print(f"📅 Report Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # System overview
    health = validate_system_health()
    
    print("\n🎯 SYSTEM OVERVIEW:")
    status_icon = "✅" if health["system_healthy"] else "❌"
    status_text = "Fully Operational" if health["system_healthy"] else "Issues Detected"
    print(f"   {status_icon} Status: {status_text}")
    
    if health["system_healthy"]:
        print(f"   ✅ Modules: {health.get('modules_count', 0)}/9 loaded successfully")  # Updated count
        print(f"   ✅ Infrastructure: Ready")
        print(f"   ✅ Azure OpenAI: Connected ({health.get('client_type', 'Unknown')})")
        print(f"   ✅ Processing: Available")
        print(f"   ✅ Selection System: Available")  # New capability
    else:
        print("   ❌ System issues detected - check individual components")
    
    # Module status (updated)
    print("\n📦 MODULE STATUS:")
    modules = [
        "smartbdx_utilities.py",
        "smartbdx_config.py", 
        "smartbdx_infrastructure.py",
        "smartbdx_core_ai.py",
        "smartbdx_mapping (core + data)",
        "smartbdx_monitoring.py",
        "smartbdx_processing.py",
        "smartbdx_selection.py",  # New module
        "smartbdx_main.py"
    ]
    
    for module in modules:
        status = "✅" if MODULES_LOADED else "❌"
        print(f"   {status} {module}")
    
    # Selection system status
    print("\n🎯 SELECTION SYSTEM:")
    try:
        from smartbdx_selection import get_selection_status
        selection_status = get_selection_status()
        print(f"   ✅ Module: {selection_status['module']} v{selection_status['version']}")
        print(f"   ✅ Functions: {len(selection_status['functions'])} available")
    except ImportError:
        print("   ❌ Selection module not available")
    
    # Recent batch history (existing code)
    print("\n📊 RECENT BATCH ACTIVITY:")
    try:
        list_all_batches()
    except Exception as e:
        print(f"   ❌ Could not retrieve batch history: {e}")
    
    # Enhanced capabilities
    print("\n🚀 AVAILABLE FUNCTIONS:")
    print("   📋 azure_optimized_batch_orchestration() - Main production processing")
    print("   🚀 quick_start_production_batch() - One-command execution")
    print("   🔄 resume_failed_batch() - Resume failed batches")
    print("   🧪 test_production_processing() - Safe testing")
    print("   🎛️ smartbdx_interactive_selection() - Interactive file/sheet selection")
    print("   🔄 smartbdx_quick_retry() - Quick retry of failed items") 
    print("   🎯 smartbdx_selective_processing() - Pattern-based processing")
    print("   🔍 smartbdx_discovery_mode() - File/sheet exploration")
    print("   📊 smartbdx_status_report() - System status")

def example_usage_patterns() -> None:
    """
    Enhanced usage examples including selection capabilities.
    """
    print("📖 SmartBDX Usage Examples")
    print("=" * 50)
    
    examples = """
    🎯 BASIC USAGE:
    
    # 1. Complete system quick start
    result = smartbdx_quick_start()
    
    # 2. Check system status
    smartbdx_status_report()
    
    # 3. Initialize system manually
    system = initialize_smartbdx_system()
    
    🚀 PRODUCTION PROCESSING:
    
    # 4. Quick production batch (all files)
    result = quick_start_production_batch(client)
    
    # 5. Custom production batch
    result = azure_optimized_batch_orchestration(
        client=client,
        batch_id="production_Q1_2024",
        volume_folder="dbfs:/Volumes/prod/bordereaux/Q1/",
        enable_mapping=True
    )
    
    # 6. Resume failed batch
    result = resume_failed_batch(client, "production_Q1_2024")
    
    🎯 SELECTIVE PROCESSING (NEW):
    
    # 7. Interactive selection (Databricks notebooks)
    system = smartbdx_interactive_selection()
    # Use widgets, then:
    selected = get_widget_selections()
    result = process_selected_items(client, selected)
    
    # 8. Quick retry of failed items
    result = smartbdx_quick_retry(max_items=15)
    
    # 9. Pattern-based selective processing
    result = smartbdx_selective_processing(
        file_patterns=["Premium_*.xlsx", "Claims_*.xlsx"],
        sheet_patterns=["Summary", "Q1*"],
        max_items=25
    )
    
    # 10. Discovery mode for exploration
    metadata_df = smartbdx_discovery_mode()
    
    📊 MONITORING & ANALYSIS:
    
    # 11. Monitor all batches
    list_all_batches()
    
    # 12. Show specific batch progress
    show_batch_progress("production_Q1_2024")
    
    # 13. Test before production
    test_result = test_production_processing(client, max_sheets=3)
    
    🔧 ADVANCED SELECTION:
    
    # 14. Manual file/sheet selection
    from smartbdx_selection import *
    
    metadata_df = discover_files_and_sheets_metadata()
    selected = select_by_patterns(
        metadata_df,
        file_patterns=["*Premium*"],
        sheet_patterns=["Summary"],
        status_filter="failed",
        max_items=10
    )
    result = process_selected_items(client, selected)
    
    # 15. Smart criteria-based selection
    selected = select_by_criteria(
        metadata_df,
        priority="failed_first",
        exclude_completed=True,
        min_priority_score=75.0
    )
    """
    
    print(examples)

# === ENHANCED QUICK START ===

def smartbdx_quick_start(volume_folder: Optional[str] = None, mode: str = "auto") -> Dict[str, Any]:
    """
    Enhanced quick start with selection mode option.
    
    Args:
        volume_folder (Optional[str]): Custom volume folder path
        mode (str): Processing mode ("auto", "selective", "interactive")
                   - "auto": Process all files (original behavior)
                   - "selective": Smart selection of failed/high-priority items
                   - "interactive": Interactive selection mode
    """
    print(f"🚀 SmartBDX Quick Start - Mode: {mode}")
    
    # Initialize system
    system = initialize_smartbdx_system(verbose=True)
    
    if system["status"] != "ready":
        print("❌ System initialization failed - cannot proceed")
        return system
    
    if mode == "interactive":
        return smartbdx_interactive_selection()
    elif mode == "selective":
        return smartbdx_quick_retry(max_items=25)
    else:  # mode == "auto" (original behavior)
        try:
            result = quick_start_production_batch(client, volume_folder)
            
            # Combine system and processing results
            complete_result = {
                **system,
                **result,
                "execution_type": "quick_start_auto",
                "total_execution_time": datetime.now() - system["initialization_time"]
            }
            
            return complete_result
            
        except Exception as e:
            print(f"❌ Batch processing failed: {e}")
            return {
                **system,
                "status": "processing_error",
                "processing_error": str(e)
            }
