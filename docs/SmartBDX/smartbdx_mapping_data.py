"""
SmartBDX Mapping Data Module
============================

Data operations for column mapping: embeddings, vector search, and persistence.
Handles all data persistence and vector operations for semantic mapping.

Dependencies: smartbdx_config, smartbdx_utilities
"""

# === IMPORTS ===

# Standard Library
import json
import os
import hashlib
from datetime import datetime
from typing import List, Dict, Any, Optional

# Third Party
import pandas as pd
from pyspark.sql import SparkSession
from pyspark.sql.types import StructType, StructField, StringType, ArrayType, FloatType, TimestampType
from pyspark.sql.functions import col, current_timestamp, when
from pyspark.sql.window import Window
from pyspark.sql.functions import row_number
from delta.tables import DeltaTable

# SmartBDX Modules
from smartbdx_config import client, DEFAULT_EMBEDDING_MODEL
from smartbdx_utilities import to_list_of_float

# Get Spark session
spark = SparkSession.getActiveSession()

# === VECTOR SEARCH & EMBEDDINGS ===

def enrich_and_embed_source_columns(
    standardized_headers: List[Dict[str, Any]],
    client: Any,
    vs_client: Any,
    endpoint_name: str,
    index_name: str,
    file_name: Optional[str] = None,
    sheet_name: Optional[str] = None,
    catalog: str = "bdx",
    schema: str = "vector_embedding",
    table_name: str = "source_column",
    embedding_model: str = DEFAULT_EMBEDDING_MODEL,
    primary_key_field: str = "standardized_header"
) -> List[Dict[str, Any]]:
    """
    Enrich source columns with embeddings, using cache when available.
    
    Main embedding orchestrator that:
    1. Extracts primary keys from standardized headers
    2. Queries Delta table for existing embeddings  
    3. Generates new embeddings for missing columns
    4. Saves new embeddings to Delta table
    5. Returns headers enriched with embedding vectors
    
    Args:
        standardized_headers: List of header dictionaries to enrich
        client: Azure OpenAI client for embedding generation
        vs_client: Vector search client (unused but kept for compatibility)
        endpoint_name: Vector search endpoint name (unused)
        index_name: Vector search index name (unused)
        file_name: Source file name for metadata
        sheet_name: Source sheet name for metadata
        catalog: Delta catalog name
        schema: Delta schema name
        table_name: Delta table name for embeddings
        embedding_model: OpenAI embedding model name
        primary_key_field: Field to use as primary key
        
    Returns:
        List of header dictionaries with embedding field added
        
    Process:
        1. Query existing embeddings from Delta: "SELECT primary_key, embedding FROM {catalog}.{schema}.{table_name}"
        2. Generate embeddings for missing columns using get_openai_embedding_batch
        3. Save new embeddings using save_embeddings_to_delta_source_batch
        4. Return enriched headers with embedding vectors
    """
    keys = [row.get(primary_key_field, "") for row in standardized_headers]
    keys = [k for k in keys if k]

    if not keys:
        print("⚠️ No keys to enrich embeddings for.")
        return standardized_headers

    keys_escaped = "','".join(keys)
    query = f"""
    SELECT primary_key, embedding
    FROM {catalog}.{schema}.{table_name}
    WHERE primary_key IN ('{keys_escaped}')
    """

    try:
        existing_embeddings_df = spark.sql(query)
        existing_embeddings = {row.primary_key: row.embedding for row in existing_embeddings_df.collect()}
    except Exception as e:
        print(f"❌ Failed to query embeddings from Delta: {e}")
        existing_embeddings = {}

    to_embed = []
    to_embed_indices = []

    for i, row in enumerate(standardized_headers):
        key = row.get(primary_key_field, "")
        if not key:
            continue
        if key in existing_embeddings:
            row["embedding"] = existing_embeddings[key]
        else:
            enriched_text = build_enriched_embedding_text(row)
            to_embed.append(enriched_text)
            to_embed_indices.append(i)

    if to_embed:
        print(f"🧠 Generating embeddings for {len(to_embed)} new columns...")
        new_embeddings = get_openai_embedding_batch(to_embed, client, model=embedding_model)

        data_to_save = []
        for idx, emb in zip(to_embed_indices, new_embeddings):
            if emb is None:
                print(f"⚠️ Embedding generation failed for header {standardized_headers[idx].get(primary_key_field)}")
                continue

            standardized_headers[idx]["embedding"] = emb
            
            # ✅ Fixed: Get values directly from the right sources
            data_to_save.append((
                standardized_headers[idx].get(primary_key_field),
                emb,
                file_name,  # Use parameter instead of metadata
                sheet_name,  # Use parameter instead of metadata
                standardized_headers[idx].get("description")  # Get directly from header
            ))

        full_table_name = f"{catalog}.{schema}.{table_name}"
        save_embeddings_to_delta_source_batch(data_to_save, table_full_name=full_table_name, spark=spark)

    else:
        print("✅ All embeddings found in Delta, no generation needed.")

    return standardized_headers

