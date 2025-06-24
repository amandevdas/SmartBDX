"""
SmartBDX Configuration Module
============================

Central configuration for SmartBDX Excel processing system.
Contains Azure OpenAI settings, function schemas, and system defaults.

Author: SmartBDX Team
Version: 1.0

Note: This module should contain only configuration data and constants.
      No complex logic or processing functions should be placed here.
"""

# === IMPORTS ===
from openai import AzureOpenAI
from pyspark.sql import SparkSession
spark = SparkSession.getActiveSession()

# === AZURE OPENAI CONFIGURATION ===
# SECURITY WARNING: Development Configuration
# This configuration uses a hardcoded API key for development convenience.
# 
# Before production deployment:
# 1. Move API key to Databricks secrets
# 2. Update get_azure_client() to use dbutils.secrets.get()
# 3. Remove hardcoded key from this file
# 4. Add key to .gitignore if using version control
#
# Production pattern:
# AZURE_OPENAI_API_KEY = dbutils.secrets.get("azure-openai", "api-key")

# Service Endpoints and Deployments
AZURE_OPENAI_ENDPOINT = "https://hanna-m9zy01tg-swedencentral.cognitiveservices.azure.com/"
EMBEDDING_DEPLOYMENT = "text-embedding-3-large"
GPT_DEPLOYMENT = "gpt-4.1"
EMBEDDING_API_VERSION = "2024-02-15-preview"
CHAT_API_VERSION = "2024-12-01-preview"

# API Key (HARDCODED FOR DEVELOPMENT)
# TO DO: Move to Databricks secrets for production
AZURE_OPENAI_API_KEY = "6fI4SyDcrQ5sGqwsEsetO6OpG1GMJY7zNX39GFGVr9iuCwisqvizJQQJ99BDACfhMk5XJ3w3AAAAACOGO2Tu"

# Client Initialization
def get_azure_client():
    """Initialize Azure OpenAI client with hardcoded configuration"""
    return AzureOpenAI(
        api_version=CHAT_API_VERSION,
        azure_endpoint=AZURE_OPENAI_ENDPOINT,
        api_key=AZURE_OPENAI_API_KEY,
    )

# Initialize default client
client = get_azure_client()

# === FUNCTION SCHEMAS ===
summarize_function = {
    "name": "summarize_excel_preview",
    "description": "Summarize the structure and layout of an Excel sheet to guide table extraction.",
    "parameters": {
        "type": "object",
        "properties": {
            "estimated_rows": {"type": "integer", "description": "Estimated total number of tabular data rows across all tables."},
            "number_of_tables": {"type": "integer", "description": "Count of distinct table regions in the sheet."},
            "table_zones": {"type": "array", "items": {"type": "object", "properties": {"start_row": {"type": "integer"}, "end_row": {"type": "integer"}}, "required": ["start_row", "end_row"]}, "description": "List of row index ranges for each table."},
            "header_rows": {"type": "array", "items": {"type": "integer"}, "description": "Row indices used as headers (multi-level supported)."},
            "noise_rows": {"type": "array", "items": {"type": "integer"}, "description": "Row indices with noise, titles, notes, or non-tabular metadata."},
            "summary_rows": {"type": "array", "items": {"type": "integer"}, "description": "Row indices with totals, subtotals, or aggregate summaries."},
            "multi_level_headers": {"type": "boolean", "description": "True if headers span multiple rows or are stacked/merged."},
            "overlapping_tables": {"type": "boolean", "description": "True if tables share rows or overlap structurally."},
            "data_end_row_estimated": {"type": ["integer", "null"], "description": "Best guess of the final row containing table data."},
            "rationale": {"type": "string", "description": "Detailed explanation of how tables and roles were identified."}
        },
        "required": [
            "estimated_rows", "number_of_tables", "table_zones", "header_rows", "noise_rows", "multi_level_headers", "overlapping_tables", "data_end_row_estimated", "rationale"
        ]
    }
}

