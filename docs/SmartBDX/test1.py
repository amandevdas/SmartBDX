# Databricks notebook source
# Discover all available Excel files and their sheets with metadata
from smartbdx_selection import discover_files_and_sheets_metadata,get_widget_selections

meta = discover_files_and_sheets_metadata()
display(meta)  # Shows file_name, sheet_name, file_size_mb, last_modified, etc.

# COMMAND ----------

from smartbdx_selection import interactive_selection_workflow
interactive_selection_workflow(volume_folder="dbfs:/Volumes/test/bronze/raw/")
# Then follow the printed notebook steps for widget-based selection

# COMMAND ----------

selected = get_widget_selections()

# COMMAND ----------

# In your Databricks notebook, test the enhanced interface:
from smartbdx_selection import enhanced_quick_workflow, get_enhanced_dropdown_selections, process_selected_items
from smartbdx_config import client

# Create enhanced interface
enhanced_quick_workflow()

# COMMAND ----------

# After using enhanced dropdowns above:
selected = get_enhanced_dropdown_selections()

# Process with existing pipeline
result = process_selected_items(client, selected)

# COMMAND ----------

# Import required modules
from smartbdx_selection import enhanced_quick_workflow, get_enhanced_dropdown_selections, process_selected_items
from smartbdx_config import client

# Create enhanced selection interface
enhanced_quick_workflow()

# After user makes selections, get them
selected = get_enhanced_dropdown_selections()

# Process the selected items with batch processing
result = process_selected_items(
    client=client,
    selected_items=selected,
    batch_id="manual_selection_001"
)

# Show results
print(f"Processed {result['total_items']} items in {result['processing_time_minutes']:.1f} minutes")


# COMMAND ----------

# Import required modules
from smartbdx_selection import enhanced_quick_workflow, get_enhanced_dropdown_selections, process_selected_items
from smartbdx_config import client

# Create enhanced selection interface
enhanced_quick_workflow()

# After user makes selections, get them
selected = get_enhanced_dropdown_selections()

# Process the selected items with batch processing
result = process_selected_items(
    client=client,
    selected_items=selected,
    batch_id="manual_selection_001"
)

# Show results
print(f"Processed {result['total_items']} items in {result['processing_time_minutes']:.1f} minutes")