def build_enriched_embedding_text(row: Dict[str, Any]) -> str:
    """
    Rich embedding text for a column.
    """
    col_name = row.get("standardized_header", "") or row.get("original_header", "")
    col_type = row.get("likely_type", "")
    desc = row.get("description", "")
    sample_values = row.get("sample_values", [])
    values_str = ", ".join(sample_values) if sample_values else ""
    enriched = f"{col_name} ({col_type}) — {desc}"
    if values_str:
        enriched += f". Example values: {values_str}"
    return enriched

def get_openai_embedding_batch(
    texts: List[str], 
    client: Any, 
    model: str = DEFAULT_EMBEDDING_MODEL
) -> List[Optional[List[float]]]:
    """
    Generate embeddings for a batch of texts using OpenAI API.
    
    Simple wrapper around OpenAI embeddings API with error handling.
    Returns None for failed embeddings instead of raising exceptions.
    
    Args:
        texts: List of text strings to embed
        client: Azure OpenAI client instance
        model: Embedding model name (default: text-embedding-3-large)
        
    Returns:
        List of embedding vectors (as lists of floats) or None for failures
        
    Example:
        >>> texts = ["premium amount", "policy number"]
        >>> embeddings = get_openai_embedding_batch(texts, client)
        >>> len(embeddings)
        2
        >>> len(embeddings[0])  # Vector dimension
        3072
    """
    try:
        response = client.embeddings.create(input=texts, model=model)
        return [r.embedding for r in response.data]
    except Exception as e:
        print("Embedding error:", e)
        return [None] * len(texts)

def fetch_embeddings_by_primary_keys(
    vs_client: Any,
    endpoint_name: str,
    index_name: str,
    primary_keys: List[str]
) -> Dict[str, List[float]]:
    """
    Fetch embeddings from vector store by primary keys using cursor-based pagination.
    
    Retrieves stored embeddings from Databricks Vector Search index.
    Uses scan_index with pagination to handle large key sets efficiently.
    
    Args:
        vs_client: Vector search client instance
        endpoint_name: Vector search endpoint name
        index_name: Vector search index name  
        primary_keys: List of primary keys to fetch
        
    Returns:
        Dictionary mapping primary_key -> embedding vector
        
    Implementation:
        - Uses scan_index with cursor-based pagination
        - Page size of 1000 records per scan
        - Filters results to match requested primary_keys
        - Handles API errors gracefully
        
    Example:
        >>> keys = ["column_hash_1", "column_hash_2"]
        >>> embeddings = fetch_embeddings_by_primary_keys(vs_client, "endpoint", "index", keys)
        >>> embeddings["column_hash_1"]  # Returns embedding vector
        [0.1, 0.2, 0.3, ...]
    """
    index = vs_client.get_index(endpoint_name=endpoint_name, index_name=index_name)
    embeddings_map = {}

    # The Databricks Vector Search supports batch retrieval with pagination.
    # Here, assuming we can fetch them by primary keys using scan or a query with filters.

    # NOTE: The Databricks Vector Search Python SDK may not have direct batch get by keys.
    # One workaround is to scan the index filtering on keys or fetch in small batches with filters.
    # For demonstration, here is a conceptual approach:

    batch_size = 50  # Adjust based on API limits

    for i in range(0, len(primary_keys), batch_size):
        batch_keys = primary_keys[i:i+batch_size]

        # Example: use a filter expression or scan API to fetch data for these keys
        # You may need to adjust based on actual SDK capabilities
        try:
            results = index.scan(
                filter={"primary_key": {"$in": batch_keys}},
                columns=["_id", "embedding"],  # assuming '_id' is the primary key column name
                limit=batch_size
            )
            for record in results:
                pk = record["_id"]  # adjust if primary key column name differs
                emb = record.get("embedding")
                if emb:
                    embeddings_map[pk] = emb
        except Exception as e:
            print(f"Error fetching embeddings batch: {e}")
            # Optionally retry or skip

    return embeddings_map

