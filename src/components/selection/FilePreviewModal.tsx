"use client";

import { useState, useEffect, useRef } from "react";
import { Modal, Table, Tabs, Spin, Alert } from "antd";
import type { TabsProps } from "antd";

interface FileMeta {
  file_name: string;
  id: string;
  [key: string]: any;
}

interface SheetData {
  name: string;
  columns: string[];
  rows: any[];
}

interface FilePreviewModalProps {
  file: FileMeta | null;
  visible: boolean;
  onClose: () => void;
}

export const FilePreviewModal = ({ file, visible, onClose }: FilePreviewModalProps) => {
  const [loading, setLoading] = useState(false);
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [error, setError] = useState<string | null>(null);

  // React Strict Mode Protection - prevent duplicate execution
  const hasInitialized = useRef(false);
  const currentFileId = useRef<string | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Main effect with React Strict Mode protection
  useEffect(() => {
    if (!hasInitialized.current && visible && file) {
      // Deduplication check - prevent multiple calls for same file
      if (currentFileId.current === file.id) {
        return;
      }

      hasInitialized.current = true;
      currentFileId.current = file.id;
      setLoading(true);
      setError(null);
      
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      // Fetch real preview data from API
      fetch(`/api/files/${file.id}/preview`)
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setSheets(data.data.sheets || []);
          } else {
            setError(data.error || "Failed to load preview data");
          }
          setLoading(false);
        })
        .catch(err => {
          console.error('Preview API error:', err);
          setError("Failed to load preview data from backend");
          setLoading(false);
        });
    }
  }, [visible, file]);

  // Cleanup and reset effect
  useEffect(() => {
    if (!visible) {
      // Reset initialization flag when modal closes
      hasInitialized.current = false;
      currentFileId.current = null;
      
      // Clear any pending timeouts
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      
      // Reset states
      setSheets([]);
      setError(null);
      setLoading(false);
    }
  }, [visible]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const items: TabsProps["items"] = sheets.map(sheet => ({
    key: sheet.name,
    label: sheet.name,
    children: (
      <Table
        columns={sheet.columns.map(col => ({
          title: col,
          dataIndex: col,
          key: col,
        }))}
        dataSource={sheet.rows}
        pagination={false}
        scroll={{ x: "max-content" }}
        size="small"
      />
    ),
  }));

  return (
    <Modal
      title={`Preview: ${file?.file_name || ""}`}
      open={visible}
      onCancel={onClose}
      footer={null}
      width={800}
    >
      {loading ? (
        <div className="flex justify-center py-12">
          <Spin tip="Loading preview..." />
        </div>
      ) : error ? (
        <Alert type="error" message={error} />
      ) : (
        <Tabs items={items} />
      )}
    </Modal>
  );
};

export default FilePreviewModal;