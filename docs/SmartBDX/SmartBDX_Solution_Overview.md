# SmartBDX Solution Overview

This document provides a comprehensive overview of the SmartBDX system, a powerful solution for ingesting, processing, and analyzing bordereaux files using an AI-powered approach.

## System Architecture

The SmartBDX system is a modular, end-to-end pipeline designed for production-level batch processing of Excel files. It leverages Azure OpenAI for its AI capabilities and is built to run within a Databricks environment, utilizing Spark for distributed processing.

The system can be broken down into the following key areas:

1.  **API Gateway & Entry Points**: The system's interface for external interaction.
2.  **Core AI Engine**: The heart of the system, responsible for intelligent data extraction.
3.  **Processing & Orchestration**: Manages the end-to-end workflow of file processing.
4.  **Infrastructure**: Provides the foundational components for robust, production-grade execution.
5.  **Data Mapping**: Handles the semantic mapping of source data to a target schema.
6.  **Selection & Monitoring**: Enables user interaction, file selection, and progress tracking.
7.  **Configuration & Utilities**: Centralizes settings and provides helper functions.

## Module Breakdown

### 1. API Gateway & Entry Points

-   **`SmartBDX_API_Gateway_v2.ipynb`**: The primary entry point for the system, designed to be called from a frontend or other services. It acts as a router, receiving an `operation` and `parameters` to trigger specific functionalities within the SmartBDX ecosystem. It supports a wide range of operations, from file discovery and status checks to batch processing and analytics.
-   **`smartbdx_main.py`**: A high-level Python entry point that provides convenience functions like `initialize_smartbdx_system()` and `smartbdx_quick_start()` to run the entire pipeline with a single command.
-   **`smartbdx_main_integration.py`**: Contains integration code and enhanced functions for the main module, demonstrating how to extend the system with new capabilities like interactive selection and quick retries.

### 2. Core AI Engine

-   **`smartbdx_core_ai.py`**: This is the intelligent core of the system. It uses GPT models to analyze the structure of "messy" Excel sheets.
    -   It chunks large sheets to fit within model context limits.
    -   It uses function calling with detailed schemas (`summarize_function`, `flatten_function`) to extract structured information about tables, headers, and data regions.
    -   It can handle complex scenarios like multi-level headers and multiple tables on a single sheet.

### 3. Processing & Orchestration

-   **`smartbdx_processing.py`**: This module orchestrates the entire batch processing workflow.
    -   `azure_optimized_batch_orchestration()` is the main function that manages a batch from start to finish.
    -   It integrates with the `BatchCheckpointManager` to track the status of each file/sheet combination, allowing for resumable batches.
    -   It uses the `AzureOpenAIRateLimiter` to ensure compliance with Azure OpenAI API limits, preventing errors and ensuring smooth operation.
    -   It provides convenience functions like `quick_start_production_batch()` and `resume_failed_batch()`.

### 4. Infrastructure

-   **`smartbdx_infrastructure.py`**: Provides the foundational components for a robust, production-ready system.
    -   `BatchCheckpointManager`: A class that manages the state of processing jobs in a Delta table (`bdx.metadata_cache.batch_checkpoints`). It tracks which files are pending, processing, completed, or have failed.
    -   `AzureOpenAIRateLimiter`: A class to manage API calls to Azure OpenAI, ensuring that the system does not exceed the tokens-per-minute and requests-per-minute limits.

### 5. Data Mapping

-   **`smartbdx_mapping_core.py`**: Orchestrates the semantic mapping of source columns to a target glossary. It uses a hybrid approach, combining vector search for initial candidates and an LLM for enhancing low-confidence matches.
-   **`smartbdx_mapping_data.py`**: Handles the data persistence layer for mapping. It's responsible for creating and storing embeddings for source columns, caching metadata, and saving approved mappings to a persistent "binder" for future reuse.

### 6. Selection & Monitoring

-   **`smartbdx_selection.py`**: Provides a rich set of tools for file discovery and selection, which is crucial for user interaction.
    -   `discover_files_and_sheets_metadata()`: Efficiently scans a directory to get metadata about all files and sheets without loading them into memory.
    -   It calculates a `priority_score` for each item to help users decide what to process next.
    -   It includes functions to create interactive widgets in Databricks notebooks for a user-friendly selection experience.
-   **`smartbdx_monitoring.py`**: Contains functions to monitor the progress of batches.
    -   `list_all_batches()` and `show_batch_progress()` provide summaries of processing jobs.
    -   `get_failed_items()` helps in debugging by retrieving detailed error information for a specific batch.

### 7. Configuration & Utilities

-   **`smartbdx_config.py`**: A centralized location for all system configurations. This includes Azure OpenAI API keys and endpoints, deployment names, default parameters for processing (e.g., chunk size, retries), and the schemas for the function calls used in the AI core.
-   **`smartbdx_utilities.py`**: A collection of helper functions used across the entire system. These include functions for token estimation, text cleaning, creating Spark-safe names, and handling file operations within the Databricks environment.
-   **`smartbdx_json_utils.py`**: A utility for serializing data structures containing timestamps into a JSON-compatible format.

## Key Features & Capabilities

-   **AI-Powered Table Detection**: Can intelligently identify and extract tabular data from unstructured Excel files.
-   **Production-Ready Batch Processing**: Built with checkpointing, rate limiting, and error handling to manage large-scale processing jobs.
-   **Resumable Batches**: If a batch fails, it can be resumed from the last successful checkpoint, saving time and resources.
-   **Semantic Column Mapping**: Uses a hybrid vector search and LLM approach to map source columns to a target schema.
-   **Intelligent File Selection**: Provides tools to discover, prioritize, and select files for processing based on metadata and processing history.
-   **Comprehensive Monitoring**: Offers detailed insights into the status and performance of processing batches.
-   **Modular and Extensible**: The codebase is well-structured into modules, making it easy to understand, maintain, and extend.

## Testing

-   **`test.py`** and **`test1.py`**: These files contain a suite of tests that cover the functionality of the different modules, from infrastructure and core AI to the mapping and selection capabilities. They serve as excellent examples of how to use the various components of the SmartBDX system.