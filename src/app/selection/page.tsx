"use client";

import { useState, useEffect } from "react";
import { Table, Button, Input, Space, Spin, notification, Select, Alert } from "antd";
import { SearchOutlined, FileExcelOutlined, StarOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import StatusBadge from "@/components/common/StatusBadge";

interface FileMeta {
  id: string;
  file_name: string;
  status: "pending" | "processing" | "completed" | "failed";
  last_modified: string;
  size: number;
  sheets: number;
  sheetNames?: string[]; // Add sheet names array
  selectedSheets?: string[]; // Track selected sheets
}

const SelectionPage = () => {
  const [files, setFiles] = useState<FileMeta[]>([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchText, setSearchText] = useState("");
  const [fileSheets, setFileSheets] = useState<Record<string, string[]>>({});
  const [selectedSheets, setSelectedSheets] = useState<Record<string, string[]>>({});

  useEffect(() => {
    setLoading(true);
    // In a real implementation, fetch data from API
    // fetch('/api/files')
    //   .then((res) => res.json())
    //   .then((data) => {
    //     setFiles(data);
    //     setLoading(false);
    //   })
    //   .catch(() => {
    //     notification.error({ message: 'Failed to load files.' });
    //     setLoading(false);
    //   });
    
    // For demo purposes, simulate API call with mock data
    setTimeout(() => {
      const mockFiles: FileMeta[] = [
        {
          id: "1",
          file_name: "Q1_2023_Claims.xlsx",
          status: "completed",
          last_modified: "2023-04-15",
          size: 1024 * 25,
          sheets: 3,
          sheetNames: ["Claims", "Premiums", "Summary"]
        },
        {
          id: "2",
          file_name: "Q2_2023_Claims.xlsx",
          status: "completed",
          last_modified: "2023-07-20",
          size: 1024 * 32,
          sheets: 3,
          sheetNames: ["Claims", "Premiums", "Summary"]
        },
        {
          id: "3",
          file_name: "Q3_2023_Claims.xlsx",
          status: "processing",
          last_modified: "2023-10-10",
          size: 1024 * 28,
          sheets: 3,
          sheetNames: ["Claims", "Premiums", "Summary"]
        },
        {
          id: "4",
          file_name: "Q4_2023_Claims.xlsx",
          status: "pending",
          last_modified: "2024-01-05",
          size: 1024 * 30,
          sheets: 3,
          sheetNames: ["Claims", "Premiums", "Summary"]
        },
        {
          id: "5",
          file_name: "Annual_Summary_2023.xlsx",
          status: "failed",
          last_modified: "2024-01-15",
          size: 1024 * 45,
          sheets: 5,
          sheetNames: ["Claims", "Premiums", "Expenses", "Revenue", "Summary"]
        },
        {
          id: "6",
          file_name: "Policy_Renewals_2024.xlsx",
          status: "pending",
          last_modified: "2024-01-20",
          size: 1024 * 38,
          sheets: 4,
          sheetNames: ["Policies", "Renewals", "Cancellations", "Summary"]
        },
        {
          id: "7",
          file_name: "Premium_Calculations_Q1_2024.xlsx",
          status: "pending",
          last_modified: "2024-02-01",
          size: 1024 * 22,
          sheets: 2,
          sheetNames: ["Calculations", "Results"]
        },
      ];
      
      // Initialize fileSheets state
      const sheetsMap: Record<string, string[]> = {};
      mockFiles.forEach(file => {
        if (file.sheetNames) {
          sheetsMap[file.id] = file.sheetNames;
        }
      });
      
      setFiles(mockFiles);
      setFileSheets(sheetsMap);
      setLoading(false);
    }, 1000);
  }, []);

  
  const handleSheetSelection = (fileId: string, selectedSheetNames: string[]) => {
    setSelectedSheets(prev => ({
      ...prev,
      [fileId]: selectedSheetNames
    }));
  };
  
  const handleSelectAllSheets = (fileId: string) => {
    const allSheets = fileSheets[fileId] || [];
    setSelectedSheets(prev => ({
      ...prev,
      [fileId]: [...allSheets]
    }));
  };

  const handleProcess = () => {
    // Prepare data with selected files and their selected sheets
    const processData = selectedRowKeys.map(fileId => ({
      fileId,
      sheets: selectedSheets[fileId as string] || [] // If no sheets selected, include all
    }));
    
    notification.success({
      message: `Processing ${selectedRowKeys.length} files with selected sheets`
    });
    
    // In a real implementation, call API to process files with selected sheets
    // fetch('/api/process', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ files: processData }),
    // })
    //   .then((res) => {
    //     if (res.ok) {
    //       notification.success({ message: 'Batch started!' });
    //     } else {
    //       notification.error({ message: 'Failed to start batch.' });
    //     }
    //   })
    //   .catch(() => notification.error({ message: 'Error communicating with API.' }));
    
    console.log('Processing data:', processData);
  };

  const filteredFiles = files.filter(file => 
    file.file_name.toLowerCase().includes(searchText.toLowerCase())
  );

  const columns: ColumnsType<FileMeta> = [
    {
      title: "",
      key: "favorite",
      width: 40,
      render: () => (
        <Button type="text" className="text-gray-400 hover:text-yellow-500">
          <StarOutlined />
        </Button>
      ),
    },
    {
      title: "File Name",
      dataIndex: "file_name",
      key: "file_name",
      render: (text, record) => (
        <div className="flex items-center py-2">
          <FileExcelOutlined className="mr-3 text-green-600 text-lg" />
          <div>
            <div className="font-medium">{text}</div>
            <div className="text-xs text-gray-500 mt-1">
              {record.sheets} sheets • {(record.size / 1024).toFixed(2)} KB
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 120,
      render: (status) => <StatusBadge status={status} />,
      filters: [
        { text: "Pending", value: "pending" },
        { text: "Processing", value: "processing" },
        { text: "Completed", value: "completed" },
        { text: "Failed", value: "failed" },
      ],
      onFilter: (value, record) => record.status === value,
    },
    {
      title: "Last Modified",
      dataIndex: "last_modified",
      key: "last_modified",
      width: 120,
      render: (date) => {
        // Format date to be more Gmail-like
        const dateObj = new Date(date);
        const today = new Date();
        const isToday = dateObj.toDateString() === today.toDateString();
        
        if (isToday) {
          return dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else {
          return dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }
      },
      sorter: (a, b) => new Date(a.last_modified).getTime() - new Date(b.last_modified).getTime(),
    },
  ];

  return (
    <div className="bg-white rounded-lg">
      <div className="flex justify-between items-center p-4 border-b border-gray-200">
        <div className="flex items-center">
          <h1 className="text-lg font-medium text-gray-700">Bordereaux Files</h1>
          <span className="ml-2 text-sm text-gray-500">({files.length})</span>
        </div>
        <div className="flex items-center">
          <Button
            type="text"
            icon={<SearchOutlined />}
            className="mr-2"
            onClick={() => {
              // This would open a more advanced search dialog in a real app
              notification.info({ message: "Advanced search would open here" });
            }}
          />
          <Input
            placeholder="Search in files"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            style={{ width: 200 }}
            className="rounded-full bg-gray-100 border-0 hover:bg-gray-200 focus:bg-white focus:border-gray-300"
          />
        </div>
      </div>
      
      <Spin spinning={loading}>
        <Table
          rowSelection={{
            selectedRowKeys,
            onChange: setSelectedRowKeys,
            columnWidth: 48,
            columnTitle: ' ',
            renderCell: (checked, record, index, originNode) => {
              return <div className="flex justify-center">{originNode}</div>;
            }
          }}
          expandable={{
            expandedRowRender: (record) => {
              const fileId = record.id;
              const sheets = fileSheets[fileId] || [];
              
              return (
                <div className="py-3 pl-12 pr-4 bg-gray-50">
                  <div className="font-medium mb-2 text-gray-700">Select Sheets:</div>
                  <div className="flex items-center gap-4">
                    <Select
                      mode="multiple"
                      style={{ width: '80%' }}
                      placeholder="Select sheets to process"
                      value={selectedSheets[fileId] || []}
                      onChange={(values) => handleSheetSelection(fileId, values)}
                      options={sheets.map(sheet => ({ label: sheet, value: sheet }))}
                    />
                    <Button
                      type="default"
                      size="small"
                      onClick={() => handleSelectAllSheets(fileId)}
                    >
                      Select All
                    </Button>
                  </div>
                </div>
              );
            },
            rowExpandable: (record) => (fileSheets[record.id]?.length || 0) > 0,
            expandIcon: ({ expanded, onExpand, record }) => (
              expanded ? (
                <Button type="text" size="small" onClick={e => onExpand(record, e)} className="mr-2">
                  <span className="text-blue-600">−</span>
                </Button>
              ) : (
                <Button type="text" size="small" onClick={e => onExpand(record, e)} className="mr-2">
                  <span className="text-blue-600">+</span>
                </Button>
              )
            )
          }}
          columns={columns}
          dataSource={filteredFiles}
          rowKey="id"
          pagination={{ pageSize: 25 }}
          className="gmail-style-table"
          rowClassName={(record) => {
            return selectedRowKeys.includes(record.id) ? 'bg-blue-50' : 'hover:bg-gray-50';
          }}
          size="middle"
          showHeader={false}
        />
      </Spin>
      
      {selectedRowKeys.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-3 flex justify-between items-center shadow-md" style={{ marginLeft: '16rem' }}>
          <div className="flex items-center">
            <span className="font-medium mr-2">
              {selectedRowKeys.length} selected
            </span>
            <Button type="text" onClick={() => setSelectedRowKeys([])}>
              Clear selection
            </Button>
          </div>
          
          <Button
            type="primary"
            onClick={handleProcess}
            size="middle"
            className="bg-blue-600 hover:bg-blue-700"
          >
            Process Selected ({selectedRowKeys.length})
          </Button>
        </div>
      )}
      
    </div>
  );
};

export default SelectionPage;