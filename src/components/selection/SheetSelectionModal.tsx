"use client";

import { useState, useEffect } from "react";
import { Modal, Spin, Alert, Select, Button } from "antd";

interface FileMeta {
  file_name: string;
  id: string;
  [key: string]: any;
}

interface SheetSelectionModalProps {
  file: FileMeta | null;
  visible: boolean;
  onClose: () => void;
  onSelectSheets: (fileId: string, sheets: string[]) => void;
  selectedSheets: string[];
}

export const SheetSelectionModal = ({ 
  file, 
  visible, 
  onClose, 
  onSelectSheets,
  selectedSheets 
}: SheetSelectionModalProps) => {
  const [loading, setLoading] = useState(false);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (visible && file) {
      setLoading(true);
      setError(null);
      setSelected(selectedSheets || []);
      
      // In a real implementation, fetch sheet names from API
      // fetch(`/api/files/${file.id}/sheets`)
      //   .then(res => res.json())
      //   .then(data => {
      //     setSheetNames(data.sheetNames);
      //     setLoading(false);
      //   })
      //   .catch(err => {
      //     setError("Failed to load sheet names");
      //     setLoading(false);
      //   });
        
      // For demo purposes, simulate API call with mock data
      setTimeout(() => {
        const mockSheetNames = file.sheetNames || [
          "Sheet1",
          "Sheet2",
          "Sheet3"
        ];
        
        setSheetNames(mockSheetNames);
        setLoading(false);
      }, 500);
    }
  }, [visible, file, selectedSheets]);

  const handleSelectAll = () => {
    setSelected([...sheetNames]);
  };

  const handleClearSelection = () => {
    setSelected([]);
  };

  const handleOk = () => {
    if (file) {
      onSelectSheets(file.id, selected);
    }
    onClose();
  };

  return (
    <Modal
      title={`Select Sheets: ${file?.file_name || ""}`}
      open={visible}
      onCancel={onClose}
      onOk={handleOk}
      okText="Confirm Selection"
      width={600}
    >
      {loading ? (
        <div className="flex justify-center py-12">
          <Spin tip="Loading sheets..." />
        </div>
      ) : error ? (
        <Alert type="error" message={error} />
      ) : (
        <div className="py-4">
          <div className="mb-4">
            <p className="text-gray-600 mb-2">Select sheets to process from this file:</p>
            <div className="flex gap-2 mb-4">
              <Button size="small" onClick={handleSelectAll}>Select All</Button>
              <Button size="small" onClick={handleClearSelection}>Clear</Button>
            </div>
            <Select
              mode="multiple"
              style={{ width: '100%' }}
              placeholder="Select sheets to process"
              value={selected}
              onChange={setSelected}
              options={sheetNames.map(sheet => ({ label: sheet, value: sheet }))}
            />
          </div>
          <div className="mt-4 text-gray-500 text-sm">
            <p>Only selected sheets will be processed. If no sheets are selected, all sheets will be processed.</p>
          </div>
        </div>
      )}
    </Modal>
  );
};

export default SheetSelectionModal;