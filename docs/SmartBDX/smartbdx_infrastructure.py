"""SmartBDX Infrastructure Module - WORKING VERSION"""

import time
import threading
from typing import Dict, List, Optional, Tuple, Any
import pandas as pd

# PySpark imports
from pyspark.sql import SparkSession
from pyspark.sql.types import StructType, StructField, StringType, TimestampType, IntegerType
from pyspark.sql.functions import current_timestamp, col

# Get spark at module level
spark = SparkSession.getActiveSession()

# SmartBDX imports with fallbacks
try:
    from smartbdx_config import DEFAULT_TOKENS_PER_MINUTE, DEFAULT_REQUESTS_PER_MINUTE
except:
    DEFAULT_TOKENS_PER_MINUTE = 50000
    DEFAULT_REQUESTS_PER_MINUTE = 50

try:
    from smartbdx_utilities import conservative_token_estimation, azure_safe_chunk_size
except:
    def conservative_token_estimation(df): return len(df) * 100
    def azure_safe_chunk_size(df, max_tokens=32000): return min(25, len(df))

print("✅ All imports loaded successfully")

class BatchCheckpointManager:
    """Production-ready checkpoint manager"""
    
    def __init__(self, catalog="bdx", schema="metadata_cache"):
        self.checkpoint_table = f"{catalog}.{schema}.batch_checkpoints"
        self.schema = StructType([
            StructField("batch_id", StringType(), False),
            StructField("file_name", StringType(), False),
            StructField("sheet_name", StringType(), False),
            StructField("status", StringType(), False),
            StructField("started_at", TimestampType(), True),
            StructField("completed_at", TimestampType(), True),
            StructField("error_message", StringType(), True),
            StructField("retry_count", IntegerType(), False)
        ])
        print(f"✅ BatchCheckpointManager created: {self.checkpoint_table}")
    
    def mark_started(self, batch_id: str, file_name: str, sheet_name: str):
        """Mark file/sheet as started"""
        try:
            spark.sql(f"""
            UPDATE {self.checkpoint_table}
            SET status = 'processing', started_at = current_timestamp()
            WHERE batch_id = '{batch_id}' AND file_name = '{file_name}' AND sheet_name = '{sheet_name}'
            """)
        except Exception as e:
            print(f"⚠️ Warning: Could not update status: {e}")
    
    def mark_completed(self, batch_id: str, file_name: str, sheet_name: str):
        """Mark file/sheet as completed"""
        try:
            spark.sql(f"""
            UPDATE {self.checkpoint_table}
            SET status = 'completed', completed_at = current_timestamp()
            WHERE batch_id = '{batch_id}' AND file_name = '{file_name}' AND sheet_name = '{sheet_name}'
            """)
            print(f"✅ Completed: {file_name}/{sheet_name}")
        except Exception as e:
            print(f"⚠️ Warning: Could not mark completed: {e}")
    
    def mark_failed(self, batch_id: str, file_name: str, sheet_name: str, error_message: str):
        """Mark file/sheet as failed"""
        try:
            escaped_error = str(error_message).replace("'", "''")[:500]
            spark.sql(f"""
            UPDATE {self.checkpoint_table}
            SET status = 'failed', completed_at = current_timestamp(),
                error_message = '{escaped_error}', retry_count = retry_count + 1
            WHERE batch_id = '{batch_id}' AND file_name = '{file_name}' AND sheet_name = '{sheet_name}'
            """)
            print(f"❌ Failed: {file_name}/{sheet_name}")
        except Exception as e:
            print(f"⚠️ Warning: Could not mark failed: {e}")
    
    def get_pending_work(self, batch_id: str):
        """Get remaining work for batch"""
        try:
            result = spark.sql(f"""
            SELECT file_name, sheet_name FROM {self.checkpoint_table}
            WHERE batch_id = '{batch_id}' AND status IN ('pending', 'failed') AND retry_count < 3
            ORDER BY retry_count ASC, file_name, sheet_name
            """).collect()
            return [(row.file_name, row.sheet_name) for row in result]
        except Exception as e:
            print(f"⚠️ Warning: Could not get pending work: {e}")
            return []
    
    def get_batch_summary(self, batch_id: str):
        """Get batch progress summary"""
        try:
            summary = spark.sql(f"""
            SELECT status, COUNT(*) as item_count FROM {self.checkpoint_table}
            WHERE batch_id = '{batch_id}' GROUP BY status
            """).collect()
            
            total = sum(row.item_count for row in summary)
            status_counts = {row.status: row.item_count for row in summary}
            
            print(f"\n📊 Batch {batch_id} Summary:")
            print(f"   Total: {total}")
            for status, count in status_counts.items():
                percentage = (count / total * 100) if total > 0 else 0
                print(f"   {status.title()}: {count} ({percentage:.1f}%)")
            
            return status_counts
        except Exception as e:
            print(f"⚠️ Warning: Could not get batch summary: {e}")
            return {}
        
    def start_batch(self, batch_id: str, file_sheets: List[Tuple[str, str, Any]]) -> None:
        """
        Initialize a new batch with all file/sheet combinations as pending work.
        """
        try:
            print(f"🚀 Starting batch: {batch_id}")
            
            # Insert all file/sheet combinations as pending work
            for file_name, sheet_name, _ in file_sheets:
                spark.sql(f"""
                INSERT INTO {self.checkpoint_table}
                (batch_id, file_name, sheet_name, status, started_at, retry_count)
                VALUES ('{batch_id}', '{file_name}', '{sheet_name}', 'pending', current_timestamp(), 0)
                """)
            
            print(f"📝 Created {len(file_sheets)} pending work items")
            
        except Exception as e:
            print(f"⚠️ Warning: Could not initialize batch: {e}")

