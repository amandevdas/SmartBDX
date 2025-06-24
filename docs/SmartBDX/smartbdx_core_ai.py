"""
SmartBDX Core AI Engine Module
=============================

Core AI processing for bordereaux Excel file analysis.
Handles table detection, header standardization, and data extraction.

Dependencies: smartbdx_config, smartbdx_utilities, smartbdx_infrastructure
"""

# Standard Library
import json
import time
import os
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple, Union

# Third Party
import pandas as pd
from pyspark.sql import SparkSession
from pyspark.sql.functions import col
from IPython.display import HTML, display

# SmartBDX Modules
from smartbdx_config import (
    client,
    summarize_function,
    meta_function,
    flatten_function,
    data_extract_function,
    DEFAULT_CHUNK_SIZE,
    DEFAULT_MODEL_NAME,
    GLOSSARY_TABLE,
    GLOSSARY_TABLE_COLUMN
)
from smartbdx_utilities import (
    df_to_json_rows,
    detect_table_boundaries,
    chunk_table_by_content,
    print_chunk_token_sizes,
    estimate_tokens,
    sample_table_rows,
    get_column_sample_values,
    safe_view_name,
    conservative_token_estimation,
    get_adaptive_chunk_size,
    copy_volume_file_to_tmp_via_spark
)
from smartbdx_infrastructure import spark

# --- dbutils Handling ---
try:
    dbutils  # type: ignore
except NameError:
    try:
        from pyspark.dbutils import DBUtils
        dbutils = DBUtils(spark)
    except Exception:
        dbutils = None

#======📋 Core AI Functions======
#======📂 File Loading Functions=====

def load_raw_excel_files(volume_folder: str) -> Dict[str, Dict[str, pd.DataFrame]]:
    """
    Load all Excel files from Databricks Volume into memory.
    If not running in Databricks, fallback to local directory loading.

    Returns nested dict structure: {filename: {sheetname: dataframe}}
    """
    all_sheets = {}

    if dbutils is not None:
        # --- Databricks path loading ---
        try:
            full_paths = [f.path for f in dbutils.fs.ls(volume_folder) if f.name.lower().endswith(".xlsx")]
            if not full_paths:
                print(f"⚠️ No Excel files found in {volume_folder}")
                return all_sheets
            print(f"📊 Found {len(full_paths)} Excel files")
        except Exception as e:
            print(f"❌ Failed to list files in {volume_folder} — {e}")
            return all_sheets
        for dbfs_path in full_paths:
            file_name = Path(dbfs_path).name
            print(f"\n📂 Processing file: {file_name}")
            try:
                local_path = copy_volume_file_to_tmp_via_spark(dbfs_path)
                print(f"✅ File copied to: {local_path}")
                xls = pd.ExcelFile(local_path)
                sheets = xls.sheet_names
                print(f"📄 Detected sheets: {sheets}")
                sheet_data = {}
                for sheet_name in sheets:
                    print(f"🧽 Loading raw sheet: '{sheet_name}'")
                    df = pd.read_excel(xls, sheet_name=sheet_name, header=None)
                    if not df.empty:
                        df = df.applymap(lambda x: str(x).strip().replace("\n", " ").replace("\r", " ") if pd.notna(x) else None)
                    sheet_data[sheet_name] = df
                all_sheets[file_name] = sheet_data
                print(f"✅ All sheets loaded raw for '{file_name}'")
            except Exception as e:
                print(f"❌ Failed to process file '{file_name}': {e}")
    else:
        # --- Local file system loading fallback ---
        print(f"🔎 dbutils not found, loading Excel files from local folder: {volume_folder}")
        if not os.path.isdir(volume_folder):
            print(f"❌ Local folder does not exist: {volume_folder}")
            return all_sheets
        file_list = [f for f in os.listdir(volume_folder) if f.lower().endswith(".xlsx")]
        if not file_list:
            print(f"⚠️ No Excel files found in {volume_folder}")
            return all_sheets
        print(f"📊 Found {len(file_list)} Excel files")
        for fname in file_list:
            file_path = os.path.join(volume_folder, fname)
            print(f"\n📂 Processing file: {fname}")
            try:
                xls = pd.ExcelFile(file_path)
                sheets = xls.sheet_names
                print(f"📄 Detected sheets: {sheets}")
                sheet_data = {}
                for sheet_name in sheets:
                    print(f"🧽 Loading raw sheet: '{sheet_name}'")
                    df = pd.read_excel(xls, sheet_name=sheet_name, header=None)
                    if not df.empty:
                        df = df.applymap(lambda x: str(x).strip().replace("\n", " ").replace("\r", " ") if pd.notna(x) else None)
                    sheet_data[sheet_name] = df
                all_sheets[fname] = sheet_data
                print(f"✅ All sheets loaded raw for '{fname}'")
            except Exception as e:
                print(f"❌ Failed to process file '{fname}': {e}")
    return all_sheets

