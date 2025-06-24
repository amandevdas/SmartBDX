import sys
import os

try:
    # For scripts: get SmartBDX root (two levels up from this file)
    smartbdx_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
except NameError:
    # For Databricks notebooks: fallback to absolute workspace path
    smartbdx_root = '/Workspace/SmartBDX'  # Adjust if your workspace path differs

if smartbdx_root not in sys.path:
    sys.path.insert(0, smartbdx_root)

from smartbdx_selection import discover_files_and_sheets_metadata

from IPython.display import display, HTML
from shared.smartbdx_ui_components import (
    get_status_icon,
    render_status_badge,
    info_banner,
    warning_banner,
    error_banner,
    show_loader
)
from selection.visual_file_browser import render_file_browser

def show_selection_dashboard():
    from smartbdx_selection import discover_files_and_sheets_metadata

    # Info banner: user guidance
    info_banner("Browse, filter, and select bordereaux files to process. Status is color-coded. You may preview contents before proceeding.")

    # Show loader while fetching data
    show_loader("Scanning for files...")

    # Discover files (core logic)
    try:
        metadata_df = discover_files_and_sheets_metadata()
    except Exception as e:
        error_banner(f"Could not load file list: {e}")
        return

    # Remove loader by printing empty output (hack; loader is not blocking in HTML)
    display(HTML("<div></div>"))

    if metadata_df.empty:
        warning_banner("No bordereaux files found in the configured directory. Please check your file path or upload files to proceed.")
        return

    # Show status summary
    if 'status' not in metadata_df.columns:
        metadata_df['status'] = 'unknown'
        warning_banner("Status column not found in metadata; defaulting to 'unknown' for all files.")
    status_counts = metadata_df['status'].value_counts().to_dict()
    all_statuses = ['completed', 'failed', 'pending', 'processing']
    summary_html = "<div style='margin-bottom:10px;font-size:1.05em;'>"
    summary_html += " ".join(
        f"{get_status_icon(status)} {render_status_badge(status)}: <b>{status_counts.get(status,0)}</b>"
        for status in all_statuses
    )
    summary_html += "</div>"
    display(HTML(summary_html))

    # --- Filter panel with clear button ---
    filter_html = """
    <div style="margin-bottom:10px;">
        <input type="text" id="fileSearchBox" placeholder="Search files..." style="padding:6px 12px;font-size:1em;border-radius:6px;border:1px solid #bbb;width:270px;" onkeyup="filterFiles()">
        <button onclick="document.getElementById('fileSearchBox').value='';filterFiles();" style="margin-left:7px;padding:6px 13px;background:#eee;border-radius:6px;border:none;color:#333;cursor:pointer;">Clear</button>
    </div>
    <script>
    function filterFiles() {
      let input = document.getElementById('fileSearchBox');
      let filter = input.value.toLowerCase();
      let rows = document.getElementsByClassName('bdx-file-row');
      for (let i=0; i<rows.length; i++) {
        let txt = rows[i].innerText.toLowerCase();
        rows[i].style.display = txt.indexOf(filter) > -1 ? '' : 'none';
      }
    }
    </script>
    """
    display(HTML(filter_html))

    # --- Visual file browser with status badges and preview ---
    display(HTML(render_file_browser(metadata_df)))

    # --- Proceed button (stub, ready for backend integration) ---
    proceed_html = """
    <div style="margin-top:14px;">
        <button onclick="alert('Processing selected files! (Stub)')" style="background:#0077cc;color:#fff;padding:9px 24px;border-radius:8px;font-size:1em;border:none;box-shadow:0 1px 2px #cfd8dc;">Proceed</button>
    </div>
    """
    display(HTML(proceed_html))
