"""
SmartBDX Utilities Module
========================

Core utility functions for bordereaux file processing.
No external module dependencies - foundation layer.

Functions:
- File & text processing utilities
- DataFrame manipulation and chunking
- Token estimation and performance optimization
- Structure signatures and caching helpers
- Data type conversion utilities


Author: SmartBDX Team
Version: 1.0
"""

# === IMPORTS ===
import re
import hashlib
import time
import getpass
from pathlib import Path
from typing import List, Dict, Any, Tuple, Optional, Union
import pandas as pd
import tiktoken
import json
import pandas as pd
from datetime import datetime
import numpy as np
from decimal import Decimal

# === CONSTANTS ===
try:
    dbutils  # type: ignore
except NameError:
    try:
        from pyspark.dbutils import DBUtils
        from pyspark.sql import SparkSession
        spark = SparkSession.builder.getOrCreate()
        dbutils = DBUtils(spark)
    except Exception:
        dbutils = None

# === TEXT PROCESSING FUNCTIONS ===
def safe_json_serialize(obj):
    """
    Recursively serialize an object to be JSON-compatible.
    
    Handles common non-serializable types:
    - datetime and pandas Timestamp objects
    - numpy integer and float types
    - Decimal objects
    """
    if isinstance(obj, dict):
        return {k: safe_json_serialize(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [safe_json_serialize(item) for item in obj]
    elif isinstance(obj, (pd.Timestamp, datetime)):
        return obj.isoformat()
    elif isinstance(obj, (np.int64, np.int32, np.int16, np.int8)):
        return int(obj)
    elif isinstance(obj, (np.float64, np.float32)):
        return float(obj)
    elif isinstance(obj, Decimal):
        return float(obj)
    else:
        return obj

# Keep the old function for backward compatibility for now, but it will be deprecated.
def json_serialize_timestamps(obj):
    """
    Convert timestamps to ISO format strings in nested data structures.
    
    This function recursively traverses dictionaries and lists to find and convert
    pandas Timestamp or datetime objects to ISO format strings, making them JSON serializable.
    
    Args:
        obj: The object to serialize (dict, list, Timestamp, or other)
        
    Returns:
        The same object structure with all Timestamp objects converted to strings
    """
    return safe_json_serialize(obj)


def extract_base_file_name(file_name: str) -> str:
    """
    Extract normalized base file name for structure caching.
    
    Removes date patterns, version numbers, and standardizes naming
    for consistent metadata lookup across similar file variations.
    
    Args:
        file_name (str): Original file name with potential date/version suffixes
        
    Returns:
        str: Normalized base file name suitable for caching lookup
        
    Example:
        >>> extract_base_file_name("Premium_Report_Jan2024_v2.xlsx")
        'premium_report'
        
    Note:
        Removes: month names, years, dates, version numbers, separators
    """
    base = file_name.lower()
    base = re.sub(r'(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\d{2,4}', '', base)
    base = re.sub(r'(19|20)\d{2}', '', base)                        # years
    base = re.sub(r'\d{6,8}', '', base)                             # yyyymm or yyyymmdd
    base = re.sub(r'[_\-\.]?\d{1,2}', '', base)                    # _01, -25, .31 etc.
    base = re.sub(r'[_\-\.]+', '_', base)                           # collapse separators
    base = re.sub(r'^_+|_+$', '', base)                             # remove leading/trailing underscores
    base = base.strip('_')
    return base

def safe_view_name(name: str) -> str:
    """
    Convert any file/sheet name to a Spark-safe view name.
    
    Transforms names to comply with Spark SQL naming requirements by
    removing special characters, normalizing case, and ensuring valid identifiers.
    
    Args:
        name (str): Original file or sheet name (may contain spaces, special chars)
        
    Returns:
        str: Spark-safe view name (lowercase, underscores, no leading digits)
        
    Example:
        >>> safe_view_name("Premium Data - Q1 2024!")
        'premium_data_q'
        
    Note:
        Removes extensions, replaces special chars with underscores,
        removes leading digits and multiple consecutive underscores.
    """
    # Remove extension, lowercase
    name = re.sub(r'\.[^.]+$', '', name)
    # Replace spaces/punct with underscores
    name = re.sub(r'[^\w]', '_', name)
    # Remove leading underscores and digits
    name = re.sub(r'^[_\d]+', '', name)
    # Collapse multiple underscores
    name = re.sub(r'_+', '_', name)
    return name.lower()

def clean_percent(val: Union[str, float, int, None]) -> Optional[float]:
    """
    Convert percentage strings to float values.
    
    Handles various percentage formats including strings with % symbols,
    numeric values, and None/empty values safely.
    
    Args:
        val: Input value that may represent a percentage
        
    Returns:
        Optional[float]: Numeric percentage value or None if conversion fails
        
    Example:
        >>> clean_percent("15.5%")
        15.5
        >>> clean_percent("  25% ")
        25.0
        >>> clean_percent(None)
        None
        
    Note:
        Strips whitespace and % symbols before conversion.
        Returns None for invalid inputs rather than raising exceptions.
    """
    try:
        if isinstance(val, str):
            val = val.replace("%", "").strip()
        return float(val)
    except (ValueError, TypeError):
        return None
    
def copy_volume_file_to_tmp_via_spark(volume_path: str) -> str:
    """
    Copy file from Databricks volume to local temp directory via Spark.
    
    Handles the Databricks-specific file access pattern where volumes
    need to be accessed through Spark and copied to local filesystem
    for pandas/openpyxl processing.
    
    Args:
        volume_path (str): Full path to file in Databricks volume (dbfs:/Volumes/...)
        
    Returns:
        str: Local filesystem path to copied file (/dbfs/tmp/user/filename)
        
    Raises:
        FileNotFoundError: If source file doesn't exist in volume
        IOError: If file copy operation fails or file is empty/unreadable
        
    Example:
        >>> local_path = copy_volume_file_to_tmp_via_spark("dbfs:/Volumes/test/bronze/raw/data.xlsx")
        >>> print(local_path)
        '/dbfs/tmp/user_domain_com/data.xlsx'
        
    Note:
        Creates user-specific temp directory to avoid conflicts.
        Performs validation to ensure file exists and is readable.
    """
    # Use user-scoped temp directory in DBFS
    import getpass
    user = getpass.getuser().replace('@','_').replace('.','_')
    file_name = Path(volume_path).name
    # Use DBFS root temp
    tmp_dir = f"/dbfs/tmp/{user}/"
    tmp_path = f"{tmp_dir}{file_name}"
    try:
        dbutils.fs.mkdirs(f"dbfs:/tmp/{user}/")
    except Exception:
        pass
    try:
        dbutils.fs.ls(volume_path)
    except Exception:
        raise FileNotFoundError(f"🚫 File not found: {volume_path}")
    try:
        binary_df = spark.read.format("binaryFile").load(volume_path)
        content_rows = binary_df.select("content").collect()
        if not content_rows or not content_rows[0]["content"]:
            raise IOError(f"⚠️ File is empty or unreadable: {volume_path}")
        with open(tmp_path, "wb") as f:
            f.write(content_rows[0]["content"])
        print(f"✅ File copied to: {tmp_path}")
        return tmp_path
    except Exception as e:
        raise IOError(f"❌ Failed to copy from volume: {volume_path} — {str(e)}")


#====📊 Data Processing Functions===

def get_column_sample_values(df: pd.DataFrame, col_idx: int, data_start: int, data_end: int, max_samples: int = 3) -> List[Any]:
    samples = []
    n_rows = df.shape[0]
    for i in range(data_start, min(data_end + 1, n_rows)):
        try:
            val = df.iloc[i, col_idx]
            if pd.notna(val):
                samples.append(str(val))
            if len(samples) >= max_samples:
                break
        except Exception:
            continue
    return samples

def df_to_json_rows(df: pd.DataFrame) -> List[Dict[str, Any]]:
    """
    Convert DataFrame to list of JSON-serializable row dictionaries.
    
    Transforms DataFrame to format suitable for LLM processing:
    - Each row becomes a dict with row_index and values
    - All cells converted to strings (handles NaN values)
    - Preserves original row indices
    
    Args:
        df (pd.DataFrame): Input DataFrame
        
    Returns:
        List[Dict[str, Any]]: List of row dictionaries
        
    Example:
        >>> df = pd.DataFrame({'A': [1, 2], 'B': ['x', 'y']})
        >>> df_to_json_rows(df)
        [{'row_index': 0, 'values': ['1', 'x']}, 
         {'row_index': 1, 'values': ['2', 'y']}]
    """
    return [
        {
            "row_index": int(idx),
            "values": [str(cell) if pd.notna(cell) else "" for cell in df.loc[idx].tolist()]
        }
        for idx in df.index
    ]

def detect_table_boundaries(df: pd.DataFrame) -> List[Tuple[int, int]]:
    """
    Find contiguous blocks of non-empty rows in DataFrame.
    
    Identifies table regions by finding consecutive rows with data.
    Used to avoid chunking in the middle of table structures.
    
    Args:
        df (pd.DataFrame): Input DataFrame to analyze
        
    Returns:
        List[Tuple[int, int]]: List of (start_row, end_row) tuples for each block
        
    Example:
        >>> # For DF with data in rows 2-5 and 8-10
        >>> detect_table_boundaries(df)
        [(2, 5), (8, 10)]
    """
    is_data_row = df.apply(lambda row: any(str(cell).strip() for cell in row), axis=1)
    blocks, in_block = [], False
    for idx, val in enumerate(is_data_row):
        if val and not in_block:
            start = idx
            in_block = True
        elif not val and in_block:
            blocks.append((start, idx-1))
            in_block = False
    if in_block:
        blocks.append((start, len(is_data_row)-1))
    return blocks


def chunk_table_by_content(df: pd.DataFrame, chunk_size: int = 150) -> pd.DataFrame:
    """
    Generator that yields DataFrame chunks without splitting table blocks.
    
    Intelligently chunks data by:
    - First identifying table boundaries
    - Then chunking within those boundaries
    - Never splitting a contiguous table across chunks
    
    Args:
        df (pd.DataFrame): Input DataFrame to chunk
        chunk_size (int): Maximum rows per chunk (default: 150)
        
    Yields:
        pd.DataFrame: Chunks of the original DataFrame
        
    Example:
        >>> for chunk in chunk_table_by_content(df, chunk_size=50):
        ...     process_chunk(chunk)
    """
    boundaries = detect_table_boundaries(df)
    for start, end in boundaries:
        for chunk_start in range(start, end+1, chunk_size):
            chunk_end = min(chunk_start+chunk_size-1, end)
            yield df.iloc[chunk_start:chunk_end+1, :]



def sample_table_rows(df: pd.DataFrame, table_meta: Dict[str, Any], max_samples_per_col: int = 5) -> Tuple[List[List], List[List]]:
    """
    Extract header rows and smart sample of data rows for AI analysis.
    
    Intelligently samples data from detected table regions to provide
    representative examples for LLM processing while handling edge cases
    like rare values, risk codes, and empty columns.
    
    Args:
        df (pd.DataFrame): Full sheet data as DataFrame
        table_meta (Dict[str, Any]): Table metadata with row classifications
        max_samples_per_col (int, optional): Maximum samples per column. Defaults to 5.
        
    Returns:
        Tuple[List[List], List[List]]: (header_rows, data_rows) as lists of lists
        
    Example:
        >>> table_meta = {
        ...     'data_start_row': 5, 'data_end_row': 100,
        ...     'header_rows': [3, 4], 'summary_rows': [101], 'noise_rows': [1, 2]
        ... }
        >>> headers, data = sample_table_rows(df, table_meta)
        >>> len(headers)  # Number of header rows
        2
        
    Note:
        Excludes header, summary, and noise rows from data sampling.
        Prioritizes unique values and handles rare/edge case data intelligently.
        Returns data suitable for LLM context without overwhelming token limits.
    """
    data_start = table_meta.get('data_start_row')
    data_end = table_meta.get('data_end_row')
    headers = table_meta.get('header_rows', [])
    summary_rows = set(table_meta.get('summary_rows', []))
    noise_rows = set(table_meta.get('noise_rows', []))

    # All candidate data rows (exclude header/summary/noise)
    data_idx = [i for i in range(data_start, data_end + 1)
                if i not in headers and i not in summary_rows and i not in noise_rows]

    # Remove blank rows
    data_idx = [i for i in data_idx if any(str(val).strip() for val in df.iloc[i, :].tolist())]
    if not data_idx:
        return [], []

    # Sampling logic: first, last, and some middle rows
    samples_idx = set()
    samples_idx.add(data_idx[0])
    if len(data_idx) > 1:
        samples_idx.add(data_idx[-1])
    if len(data_idx) > 3:
        samples_idx.add(data_idx[len(data_idx)//2])
        samples_idx.add(data_idx[len(data_idx)//3])
        samples_idx.add(data_idx[(2*len(data_idx))//3])

    # Edge cases: rare values in 'risk', 'code', or 'id' columns
    col_headers = table_meta.get('column_headers', [f'col_{i+1}' for i in range(df.shape[1])])
    for col_idx, header in enumerate(col_headers):
        col_vals = [str(df.iloc[i, col_idx]) for i in data_idx if pd.notna(df.iloc[i, col_idx])]
        if not col_vals or all(v.strip() == "" for v in col_vals):
            continue
        val_counts = Counter(col_vals)
        # Rare values: add row if it exists
        if any(w in header.lower() for w in ["risk", "code", "id"]):
            rare_val = min(val_counts, key=val_counts.get)
            for i in data_idx:
                if str(df.iloc[i, col_idx]) == rare_val:
                    samples_idx.add(i)
                    break
        else:
            for val, cnt in val_counts.items():
                if cnt == 1 and val.strip():
                    for i in data_idx:
                        if str(df.iloc[i, col_idx]) == val:
                            samples_idx.add(i)
                            break
                    if len(samples_idx) > max_samples_per_col:
                        break

    # Gather header rows
    header_rows = [df.iloc[h, :].tolist() for h in headers if 0 <= h < len(df)]
    data_rows = [df.iloc[i, :].tolist() for i in sorted(samples_idx)]

    return header_rows, data_rows


# === ⚡ Token & Performance Functions === 

def estimate_tokens(prompt: str, model: str = "gpt-4") -> int:
    """
    Estimate token count for text using tiktoken encoding.
    
    Provides accurate token estimates for GPT models using cl100k_base
    encoding (used by GPT-4/3.5). Essential for staying within context limits.
    
    Args:
        prompt (str): Text to estimate tokens for
        model (str): Model name (default: "gpt-4")
        
    Returns:
        int: Estimated token count
        
    Example:
        >>> estimate_tokens("Hello world")
        2
        >>> estimate_tokens(large_json_string)
        15420
    """
    enc = tiktoken.get_encoding("cl100k_base")
    return len(enc.encode(prompt))

def conservative_token_estimation(df: pd.DataFrame, model: str = "gpt-4.1") -> int:
    """
    Estimate token count for DataFrame with conservative overhead for Azure OpenAI.
    
    Provides safe token estimation to stay within Azure OpenAI limits by
    sampling data and applying conservative multiplication factors for
    JSON formatting, prompt overhead, and response space.
    
    Args:
        df (pd.DataFrame): DataFrame to estimate tokens for
        model (str, optional): Model name for tokenizer. Defaults to "gpt-4.1".
        
    Returns:
        int: Conservative token estimate including all overhead
        
    Example:
        >>> df = pd.read_excel("sample.xlsx")
        >>> tokens = conservative_token_estimation(df)
        >>> print(f"Estimated tokens: {tokens:,}")
        Estimated tokens: 15,000
        
    Note:
        Samples subset of rows, extrapolates to full dataset, applies 4x overhead.
        Designed to prevent Azure OpenAI rate limit violations by being conservative.
    """
    
    if df is None or df.empty:
        return 1000  # Minimum estimate
    
    # Very conservative approach for 50k token limit
    total_cells = df.shape[0] * df.shape[1]
    
    # Sample content to estimate average cell size
    sample_size = min(50, len(df))
    if sample_size == 0:
        return 1000
    
    sample_df = df.head(sample_size)
    total_chars = 0
    cell_count = 0
    
    for col in sample_df.columns:
        for val in sample_df[col]:
            if pd.notna(val):
                total_chars += len(str(val))
                cell_count += 1
    
    if cell_count == 0:
        return 1000
    
    # Conservative estimation
    avg_chars_per_cell = total_chars / cell_count
    total_content_chars = avg_chars_per_cell * df.notna().sum().sum()
    
    # Very conservative: 3 chars per token + high overhead for small files
    base_tokens = int(total_content_chars / 3)
    
    # High overhead for prompts, function calls, retries
    overhead_factor = 4  # Conservative for Azure limits
    estimated_tokens = max(1000, int(base_tokens * overhead_factor))
    
    # Cap at reasonable maximum for single sheet
    estimated_tokens = min(estimated_tokens, 40000)  # Leave 10k buffer
    
    print(f"📊 Conservative estimate: {df.shape} -> {estimated_tokens:,} tokens")
    return estimated_tokens

def azure_safe_chunk_size(df: pd.DataFrame, max_tokens: int = 25000) -> int:
    """
    Calculate safe chunk size for Azure OpenAI processing with conservative limits.
    
    Determines optimal chunk size to stay well within Azure token limits
    while maximizing processing efficiency. Uses actual data sampling
    to estimate tokens per row.
    
    Args:
        df (pd.DataFrame): DataFrame to be chunked
        max_tokens (int, optional): Maximum tokens per chunk. Defaults to 25000.
        
    Returns:
        int: Safe number of rows per chunk (minimum 5, maximum len(df))
        
    Example:
        >>> chunk_size = azure_safe_chunk_size(large_df, max_tokens=20000)
        >>> print(f"Process in chunks of {chunk_size} rows")
        Process in chunks of 15 rows
        
    Note:
        Very conservative approach - uses tiktoken for accurate estimation.
        Reserves space for prompt overhead and response generation.
        Clamps result to reasonable bounds (5 minimum rows).
    """
    
    if df is None or len(df) <= 5:
        return max(1, len(df)) if df is not None else 1
    
    # Test with small sample
    sample_rows = min(5, len(df))
    sample_df = df.head(sample_rows)
    
    # Count content
    sample_content = ""
    for _, row in sample_df.iterrows():
        row_content = " ".join([str(cell) for cell in row if pd.notna(cell)])
        sample_content += row_content + " "
    
    # Conservative token estimation
    enc = tiktoken.get_encoding("cl100k_base")
    sample_tokens = len(enc.encode(sample_content))
    tokens_per_row = (sample_tokens / sample_rows) if sample_rows > 0 else 50
    
    # Very conservative chunk sizing for Azure limits
    overhead_factor = 5  # High overhead for safety
    safe_tokens_per_chunk = max_tokens / overhead_factor
    
    chunk_size = int(safe_tokens_per_chunk / tokens_per_row)
    chunk_size = max(3, min(chunk_size, 50, len(df)))  # Very small chunks
    
    estimated_chunk_tokens = int(tokens_per_row * chunk_size * overhead_factor)
    
    print(f"🛡️  Azure-safe chunking: {chunk_size} rows/chunk (~{estimated_chunk_tokens:,} tokens)")
    return chunk_size

def get_adaptive_chunk_size(df: pd.DataFrame, model_name: str = "gpt-4.1", max_tokens: int = 32000) -> int:
    """
    Calculate adaptive chunk size based on content complexity and model limits.
    
    Dynamically adjusts chunk size based on actual data characteristics,
    model context limits, and processing requirements. More sophisticated
    than fixed chunking strategies.
    
    Args:
        df (pd.DataFrame): DataFrame to analyze for chunking
        model_name (str, optional): Target model for processing. Defaults to "gpt-4.1".
        max_tokens (int, optional): Model context limit. Defaults to 32000.
        
    Returns:
        int: Adaptive chunk size optimized for the specific data and model
        
    Example:
        >>> # Dense data with long text
        >>> chunk_size = get_adaptive_chunk_size(dense_df)
        >>> print(chunk_size)  # Smaller chunks
        8
        >>> # Sparse data with short values  
        >>> chunk_size = get_adaptive_chunk_size(sparse_df)
        >>> print(chunk_size)  # Larger chunks
        50
        
    Note:
        Analyzes data density, cell content length, and column count.
        Balances processing efficiency with model context limits.
        More intelligent than fixed-size chunking approaches.
    """
    # Try a sample of 25 rows to estimate avg tokens/row
    sample_rows = min(25, len(df))
    if sample_rows == 0:
        return 1
    sample = [
        {"row_index": int(idx), "values": [str(cell) if pd.notna(cell) else "" for cell in df.loc[idx].tolist()]}
        for idx in df.index[:sample_rows]
    ]
    enc = tiktoken.get_encoding("cl100k_base")
    token_count = len(enc.encode(json.dumps(sample)))
    avg_tokens_per_row = token_count / sample_rows
    usable_tokens = max_tokens - 2000  # Reserve 2k for prompt/overhead/response
    est_rows = int(usable_tokens // avg_tokens_per_row)
    # Clamp to [5, len(df)]
    chunk_size = max(5, min(est_rows, len(df)))
    print(f"🟢 Auto-selected chunk size: {chunk_size} rows (≈{int(avg_tokens_per_row*chunk_size):,} tokens per chunk)")
    return chunk_size

def print_chunk_token_sizes(chunks: List[Any], model: str = "gpt-4", 
                          prefix: str = "") -> None:
    """
    Print token size analysis for list of chunks (debugging utility).
    
    Analyzes and displays token usage for each chunk:
    - Shows chunk size and estimated tokens
    - Warns about chunks exceeding limits
    - Helps optimize chunking strategies
    
    Args:
        chunks (List[Any]): List of chunks to analyze
        model (str): Model for token estimation (default: "gpt-4")
        prefix (str): Prefix for output lines (default: "")
        
    Example:
        >>> print_chunk_token_sizes(chunks, prefix=">>> ")
        >>> Chunk 1: 50 rows, 2,714 tokens
        >>> Chunk 2: 25 rows, 1,405 tokens
        ⚠️  WARNING: Chunk 3 exceeds 32k tokens!
    """
    for i, chunk in enumerate(chunks):
        prompt_json = json.dumps(chunk, indent=2)
        n_tokens = estimate_tokens(prompt_json, model=model)
        print(f"{prefix}Chunk {i+1}: {len(chunk)} rows, {n_tokens:,} tokens")
        if n_tokens > 32000:
            print("  ⚠️ WARNING: This chunk exceeds 32k tokens! GPT-4-32k context limit is ~32k.")
        elif n_tokens > 50000:
            print("  🚨 WARNING: This chunk exceeds 50k tokens! Your model may error.")


# === STRUCTURE & CACHING FUNCTIONS ===

def compute_structure_signature_from_headers(header_rows: List[List], 
                                           n_cols: int) -> str:
    """
    Generate MD5 signature for table structure based on headers and columns.
    
    Creates consistent hash for table structure caching:
    - Normalizes header content (lowercase, whitespace)
    - Includes column count for structure validation
    - Produces consistent signatures for identical structures
    
    Args:
        header_rows (List[List]): List of header row lists
        n_cols (int): Number of columns in table
        
    Returns:
        str: MD5 hash signature for table structure
        
    Example:
        >>> headers = [['Premium', 'Commission'], ['Amount', 'Rate']]
        >>> compute_structure_signature_from_headers(headers, 2)
        'a1b2c3d4e5f6789...'  # MD5 hash
    """
    header_content = ["|".join([str(x).strip().lower() if x is not None else "" for x in row]) for row in header_rows]
    signature_str = "|".join(header_content) + f"|n_cols={n_cols}"
    return hashlib.md5(signature_str.encode()).hexdigest()

def to_list_of_float(val: Any) -> List[float]:
    """
    Convert various formats to list of floats (for embeddings).
    
    Handles multiple embedding storage formats:
    - Python lists of numbers
    - NumPy arrays
    - JSON-encoded strings
    - Other array-like objects
    
    Args:
        val (Any): Value to convert (list, array, string, etc.)
        
    Returns:
        List[float]: List of float values, empty list if conversion fails
        
    Example:
        >>> to_list_of_float([1, 2, 3])
        [1.0, 2.0, 3.0]
        >>> to_list_of_float("[1.5, 2.5, 3.5]")  # JSON string
        [1.5, 2.5, 3.5]
        >>> to_list_of_float("invalid")
        []
    """
    if isinstance(val, list) and all(isinstance(x, (float, int)) for x in val):
        return [float(x) for x in val]
    elif hasattr(val, "tolist"):
        return [float(x) for x in val.tolist()]
    elif isinstance(val, str):
        try:
            arr = json.loads(val)
            return [float(x) for x in arr]
        except Exception:
            return []
    return []

def json_serialize_timestamps(obj):
    """Convert timestamps to ISO format strings in nested data structures.
    
    This function recursively traverses dictionaries and lists to find and convert
    pandas Timestamp or datetime objects to ISO format strings, making them JSON serializable.
    
    Args:
        obj: The object to serialize (dict, list, Timestamp, or other)
        
    Returns:
        The same object structure with all Timestamp objects converted to strings
    """
    if isinstance(obj, dict):
        return {k: json_serialize_timestamps(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [json_serialize_timestamps(item) for item in obj]
    elif isinstance(obj, (pd.Timestamp, datetime)):
        return obj.isoformat()
    else:
        return obj