# Load glossary target columns from Delta table (change as needed)
def load_glossary_targets(target_col: str = GLOSSARY_TABLE_COLUMN,
                         table: str = GLOSSARY_TABLE) -> List[str]:
    """
    Load target column names from glossary table for mapping.

    Queries the glossary Delta table to get list of valid target columns
    for semantic mapping. Adds "None" option for unmapped columns.
    """
    try:
        df = spark.sql(f"SELECT DISTINCT {target_col} FROM {table}")
        targets = [row[target_col] for row in df.collect() if row[target_col]]
        targets = sorted(set(targets))
    except Exception as e:
        print(f"❌ Error loading glossary targets: {e}")
        targets = []
    # Add the "None" option for unmapped/extra columns
    if "None" not in targets:
        targets = ["None"] + targets
    return targets

# Example usage:
glossary_targets = load_glossary_targets()
print("Glossary Target List:", glossary_targets[:5], "...")

#======🤖 AI Processing Pipeline======

def process_sheet_content_aware_with_tokens(file_name: str, sheet_name: str, 
                                          df: pd.DataFrame, client,
                                          show_header_samples: bool = True,
                                          show_summary_prompt: bool = True,
                                          chunk_size: int = DEFAULT_CHUNK_SIZE,
                                          model_name: str = DEFAULT_MODEL_NAME) -> Dict[str, Any]:
    """
    Main AI processing orchestrator for Excel sheet analysis.
    
    Processes Excel sheet through complete AI pipeline:
    1. Converts DataFrame to JSON chunks
    2. Analyzes each chunk with GPT for table structure
    3. Aggregates chunks into sheet-level summary
    4. Standardizes headers for each detected table
    5. Extracts and registers Spark temporary views
    
    Args:
        file_name (str): Source Excel file name
        sheet_name (str): Sheet name being processed
        df (pd.DataFrame): Full sheet data as DataFrame
        client: Azure OpenAI client for API calls
        show_header_samples (bool): Whether to display sample data
        show_summary_prompt (bool): Whether to show summary output
        chunk_size (int): Rows per chunk for processing
        model_name (str): GPT model to use
        
    Returns:
        Dict[str, Any]: Complete processing results with metadata and headers
        
    Example:
        >>> result = process_sheet_content_aware_with_tokens(
        ...     "premium_report.xlsx", "Summary", df, client
        ... )
        >>> # Returns: {"meta_summary": {...}, "all_standardized_headers": [...]}
    """

    print(f"\n🔍 Processing: {file_name} / {sheet_name}")

    # Step 1: DataFrame → JSON for LLM
    raw_json_rows_full = df_to_json_rows(df)
    chunked = list(chunk_table_by_content(df, chunk_size=chunk_size))
    raw_json_chunks = [df_to_json_rows(chunk_df) for chunk_df in chunked]
    print_chunk_token_sizes(raw_json_chunks, model=model_name, prefix=">>> ")

    # Step 2: Summarize each chunk with retry logic
    chunk_summaries = []
    start_time = time.time()
    token_bucket = 0
    for chunk_idx, (chunk_df, chunk_rows) in enumerate(zip(chunked, raw_json_chunks)):
        summary_data = summarize_chunk_with_retry(
            chunk_rows, client, file_name, sheet_name, chunk_idx, len(chunked), chunk_df, model_name=model_name
        )
        time.sleep(1)
        if summary_data:
            chunk_summaries.append(summary_data)

    if not chunk_summaries:
        print("❌ No valid chunk summaries generated. Skipping sheet.")
        return

    # Step 3: Meta-summarize (Prompt 2)
    combined_summary = meta_summarize_chunks_with_gpt(chunk_summaries, client, file_name, sheet_name)
    if show_summary_prompt:
        print("\n=== AGGREGATED SHEET SUMMARY ===")
        print(json.dumps(combined_summary, indent=2, ensure_ascii=False))
    if not combined_summary:
        print("❌ Skipping extraction step due to summary error.")
        return

    # Step 4: Per-table header flattening/standardization and table extraction
    tables_meta = combined_summary.get("tables", [])
    if not tables_meta:
        print("❌ No tables found in meta-summary!")
        return

    all_standardized_headers = []
    for table_idx, table_meta in enumerate(tables_meta):
        standardized_headers = process_single_table(
            df, table_meta, file_name, sheet_name, client, show_header_samples
        )
        all_standardized_headers.append(standardized_headers)

        # --- Optional: Extract Spark temp view
        file_stub = safe_view_name(file_name)
        sheet_stub = safe_view_name(sheet_name)
        table_views = extract_tables_and_register_temp_views(
            df=df,
            tables_meta=tables_meta,
            all_standardized_headers=all_standardized_headers,
            spark=spark,
            file_stub=file_stub,
            sheet_stub=sheet_stub,
            view_prefix="tmp"
        )
        for view_name, table_df in table_views:
            print(f"\n🔹 {view_name} (showing first and last 10 rows):")
            display(table_df.head(10))
            display(table_df.tail(10))

    return {
        "meta_summary": combined_summary,
        "all_standardized_headers": all_standardized_headers,
        "chunk_summaries": chunk_summaries
    }