data_extract_function = {
    "name": "extract_excel_structure",
    "description": "Extract structured table information from a messy Excel or CSV preview.",
    "parameters": {
        "type": "object",
        "properties": {
            "tables": {
                "type": "array",
                "description": "List of detected tables",
                "items": {
                    "type": "object",
                    "properties": {
                        "header_row": {"type": "integer"},
                        "header_row_count": {"type": "integer", "description": "Number of stacked/merged header rows before real tabular data starts (typically 2–5)"},
                        "data_start_row": {"type": "integer"},
                        "data_end_row": {"type": "integer"},
                        "start_column": {"type": "integer", "description": "Column index where the table starts"},
                        "end_column": {"type": "integer", "description": "Column index where the table ends"},
                        "column_headers": {"type": "array", "items": {"type": "string"}},
                        "likely_column_types": {"type": "array", "items": {"type": "string"}},
                        "summary_rows": {"type": "array", "items": {"type": "integer"}},
                        "skipped_columns": {
                            "type": "array",
                            "description": "List of skipped columns with their 0-based index and a reason.",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "col_index": {"type": "integer", "description": "0-based column index in the original sheet"},
                                    "reason": {"type": "string", "description": "Why this column was skipped (e.g. 'empty header', 'duplicate', 'ambiguous', etc.)"}
                                },
                                "required": ["col_index", "reason"]
                            }
                        }
                    },
                    "required": [
                        "header_row",
                        "header_row_count",
                        "data_start_row",
                        "data_end_row",
                        "start_column",
                        "end_column",
                        "column_headers",
                        "skipped_columns"
                    ]
                }
            },
            "notes_blocks": {
                "type": "array",
                "description": "Sections of non-tabular notes or metadata",
                "items": {
                    "type": "object",
                    "properties": {
                        "start_row": {"type": "integer"},
                        "end_row": {"type": "integer"},
                        "description": {"type": "string"}
                    }
                }
            },
            "warnings": {
                "type": "array",
                "description": "List of warnings or quality issues detected",
                "items": {"type": "string"}
            }
        },
        "required": ["tables", "notes_blocks", "warnings"]
    }
}

meta_function = {
    "name": "meta_summarize_excel_chunks",
    "description": "Combine chunk-level summaries into a single minimal, deduplicated sheet-level summary. For each table, include header rows and other relevant boundaries.",
    "parameters": {
        "type": "object",
        "properties": {
            "estimated_rows": {"type": "integer"},
            "number_of_tables": {"type": "integer"},
            "tables": {  # <-- Per-table metadata block!
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "table_zone": {
                            "type": "object",
                            "properties": {
                                "start_row": {"type": "integer"},
                                "end_row": {"type": "integer"},
                            },
                            "required": ["start_row", "end_row"]
                        },
                        "header_rows": {
                            "type": "array",
                            "items": {"type": "integer"}
                        },
                        "summary_rows": {
                            "type": "array",
                            "items": {"type": "integer"}
                        },
                        "multi_level_headers": {"type": "boolean"},
                        "overlapping_tables": {"type": "boolean"},
                        "noise_rows": {
                            "type": "array",
                            "items": {"type": "integer"}
                        },
                    },
                    "required": ["table_zone", "header_rows", "summary_rows", "multi_level_headers", "overlapping_tables", "noise_rows"]
                }
            },
            "data_end_row_estimated": {"type": "integer"},
            "rationale": {"type": "string"},
        },
        "required": [
            "estimated_rows", "number_of_tables", "tables",
            "data_end_row_estimated", "rationale"
        ]
    }
}