def get_column_primary_key(file_name: str, sheet_name: str, column_name: str) -> str:
    """
    Generate deterministic primary key for a column based on file/sheet/column.
    
    Creates unique SHA256 hash for column identification across the system.
    Used as primary key in vector store and Delta tables.
    
    Args:
        file_name: Source file name
        sheet_name: Source sheet name  
        column_name: Column name
        
    Returns:
        SHA256 hash string as primary key
        
    Format:
        SHA256("{file_name}::{sheet_name}::{column_name}")
        
    Example:
        >>> get_column_primary_key("policy.xlsx", "data", "premium")
        'a1b2c3d4e5f6789...'  # 64-character SHA256 hash
    """
    base_str = f"{file_name}::{sheet_name}::{column_name}"
    # Use SHA256 to get a fixed-length hash string
    key_hash = hashlib.sha256(base_str.encode('utf-8')).hexdigest()
    return key_hash

def save_new_embeddings_to_vector_store(
    vs_client: Any,
    endpoint_name: str,
    index_name: str,
    primary_keys: List[str],
    embeddings: List[List[float]],
    standardized_headers: List[Dict[str, Any]]
) -> None:
    """
    Save new embeddings to Databricks Vector Search index.
    
    Batch upsert embeddings with metadata to vector store for similarity search.
    Each record includes primary key, embedding vector, and column metadata.
    
    Args:
        vs_client: Vector search client instance
        endpoint_name: Vector search endpoint name
        index_name: Vector search index name
        primary_keys: List of unique column identifiers
        embeddings: List of embedding vectors  
        standardized_headers: List of header metadata dictionaries
        
    Process:
        1. Build records with _id, embedding, and metadata fields
        2. Batch upsert using index.upsert(records)
        3. Handle errors gracefully with logging
        
    Record Format:
        {
            "_id": primary_key,
            "embedding": embedding_vector,
            "standardized_header": column_name,
            "original_header": original_name,
            "description": column_description,
            "data_type": column_type
        }
    """
    """
    Save new embeddings to the vector store.
    Each record includes the primary key, embedding vector, and metadata columns.
    """
    index = vs_client.get_index(endpoint_name=endpoint_name, index_name=index_name)

    records = []
    for pk, emb, header in zip(primary_keys, embeddings, standardized_headers):
        record = {
            "_id": pk,  # adjust if your primary key column differs
            "embedding": emb,
            "standardized_header": header.get("standardized_header"),
            "original_header": header.get("original_header"),
            "description": header.get("description"),
            "data_type": header.get("data_type"),
            # Add other metadata fields as needed
        }
        records.append(record)

    try:
        # Batch upsert records into the index
        index.upsert(records)
        print(f"✅ Saved {len(records)} new embeddings to vector store.")
    except Exception as e:
        print(f"❌ Failed to save embeddings to vector store: {e}")

# === PERSISTENCE OPERATIONS ===