#===================================================================


def gpt_summarize_excel_structure_via_function(raw_json_rows: List[Dict],
                                              client, file_name: str = None,
                                              sheet_name: str = None,
                                              raw_row_count: int = None,
                                              chunk_index: int = None,
                                              total_chunks: int = None,
                                              chunk_start_row: int = None,
                                              chunk_end_row: int = None) -> Dict[str, Any]:
    """
    Use GPT to analyze single chunk of Excel data for table structure.
    
    Sends chunk data to GPT with function calling to identify:
    - Table boundaries and regions
    - Header rows and column structure
    - Data types and quality issues
    - Noise, summary, and metadata rows
    
    Args:
        raw_json_rows (List[Dict]): Chunk data as JSON rows
        client: Azure OpenAI client
        file_name (str): Source file name for context
        sheet_name (str): Sheet name for context
        raw_row_count (int): Number of rows in chunk
        chunk_index (int): Index of this chunk (0-based)
        total_chunks (int): Total number of chunks
        chunk_start_row (int): Starting row index in original sheet
        chunk_end_row (int): Ending row index in original sheet
        
    Returns:
        Dict[str, Any]: Structured analysis results from GPT
        
    Example:
        >>> result = gpt_summarize_excel_structure_via_function(
        ...     chunk_data, client, "file.xlsx", "Sheet1", 50, 0, 3, 0, 49
        ... )
        >>> # Returns GPT function call results with table structure
    """
    """
    Use LLM to summarize a single chunk of Excel sheet content, for later aggregation.
    """
    context = ""
    if file_name or sheet_name:
        context += (
            f"You are analyzing a **CHUNK** of an Excel sheet, not the whole file.\n"
            f"- File: '{file_name}' | Sheet: '{sheet_name}'\n"
        )
    if chunk_index is not None and total_chunks is not None:
        context += (
            f"- This is chunk {chunk_index+1} of {total_chunks} for this sheet, "
            f"covering rows {chunk_start_row} to {chunk_end_row} (0-based indices).\n"
        )
    if raw_row_count:
        context += f"- This chunk contains {raw_row_count} rows.\n"
    context += (
        "REMEMBER: You are being sent only a part (chunk) of the sheet. "
        "You **must not** assume you see the whole table, all headers, or the full sheet structure. "
        "Summarize ONLY what you see in this chunk, as accurately as possible."
    )

    system_message = {
        "role": "system",
        "content": (
            "You are an expert insurance data analyst. "
            "You analyze messy Excel sheets (converted to JSON rows) to detect structured data tables. "
            "Your goal is to classify rows, identify all tables, and support accurate data extraction."
        )
    }
    user_message = {
        "role": "user",
        "content": f"""
{context}

You are provided with a structured JSON representation of a CHUNK of an Excel sheet.
Each row is a dictionary:
- `row_index`: 0-based row number
- `values`: list of stringified cell values in that row

Your task is to **summarize the structure** you observe in this chunk to guide downstream table extraction.

Return the following:
- `estimated_rows`: Total number of rows likely containing tabular data (in this chunk)
- `number_of_tables`: Count of clearly separated tables (in this chunk)
- `table_zones`: List of 'start_row, end_row' ranges (within this chunk)
- `header_rows`: List of row indices used as column headers (within this chunk)
- `summary_rows`: List of row indices with totals, subtotals, or aggregation summaries (within this chunk)
- `noise_rows`: List of rows that are metadata, notes, title blocks, or empty (within this chunk)
- `multi_level_headers`: True if any table uses stacked/merged headers (in this chunk)
- `overlapping_tables`: True if table zones visually overlap or are hard to separate (in this chunk)
- `data_end_row_estimated`: Last row index likely containing tabular data (in this chunk)
- `rationale`: A detailed explanation for your classification logic, with reference to row index patterns or observed structures in this chunk.

Guidelines:
- Tables are areas of consistently shaped rows (same number of columns), not just numeric content.
- Header rows may appear before each table, and may span multiple lines.
- Noise rows include empty rows, sheet titles, footnotes, or row descriptions unrelated to the main table.
- Summary rows often contain words like 'Total', 'Sum', etc., or end sections.
- Be cautious of subtables in one block: count them separately if they have different headers or layout.
- It's okay to infer structure from repeated shapes, even if no column titles are obvious.
- **Do NOT refer to rows or data not in this chunk.**

Here is the chunk content:
```json
{json.dumps(raw_json_rows, indent=2)}
"""
    }
    try:
        response = client.chat.completions.create(
            model="gpt-4.1",
            messages=[system_message, user_message],
            functions=[summarize_function],
            function_call={"name": "summarize_excel_preview"},
            temperature=0.0
        )
        structured_output = json.loads(response.choices[0].message.function_call.arguments)
        return structured_output
    except Exception as e:
        print(f"❌ GPT summarization failed: {e}")
        return None
    
