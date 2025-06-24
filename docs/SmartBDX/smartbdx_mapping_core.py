"""
SmartBDX Mapping Core Module
===========================

Core column mapping logic for semantic mapping of bordereaux columns to target schema.
Handles main orchestration, LLM enhancement, and mapping workflows.

Dependencies: smartbdx_config, smartbdx_utilities, smartbdx_mapping_data
"""

# === IMPORTS ===

# Standard Library
import json
import time
import re
from typing import List, Dict, Any, Optional, Tuple, Union

# Third Party
import pandas as pd

# --- Vector Search Import: SAFE for non-Databricks environments ---
try:
    from databricks.vector_search.client import VectorSearchClient
    VECTOR_SEARCH_AVAILABLE = True
except ImportError:
    VectorSearchClient = None
    VECTOR_SEARCH_AVAILABLE = False

# SmartBDX Modules
from smartbdx_config import (client, 
    GPT_DEPLOYMENT,
    DEFAULT_TARGET_TABLE_ENDPOINT,
    DEFAULT_TARGET_TABLE_INDEX,
    DEFAULT_SOURCE_TABLE_INDEX,
    DEFAULT_SOURCE_TABLE_ENDPOINT
)

from smartbdx_utilities import (
    extract_base_file_name,
    compute_structure_signature_from_headers,
    to_list_of_float

)
from smartbdx_mapping_data import (
    enrich_and_embed_source_columns,
    save_embeddings_to_delta_source_batch,
    get_column_primary_key,
    build_enriched_embedding_text,
    get_openai_embedding_batch,
    save_metadata_to_cache,
    load_metadata_from_cache,
    log_structure_change,
    load_json_if_exists,
    save_json
)

# === CONSTANTS ===

# Regex patterns used by parse_llm_mapping_response and inline filtering
EMPTY_COL_PATTERN = re.compile(r"^empty_column_\d*$", re.IGNORECASE)
JSON_PATTERN = re.compile(r'\{.*\}', re.DOTALL)  
PREFIX_PATTERN = re.compile(r'^(glossary\.|target\.)', re.IGNORECASE)

# Default thresholds
DEFAULT_VECTOR_THRESHOLD = 0.90
DEFAULT_LLM_BATCH_SIZE = 10
DEFAULT_TOP_K = 3

# === CORE MAPPING FUNCTIONS ===

