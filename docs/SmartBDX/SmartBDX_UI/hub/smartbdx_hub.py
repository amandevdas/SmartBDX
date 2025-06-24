"""
SmartBDX Hub Module

This module serves as the central hub for the SmartBDX UI, facilitating navigation and display
of various dashboards such as Selection, Processing, Monitoring, and Mapping Approval.

Main Features:
- Dashboard registry with dynamic loading and execution of dashboard modules.
- Navigation widget for selecting dashboards.
- Styled system status panel with real-time timestamp.
- Consistent error handling and user feedback via banners.
- Optional dynamic help panel providing contextual guidance.

Extensibility:
- Add new dashboards by extending the DASHBOARDS dictionary with appropriate module and function references.
- Maintain consistent UI feedback by using shared UI components (info_banner, error_banner).
- Dashboard modules should expose a function to display their respective UI, referenced in DASHBOARDS.
"""
import sys
import os

try:
    smartbdx_root = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
except NameError:
    # For Databricks notebook runner or jobs where __file__ is not set:
    smartbdx_root = '/Workspace/SmartBDX/SmartBDX_UI/'  # Adjust if your root is different!

if smartbdx_root not in sys.path:
    sys.path.insert(0, smartbdx_root)


# Cross-environment compatibility for dbutils
try:
    dbutils  # type: ignore
except NameError:
    try:
        from pyspark.dbutils import DBUtils
        dbutils = DBUtils(spark)
    except Exception:
        dbutils = None


from datetime import datetime
from IPython.display import display, HTML
from shared.smartbdx_ui_components import info_banner, error_banner

# --- Dashboard Registry ---
DASHBOARDS = {
    "selection": {"label": "Selection", "loader": "selection.smartbdx_selection_dashboard", "fn": "show_selection_dashboard"},
    "processing": {"label": "Processing", "loader": "processing.smartbdx_processing_dashboard", "fn": "show_processing_dashboard"},
    "monitoring": {"label": "Monitoring", "loader": "monitoring.smartbdx_monitoring_dashboard", "fn": "show_monitoring_dashboard"},
    "mapping": {"label": "Mapping Approval", "loader": "mapping.smartbdx_mapping_dashboard", "fn": "show_mapping_dashboard"}
}

# --- Navigation Widget ---
if dbutils:
    dbutils.widgets.dropdown(
        "dashboard",
        "selection",
        list(DASHBOARDS.keys()),
        "SmartBDX Dashboard"
    )
    selected_dashboard = dbutils.widgets.get("dashboard")
else:
    selected_dashboard = "selection"

def show_system_status():
    """
    Display a styled system status panel showing the current state of the SmartBDX UI Hub,
    including a timestamp and simulated system messages.

    Uses info_banner to display the 'System ready' status for consistent UI feedback.
    """
    system_ready_html = info_banner("System ready for user input")
    html = f"""
    <div style='
        background:#f4f6fa;border-radius:12px;
        box-shadow:0 1px 3px rgba(0,0,0,0.07);padding:16px;
        margin-bottom:16px;'>
      <span style='font-weight:bold;font-size:1.2em;color:#2d3e50;'>
        SmartBDX UI Hub
      </span>
      <span style='float:right;color:#6c757d;font-size:0.95em;'>
        {datetime.now().strftime('%A %Y-%m-%d %H:%M')}
      </span>
      <div style='margin-top:5px;color:#455a64;'>
        <ul style='margin:0 0 0 1.3em;padding:0;font-size:1em;'>
          <li>{system_ready_html}</li>
          <li>API quota: <span style='color:#5cb85c;'>OK</span> (simulate)</li>
          <li>Last batch: <span style='color:#0077cc;'>2024-06-15 12:23</span> (simulate)</li>
        </ul>
      </div>
    </div>
    """
    display(HTML(html))

def show_dashboard(dash_key):
    """
    Load and display the selected dashboard dynamically.

    Parameters:
    - dash_key (str): Key identifying the dashboard to display.

    If the dashboard key is unknown or an error occurs during loading, display an error banner.
    """
    try:
        dash = DASHBOARDS.get(dash_key)
        if dash:
            module = __import__(dash["loader"], fromlist=[dash["fn"]])
            fn = getattr(module, dash["fn"])
            fn()
        else:
            display(error_banner("Unknown dashboard selection."))
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        error_html = f"""
        <div style='color:#b71c1c;background:#ffebee;padding:12px;border-radius:8px;'>
            <b>Error loading dashboard:</b><br>
            <pre style='color:#c62828;font-size:0.95em;'>{e}</pre>
            <details>
                <summary>Details</summary>
                <pre style='font-size:0.9em'>{tb}</pre>
            </details>
        </div>
        """
        display(error_banner(error_html))

def show_help_panel(dash_key):
    """
    Display a contextual help panel based on the selected dashboard.

    Parameters:
    - dash_key (str): Key identifying the dashboard for which help is displayed.
    """
    help_text = {
        "selection": "<b>File/Sheet Selection</b>: Choose files and sheets to process. Use filters to refine your choices.",
        "processing": "<b>Batch Processing</b>: Configure and run processing jobs. Monitor status here.",
        "monitoring": "<b>Monitoring</b>: View live batch status, resource usage, and error logs.",
        "mapping": "<b>Mapping Approval</b>: Review and approve column mappings suggested by AI."
    }
    text = help_text.get(dash_key, "Use the dropdown above to navigate between dashboards.")
    html = f"""
    <div style='background:#f9fafb;padding:10px 15px;margin-bottom:10px;border-radius:6px;
               border-left:5px solid #0077cc;font-size:1em;'>
        {text}
    </div>
    """
    display(HTML(html))

# --- UI Sequence ---
show_system_status()
show_help_panel(selected_dashboard)
show_dashboard(selected_dashboard)

# --- Example: Adding a New Dashboard ---
# To add a new dashboard, extend the DASHBOARDS dictionary as follows:
# DASHBOARDS["admin"] = {
#     "label": "Admin Panel",
#     "loader": "admin.smartbdx_admin_dashboard",
#     "fn": "show_admin_dashboard"
# }
# Then implement the corresponding module and function.
# This modular design allows easy extension and maintenance of the SmartBDX UI.
