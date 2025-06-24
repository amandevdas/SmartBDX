"""smartbdx_ui_components.py

This module provides reusable UI components for Jupyter notebooks and web interfaces,
including status icons, badges, banners, loaders, buttons, and chips. These components
are designed to be easily integrated and styled consistently across SmartBDX projects.

Main features:
- Color-coded status icons and badges for representing file or batch statuses.
- Informational, warning, and error banners for user notifications.
- A loading spinner with customizable messages.
- Styled buttons and chips with optional tooltips.
- Helper functions to combine icons and badges for table-friendly status displays.

The module is extensible, allowing easy addition of new status types, colors, and UI elements.
"""

from IPython.display import HTML, display

# ---- STATUS ICONS ----
def get_status_icon(status, size='1.25em'):
    """
    Return a color-coded circle icon representing the given status.

    Args:
        status (str or None): Status string (e.g. 'completed', 'failed').
        size (str): CSS font-size for the icon (e.g. '1.25em').

    Returns:
        str: HTML span element with a colored circle icon.

    Note:
        Unknown or None status defaults to a grey icon.
    """
    color_map = {
        "completed": "#5cb85c",  # Green
        "failed": "#d9534f",     # Red
        "pending": "#f0ad4e",    # Orange
        "processing": "#0275d8", # Blue
        "active": "#0275d8",     # Blue
        "unknown": "#bdbdbd",    # Grey
        None: "#bdbdbd"
    }
    color = color_map.get(str(status).lower(), "#bdbdbd")
    return f'<span style="color:{color};font-size:{size};vertical-align:-0.12em;">&#9679;</span>'

def render_status_badge(status):
    """
    Render a colored badge displaying the status text.

    Args:
        status (str or None): Status string (e.g. 'completed', 'failed').

    Returns:
        str: HTML span element styled as a badge with background and text color.

    Note:
        Unknown or None status defaults to neutral colors and label "Unknown".
    """
    color_map = {
        "completed": "#e6f4ea",
        "failed": "#fae1e1",
        "pending": "#fdf5e6",
        "processing": "#e6f0fa",
        "active": "#e6f0fa",
        "unknown": "#f5f5f5"
    }
    text_color = {
        "completed": "#2d7d46",
        "failed": "#b71c1c",
        "pending": "#a15d00",
        "processing": "#2364aa",
        "active": "#2364aa",
        "unknown": "#888"
    }
    color = color_map.get(str(status).lower(), "#f5f5f5")
    tcolor = text_color.get(str(status).lower(), "#888")
    label = str(status).capitalize() if status else "Unknown"
    return f"""<span style='
        background:{color};color:{tcolor};
        border-radius:10px;padding:2px 10px;font-size:0.98em;
        margin-left:6px;font-weight:500;'>
        {label}
    </span>"""

def render_status_chip(status):
    """
    Render a combined status chip with a colored icon and a badge label.

    Args:
        status (str or None): Status string (e.g. 'completed', 'failed').

    Returns:
        str: HTML snippet combining the status icon and badge for compact display.

    Use case:
        Ideal for showing status in tables or lists where space is limited.
    """
    icon_html = get_status_icon(status, size="1.1em")
    badge_html = render_status_badge(status)
    # Remove margin-left from badge to keep chip compact
    badge_html = badge_html.replace("margin-left:6px;", "margin-left:4px;")
    return f'<span style="display:inline-flex;align-items:center;">{icon_html}{badge_html}</span>'

def render_info_icon(tooltip="Information"):
    """
    Render an info icon (ℹ️) with a tooltip displayed on hover.

    Args:
        tooltip (str): Text to display when hovering over the icon.

    Returns:
        str: HTML span element with info icon and tooltip.

    Usage:
        Useful for providing contextual help or explanations inline.
    """
    return f"""<span style="cursor:help; border-bottom:1px dotted #1976d2;" title="{tooltip}">&#8505;</span>"""

# ---- BANNERS ----
def info_banner(msg):
    """
    Display an informational banner with a blue background.

    Args:
        msg (str): Message to display inside the banner.
    """
    html = f"""
    <div style="background:#e3f0fd;color:#175199;padding:12px 22px;border-radius:8px;
        margin:12px 0 16px 0;font-size:1.07em;border-left:6px solid #1976d2;">
        <b>Info:</b> {msg}
    </div>
    """
    display(HTML(html))