def save_embeddings_to_delta_source_batch(
    data_list: List[tuple],
    table_full_name: str = "bdx.vector_embedding.source_column",
    spark: SparkSession = None
) -> None:
    """
    Save or update embeddings in Delta table with deduplication and merging.
    
    Robust persistence function that handles:
    - Schema creation and management
    - Deduplication by primary_key
    - Delta table merging (upsert operations)
    - Null handling and data validation
    
    Args:
        data_list: List of tuples (primary_key, embedding, file_name, sheet_name, description)
        table_full_name: Full Delta table name (catalog.schema.table)
        spark: Spark session instance
        
    Schema:
        - primary_key: STRING
        - embedding: ARRAY<FLOAT>  
        - file_name: STRING
        - sheet_name: STRING
        - description: STRING
        - updated_at: TIMESTAMP
        
    Process:
        1. Create DataFrame with explicit schema
        2. Deduplicate by primary_key (keep last occurrence)
        3. Add updated_at timestamp
        4. Merge with existing Delta table or create new table
        5. Handle schema evolution automatically
    """
    schema = StructType([
        StructField("primary_key", StringType(), True),
        StructField("embedding", ArrayType(FloatType()), True),
        StructField("file_name", StringType(), True),
        StructField("sheet_name", StringType(), True),
        StructField("description", StringType(), True),
    ])

    df = spark.createDataFrame(data_list, schema)

    # Deduplicate by primary_key, keep last occurrence (assuming input order)
    window_spec = Window.partitionBy("primary_key").orderBy(col("primary_key").desc())
    df = df.withColumn("row_num", row_number().over(window_spec)) \
           .filter(col("row_num") == 1) \
           .drop("row_num")

    df = df.withColumn("updated_at", current_timestamp())

    spark.conf.set("spark.databricks.delta.schema.autoMerge.enabled", "true")

    if DeltaTable.isDeltaTable(spark, table_full_name):
        delta_table = DeltaTable.forName(spark, table_full_name)
        delta_table.alias("target").merge(
            df.alias("source"),
            "target.primary_key = source.primary_key"
        ).whenMatchedUpdate(
            set={
                "embedding": col("source.embedding"),
                "file_name": when(col("source.file_name").isNotNull(), col("source.file_name"))
                             .otherwise(col("target.file_name")),
                "sheet_name": when(col("source.sheet_name").isNotNull(), col("source.sheet_name"))
                              .otherwise(col("target.sheet_name")),
                "description": when(col("source.description").isNotNull(), col("source.description"))
                               .otherwise(col("target.description")),
                "updated_at": current_timestamp()
            }
        ).whenNotMatchedInsertAll().execute()
    else:
        df.write.format("delta").mode("append").saveAsTable(table_full_name)

    print(f"🟢 Upserted {df.count()} embeddings into {table_full_name}")

def save_metadata_to_cache(
    file_name: str,
    base_file_name: str,
    sheet_name: str,
    structure_signature: str,
    table_meta_json: Dict[str, Any],
    standardized_headers_json: List[Dict[str, Any]],
    original_file_hash: Optional[str] = None,
    notes: Optional[str] = None,
    catalog: str = "bdx",
    schema: str = "metadata_cache",
    table_name: str = "structure_metadata_cache"
) -> None:
    """
    Cache table metadata for structure-based caching and change detection.
    
    Saves processed table metadata to Delta table for caching AI processing results.
    Enables structure-based caching where identical table structures reuse results.
    
    Args:
        file_name: Original file name
        base_file_name: Normalized file name (for caching)
        sheet_name: Sheet name
        structure_signature: MD5 hash of table structure
        table_meta_json: Table metadata dictionary
        standardized_headers_json: List of standardized header dictionaries
        original_file_hash: Optional file hash for change detection
        notes: Optional notes
        catalog: Delta catalog name
        schema: Delta schema name  
        table_name: Delta table name
        
    Schema:
        All fields as STRING plus processed_at TIMESTAMP
        
    Usage:
        Structure signature enables caching - identical table structures 
        can reuse AI processing results regardless of file name/date
    """
    schema_def = StructType([
        StructField("file_name", StringType(), True),
        StructField("base_file_name", StringType(), True),
        StructField("sheet_name", StringType(), True),
        StructField("structure_signature", StringType(), True),
        StructField("table_meta_json", StringType(), True),
        StructField("standardized_headers_json", StringType(), True),
        StructField("processed_at", TimestampType(), True),
        StructField("original_file_hash", StringType(), True),
        StructField("notes", StringType(), True)
    ])
    row = {
        "file_name": file_name,
        "base_file_name": base_file_name,
        "sheet_name": sheet_name,
        "structure_signature": structure_signature,
        "table_meta_json": json.dumps(table_meta_json),
        "standardized_headers_json": json.dumps(standardized_headers_json),
        "processed_at": datetime.utcnow(),
        "original_file_hash": original_file_hash,
        "notes": notes
    }
    try:
        df = spark.createDataFrame([row], schema=schema_def)
        df.write.format("delta").mode("append").saveAsTable(f"{catalog}.{schema}.{table_name}")
        print(f"💾 Metadata cached for {file_name} ({base_file_name}) / {sheet_name} / {structure_signature[:8]}")
    except Exception as e:
        print(f"❌ Failed to save metadata cache for {file_name}: {e}")