#===================================================================

def meta_summarize_chunks_with_gpt(chunk_summaries: List[Dict], client,
                                 file_name: str, sheet_name: str) -> Dict[str, Any]:
    """
    Combine chunk-level summaries into single sheet-level structure.
    
    Takes individual chunk analyses and uses GPT to merge/deduplicate:
    - Combines adjacent table regions
    - Resolves overlapping boundaries
    - Creates final table metadata
    - Identifies sheet-level patterns
    
    Args:
        chunk_summaries (List[Dict]): List of chunk analysis results
        client: Azure OpenAI client
        file_name (str): Source file name
        sheet_name (str): Sheet name
        
    Returns:
        Dict[str, Any]: Unified sheet-level table structure
        
    Example:
        >>> summary = meta_summarize_chunks_with_gpt(
        ...     [chunk1_result, chunk2_result], client, "file.xlsx", "Sheet1"
        ... )
        >>> # Returns: {"tables": [...], "estimated_rows": 150, ...}
    """
    prompt = f"""
You are an expert in Excel table structure detection.
You are given chunk-level summaries for the file '{file_name}' and sheet '{sheet_name}' (see below).

Chunks may report a table in every chunk, but in reality, these may be parts of the same large table, or there may be multiple tables. Your job is to merge and deduplicate chunk-level information.

**Your task:**
- Merge all adjacent, abutting, or overlapping table_zones as a single table where appropriate.
- Split out distinct tables if separated by noise, gaps, or repeated header rows (do not merge).
- For each table, deduplicate and return:
    - table_zone: object with "start_row" and "end_row" (0-based indices)
    - header_rows: list of row indices with column headers for this table (should not include any data row; only true headers, even if multi-level)
    - summary_rows: list of row indices with totals, subtotals, or aggregation rows for this table
    - noise_rows: list of row indices that are titles, footnotes, empty, or metadata for this table only (not for other tables)
    - multi_level_headers: true if this table uses stacked/merged headers
    - overlapping_tables: true if the table zone overlaps another or is hard to separate
    - data_end_row_estimated: last likely data row in this table
    - rationale: explanation of your merging/splitting/classification logic for this table

Guidance for Header Row Detection:
- Header rows must contain labels, categories, or field names. Do NOT include the first data row, any row with mostly numbers, totals, or values.
- For multi-level headers, all header rows must be directly above the first data row, with no values or totals.
- If in doubt, err on the side of only including rows that are clearly header/label rows, not data.

- Return a JSON object with:
    - estimated_rows: sum or best estimate of all table rows combined
    - number_of_tables: minimal actual count after merging
    - tables: a list of table objects as above (one per table detected, not per chunk)
    - rationale: concise overall justification for your result

Chunk summaries:
{json.dumps(chunk_summaries, indent=2)}
"""
    response = client.chat.completions.create(
        model="gpt-4.1",
        messages=[{"role": "user", "content": prompt}],
        functions=[meta_function],
        function_call={"name": "meta_summarize_excel_chunks"},
        temperature=0.0,
    )
    try:
        return json.loads(response.choices[0].message.function_call.arguments)
    except Exception as e:
        print("❌ JSON decoding error in meta-summarize. Raw output:")
        print(response.choices[0].message.content)
        print(e)
        return None