def process_table_mapping(
    df: pd.DataFrame,
    file_name: str,
    sheet_name: str,
    table_idx: int,
    table_meta: Dict[str, Any],
    std_headers: List[Dict[str, Any]],
    glossary_targets: List[str],
    client: Any,
    vs_client: Optional[VectorSearchClient] = None,
    endpoint_name: str = DEFAULT_SOURCE_TABLE_ENDPOINT,
    index_name: str = DEFAULT_SOURCE_TABLE_INDEX,
    vector_threshold: float = DEFAULT_VECTOR_THRESHOLD,
    llm_batch_size: int = DEFAULT_LLM_BATCH_SIZE
) -> List[Dict[str, Any]]:
    """
    Main mapping orchestrator for semantic column mapping with hybrid vector search + LLM enhancement.
    
    Process semantic mapping for a single table with complete pipeline:
    1. Filters empty/meaningless columns using inline EMPTY_COL_PATTERN matching:
       valid_headers = [h for h in all_headers if not EMPTY_COL_PATTERN.match(h.get('standardized_header', ''))]
       empty_headers = [h for h in all_headers if EMPTY_COL_PATTERN.match(h.get('standardized_header', ''))]
    2. Enriches source columns with embeddings via enrich_and_embed_source_columns
    3. Performs vector similarity search against glossary
    4. Enhances low-confidence matches with LLM analysis
    5. Returns structured mapping results ready for UI review
    
    Args:
        df: DataFrame of the full sheet
        file_name, sheet_name: source identifiers
        table_idx: index of the table in the sheet
        table_meta: metadata for this table including zone info
        std_headers: list of standardized header dictionaries
        glossary_targets: list of valid target column names from glossary
        client: Azure OpenAI client for LLM enhancement
        vs_client: Vector search client for similarity matching
        endpoint_name: Vector search endpoint name
        index_name: Vector search index name
        vector_threshold: Confidence threshold for vector matches (default 0.90)
        llm_batch_size: Batch size for LLM enhancement requests (default 10)
        
    Returns:
        List of mapping dictionaries ready for UI approval, each containing:
        - target_column: Mapped target or "None"
        - needs_review: Boolean flag for human review
        - proposed_targets: Full glossary target list
        - notes: Context and reasoning
        
    Note: Currently disabled in production but code exists and is functional
    """
    try:
        # Validate required parameters
        if vs_client is None:
            raise ValueError("VectorSearchClient is required but was not provided")
            
        zone = table_meta.get("table_zone")
        if not zone:
            raise ValueError("table_meta missing 'table_zone' key")

        header_rows_idx = table_meta.get("header_rows", [])
        if not isinstance(header_rows_idx, list):
            raise ValueError("'header_rows' should be a list")

        n_cols = zone.get("end_column", df.shape[1] - 1) - zone.get("start_column", 0) + 1

        # Extract header rows based on zone and header row indices
        header_rows = [
            df.iloc[row_idx, zone.get("start_column", 0):zone.get("end_column", df.shape[1] - 1) + 1].tolist()
            for row_idx in header_rows_idx
            if 0 <= row_idx < len(df)
        ]

        # Compute structure signature for caching
        structure_signature = compute_structure_signature_from_headers(header_rows, n_cols)
        base_file_name = extract_base_file_name(file_name)

        cached = None
        try:
            cached = load_metadata_from_cache(base_file_name, sheet_name, structure_signature)
        except Exception as e:
            print(f"⚠️ Warning: Failed to load cache - {e}")

        # ✅ Filter empty columns before processing
        import re
        EMPTY_COL_PATTERN = re.compile(r"^empty_column_\d+$", re.IGNORECASE)
        
        if cached:
            # Get headers from cache
            all_headers = cached["standardized_headers"]
        else:
            # Use provided headers
            all_headers = std_headers
        
        # Separate valid headers from empty ones
        valid_headers = [h for h in all_headers if not EMPTY_COL_PATTERN.match(h.get('standardized_header', ''))]
        empty_headers = [h for h in all_headers if EMPTY_COL_PATTERN.match(h.get('standardized_header', ''))]
        
        print(f"📊 Processing {len(valid_headers)} valid columns, skipping {len(empty_headers)} empty columns for mapping")

        # Only process valid headers for embedding and enrichment
        if valid_headers:
            if cached:
                # ✅ FIXED: Pass file_name and sheet_name to fix null values (only for valid headers)
                valid_headers = enrich_and_embed_source_columns(
                    valid_headers, client, vs_client, endpoint_name, index_name,
                    file_name=file_name, sheet_name=sheet_name
                )
            else:
                # ✅ FIXED: Pass file_name and sheet_name to fix null values (only for valid headers)
                valid_headers = enrich_and_embed_source_columns(
                    valid_headers, client, vs_client, endpoint_name, index_name,
                    file_name=file_name, sheet_name=sheet_name
                )
                try:
                    # Save all headers (including empty ones) to cache for structure consistency
                    save_metadata_to_cache(
                        file_name=file_name,
                        base_file_name=base_file_name,
                        sheet_name=sheet_name,
                        structure_signature=structure_signature,
                        table_meta_json=table_meta,
                        standardized_headers_json=all_headers  # Save all headers for structure consistency
                    )
                    log_structure_change(
                        file_name=file_name,
                        base_file_name=base_file_name,
                        sheet_name=sheet_name,
                        structure_signature=structure_signature,
                        table_meta_json=table_meta,
                        standardized_headers_json=all_headers,
                        change_type="cache_miss",
                        notes="No metadata cache found; table structure may have changed or is new."
                    )
                except Exception as e:
                    print(f"⚠️ Warning: Failed to save metadata cache or log structure change - {e}")

            # --- Semantic mapping with vector search + LLM enhancement (only for valid headers) ---
            # NOTE: Overriding endpoint_name and index_name intentionally here for glossary mapping.
            try:
                mapped_df = enhance_mapping_with_llm(
                    valid_headers,  # ✅ Only process valid headers
                    glossary_targets,
                    file_name,
                    sheet_name,
                    client,
                    vs_client,
                    endpoint_name=DEFAULT_TARGET_TABLE_ENDPOINT,
                    index_name=DEFAULT_TARGET_TABLE_INDEX,
                    vector_threshold=vector_threshold,
                    llm_batch_size=llm_batch_size
                )
            except Exception as e:
                print(f"❌ Error during semantic mapping with LLM: {e}")
                return []
        else:
            # No valid headers to process
            mapped_df = pd.DataFrame()

        # Fill missing mapped_to_target and match_score values
        if not mapped_df.empty:
            mapped_df["mapped_to_target"] = mapped_df["mapped_to_target"].fillna("None")
            mapped_df["match_score"] = mapped_df["match_score"].fillna(0.0)

        # ✅ Add empty headers back to result without processing
        for empty_header in empty_headers:
            empty_row = {
                **empty_header,
                'mapped_to_target': None,
                'match_score': 0.0,
                'needs_human_review': False,  # Don't require review for empty columns
                'mapping_source': 'filtered_empty',
                'notes': f'Empty column ({empty_header.get("standardized_header")}) - excluded from mapping'
            }
            mapped_df = pd.concat([mapped_df, pd.DataFrame([empty_row])], ignore_index=True)

        mappings_for_review = []
        for _, row in mapped_df.iterrows():
            source_info = row.get("mapping_source", "vector_search")
            needs_review_flag = bool(row.get("needs_human_review", True))
            notes = f"Semantic match score: {row['match_score']:.2f}"
            if source_info == "llm_enhanced":
                notes += " (LLM enhanced)"
            elif source_info == "filtered_empty":
                notes = row.get("notes", "Empty column - excluded from mapping")

            mappings_for_review.append({
                **row.to_dict(),
                "target_column": row.get("mapped_to_target") or "None",
                "needs_review": needs_review_flag,
                "proposed_targets": glossary_targets,
                "notes": notes,
            })

        return mappings_for_review

    except Exception as e:
        print(f"❌ Error in process_table_mapping: {e}")
        return []
    