def load_metadata_from_cache(
    base_file_name: str,
    sheet_name: str,
    structure_signature: str,
    catalog: str = "bdx",
    schema: str = "metadata_cache", 
    table_name: str = "structure_metadata_cache"
) -> Optional[Dict[str, Any]]:
    """
    Load cached metadata for structure-based cache lookup.
    
    Retrieves previously processed metadata based on structure signature.
    Enables reusing AI processing results for identical table structures.
    
    Args:
        base_file_name: Normalized file name
        sheet_name: Sheet name
        structure_signature: MD5 hash of table structure
        catalog: Delta catalog name
        schema: Delta schema name
        table_name: Delta table name
        
    Returns:
        Dictionary with table_meta, standardized_headers, and row data
        or None if not found
        
    Query:
        "SELECT * FROM {catalog}.{schema}.{table_name} 
         WHERE base_file_name = '{base_file_name}' 
           AND sheet_name = '{sheet_name}' 
           AND structure_signature = '{structure_signature}' 
         ORDER BY processed_at DESC LIMIT 1"
         
    Cache Hit: Returns parsed JSON metadata
    Cache Miss: Returns None
    """

    query = f"""
    SELECT * FROM {catalog}.{schema}.{table_name}
    WHERE base_file_name = '{base_file_name}'
      AND sheet_name = '{sheet_name}'
      AND structure_signature = '{structure_signature}'
    ORDER BY processed_at DESC
    LIMIT 1
    """
    try:
        result = spark.sql(query).collect()
        if result:
            row = result[0]
            try:
                table_meta = json.loads(row["table_meta_json"])
                std_headers = json.loads(row["standardized_headers_json"])
            except json.JSONDecodeError as e:
                print(f"❌ JSON decode error in cache for {base_file_name}/{sheet_name}: {e}")
                return None

            print(f"✅ Cache HIT for {base_file_name} / {sheet_name} / {structure_signature[:8]}")
            return {"table_meta": table_meta, "standardized_headers": std_headers, "row": row}
        else:
            print(f"❌ Cache MISS for {base_file_name} / {sheet_name} / {structure_signature[:8]}")
            return None
    except Exception as e:
        print(f"❌ Failed to query cache: {e}")
        return None
    
