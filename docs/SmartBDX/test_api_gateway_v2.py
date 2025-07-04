# Databricks notebook source
# Test Script for SmartBDX_API_Gateway_v2.ipynb

import json
from datetime import datetime
import sys
import subprocess
import os
import traceback

# --- Environment Detection and Setup ---
IS_DATABRICKS = "DATABRICKS_RUNTIME_VERSION" in os.environ

if IS_DATABRICKS:
    from pyspark.sql import SparkSession  # type: ignore
    from pyspark.dbutils import DBUtils  # type: ignore
    spark = SparkSession.getActiveSession()
    dbutils = DBUtils(spark)
else:
    # Ensure pyspark is installed for local runs where it might be missing
    try:
        from pyspark.sql import SparkSession
    except ImportError:
        print("pyspark not found. Installing...")
        subprocess.check_call(
            [sys.executable, "-m", "pip", "install", "pyspark"]
        )
    # Import our local mocks
    from smartbdx_local_mocks import MockDBUtils, get_mock_spark_session
    dbutils = MockDBUtils()
    spark = get_mock_spark_session()


# === Helper Function to Run and Print Results ===

def run_api_operation(operation: str, parameters: dict = {}):
    """
    Runs a specified operation on the SmartBDX_API_Gateway_v2 notebook.
    
    Args:
        operation (str): The API operation to call.
        parameters (dict): A dictionary of parameters for the operation.
    """
    print(f"\n{'='*20} TEST CASE: {operation} {'='*20}")
    print(f"🚀 Executing operation: {operation}")
    print(f"📋 Parameters: {json.dumps(parameters, indent=2)}")
    
    try:
        result_json = dbutils.notebook.run(
            "SmartBDX_API_Gateway_v2",
            timeout_seconds=1200,
            arguments={
                "operation": operation,
                "parameters": json.dumps(parameters)
            }
        )
        
        result = json.loads(result_json)
        
        print("\n✅ Operation successful!")
        print("--- RESULT ---")
        print(json.dumps(result, indent=2))
        print("--------------")
        
        return result
        
    except Exception as e:
        print(f"\n❌ Operation failed for '{operation}': {e}")
        traceback.print_exc()
        return None


# === TEST 1: discover_files_with_sheets ===
run_api_operation("discover_files_with_sheets")

# === TEST 2: check_processing_status ===
run_api_operation("check_processing_status")

# === TEST 3: smart_file_selection ===
run_api_operation(
    "smart_file_selection",
    {"criteria": "failed_first", "max_items": 10}
)

# === TEST 4: process_files (New Batch) ===
print("\n--- Preparing for process_files test ---")
selection_result = run_api_operation(
    "smart_file_selection",
    {"criteria": "newest_first", "max_items": 2}
)

can_process = (
    selection_result and 
    selection_result.get("success") and
    selection_result.get("data", {}).get("batch_ready", {}).get("files")
)

if IS_DATABRICKS and can_process:
    files_to_process = selection_result["data"]["batch_ready"]["files"]
    run_api_operation(
        "process_files",
        {
            "files": files_to_process,
            "enable_mapping": False,
            "batch_id": f"test_batch_{int(datetime.now().timestamp())}"
        }
    )
else:
    print(
        "⚠️ Skipping process_files test: requires a successful file "
        "selection on Databricks."
    )

# === TEST 5: get_batch_status ===
if IS_DATABRICKS:
    try:
        query = (
            "SELECT batch_id FROM bdx.metadata_cache.batch_checkpoints "
            "ORDER BY started_at DESC LIMIT 1"
        )
        batches_df = spark.sql(query)
        if not batches_df.isEmpty():
            latest_batch_id = batches_df.collect()[0].batch_id
            run_api_operation(
                "get_batch_status", {"batch_id": latest_batch_id}
            )
        else:
            print(
                "⚠️ Skipping get_batch_status test: no recent batch_id found."
            )
    except Exception as e:
        print(f"⚠️ Could not retrieve a recent batch_id for testing: {e}")
else:
    print("⚠️ Skipping get_batch_status test in local environment.")


# === TEST 6: get_cache_analytics ===
run_api_operation("get_cache_analytics")


# === TEST 7: get_processing_insights ===
if IS_DATABRICKS:
    try:
        query = (
            "SELECT batch_id FROM bdx.metadata_cache.batch_checkpoints "
            "ORDER BY started_at DESC LIMIT 1"
        )
        batches_df = spark.sql(query)
        if not batches_df.isEmpty():
            latest_batch_id = batches_df.collect()[0].batch_id
            run_api_operation(
                "get_processing_insights", {"batch_id": latest_batch_id}
            )
        else:
            print(
                "⚠️ Skipping get_processing_insights test: no recent "
                "batch_id found."
            )
    except Exception as e:
        print(f"⚠️ Could not retrieve a recent batch_id for testing: {e}")
else:
    print("⚠️ Skipping get_processing_insights test in local environment.")


# === TEST 8: quick_file_analysis ===
if IS_DATABRICKS:
    try:
        query = "SELECT file_path FROM bdx.metadata_cache.file_master LIMIT 1"
        files_df = spark.sql(query)
        if not files_df.isEmpty():
            file_to_analyze = files_df.collect()[0].file_path
            run_api_operation(
                "quick_file_analysis", {"file_path": file_to_analyze}
            )
        else:
            print(
                "⚠️ Skipping quick_file_analysis test: no file was found in "
                "file_master."
            )
    except Exception as e:
        print(f"⚠️ Could not retrieve a file for analysis: {e}")
else:
    print("⚠️ Skipping quick_file_analysis test in local environment.")


# === TEST 9: analyze_batch_errors ===
if IS_DATABRICKS:
    try:
        query = "SELECT batch_id FROM bdx.log.errors LIMIT 1"
        failed_batches_df = spark.sql(query)
        if not failed_batches_df.isEmpty():
            batch_to_analyze = failed_batches_df.collect()[0].batch_id
            run_api_operation(
                "analyze_batch_errors", {"batch_id": batch_to_analyze}
            )
        else:
            print(
                "⚠️ Skipping analyze_batch_errors test: no failed batches "
                "were found in logs."
            )
    except Exception as e:
        print(f"⚠️ Could not retrieve a failed batch for analysis: {e}")
else:
    print("⚠️ Skipping analyze_batch_errors test in local environment.")


# === TEST 10: suggest_batch_strategy ===
run_api_operation("suggest_batch_strategy")


# === TEST 11: get_usage_analytics ===
run_api_operation("get_usage_analytics", {"days_back": 7})


# === TEST 12: Unknown Operation ===
run_api_operation("this_operation_does_not_exist")
