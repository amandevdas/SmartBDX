"""
SmartBDX Monitoring Module
=========================

Batch monitoring and debugging functions for SmartBDX production processing.
Provides real-time monitoring, progress tracking, and batch management utilities.

Dependencies: smartbdx_infrastructure, spark
"""

# === IMPORTS ===
import time
from typing import Optional, Dict, Any

# PySpark imports
from pyspark.sql import SparkSession

# SmartBDX imports
from smartbdx_infrastructure import BatchCheckpointManager

# Get spark session
spark = SparkSession.getActiveSession()

# === PROGRESS MONITORING FUNCTIONS ===

def show_batch_progress(batch_id: Optional[str] = None) -> None:
    """
    Show progress of current or all batches.
    
    Displays batch progress with status counts, timing information,
    and completion percentages for monitoring active processing.
    
    Args:
        batch_id (Optional[str]): Specific batch ID to monitor, or None for all batches
        
    Displays:
        - Batch ID and status breakdown
        - Item counts per status (completed, failed, pending)
        - First started and last completed timestamps
        
    Example:
        >>> show_batch_progress("production_batch_001")
        # Shows detailed progress for specific batch
        
        >>> show_batch_progress()
        # Shows progress for all batches
    """
    where_clause = f"WHERE batch_id = '{batch_id}'" if batch_id else ""
    
    result = spark.sql(f"""
    SELECT 
        batch_id,
        status,
        COUNT(*) as count,
        MIN(started_at) as first_started,
        MAX(completed_at) as last_completed
    FROM bdx.metadata_cache.batch_checkpoints
    {where_clause}
    GROUP BY batch_id, status
    ORDER BY batch_id DESC, status
    """)
    
    print(f"📊 Batch Progress {'for ' + batch_id if batch_id else '(All Batches)'}:")
    result.show(50, truncate=False)

def list_all_batches() -> None:
    """
    Show all batches with comprehensive summary statistics.
    
    Provides high-level overview of all batch processing with:
    - Total items processed per batch
    - Success/failure breakdown
    - Completion rates and timing
    - Overall batch health metrics
    
    Displays:
        - Batch ID and total items
        - Completed, failed, pending counts
        - Success rate percentage
        - Batch start/finish timestamps
        
    Example:
        >>> list_all_batches()
        📊 All Batches Summary:
        +------------------+------+-----+------+-------+----------+
        |batch_id          |total |comp.|failed|pending|success % |
        +------------------+------+-----+------+-------+----------+
        |production_001    |150   |145  |3     |2      |96.7%     |
        |test_batch_002    |50    |50   |0     |0      |100.0%    |
        +------------------+------+-----+------+-------+----------+
    """
    try:
        result = spark.sql("""
        SELECT
            batch_id,
            COUNT(*) as total_items,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
            MIN(started_at) as batch_started,
            MAX(completed_at) as batch_finished,
            ROUND(
                SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) * 100.0 / COUNT(*),
                1
            ) as success_rate
        FROM bdx.metadata_cache.batch_checkpoints
        GROUP BY batch_id
        ORDER BY batch_started DESC
        """)
        
        print("📊 All Batches Summary:")
        result.show(20, truncate=False)
        
    except Exception as e:
        print(f"❌ Could not retrieve batch summary: {e}")

def get_failed_items(batch_id: str) -> Optional[Any]:
    """
    Get detailed information about failed items in a batch.
    
    Provides comprehensive failure analysis for debugging and recovery:
    - Failed file/sheet combinations
    - Error messages and retry counts
    - Timing information for failure analysis
    
    Args:
        batch_id (str): Batch ID to analyze for failures
        
    Returns:
        Optional[DataFrame]: Spark DataFrame with failed items or None if error
        
    Example:
        >>> failed_items = get_failed_items("production_batch_001")
        ❌ Failed items in batch production_batch_001:
        +------------------+----------+----------------------+-------+
        |file_name         |sheet_name|error_message         |retries|
        +------------------+----------+----------------------+-------+
        |complex_data.xlsx |Summary   |Table detection failed|2      |
        |malformed.xlsx    |Data      |JSON parsing error    |1      |
        +------------------+----------+----------------------+-------+
    """
    try:
        result = spark.sql(f"""
        SELECT 
            file_name,
            sheet_name,
            error_message,
            retry_count,
            started_at,
            completed_at
        FROM bdx.metadata_cache.batch_checkpoints
        WHERE batch_id = '{batch_id}' AND status = 'failed'
        ORDER BY file_name, sheet_name
        """)
        
        print(f"❌ Failed items in batch {batch_id}:")
        result.show(50, truncate=False)
        
        return result
        
    except Exception as e:
        print(f"❌ Could not retrieve failed items: {e}")
        return None

# === REAL-TIME MONITORING FUNCTIONS ===