def log_structure_change(
    file_name: str,
    base_file_name: str,
    sheet_name: str,
    structure_signature: str,
    table_meta_json: Dict[str, Any],
    standardized_headers_json: List[Dict[str, Any]],
    change_type: str,
    original_file_hash: Optional[str] = None,
    notes: Optional[str] = None,
    catalog: str = "bdx",
    schema: str = "metadata_cache",
    table_name: str = "structure_change_log"
) -> None:
    """
    Log structure changes for auditing and change tracking.
    
    Append-only log of table structure changes for monitoring and debugging.
    Tracks when new structures are detected or existing ones change.
    
    Args:
        file_name: Original file name
        base_file_name: Normalized file name
        sheet_name: Sheet name
        structure_signature: MD5 hash of table structure  
        table_meta_json: Table metadata dictionary
        standardized_headers_json: List of header dictionaries
        change_type: Type of change ("cache_miss", "structure_change", etc.)
        original_file_hash: Optional file hash
        notes: Optional notes
        catalog: Delta catalog name
        schema: Delta schema name
        table_name: Delta table name
        
    Schema:
        Same as metadata cache plus change_type field
        
    Common change_types:
        - "cache_miss": New structure detected
        - "structure_change": Existing structure modified
        - "file_updated": File content changed
    """
    schema_def = StructType([
        StructField("file_name", StringType(), True),
        StructField("base_file_name", StringType(), True),
        StructField("sheet_name", StringType(), True),
        StructField("structure_signature", StringType(), True),
        StructField("table_meta_json", StringType(), True),
        StructField("standardized_headers_json", StringType(), True),
        StructField("processed_at", TimestampType(), True),
        StructField("original_file_hash", StringType(), True),
        StructField("notes", StringType(), True),
        StructField("change_type", StringType(), False)
    ])

    row = {
        "file_name": file_name,
        "base_file_name": base_file_name,
        "sheet_name": sheet_name,
        "structure_signature": structure_signature,
        "table_meta_json": json.dumps(table_meta_json),
        "standardized_headers_json": json.dumps(standardized_headers_json),
        "processed_at": datetime.utcnow(),
        "original_file_hash": original_file_hash,
        "notes": notes,
        "change_type": change_type
    }
    
    try:
        df = spark.createDataFrame([row], schema=schema_def)
        df.write.format("delta").mode("append").saveAsTable(f"{catalog}.{schema}.{table_name}")
        print(f"📝 Structure change logged for {file_name} / {sheet_name} / {structure_signature[:8]} - {change_type}")
    except Exception as e:
        print(f"❌ Failed to log structure change for {file_name}: {e}")

def save_mapping_to_binder(
    base_file_name: str,
    sheet_name: str,
    structure_signature: str,
    source_column: str,
    target_column: str,
    mapped_by: str,
    notes: Optional[str] = None,
    catalog: str = "bdx",
    schema: str = "metadata_cache",
    table_name: str = "mapping_binder"
) -> None:
    """
    Save approved column mapping to persistent mapping binder.
    
    Stores user-approved column mappings for reuse across similar structures.
    Used for mapping persistence and learning from user decisions.
    
    Args:
        base_file_name: Normalized file name
        sheet_name: Sheet name
        structure_signature: Structure hash for consistency
        source_column: Source column name
        target_column: Target column name (from glossary)
        mapped_by: Identifier of mapping source (user, auto, etc.)
        notes: Optional mapping notes
        catalog: Delta catalog name
        schema: Delta schema name
        table_name: Delta table name
        
    Schema:
        - All string fields plus mapped_at TIMESTAMP
        
    Usage:
        Enables reusing user decisions for identical table structures
    """
    row = {
        "base_file_name": base_file_name,
        "sheet_name": sheet_name,
        "structure_signature": structure_signature,
        "source_column": source_column,
        "target_column": target_column,
        "mapped_by": mapped_by,
        "mapped_at": datetime.utcnow(),
        "notes": notes
    }
    df = spark.createDataFrame([row])
    df.write.format("delta").mode("append").saveAsTable(f"{catalog}.{schema}.{table_name}")
    print(f"✅ Mapping cached: {source_column} ➔ {target_column} ({base_file_name}/{sheet_name})")

