# docs/SmartBDX/smartbdx_local_mocks.py

import json


class MockNotebook:
    """A mock for the dbutils.notebook object."""
    def run(self, path, timeout_seconds, arguments):
        """
        Mocks running another notebook.
        This now correctly extracts the operation from the arguments.
        """
        print("--- MOCK NOTEBOOK RUN ---")
        print(f"Path: {path}")
        print(f"Timeout: {timeout_seconds}s")
        print(f"Arguments: {arguments}")

        # Correctly get the operation from the top-level arguments
        operation = arguments.get("operation", "unknown")

        # Special handling for smart_file_selection to help test dependent
        # operations
        if operation == "smart_file_selection":
            return json.dumps({
                "success": True,
                "mock_run": True,
                "operation": operation,
                "data": {
                    "batch_ready": {
                        "files": [
                            {
                                "file_path": "/mock/path/file1.xlsx", 
                                "sheets": ["Sheet1"]
                            },
                            {
                                "file_path": "/mock/path/file2.xlsx", 
                                "sheets": ["Data"]
                            }
                        ]
                    }
                },
                "message": "Mock response for smart_file_selection."
            })

        # Generic response for all other operations
        return json.dumps({
            "success": True,
            "mock_run": True,
            "operation": operation
        })

    def exit(self, value):
        """Mocks exiting a notebook."""
        print(f"DBUtils Exit with value: {value}")


class MockDBUtils:
    """A mock for the Databricks dbutils object for local testing."""
    def __init__(self):
        self.widgets = self
        self.notebook = MockNotebook()
    
    def text(self, *args, **kwargs):
        """Mocks the text widget creation."""
        pass
    
    def get(self, *args, **kwargs):
        """Mocks getting a widget value."""
        return ""


def get_mock_spark_session():
    """
    Returns a mock SparkSession for local execution.
    """
    class MockSparkSession:
        def sql(self, query):
            print("--- MOCK SPARK SQL ---")
            print(query)
            
            class MockDataFrame:
                def collect(self):
                    return []
                
                def isEmpty(self):
                    return True
            return MockDataFrame()

    return MockSparkSession()