def enhance_mapping_with_llm(
    standardized_headers: List[Dict[str, Any]],
    glossary_targets: List[str],
    file_name: str,
    sheet_name: str,
    client: Any,
    vs_client: VectorSearchClient,
    endpoint_name: str,
    index_name: str,
    vector_threshold: float = 0.80,
    llm_batch_size: int = 10
) -> pd.DataFrame:
    """
    Enhance low-confidence vector mappings using LLM contextual analysis.
    
    Takes standardized headers, performs vector search first, then enhances
    low-confidence matches using GPT-4's understanding of insurance domain context,
    column semantics, and sample data patterns.
    
    Args:
        standardized_headers: List of header dictionaries with embeddings
        glossary_targets: List of valid target column names
        file_name: Source file name for LLM context
        sheet_name: Source sheet name for LLM context
        client: Azure OpenAI client (GPT-4.1)
        vs_client: Vector search client for similarity matching
        endpoint_name: Vector search endpoint name
        index_name: Vector search index name
        vector_threshold: Confidence threshold below which to apply LLM (default 0.80)
        llm_batch_size: Number of columns to process per LLM request (default 10)
        
    Returns:
        Enhanced DataFrame with mappings, updated match_score,
        mapping_source='llm_enhanced', and needs_human_review flags
        
    Process:
        1. Performs vector search using map_with_vector_search() 
        2. Identifies low-confidence mappings below vector_threshold
        3. Filters out empty columns using EMPTY_COL_PATTERN
        4. Batches columns for efficient LLM processing
        5. Provides rich context (names, types, sample values) to LLM
        6. Parses LLM responses using parse_llm_mapping_response()
        7. Validates suggestions against glossary_targets
        8. Updates mappings with LLM suggestions and confidence scores
    """
    # Early validation
    if not standardized_headers:
        print("⚠️ No headers provided for mapping.")
        return pd.DataFrame()
    
    if not glossary_targets:
        print("⚠️ No glossary targets provided.")
        return pd.DataFrame()

    glossary_set = set(glossary_targets)

    # Vector search results with top 1 candidate per column
    mapped_df = map_with_vector_search(
        pd.DataFrame(standardized_headers),
        vs_client,
        endpoint_name=endpoint_name,
        index_name=index_name,
        top_k=3
    )

    # Early exit if dataframe is empty
    if mapped_df.empty:
        print("⚠️ Vector search returned empty results.")
        return mapped_df

    # Identify low-confidence mappings and filter empty columns in one pass
    low_confidence_indices = [
        idx for idx in mapped_df.index
        if ((mapped_df.loc[idx, 'match_score'] < vector_threshold) or 
            pd.isna(mapped_df.loc[idx, 'mapped_to_target'])) and
           not EMPTY_COL_PATTERN.match(mapped_df.loc[idx, 'standardized_header'] or '')
    ]

    if not low_confidence_indices:
        print("✅ All mappings have high confidence or are empty columns. No LLM enhancement needed.")
        return mapped_df

    print(f"🤖 Enhancing {len(low_confidence_indices)} low-confidence mappings with LLM...")

    # Process in batches
    for i in range(0, len(low_confidence_indices), llm_batch_size):
        batch_indices = low_confidence_indices[i:i+llm_batch_size]
        
        # Build batch data more efficiently
        batch_data = []
        for idx in batch_indices:
            row = mapped_df.loc[idx]
            batch_data.append({
                'column_name': row.get('standardized_header', ''),
                'original_header': row.get('original_header', ''),
                'data_type': row.get('data_type', 'unknown'),
                'description': row.get('description', ''),
                'sample_values': (row.get('sample_values', []) or [])[:5],
                'current_vector_match': row.get('mapped_to_target', 'None'),
                'vector_confidence': round(row.get('match_score', 0), 3)
            })

        # Create optimized prompt
        prompt = f"""You are an expert in insurance and reinsurance data mapping.

File: {file_name}
Sheet: {sheet_name}

I need help mapping these columns to the most appropriate glossary target. The vector search gave low-confidence results.

Columns to map:
{json.dumps(batch_data, indent=2)}

Available glossary targets (full list):
{json.dumps(glossary_targets, indent=2)}

Instructions:
- Respond ONLY with exact glossary target keys from the full list above.
- Do NOT provide explanations or additional text.
- If no suitable target exists, respond with exactly "None".

Return mappings in this format (one mapping per line):
column_name -> target_name
"""

        try:
            response = client.chat.completions.create(
                model="gpt-4.1",
                messages=[
                    {"role": "system", "content": "You are an expert in insurance data modeling and bordereaux mapping. Be precise and conservative in your mappings."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.0
            )

            llm_text = response.choices[0].message.content
            if not llm_text:
                print(f"  ⚠️ Empty response from LLM for batch {i//llm_batch_size + 1}")
                continue

            # Extract column names for parsing
            column_names = [d['column_name'] for d in batch_data]
            llm_suggestions = parse_llm_mapping_response(llm_text, column_names)

            # Apply suggestions efficiently with fallback handling
            for idx, col_data in zip(batch_indices, batch_data):
                col_name = col_data['column_name']
                suggested_target = llm_suggestions.get(col_name, "").strip()
                
                # Try exact match first
                if suggested_target in glossary_set or suggested_target == "None":
                    final_target = suggested_target
                else:
                    # Try case-insensitive match
                    glossary_lower = {target.lower(): target for target in glossary_targets}
                    if suggested_target.lower() in glossary_lower:
                        final_target = glossary_lower[suggested_target.lower()]
                    else:
                        # Fallback to None instead of showing error
                        final_target = "None"
                
                # Update multiple columns at once
                mapped_df.loc[idx, ['mapped_to_target', 'match_score', 'mapping_source', 'llm_reasoning']] = [
                    final_target, 0.75, 'llm_enhanced', "LLM suggested based on context and samples"
                ]
                print(f"  ✓ {col_name} -> {final_target} (LLM)")

        except Exception as e:
            print(f"❌ LLM enhancement failed for batch {i//llm_batch_size + 1}: {e}")

    # Update human review flag efficiently
    mapped_df['needs_human_review'] = (
        (mapped_df['match_score'] < vector_threshold) |
        mapped_df['mapped_to_target'].isin([None, 'None']) |
        mapped_df['mapped_to_target'].isna()
    )

    return mapped_df

def parse_llm_mapping_response(
    response_text: str, 
    columns: List[str]
) -> Dict[str, str]:
    """
    Parse LLM response to extract column mappings with format flexibility.
    
    Handles both JSON and line-based response formats from LLM mapping requests.
    Uses pre-compiled regex patterns for efficient parsing and provides
    graceful fallbacks for malformed responses.
    
    Args:
        response_text: Raw text response from LLM
        columns: List of source column names that were sent to LLM
        
    Returns:
        Dictionary mapping column names to target names
        
    Supported Formats:
        - JSON: {"column_name": "target_name"}
        - Line-based: "column_name -> target_name" or "column_name: target_name"
        
    Features:
        - Uses JSON_PATTERN regex for JSON extraction
        - Supports multiple separators (-> : = "to" "maps to")
        - Case-insensitive column matching
        - Handles malformed or incomplete responses
        - Uses PREFIX_PATTERN to clean common prefixes
        
    Example:
        >>> response = "premium_amount -> gross_premium\\ndate_col: as_of_date"
        >>> mappings = parse_llm_mapping_response(response, ["premium_amount", "date_col"])
        >>> print(mappings)
        {'premium_amount': 'gross_premium', 'date_col': 'as_of_date'}
    """
    mappings = {}

    # Attempt JSON extraction using pre-compiled regex
    try:
        json_match = JSON_PATTERN.search(response_text)
        if json_match:
            parsed = json.loads(json_match.group())
            if isinstance(parsed, dict):
                return parsed
    except (json.JSONDecodeError, AttributeError):
        pass

    # Fallback: parse line by line with optimized processing
    lines = response_text.strip().split('\n')
    columns_lower = [col.lower() for col in columns]  # Pre-compute lowercase
    separators = ['->', ':', '=', ' to ', ' maps to ']
    
    for line in lines:
        line_lower = line.lower()
        for i, col in enumerate(columns):
            if columns_lower[i] in line_lower:
                # Look for separators to split mapping
                for sep in separators:
                    if sep in line_lower:
                        parts = line.split(sep, 1)  # Use original line for proper case
                        if len(parts) >= 2:
                            target = parts[1].strip().strip('"').strip("'")
                            # Clean common prefixes
                            target = PREFIX_PATTERN.sub('', target)
                            if target and target.lower() not in ('null', 'none') and len(target) > 2:
                                mappings[col] = target
                                break
                break

    return mappings


def map_with_vector_search(
    standardized_df: pd.DataFrame,
    vs_client: VectorSearchClient,
    endpoint_name: str,
    index_name: str,
    top_k: int = DEFAULT_TOP_K,
    match_threshold: float = 0.75
) -> pd.DataFrame:
    """
    Perform vector similarity search for semantic column mapping.
    
    Uses embeddings to find the most semantically similar target columns
    from the glossary based on vector similarity in the embedding space.
    Handles embedding conversion and similarity scoring.
    
    Args:
        standardized_df: DataFrame with source columns and embeddings
        vs_client: Vector search client instance  
        endpoint_name: Vector search endpoint name
        index_name: Vector search index name
        top_k: Number of similar results to retrieve per query (default 3)
        match_threshold: Minimum similarity score to accept (default 0.75)
        
    Returns:
        DataFrame with added mapped_to_target and match_score columns
        
    Process:
        1. Extracts embeddings using to_list_of_float utility
        2. Queries vector index for each embedding using similarity_search
        3. Handles different result formats from vector search API
        4. Finds best matches above match_threshold
        5. Adds mapped_to_target and match_score columns to DataFrame
        
    Note: Handles missing or invalid embeddings gracefully
    """
    mapped_to_targets = []
    match_scores = []
    index = vs_client.get_index(endpoint_name=endpoint_name, index_name=index_name)
    
    for _, row in standardized_df.iterrows():
        source_emb = row.get("embedding")
        source_emb = to_list_of_float(source_emb) if source_emb else None
        
        if not source_emb or len(source_emb) < 10:
            mapped_to_targets.append(None)
            match_scores.append(0.0)
            continue
        
        try:
            results = index.similarity_search(
                query_vector=source_emb,
                columns=["proposed_name"],
                num_results=top_k
            )
            
            candidate_target = None
            candidate_score = 0.0
            
            # Handle different result formats
            if isinstance(results, dict) and "result" in results and "data_array" in results["result"]:
                data = results["result"]["data_array"]
                if data and len(data[0]) >= 2:
                    candidate_target = data[0][0]
                    candidate_score = data[0][1]
            elif isinstance(results, list) and len(results) > 0:
                candidate_target = results[0].get("proposed_name")
                candidate_score = results[0].get("score", 0.0)
            
            # Enforce threshold
            if candidate_score is not None and candidate_score >= match_threshold:
                mapped_to_targets.append(candidate_target)
                match_scores.append(candidate_score)
            else:
                mapped_to_targets.append(None)
                match_scores.append(0.0)
        
        except Exception as e:
            print(f"Vector search error: {e}")
            mapped_to_targets.append(None)
            match_scores.append(0.0)
    
    standardized_df["mapped_to_target"] = mapped_to_targets
    standardized_df["match_score"] = match_scores
    return standardized_df

def get_mapping_suggestions_for_review(
    mapped_headers: List[Dict[str, Any]], 
    threshold: float = 0.85
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Categorize mappings into auto-approved and needs-review groups.
    
    Analyzes mapping confidence scores and completeness to determine
    which mappings can be automatically approved versus those requiring
    human review and validation.
    
    Args:
        mapped_headers: List of mapping dictionaries with scores
        threshold: Confidence threshold for auto-approval (default 0.85)
        
    Returns:
        Tuple of (can_auto_approve, needs_review) lists
        
    Auto-Approval Criteria:
        - Confidence score >= threshold
        - Valid target mapping exists (not None)
        
    Review Criteria:
        - Low confidence scores below threshold
        - Missing or "None" targets
        
    Example:
        >>> auto, review = get_mapping_suggestions_for_review(mappings, 0.9)
        >>> print(f"Auto-approve: {len(auto)}, Review: {len(review)}")
        Auto-approve: 7, Review: 5
    """
    needs_review = []
    can_auto_approve = []
    for col in mapped_headers:
        # You may want to check not just score, but if mapped_to_target exists
        score = col.get("match_score", 0)
        if col.get("mapped_to_target") and score >= threshold:
            can_auto_approve.append(col)
        else:
            needs_review.append(col)
    return can_auto_approve, needs_review