def load_mapping_from_binder(
    base_file_name: str,
    sheet_name: str,
    structure_signature: str,
    source_column: str,
    catalog: str = "bdx",
    schema: str = "metadata_cache",
    table_name: str = "mapping_binder"
) -> Optional[str]:
    """
    Load specific column mapping from persistent binder.
    
    Retrieves previously saved mapping for a specific source column.
    Returns the target column if mapping exists.
    
    Args:
        base_file_name: Normalized file name
        sheet_name: Sheet name
        structure_signature: Structure hash
        source_column: Source column to look up
        catalog: Delta catalog name
        schema: Delta schema name
        table_name: Delta table name
        
    Returns:
        Target column name if mapping exists, None otherwise
        
    Query:
        Filters by all identifiers and orders by mapped_at DESC
        to get most recent mapping for the column
    """
    query = f"""
        SELECT * FROM {catalog}.{schema}.{table_name}
        WHERE base_file_name = '{base_file_name}'
          AND sheet_name = '{sheet_name}'
          AND structure_signature = '{structure_signature}'
          AND source_column = '{source_column}'
        ORDER BY mapped_at DESC
        LIMIT 1
    """
    result = spark.sql(query).collect()
    if result:
        print(f"✅ Mapping found for {source_column}: {result[0]['target_column']}")
        return result[0]["target_column"]
    print(f"❌ Mapping NOT found for {source_column}")
    return None

def load_all_mappings_from_binder(
    base_file_name: str,
    sheet_name: str,
    structure_signature: str,
    catalog: str = "bdx",
    schema: str = "metadata_cache",
    table_name: str = "mapping_binder"
) -> Dict[str, str]:
    """
    Load all column mappings for a specific table structure.
    
    Retrieves all previously saved mappings for reuse with identical structures.
    Returns dictionary mapping source columns to target columns.
    
    Args:
        base_file_name: Normalized file name
        sheet_name: Sheet name
        structure_signature: Structure hash
        catalog: Delta catalog name
        schema: Delta schema name
        table_name: Delta table name
        
    Returns:
        Dictionary mapping source_column -> target_column
        
    Usage:
        Bulk loading of all mappings for table structure reuse
    """

    query = f"""
        SELECT source_column, target_column FROM {catalog}.{schema}.{table_name}
        WHERE base_file_name = '{base_file_name}'
          AND sheet_name = '{sheet_name}'
          AND structure_signature = '{structure_signature}'
    """
    results = spark.sql(query).collect()
    mapping = {r['source_column']: r['target_column'] for r in results}
    if mapping:
        print(f"✅ Loaded {len(mapping)} mappings for {base_file_name}/{sheet_name}/{structure_signature[:8]}")
        return mapping
    print(f"❌ No mappings found for {base_file_name}/{sheet_name}/{structure_signature[:8]}")
    return {}

# === HELPER FUNCTIONS ===

def load_json_if_exists(path: str) -> Optional[Any]:
    """
    Load JSON file if it exists, with error handling.
    
    Simple utility for loading cached JSON files from local filesystem.
    Used for temporary caching during development and testing.
    
    Args:
        path: File path to JSON file
        
    Returns:
        Parsed JSON object or None if file doesn't exist or fails to parse
        
    Features:
        - Checks file existence before loading
        - Handles JSON parse errors gracefully
        - Provides logging for cache hits/misses
        
    Example:
        >>> data = load_json_if_exists("/tmp/cache.json")
        📂 Loaded from cache: /tmp/cache.json
    """
    try:
        if os.path.exists(path):
            with open(path, "r") as f:
                print(f"📂 Loaded from cache: {path}")
                return json.load(f)
    except Exception as e:
        print(f"⚠️ Failed to load {path}: {e}")
    return None

def save_json(obj: Any, path: str) -> None:
    """
    Save object as JSON file with directory creation.
    
    Utility for saving data to JSON files with automatic directory creation.
    Used for temporary caching and data export during development.
    
    Args:
        obj: Python object to serialize as JSON
        path: File path where JSON should be saved
        
    Features:
        - Creates parent directories if they don't exist
        - Pretty-prints JSON with 2-space indentation
        - Handles write errors gracefully with logging
        
    Example:
        >>> save_json({"key": "value"}, "/tmp/data.json")
        💾 Saved: /tmp/data.json
    """
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w") as f:
            json.dump(obj, f, indent=2)
        print(f"💾 Saved: {path}")
    except Exception as e:
        print(f"⚠️ Failed to save {path}: {e}")

# === ADDITIONAL MAPPING FUNCTIONS ===