#==============================================================

def gpt_flatten_and_standardize_headers(mini_json: str, n_header_rows: int,
                                      file_name: str, sheet_name: str,
                                      client, model: str = "gpt-4.1") -> List[Dict[str, Any]]:
    """
    Use GPT to flatten multi-level headers and standardize to snake_case.
    
    Processes header rows to create standardized column definitions:
    - Flattens multi-level/merged headers
    - Converts to snake_case naming
    - Infers data types from sample data
    - Provides descriptions and confidence ratings
    
    Args:
        mini_json (str): JSON representation of header + sample rows
        n_header_rows (int): Number of header rows to process
        file_name (str): Source file for context
        sheet_name (str): Sheet name for context
        client: Azure OpenAI client
        model (str): GPT model to use
        
    Returns:
        List[Dict[str, Any]]: Standardized header definitions
        
    Example:
        >>> headers = gpt_flatten_and_standardize_headers(
        ...     json_data, 2, "file.xlsx", "Sheet1", client
        ... )
        >>> # Returns: [{"original_header": "Premium Amount", 
        >>> #              "standardized_header": "premium_amount", ...}, ...]
    """
    user_prompt = f"""
You are an expert in insurance and financial data modeling.
Given a mini-table from an Excel sheet as a JSON array of arrays (each inner array is a row),
with the first {n_header_rows} rows as header rows and the rest as representative data rows,
produce a single, flattened, standardized list of column names.

**Instructions:**
- For each column (in order), output one object as described, never skipping any column.
- If all header rows for a column are blank:
  - Check if the column has actual data in the rows
  - If NO data: use empty_column_N (N=1-based col index)
  - If HAS data: analyze the data pattern and infer an appropriate insurance/reinsurance field name based on:
    * Data type (numeric, text, dates, percentages, codes)
    * Data patterns and formats
    * Context from surrounding columns
    * Common insurance and reinsurance terminology
    * Set notes: "header missing - name inferred from data pattern"
    * Set confidence_reasoning: "Data pattern suggests [your reasoning]"
- Otherwise, flatten/merge all header rows with ' | ', standardize, and fill as required.
- Use context from data rows for disambiguation.
- Always write column descriptions using detailed insurance and reinsurance terminology.

Mini-table (headers + data):
{mini_json}

Return a JSON array of objects, one per column, in order.
"""
    system_message = {
        "role": "system",
        "content": (
            "You are a highly detail-oriented data modeler specializing in standardizing Excel table headers for data ingestion. "
            "Handle edge cases like stacked headers, notes, merged cells, or blank columns carefully. "
            "Always write column descriptions using detailed insurance and reinsurance terminology, referencing common reinsurance business scenarios, terms, and contracts wherever appropriate."
        ),
    }

    try:
        response = client.chat.completions.create(
            model=model,
            messages=[system_message, {"role": "user", "content": user_prompt}],
            functions=[flatten_function],
            function_call={"name": "flatten_and_standardize_headers"},
            temperature=0.0
        )
        arguments = response.choices[0].message.function_call.arguments
        result = json.loads(arguments) if isinstance(arguments, str) else arguments
        if isinstance(result, dict) and "columns" in result:
            return result["columns"]
        return result
    except Exception as e:
        print(f"❌ GPT header flattening/standardization failed: {e}")
        return []
    
#=========================