flatten_function = {
        "name": "flatten_and_standardize_headers",
        "description": (
            "Flatten/merge multi-row Excel headers, standardize them to snake_case, and annotate with data type and description."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "columns": {
                    "type": "array",
                    "description": "One object per column, with original and standardized headers.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "original_header": {"type": "string"},
                            "standardized_header": {"type": "string"},
                            "notes": {"type": "string"},
                            "data_type": {"type": "string"},
                            "description": {"type": "string"},
                            "confidence_reasoning": {"type": "string"},
                        },
                        "required": [
                            "original_header", "standardized_header", "notes",
                            "data_type", "description", "confidence_reasoning"
                        ],
                    }
                }
            },
            "required": ["columns"]
        }
    }

# === DEFAULT PARAMETERS ===

# ===================================================================
# SYSTEM DEFAULTS
# ===================================================================

# File Processing
DEFAULT_VOLUME_FOLDER = "dbfs:/Volumes/test/bronze/raw/"
DEFAULT_CHUNK_SIZE = 25
DEFAULT_MAX_SAMPLES_PER_COL = 5

# Rate Limiting (Azure OpenAI Limits)
DEFAULT_TOKENS_PER_MINUTE = 50000
DEFAULT_REQUESTS_PER_MINUTE = 50
DEFAULT_MAX_TOKENS_PER_CHUNK = 25000

# Model Configuration
DEFAULT_MODEL_NAME = "gpt-4.1"
DEFAULT_EMBEDDING_MODEL = "text-embedding-3-large"
DEFAULT_MAX_TOKENS = 32000
DEFAULT_TEMPERATURE = 0.0

# Processing Settings
DEFAULT_MAX_RETRIES = 3
DEFAULT_RETRY_DELAY = 1.0
DEFAULT_REQUEST_PACING_SECONDS = 1.2

# Caching and Performance
DEFAULT_CONSERVATIVE_TOKEN_OVERHEAD = 4  # 4x multiplier for safety
DEFAULT_ADAPTIVE_CHUNK_MIN_SIZE = 5

# ===================================================================
# DATABASE CONFIGURATION  
# ===================================================================

# Database Structure
DEFAULT_CATALOG = "bdx"
DEFAULT_METADATA_SCHEMA = "metadata_cache"
DEFAULT_GLOSSARY_SCHEMA = "glossary"

# source column delta table
DEFAULT_SOURCE_TABLE_INDEX = "bdx.vector_embedding.source_column_vector"
DEFAULT_SOURCE_TABLE_ENDPOINT = "dox_search"

#target glossary delta table
DEFAULT_TARGET_TABLE_INDEX = "bdx.glossary.vector_index_3072"
DEFAULT_TARGET_TABLE_ENDPOINT = "box_search"

# Table Names
CHECKPOINT_TABLE_NAME = "batch_checkpoints"
STRUCTURE_CACHE_TABLE_NAME = "structure_metadata_cache"
STRUCTURE_LOG_TABLE_NAME = "structure_change_log"
GLOSSARY_TABLE_NAME = "vector_store_3072"
GLOSSARY_TABLE_COLUMN ="proposed_name"

# Full Table Paths
CHECKPOINT_TABLE = f"{DEFAULT_CATALOG}.{DEFAULT_METADATA_SCHEMA}.{CHECKPOINT_TABLE_NAME}"
STRUCTURE_CACHE_TABLE = f"{DEFAULT_CATALOG}.{DEFAULT_METADATA_SCHEMA}.{STRUCTURE_CACHE_TABLE_NAME}"
STRUCTURE_LOG_TABLE = f"{DEFAULT_CATALOG}.{DEFAULT_METADATA_SCHEMA}.{STRUCTURE_LOG_TABLE_NAME}"
GLOSSARY_TABLE = f"{DEFAULT_CATALOG}.{DEFAULT_GLOSSARY_SCHEMA}.{GLOSSARY_TABLE_NAME}"

# File System Paths
TEMP_DIR_PATTERN = "/dbfs/tmp/{user}/"
CACHE_DIR_PATTERN = "/dbfs/tmp/smartbdx_cache/"