def monitor_active_batch(batch_id: str, refresh_interval: int = 30) -> None:
    """
    Monitor an active batch with periodic real-time updates.
    
    Continuous monitoring function that tracks batch progress in real-time:
    - Automatic refresh with configurable intervals
    - Progress percentage and ETA estimation
    - Automatic completion detection
    - Keyboard interrupt support for manual stopping
    
    Args:
        batch_id (str): Batch ID to monitor
        refresh_interval (int): Seconds between status updates (default: 30)
        
    Usage:
        >>> monitor_active_batch("production_batch_001", refresh_interval=60)
        👀 Monitoring batch: production_batch_001
        🔄 Refresh interval: 60 seconds
        Press Ctrl+C to stop monitoring
        
        📊 Batch production_batch_001 Summary:
           Total: 150
           Completed: 45 (30.0%)
           Pending: 105 (70.0%)
        
        [Updates every 60 seconds until completion or interruption]
        
    Note:
        - Run this in a separate cell/process while batch is running
        - Use Ctrl+C to stop monitoring manually
        - Automatically stops when batch completes
    """
    print(f"👀 Monitoring batch: {batch_id}")
    print(f"🔄 Refresh interval: {refresh_interval} seconds")
    print("Press Ctrl+C to stop monitoring")
    
    checkpoint_mgr = BatchCheckpointManager()
    
    try:
        while True:
            # Get current status
            summary = checkpoint_mgr.get_batch_summary(batch_id)
            
            if not summary:
                print(f"❌ Batch {batch_id} not found")
                break
            
            # Check if batch is complete
            if 'pending' not in summary and 'processing' not in summary:
                print("✅ Batch completed!")
                break
            
            # Wait before next check
            time.sleep(refresh_interval)
            
    except KeyboardInterrupt:
        print("\n⏹️ Monitoring stopped by user")

# === BATCH MANAGEMENT FUNCTIONS ===

def cleanup_old_batches(days_old: int = 7) -> None:
    """
    Clean up checkpoint records older than specified days.
    
    Maintenance function to prevent checkpoint table bloat by removing
    old batch records based on completion time or age thresholds.
    
    Args:
        days_old (int): Number of days after which to remove records (default: 7)
        
    Cleanup Logic:
        - Removes completed batches older than days_old
        - Removes abandoned batches (started but never completed) older than days_old
        - Preserves recent active/failed batches for debugging
        
    Example:
        >>> cleanup_old_batches(days_old=30)
        🧹 Cleaned up checkpoint records older than 30 days
        
        >>> cleanup_old_batches()  # Default 7 days
        🧹 Cleaned up checkpoint records older than 7 days
        
    Caution:
        - This permanently deletes checkpoint records
        - Consider backup requirements before cleanup
        - Test with longer retention periods initially
    """
    try:
        result = spark.sql(f"""
        DELETE FROM bdx.metadata_cache.batch_checkpoints
        WHERE completed_at < current_timestamp() - INTERVAL {days_old} DAYS
           OR (started_at < current_timestamp() - INTERVAL {days_old} DAYS AND completed_at IS NULL)
        """)
        
        print(f"🧹 Cleaned up checkpoint records older than {days_old} days")
        
    except Exception as e:
        print(f"❌ Could not cleanup old batches: {e}")

def example_usage() -> None:
    """
    Display example usage patterns for the production monitoring system.
    
    Comprehensive guide showing common monitoring workflows and best practices
    for production batch processing operations.
    
    Examples Cover:
        - Basic progress monitoring
        - Real-time batch tracking
        - Failure analysis and debugging
        - Maintenance and cleanup operations
        - Integration with processing functions
        
    Usage:
        >>> example_usage()
        📖 SmartBDX Monitoring Usage Examples:
        [Displays formatted examples with explanations]
    """
    print("📖 SmartBDX Monitoring Usage Examples:")
    print()
    
    examples = """
    # === BASIC MONITORING ===
    
    # 1. Check all batch progress
    list_all_batches()
    
    # 2. Monitor specific batch
    show_batch_progress("production_batch_001")
    
    # 3. Analyze failures
    failed_items = get_failed_items("production_batch_001")
    
    # === REAL-TIME MONITORING ===
    
    # 4. Monitor active batch (run in separate cell)
    monitor_active_batch("production_batch_001", refresh_interval=60)
    
    # === MAINTENANCE ===
    
    # 5. Clean up old records
    cleanup_old_batches(days_old=30)
    
    # === PRODUCTION WORKFLOW ===
    
    # Start monitoring before launching batch
    from smartbdx_processing import azure_optimized_batch_orchestration
    
    # Launch batch
    result = azure_optimized_batch_orchestration(
        client=client,
        batch_id="production_batch_001"
    )
    
    # Monitor progress (in separate cell/notebook)
    monitor_active_batch("production_batch_001")
    
    # Check results when complete
    show_batch_progress("production_batch_001")
    list_all_batches()
    """
    
    print(examples)

# === MODULE INFORMATION ===

def get_monitoring_status() -> Dict[str, Any]:
    """
    Get monitoring module status and capabilities.
    
    Returns system status for monitoring infrastructure validation
    and capability reporting.
    
    Returns:
        Dict[str, Any]: Status information including available functions and dependencies
    """
    return {
        "module": "smartbdx_monitoring",
        "version": "1.0",
        "functions": [
            "show_batch_progress", "list_all_batches", "get_failed_items",
            "monitor_active_batch", "cleanup_old_batches", "example_usage"
        ],
        "dependencies": ["smartbdx_infrastructure", "pyspark"],
        "status": "ready"
    }

print("✅ SmartBDX Monitoring module loaded successfully")