def summarize_chunk_with_retry(chunk_rows: List[Dict], client, file_name: str,
                              sheet_name: str, chunk_idx: int, total_chunks: int,
                              chunk_df: pd.DataFrame, max_attempts: int = 3,
                              model_name: str = "gpt-4.1") -> Optional[Dict[str, Any]]:
    """
    Robust chunk processing with retry logic for API failures.
    
    Wraps chunk analysis with retry logic to handle:
    - Rate limiting (429 errors)
    - Temporary API failures
    - Token limit issues
    
    Args:
        chunk_rows (List[Dict]): Chunk data as JSON
        client: Azure OpenAI client
        file_name (str): Source file name
        sheet_name (str): Sheet name
        chunk_idx (int): Chunk index
        total_chunks (int): Total chunks
        chunk_df (pd.DataFrame): Chunk as DataFrame
        max_attempts (int): Maximum retry attempts
        model_name (str): GPT model to use
        
    Returns:
        Optional[Dict[str, Any]]: Analysis results or None if all retries fail
        
    Example:
        >>> result = summarize_chunk_with_retry(
        ...     chunk_data, client, "file.xlsx", "Sheet1", 0, 3, chunk_df
        ... )
        >>> # Returns analysis or None after retries
    """
    prompt_json = json.dumps(chunk_rows, indent=2)
    n_tokens = estimate_tokens(prompt_json, model=model_name)
    print(f"\nProcessing chunk {chunk_idx+1}/{total_chunks} (rows {chunk_df.index[0]}–{chunk_df.index[-1]}) ...")
    print(f"  Token count for this chunk: {n_tokens:,}")

    for attempt in range(max_attempts):
        try:
            summary_data = gpt_summarize_excel_structure_via_function(
                chunk_rows,
                client,
                file_name,
                sheet_name,
                raw_row_count=len(chunk_rows),
                chunk_index=chunk_idx,
                total_chunks=total_chunks,
                chunk_start_row=int(chunk_df.index[0]),
                chunk_end_row=int(chunk_df.index[-1])
            )
            print(f"✅ Chunk {chunk_idx+1}/{total_chunks} summarized.")
            return summary_data
        except Exception as e:
            if "429" in str(e):
                wait_time = 70 + attempt * 15
                print(f"❌ GPT summarization failed: {e}")
                print(f"⚠️ 429 Rate limit, sleeping {wait_time}s before retry (attempt {attempt+1}/{max_attempts})...")
                time.sleep(wait_time)
            else:
                print(f"❌ GPT summarization failed: {e}")
                break
    print(f"❌ Skipping chunk {chunk_idx+1} (rows {chunk_df.index[0]}–{chunk_df.index[-1]}) after retries.")
    return None

#========📊 Table Extraction Functions==========