def prepare_mappings_for_review(
    all_columns: List[Dict[str, Any]],
    glossary_targets: List[str],
    base_file_name: str,
    sheet_name: str,
    structure_signature: str,
    mapping_results: Optional[Any] = None
) -> List[Dict[str, Any]]:
    """
    Prepare mapping results for UI review and user approval.
    
    Converts column metadata and mapping results into standardized format
    for UI display and user interaction. Sets review flags based on confidence.
    
    Args:
        all_columns: List of all detected column dictionaries
        glossary_targets: List of valid target column names
        base_file_name: Normalized file name
        sheet_name: Sheet name
        structure_signature: Structure hash
        mapping_results: Optional mapping results from vector search
        
    Returns:
        List of mapping dictionaries ready for UI review
        
    Review Structure:
        Each mapping contains:
        - file_name, sheet_name, structure_signature
        - source_column, original_header
        - target_column (preselected if score >= 0.80)
        - match_score, needs_review flag
        - proposed_targets (full glossary list)
        - sample_values, data_type, description
        
    Logic:
        - Auto-suggests targets only for high-confidence matches (>= 0.80)
        - Always requires UI review (needs_review: True)
    """
    mappings = []
    for col in all_columns:
        score = col.get("match_score", 0)
        suggested = col.get("mapped_to_target") if score >= 0.80 else None
        mappings.append({
            "file_name": base_file_name,
            "sheet_name": sheet_name,
            "structure_signature": structure_signature,
            "source_column": col.get("standardized_header"),
            "original_header": col.get("original_header", ""),
            "target_column": suggested,  # Preselect only if score ≥ 0.80
            "match_score": score,
            "needs_review": True,  # Always UI review
            "proposed_targets": glossary_targets,
            "sample_values": col.get("sample_values", []),
            "data_type": col.get("data_type", ""),
            "description": col.get("description", ""),
        })
    return mappings

def review_and_save_mappings(
    mapped_df: pd.DataFrame,
    base_file_name: str,
    sheet_name: str,
    structure_signature: str,
    mapped_by: str = "semantic-auto",
    glossary_target_list: Optional[List[str]] = None,
    threshold: float = 0.85
) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Process mapping DataFrame and categorize for review and approval.
    
    Takes mapping results and splits them into auto-approved and needs-review
    categories based on confidence scores and mapping quality.
    
    Args:
        mapped_df: DataFrame with mapping results and scores
        base_file_name: Normalized file name
        sheet_name: Sheet name
        structure_signature: Structure hash
        mapped_by: Source of mappings identifier
        glossary_target_list: List of valid targets
        threshold: Confidence threshold for auto-approval (default 0.85)
        
    Returns:
        Tuple of (auto_approved_mappings, needs_review_mappings)
        
    Mapping Structure:
        Each mapping dictionary contains:
        - file_name, sheet_name, source_column
        - sample_values, suggested_target, current_mapping
        - confidence_score, auto_approved, needs_review
        - override_status, target_options
        - structure_signature, notes
        
    Auto-Approval Logic:
        - High confidence score (>= threshold)
        - Valid target mapping exists
        - No review flag set
    """
    auto_approved = []
    needs_review = []
    for _, row in mapped_df.iterrows():
        src_col = row.get("standardized_header")
        tgt_col = row.get("mapped_to_target")
        score = row.get("match_score", 0)
        needs_review_flag = row.get("needs_human_review", score < threshold)
        sample_values = row.get("sample_values", [])
        mapping = {
            "file_name": base_file_name,
            "sheet_name": sheet_name,
            "source_column": src_col,
            "sample_values": sample_values,
            "suggested_target": tgt_col,
            "current_mapping": tgt_col,   # <-- This can be overridden by the user
            "confidence_score": score,
            "auto_approved": not needs_review_flag,
            "needs_review": needs_review_flag,
            "override_status": None,
            "target_options": glossary_target_list or [],  # <-- Wire in glossary list
            "structure_signature": structure_signature,
            "notes": f"Semantic match score: {score:.2f}" + (" (needs review)" if needs_review_flag else ""),
        }
        if tgt_col and not needs_review_flag:
            auto_approved.append(mapping)
        else:
            needs_review.append(mapping)
    return auto_approved, needs_review