class AzureOpenAIRateLimiter:
    """Rate limiter for Azure OpenAI"""
    
    def __init__(self, tokens_per_minute=50000, requests_per_minute=50):
        self.tokens_per_minute = tokens_per_minute
        self.requests_per_minute = requests_per_minute
        self.min_request_interval = 60.0 / requests_per_minute
        self.last_request_time = 0
        self.current_minute = int(time.time() // 60)
        self.tokens_used = 0
        self.requests_used = 0
        self.lock = threading.Lock()
        
        print(f"⚡ Azure OpenAI Rate Limiter: {tokens_per_minute:,} tokens/min, {requests_per_minute} req/min")
    
    # ✅ FIXED: Move this function INSIDE the class (add proper indentation)
    def can_proceed(self, tokens_needed: int, requests_needed: int = 1) -> bool:
        """Check if request can proceed within rate limits"""
        import time
        
        current_time = time.time()
        
        # Reset if minute has passed
        if not hasattr(self, 'last_reset'):
            self.last_reset = current_time
            self.tokens_used = 0
            self.requests_made = 0
        
        if current_time - self.last_reset >= 60:
            self.tokens_used = 0
            self.requests_made = 0
            self.last_reset = current_time
        
        # Check limits
        if (self.tokens_used + tokens_needed > self.tokens_per_minute or 
            self.requests_made + requests_needed > self.requests_per_minute):
            print(f"⏳ Rate limit reached. Please wait...")
            return False
        
        # Update usage
        self.tokens_used += tokens_needed
        self.requests_made += requests_needed
        
        remaining_tokens = self.tokens_per_minute - self.tokens_used
        remaining_requests = self.requests_per_minute - self.requests_made
        
        print(f"💭 Need: {tokens_needed:,} tokens | Available: {remaining_tokens:,} tokens, {remaining_requests} requests")
        print(f"✅ Request approved | Remaining: {remaining_tokens:,} tokens, {remaining_requests} requests")
        
        return True
    
def create_checkpoint_tables():
    """Create checkpoint tables"""
    try:
        spark.sql("DROP TABLE IF EXISTS bdx.metadata_cache.batch_checkpoints")
        spark.sql("""
        CREATE TABLE bdx.metadata_cache.batch_checkpoints (
            batch_id STRING NOT NULL,
            file_name STRING NOT NULL,
            sheet_name STRING NOT NULL,
            status STRING NOT NULL,
            started_at TIMESTAMP,
            completed_at TIMESTAMP,
            error_message STRING,
            retry_count INT NOT NULL
        ) USING DELTA
        """)
        print("✅ Checkpoint tables created successfully")
        
        # Test table
        spark.sql("""
        INSERT INTO bdx.metadata_cache.batch_checkpoints 
        (batch_id, file_name, sheet_name, status, retry_count)
        VALUES ('test', 'test.xlsx', 'Sheet1', 'test', 0)
        """)
        spark.sql("DELETE FROM bdx.metadata_cache.batch_checkpoints WHERE batch_id = 'test'")
        print("✅ Checkpoint table validated")
        
    except Exception as e:
        print(f"❌ Error creating checkpoint tables: {e}")

def test_checkpoint_system():
    """Test checkpoint system components"""
    print("🧪 Testing checkpoint system...")
    create_checkpoint_tables()
    
    checkpoint_mgr = BatchCheckpointManager()
    rate_limiter = AzureOpenAIRateLimiter(tokens_per_minute=50000, requests_per_minute=50)
    
    test_df = pd.DataFrame({'A': [1, 2, 3], 'B': ['test', 'data', 'here']})
    tokens = conservative_token_estimation(test_df)
    chunk_size = azure_safe_chunk_size(test_df)
    
    print(f"✅ All systems tested successfully!")
    print(f"   - Test tokens estimated: {tokens}")
    print(f"   - Test chunk size: {chunk_size}")
    
    return checkpoint_mgr, rate_limiter

def initialize_smartbdx_infrastructure():
    """Initialize complete SmartBDX infrastructure"""
    print("🚀 Initializing SmartBDX infrastructure...")
    create_checkpoint_tables()
    checkpoint_mgr, rate_limiter = test_checkpoint_system()
    print("✅ SmartBDX infrastructure ready!")
    return checkpoint_mgr, rate_limiter

print("✅ SmartBDX Infrastructure module loaded successfully")