def extract_table_from_metadata_and_headers(df: pd.DataFrame, table_meta: Dict,
                                           standardized_headers: List[Dict],
                                           file_name: str, sheet_name: str,
                                           table_index: int, spark,
                                           file_stub: str, sheet_stub: str,
                                           view_prefix: str = "tmp") -> None:
    """
    Extract clean table from DataFrame using AI-generated metadata.
    
    Uses table boundaries and standardized headers to extract clean data:
    - Applies row/column boundaries from metadata
    - Maps original to standardized column names
    - Handles data type conversion
    - Registers as Spark temporary view
    
    Args:
        df (pd.DataFrame): Full sheet DataFrame
        table_meta (Dict): Table boundary metadata from AI
        standardized_headers (List[Dict]): Standardized column definitions
        file_name (str): Source file name
        sheet_name (str): Sheet name
        table_index (int): Table index within sheet
        spark: Spark session
        file_stub (str): Safe file name for view
        sheet_stub (str): Safe sheet name for view
        view_prefix (str): Prefix for temporary view name
        
    Returns:
        None: Creates Spark temporary view as side effect
        
    Example:
        >>> extract_table_from_metadata_and_headers(
        ...     df, table_meta, headers, "file.xlsx", "Sheet1", 0, 
        ...     spark, "file", "sheet1", "tmp"
        ... )
        >>> # Creates view: tmp_file_sheet1_table_0
    """
    """
    Extract table block using table_meta + standardized_headers (from cache or LLM).
    Register temp view (optional).
    """
    zone = table_meta.get("table_zone", table_meta)  # Support both styles
    start_row, end_row = zone["start_row"], zone["end_row"]
    start_col, end_col = zone.get("start_column", 0), zone.get("end_column", df.shape[1] - 1)

    # Exclude header/summary/noise rows if present
    header_rows_idx = set(table_meta.get("header_rows", []))
    summary_rows_idx = set(table_meta.get("summary_rows", []))
    noise_rows_idx = set(table_meta.get("noise_rows", []))
    keep_rows = [
        i for i in range(start_row, end_row + 1)
        if i not in header_rows_idx and i not in summary_rows_idx and i not in noise_rows_idx
    ]
    if not keep_rows:
        print(f"❌ No data rows found for {file_name}/{sheet_name} table {table_index+1}")
        return None

    # Extract data rows as DataFrame
    data = [df.iloc[i, start_col:end_col+1].tolist() for i in keep_rows]
    # Assign standardized headers (from cache or LLM)
    col_names = [col['standardized_header'] for col in standardized_headers]
    # Pad data rows if needed
    clean_data = [
        row[:len(col_names)] + [None]*(len(col_names)-len(row))
        if len(row) < len(col_names) else row[:len(col_names)]
        for row in data
    ]
    table_df = pd.DataFrame(clean_data, columns=col_names)

    # Register temp view (optional)
    if spark is not None and file_stub and sheet_stub:
        view_name = f"{view_prefix}_{file_stub}_{sheet_stub}_table{table_index+1}".replace("-", "_").replace(" ", "_").replace(".", "_")
        spark.createDataFrame(table_df).createOrReplaceTempView(view_name)
        print(f"✅ Temp view registered: {view_name} ({table_df.shape[0]} rows, {table_df.shape[1]} columns)")
    else:
        print(f"✅ Extracted table for {file_name}/{sheet_name} (Table {table_index+1}) with {table_df.shape[0]} rows.")

    return table_df


def extract_tables_and_register_temp_views(df: pd.DataFrame, tables_meta: List[Dict],
                                          all_standardized_headers: List[List[Dict]],
                                          spark, file_stub: str, sheet_stub: str,
                                          view_prefix: str = "tmp") -> List[Tuple[str, pd.DataFrame]]:
    """
    Extract all tables from sheet and register as Spark views.
    
    Processes multiple tables detected in single sheet:
    - Extracts each table using metadata
    - Creates standardized column mappings
    - Registers multiple temporary views
    - Returns view names and DataFrames
    
    Args:
        df (pd.DataFrame): Full sheet DataFrame
        tables_meta (List[Dict]): List of table metadata
        all_standardized_headers (List[List[Dict]]): Headers for each table
        spark: Spark session
        file_stub (str): Safe file name
        sheet_stub (str): Safe sheet name
        view_prefix (str): View name prefix
        
    Returns:
        List[Tuple[str, pd.DataFrame]]: List of (view_name, dataframe) tuples
        
    Example:
        >>> views = extract_tables_and_register_temp_views(
        ...     df, [table1_meta, table2_meta], [headers1, headers2],
        ...     spark, "file", "sheet1", "tmp"
        ... )
        >>> # Returns: [("tmp_file_sheet1_table_0", df1), ("tmp_file_sheet1_table_1", df2)]
    """
    view_results = []
    for idx, (table_meta, std_headers) in enumerate(zip(tables_meta, all_standardized_headers)):
        # --- Table boundaries ---
        start = table_meta['table_zone']['start_row']
        end = table_meta['table_zone']['end_row']
        header_rows_idx = table_meta.get('header_rows', [])
        summary_rows_idx = set(table_meta.get('summary_rows', []))
        noise_rows_idx = set(table_meta.get('noise_rows', []))

        # --- Collect data rows, skipping header/summary/noise ---
        data_rows = []
        for i in range(start, end + 1):
            if i in header_rows_idx or i in summary_rows_idx or i in noise_rows_idx:
                continue
            row = df.iloc[i, :].tolist()
            data_rows.append(row)

        # --- Assign column headers ---
        col_names = [col['standardized_header'] for col in std_headers]
        n_cols_headers = len(col_names)

        clean_data_rows = []
        for row in data_rows:
            if len(row) > n_cols_headers:
                clean_data_rows.append(row[:n_cols_headers])
            elif len(row) < n_cols_headers:
                clean_data_rows.append(row + [None] * (n_cols_headers - len(row)))
            else:
                clean_data_rows.append(row)

        # --- Assemble DataFrame
        table_df = pd.DataFrame(clean_data_rows, columns=col_names)

        # --- View name: unique per table
        view_name = f"{view_prefix}_{file_stub}_{sheet_stub}_table{idx+1}"
        view_name = view_name.replace("-", "_").replace(" ", "_").replace(".", "_")
        spark.createDataFrame(table_df).createOrReplaceTempView(view_name)
        print(f"✅ Temp view registered: {view_name} ({table_df.shape[0]} rows, {table_df.shape[1]} columns)")
        print("Columns:", col_names)
        view_results.append((view_name, table_df))

    return view_results  # List of (view_name, df) for all tables

