"""Module for rendering a visual file browser as an HTML table.

This module provides a function to render a file browser view from a metadata DataFrame,
displaying file names, statuses, and actions. It dynamically adjusts the table columns
based on available metadata such as last modified date and file size.

Usage:
    Call `render_file_browser(metadata_df)` with a pandas DataFrame containing file metadata.
    The DataFrame may include columns like 'file_name', 'status', 'last_modified', 'file_path', and 'size'.

Extensibility:
    The rendering logic is modular and adapts to the presence of metadata columns.
    Additional columns or features can be integrated by extending the column checks and rendering logic.
"""
import sys
import os

try:
    current_dir = os.path.dirname(os.path.abspath(__file__))
except NameError:
    # __file__ is not defined (notebook or Databricks jobs)
    current_dir = os.getcwd()

parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)
    
from shared.smartbdx_ui_components import get_status_icon, render_status_badge

def render_file_browser(metadata_df):
    # Determine which optional columns to include based on DataFrame columns
    include_last_modified = 'last_modified' in metadata_df.columns
    include_size = 'size' in metadata_df.columns
    include_file_path = 'file_path' in metadata_df.columns

    # Build table headers dynamically
    headers = [
        '<th></th>',
        '<th style="text-align:left;padding:6px 10px;">File Name</th>',
        'Status',
    ]
    if include_last_modified:
        headers.append('Last Modified')
    if include_size:
        headers.append('Size')
    headers.append('Action')

    html = f"""
    <table style="border-collapse:collapse;width:100%;background:#fcfcfc;">
      <thead>
        <tr style="background:#f0f4f8;">
          {' '.join(headers)}
        </tr>
      </thead>
      <tbody>
    """

    for idx, row in metadata_df.iterrows():
        status_icon = get_status_icon(row.get('status', 'unknown'))
        status_badge = render_status_badge(row.get('status', 'unknown'))

        # Prepare tooltip for file name with full path if available
        file_name = row['file_name']
        file_path = row.get('file_path', '')
        file_name_tooltip = f'title="{file_path}"' if include_file_path and file_path else ''

        # Prepare info icon with tooltip for size if available
        size_info_html = ''
        if include_size and row.get('size') is not None:
            size_info_html = f"""
                <span style="margin-left:4px;cursor:help;color:#888;" title="Size: {row['size']}">
                    &#9432;
                </span>
            """

        html += f"""
        <tr class="bdx-file-row" style="border-bottom:1px solid #eaeaea;">
            <td style="padding:4px 8px;">
                <input type="checkbox" name="selected_file" value="{file_name}">
            </td>
            <td style="padding:4px 10px;" {file_name_tooltip}>
                {file_name}{size_info_html}
            </td>
            <td style="text-align:center;">
                {status_icon} {status_badge}
            </td>
        """

        if include_last_modified:
            last_modified = row.get('last_modified', '')
            html += f'<td style="padding:4px 10px;">{last_modified}</td>'

        if include_size:
            # Show size text in separate column as well
            size_text = row.get('size', '')
            html += f'<td style="padding:4px 10px;">{size_text}</td>'

        html += f"""
            <td>
                <a href="javascript:void(0);" onclick="alert('Preview: {file_name} (Stub)')" style="color:#0077cc;text-decoration:underline;">Preview</a>
            </td>
        </tr>
        """

    html += "</tbody></table>"
    return html

