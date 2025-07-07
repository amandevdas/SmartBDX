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
      
      // In a real implementation, fetch preview data from API
      // fetch(`/api/files/${file.id}/preview`)
      //   .then(res => res.json())
      //   .then(data => {
      //     setSheets(data.sheets);
      //     setLoading(false);
      //   })
      //   .catch(err => {
      //     setError("Failed to load preview data");
      //     setLoading(false);
      //   });
        
      // For demo purposes, simulate API call with mock data
      timeoutRef.current = setTimeout(() => {
        const mockSheets = [
          {
            name: "Sheet1",
            columns: ["Policy Number", "Insured Name", "Premium", "Inception Date", "Expiry Date"],
            rows: [
              { key: "1", "Policy Number": "POL001", "Insured Name": "Acme Corp", "Premium": "$1,200", "Inception Date": "2023-01-01", "Expiry Date": "2024-01-01" },
              { key: "2", "Policy Number": "POL002", "Insured Name": "XYZ Ltd", "Premium": "$950", "Inception Date": "2023-02-15", "Expiry Date": "2024-02-15" },
              { key: "3", "Policy Number": "POL003", "Insured Name": "ABC Inc", "Premium": "$1,500", "Inception Date": "2023-03-10", "Expiry Date": "2024-03-10" },
            ]
          },
          {
            name: "Sheet2",
            columns: ["Claim ID", "Policy Number", "Claim Amount", "Date Reported"],
            rows: [
              { key: "1", "Claim ID": "CLM001", "Policy Number": "POL001", "Claim Amount": "$500", "Date Reported": "2023-06-15" },
              { key: "2", "Claim ID": "CLM002", "Policy Number": "POL003", "Claim Amount": "$750", "Date Reported": "2023-07-20" },
            ]
          }
        ];
        
        setSheets(mockSheets);
        setLoading(false);
        timeoutRef.current = null;
      }, 1000);
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