def ensure_metadata_and_extract(df: pd.DataFrame, table_meta: Dict,
                               std_headers: List[Dict], file_name: str,
                               sheet_name: str, table_idx: int, spark) -> None:
    """
    Extract table with automatic view naming (convenience wrapper).
    
    Wrapper around extract_table_from_metadata_and_headers that
    automatically generates safe view names from file/sheet names.
    
    Args:
        df (pd.DataFrame): Full sheet DataFrame
        table_meta (Dict): Table metadata
        std_headers (List[Dict]): Standardized headers
        file_name (str): Source file name
        sheet_name (str): Sheet name
        table_idx (int): Table index
        spark: Spark session
        
    Returns:
        None: Creates Spark temporary view
        
    Example:
        >>> ensure_metadata_and_extract(
        ...     df, table_meta, headers, "Premium Report.xlsx", "Summary", 0, spark
        ... )
        >>> # Creates view with auto-generated safe name
    """
    """Extract table, cache metadata if new, and register Spark view."""
    file_stub = safe_view_name(file_name)
    sheet_stub = safe_view_name(sheet_name)
    view_prefix = "tmp"
    extract_table_from_metadata_and_headers(
        df=df,
        table_meta=table_meta,
        standardized_headers=std_headers,
        file_name=file_name,
        sheet_name=sheet_name,
        table_index=table_idx,
        spark=spark,
        file_stub=file_stub,
        sheet_stub=sheet_stub,
        view_prefix=view_prefix
    )

def process_single_table(df: pd.DataFrame, table_meta: Dict, file_name: str,
                        sheet_name: str, client, show_header_samples: bool = True) -> List[Dict[str, Any]]:
    """
    Process individual table for header standardization.
    
    Focuses on single table within sheet:
    - Extracts table region using metadata
    - Samples header and data rows
    - Calls GPT for header standardization
    - Returns standardized column definitions
    
    Args:
        df (pd.DataFrame): Full sheet DataFrame
        table_meta (Dict): Table metadata from AI analysis
        file_name (str): Source file name
        sheet_name (str): Sheet name
        client: Azure OpenAI client
        show_header_samples (bool): Whether to display samples
        
    Returns:
        List[Dict[str, Any]]: Standardized header definitions
        
    Example:
        >>> headers = process_single_table(
        ...     df, table_meta, "file.xlsx", "Sheet1", client
        ... )
        >>> # Returns standardized column definitions for table
    """
    # Extract zone/rows
    zone = table_meta["table_zone"]
    data_start_row = zone["start_row"]
    data_end_row = zone["end_row"]
    header_rows_idx = table_meta.get("header_rows", [])
    summary_rows_idx = table_meta.get("summary_rows", [])
    noise_rows_idx = table_meta.get("noise_rows", [])

    table_for_sampling = {
        "data_start_row": data_start_row,
        "data_end_row": data_end_row,
        "header_rows": header_rows_idx,
        "summary_rows": summary_rows_idx,
        "noise_rows": noise_rows_idx,
        "column_headers": [],
    }
    header_rows, data_rows = sample_table_rows(df, table_for_sampling)
    df_disp = pd.DataFrame(header_rows + data_rows)

    if show_header_samples:
        display(HTML(f"<b>Table ({file_name} / {sheet_name})</b>"))
        display(df_disp)

    mini_json = df_disp.to_json(orient="values")

    standardized_headers = gpt_flatten_and_standardize_headers(
        mini_json=mini_json,
        n_header_rows=len(header_rows),
        file_name=file_name,
        sheet_name=sheet_name,
        client=client
    )
    print("Standardized columns (from LLM):")
    print(json.dumps(standardized_headers, indent=2, ensure_ascii=False))
    return standardized_headers