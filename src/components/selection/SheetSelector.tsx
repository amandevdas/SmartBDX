'use client';

import React, { useState, useMemo } from 'react';
import { Input, Button, Space, Typography, Select } from 'antd';

const { Text } = Typography;
const { Option } = Select;

interface SheetSelectorProps {
  allSheets: string[];
  selectedSheets: string[];
  onSelectionChange: (newSelection: string[]) => void;
}

export const SheetSelector: React.FC<SheetSelectorProps> = ({
  allSheets,
  selectedSheets,
  onSelectionChange,
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const filteredSheets = useMemo(() => {
    if (!searchTerm) {
      return allSheets;
    }
    return allSheets.filter(sheet =>
      sheet.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [allSheets, searchTerm]);

  const handleSelectAll = () => {
    onSelectionChange(allSheets);
  };

  const handleClearAll = () => {
    onSelectionChange([]);
  };

  return (
    <div className="p-4 bg-gray-50 border rounded-lg">
      <div className="flex justify-between items-center mb-4">
        <Text strong>Select Sheets ({selectedSheets.length} / {allSheets.length})</Text>
        <Space>
          <Button onClick={handleSelectAll} size="small" disabled={selectedSheets.length === allSheets.length}>
            Select All
          </Button>
          <Button onClick={handleClearAll} size="small" disabled={selectedSheets.length === 0}>
            Clear All
          </Button>
        </Space>
      </div>
      <Select
        mode="multiple"
        allowClear
        style={{ width: '100%' }}
        placeholder="Please select sheets"
        value={selectedSheets}
        onChange={onSelectionChange}
        onSearch={setSearchTerm}
        filterOption={false} // Since we are filtering manually
        maxTagCount="responsive"
      >
        {filteredSheets.map(sheet => (
          <Option key={sheet} value={sheet}>
            {sheet}
          </Option>
        ))}
      </Select>
    </div>
  );
};