def warning_banner(msg):
    """
    Display a warning banner with an orange background.

    Args:
        msg (str): Message to display inside the banner.
    """
    html = f"""
    <div style="background:#fff5e6;color:#d98300;padding:12px 22px;border-radius:8px;
        margin:12px 0 16px 0;font-size:1.07em;border-left:6px solid #ffa000;">
        <b>Warning:</b> {msg}
    </div>
    """
    display(HTML(html))

def error_banner(msg):
    """
    Display an error banner with a red background.

    Args:
        msg (str): Message to display inside the banner.
    """
    html = f"""
    <div style="background:#fae1e1;color:#b71c1c;padding:12px 22px;border-radius:8px;
        margin:12px 0 16px 0;font-size:1.07em;border-left:6px solid #b71c1c;">
        <b>Error:</b> {msg}
    </div>
    """
    display(HTML(html))

# ---- LOADER/SPINNER ----
def show_loader(message="Loading, please wait..."):
    """
    Display a loading spinner with an optional message below.

    Args:
        message (str): Text to display below the spinner.
    """
    html = f"""
    <div style="padding:22px 0;text-align:center;">
      <div class="loader" style="
        display:inline-block;
        border: 6px solid #e0e0e0;
        border-top: 6px solid #1976d2;
        border-radius: 50%;
        width: 34px;
        height: 34px;
        animation: spin 1.1s linear infinite;">
      </div>
      <div style="color:#1976d2;margin-top:7px;font-size:1.08em;">
        {message}
      </div>
    </div>
    <style>
    @keyframes spin {{
      0% {{ transform: rotate(0deg); }}
      100% {{ transform: rotate(360deg); }}
    }}
    </style>
    """
    display(HTML(html))

# ---- BUTTONS ----
def render_button(text, onclick=None, color="#0077cc", size="1em"):
    """
    Render a styled clickable button.

    Args:
        text (str): Button label text.
        onclick (str or None): JavaScript onclick handler code.
        color (str): Background color of the button.
        size (str): CSS font-size for the button text.

    Returns:
        str: HTML button element as a string.

    Note:
        The onclick attribute is optional and should be a valid JS snippet.
    """
    onclick_attr = f'onclick="{onclick}"' if onclick else ""
    html = f"""
    <button {onclick_attr}
      style="background:{color};color:#fff;
        padding:8px 24px;
        border-radius:9px;
        font-size:{size};
        font-weight:500;
        border:none;
        margin:3px 10px 3px 0;
        box-shadow:0 1px 2px #cfd8dc;cursor:pointer;">
      {text}
    </button>
    """
    return html

# ---- CHIP / TAG ----
def render_chip(label, color="#e0e0e0", tcolor="#333", tooltip=None):
    """
    Render a small tag/chip with optional tooltip.

    Args:
        label (str): Text to display inside the chip.
        color (str): Background color of the chip.
        tcolor (str): Text color inside the chip.
        tooltip (str or None): Optional tooltip text shown on hover.

    Returns:
        str: HTML span element styled as a chip/tag.

    Usage:
        Useful for tags, labels, or compact status indicators.
    """
    tooltip_attr = f' title="{tooltip}"' if tooltip else ""
    return f"""
    <span{tooltip_attr} style='
      display:inline-block;background:{color};color:{tcolor};
      border-radius:13px;font-size:0.98em;
      padding:2px 13px;margin:0 5px 2px 0;'>
      {label}
    </span>
    """

# ---- EXAMPLE USAGE (Remove/comment before importing as a module) ----
if __name__ == "__main__":
    # For visual test (in notebook cell)
    display(HTML(
        f"{get_status_icon('completed')} Completed "
        f"{get_status_icon('failed')} Failed "
        f"{get_status_icon('pending')} Pending "
        f"{render_status_badge('processing')}"
        f"{render_chip('Header Matched', color='#c6f6d5', tcolor='#276749')}"
    ))
    info_banner("This is an information banner.")
    warning_banner("This is a warning.")
    error_banner("This is an error!")
    show_loader()
    display(HTML(render_button("Click Me", onclick="alert('Button clicked!')")))

"""
# ---- ADVANCED USAGE EXAMPLES ----

# Display a combined status chip for use in tables:
display(HTML(render_status_chip('completed')))

# Render an info icon with a tooltip for contextual help:
display(HTML(f"Hover over the icon {render_info_icon('This is additional information')} for details."))

# Render a chip with a tooltip:
display(HTML(render_chip('Beta Feature', color='#ffecb3', tcolor='#795548', tooltip='This feature is experimental')))

# Render a button with a custom onclick handler and size:
display(HTML(render_button("Submit", onclick="console.log('Submitted')", color="#28a745", size="1.2em")))
"""
