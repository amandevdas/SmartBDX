"use client";

import { useState, useEffect } from "react";
import { Table, Card, Button, Tag, Space, Spin, Alert, Tabs, Progress, Modal, Checkbox, Row, Col } from "antd";
import { CheckOutlined, CloseOutlined, EyeOutlined, CheckCircleOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";


interface MappingFile {
  id: string;
  file_name: string;
  status: "pending" | "approved" | "rejected";
  confidence: number;
  column_count: number;
  mapped_columns: number;
  last_modified: string;
}

interface ColumnMapping {
  source_column: string;
  target_column: string;
  confidence: number;
  examples: string[];
}

const MappingPage = () => {
  const [files, setFiles] = useState<MappingFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [selectedFile, setSelectedFile] = useState<MappingFile | null>(null);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [mappingModalVisible, setMappingModalVisible] = useState(false);
  const [mappingLoading, setMappingLoading] = useState(false);
  const [selectedMappings, setSelectedMappings] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState("pending");

  useEffect(() => {
    const loadMappingFiles = async () => {
      setLoading(true);
      try {
        const response = await fetch('/api/mapping?status=all');
        const result = await response.json();
        
        if (result.success && result.data.files_summary) {
          // Transform backend data to UI format
          const transformedFiles: MappingFile[] = result.data.files_summary.map((file: any) => ({
            id: `${file.file_name}_${file.sheet_name}`,
            file_name: `${file.file_name}/${file.sheet_name}`,
            status: file.status,
            confidence: file.high_confidence / file.total_columns,
            column_count: file.total_columns,
            mapped_columns: file.total_columns - file.needs_review,
            last_modified: new Date().toISOString().split('T')[0]
          }));
          setFiles(transformedFiles);
        } else {
          setFiles([]);
        }
      } catch (err) {
        console.error('Error loading mapping files:', err);
        setError(err as Error);
        setFiles([]);
      } finally {
        setLoading(false);
      }
    };

    loadMappingFiles();
  }, []);

  const handleViewMapping = async (file: MappingFile) => {
    setSelectedFile(file);
    setMappingLoading(true);
    setMappingModalVisible(true);
    setSelectedMappings([]);
    
    try {
      // Extract file_name and sheet_name from the combined id
      const [fileName, sheetName] = file.file_name.split('/');
      const response = await fetch(`/api/mapping?file_name=${fileName}&sheet_name=${sheetName}&status=pending`);
      const result = await response.json();
      
      if (result.success && result.data.mappings) {
        // Transform backend mappings to UI format
        const transformedMappings: ColumnMapping[] = result.data.mappings.map((mapping: any) => ({
          source_column: mapping.source_column,
          target_column: mapping.target_column,
          confidence: mapping.confidence,
          examples: mapping.sample_values || []
        }));
        setMappings(transformedMappings);
      } else {
        setMappings([]);
      }
    } catch (err) {
      console.error('Error loading mapping details:', err);
      setError(err as Error);
      setMappings([]);
    } finally {
      setMappingLoading(false);
    }
  };

  const handleApproveMapping = async () => {
    // In a real implementation, call API to approve mapping
    // fetch(`/api/mapping/${selectedFile?.id}/approve`, {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ approved_mappings: selectedMappings.length ? selectedMappings : 'all' }),
    // })
    //   .then(() => {
    //     setFiles(prev => prev.map(file => 
    //       file.id === selectedFile?.id ? { ...file, status: 'approved' } : file
    //     ));
    //     setMappingModalVisible(false);
    //   })
    //   .catch(err => {
    //     setError(err);
    //   });

    if (!selectedFile) return;
    
    try {
      const [fileName, sheetName] = selectedFile.file_name.split('/');
      
      // Prepare approval data
      const approvalData = {
        file_name: fileName,
        sheet_name: sheetName,
        approved_mappings: selectedMappings.length > 0
          ? mappings.filter(m => selectedMappings.includes(m.source_column))
          : mappings, // Approve all if none specifically selected
        rejected_mappings: [],
        reviewed_by: 'frontend_user'
      };
      
      const response = await fetch('/api/mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(approvalData)
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Update local state
        setFiles(prev => prev.map(file =>
          file.id === selectedFile?.id ? { ...file, status: 'approved' } : file
        ));
        setMappingModalVisible(false);
      } else {
        setError(new Error(result.error || 'Failed to approve mapping'));
      }
    } catch (err) {
      console.error('Error approving mapping:', err);
      setError(err as Error);
    }
  };

  const handleRejectMapping = async () => {
    if (!selectedFile) return;
    
    try {
      const [fileName, sheetName] = selectedFile.file_name.split('/');
      
      const rejectionData = {
        file_name: fileName,
        sheet_name: sheetName,
        approved_mappings: [],
        rejected_mappings: mappings.map(m => m.source_column),
        reviewed_by: 'frontend_user'
      };
      
      const response = await fetch('/api/mapping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rejectionData)
      });
      
      const result = await response.json();
      
      if (result.success) {
        setFiles(prev => prev.map(file =>
          file.id === selectedFile?.id ? { ...file, status: 'rejected' } : file
        ));
        setMappingModalVisible(false);
      } else {
        setError(new Error(result.error || 'Failed to reject mapping'));
      }
    } catch (err) {
      console.error('Error rejecting mapping:', err);
      setError(err as Error);
    }
  };

  const handleSelectMapping = (sourceColumn: string) => {
    setSelectedMappings(prev => {
      if (prev.includes(sourceColumn)) {
        return prev.filter(col => col !== sourceColumn);
      } else {
        return [...prev, sourceColumn];
      }
    });
  };

  const handleSelectAll = () => {
    if (selectedMappings.length === mappings.length) {
      setSelectedMappings([]);
    } else {
      setSelectedMappings(mappings.map(m => m.source_column));
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.9) return "#52c41a"; // green
    if (confidence >= 0.75) return "#faad14"; // yellow
    return "#f5222d"; // red
  };

  const columns: ColumnsType<MappingFile> = [
    {
      title: "File Name",
      dataIndex: "file_name",
      key: "file_name",
      sorter: (a, b) => a.file_name.localeCompare(b.file_name),
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status) => {
        let color = "";
        let text = "";
        
        switch (status) {
          case "approved":
            color = "success";
            text = "Approved";
            break;
          case "rejected":
            color = "error";
            text = "Rejected";
            break;
          case "pending":
            color = "warning";
            text = "Pending";
            break;
        }
        
        return <Tag color={color}>{text}</Tag>;
      },
      filters: [
        { text: "Pending", value: "pending" },
        { text: "Approved", value: "approved" },
        { text: "Rejected", value: "rejected" },
      ],
      onFilter: (value, record) => record.status === value,
    },
    {
      title: "Confidence",
      dataIndex: "confidence",
      key: "confidence",
      render: (confidence) => (
        <Progress 
          percent={Math.round(confidence * 100)} 
          size="small" 
          strokeColor={getConfidenceColor(confidence)}
          format={percent => `${percent}%`}
        />
      ),
      sorter: (a, b) => a.confidence - b.confidence,
    },
    {
      title: "Mapped Columns",
      key: "mapped_columns",
      render: (_, record) => `${record.mapped_columns}/${record.column_count}`,
      sorter: (a, b) => (a.mapped_columns / a.column_count) - (b.mapped_columns / b.column_count),
    },
    {
      title: "Last Modified",
      dataIndex: "last_modified",
      key: "last_modified",
      sorter: (a, b) => new Date(a.last_modified).getTime() - new Date(b.last_modified).getTime(),
    },
    {
      title: "Actions",
      key: "actions",
      render: (_, record) => (
        <Space>
          <Button 
            icon={<EyeOutlined />} 
            onClick={() => handleViewMapping(record)}
            type="primary"
            ghost
          >
            View Mapping
          </Button>
          {record.status === "pending" && (
            <>
              <Button 
                icon={<CheckOutlined />} 
                onClick={() => {
                  setSelectedFile(record);
                  handleApproveMapping();
                }}
                type="text"
                style={{ color: "#52c41a" }}
              >
                Approve
              </Button>
              <Button 
                icon={<CloseOutlined />} 
                onClick={() => {
                  setSelectedFile(record);
                  handleRejectMapping();
                }}
                type="text"
                danger
              >
                Reject
              </Button>
            </>
          )}
        </Space>
      ),
    },
  ];

  const filteredFiles = files.filter(file => file.status === activeTab);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Mapping Approval Dashboard</h1>
        <Button 
          type="primary" 
          icon={<CheckCircleOutlined />}
          onClick={() => {
            // Approve all pending mappings
            setFiles(prev => prev.map(file => 
              file.status === "pending" ? { ...file, status: 'approved' } : file
            ));
          }}
          disabled={!files.some(file => file.status === "pending")}
        >
          Approve All Pending
        </Button>
      </div>

      {error && (
        <Alert type="error" message="Failed to load mapping data" description={error.message} className="mb-4" />
      )}

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        className="mb-4"
        items={[
          {
            key: "pending",
            label: `Pending (${files.filter(f => f.status === "pending").length})`
          },
          {
            key: "approved",
            label: `Approved (${files.filter(f => f.status === "approved").length})`
          },
          {
            key: "rejected",
            label: `Rejected (${files.filter(f => f.status === "rejected").length})`
          }
        ]}
      />

      <Spin spinning={loading}>
        <Table
          columns={columns}
          dataSource={filteredFiles}
          rowKey="id"
          pagination={{ pageSize: 10 }}
        />
      </Spin>

      <Modal
        title={`Column Mapping: ${selectedFile?.file_name}`}
        open={mappingModalVisible}
        onCancel={() => setMappingModalVisible(false)}
        width={800}
        footer={[
          <Button key="cancel" onClick={() => setMappingModalVisible(false)}>
            Cancel
          </Button>,
          <Button 
            key="reject" 
            danger 
            onClick={handleRejectMapping}
            disabled={selectedFile?.status === "approved" || selectedFile?.status === "rejected"}
          >
            Reject Mapping
          </Button>,
          <Button 
            key="approve" 
            type="primary" 
            onClick={handleApproveMapping}
            disabled={selectedFile?.status === "approved" || selectedFile?.status === "rejected"}
          >
            {selectedMappings.length > 0 && selectedMappings.length < mappings.length
              ? `Approve Selected (${selectedMappings.length})`
              : "Approve All Mappings"}
          </Button>,
        ]}
      >
        <Spin spinning={mappingLoading}>
          {selectedFile?.status !== "pending" && (
            <Alert 
              type={selectedFile?.status === "approved" ? "success" : "error"}
              message={`This mapping has been ${selectedFile?.status}`}
              className="mb-4"
            />
          )}
          
          <div className="mb-4">
            <Checkbox 
              onChange={handleSelectAll}
              checked={selectedMappings.length === mappings.length && mappings.length > 0}
              indeterminate={selectedMappings.length > 0 && selectedMappings.length < mappings.length}
              disabled={selectedFile?.status !== "pending"}
            >
              Select All
            </Checkbox>
          </div>
          
          <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
            {mappings.map((mapping) => (
              <Card 
                key={mapping.source_column} 
                size="small"
                className={`border-l-4 ${
                  mapping.confidence >= 0.9 ? "border-l-green-500" :
                  mapping.confidence >= 0.75 ? "border-l-yellow-500" :
                  "border-l-red-500"
                }`}
              >
                <Row gutter={16} align="middle">
                  <Col span={1}>
                    <Checkbox 
                      checked={selectedMappings.includes(mapping.source_column)}
                      onChange={() => handleSelectMapping(mapping.source_column)}
                      disabled={selectedFile?.status !== "pending"}
                    />
                  </Col>
                  <Col span={23}>
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center">
                        <div className="font-medium mr-2">Source:</div>
                        <Tag color="blue">{mapping.source_column}</Tag>
                      </div>
                      <Progress 
                        percent={Math.round(mapping.confidence * 100)} 
                        size="small" 
                        strokeColor={getConfidenceColor(mapping.confidence)}
                        style={{ width: 100 }}
                      />
                    </div>
                    <div className="flex items-center mb-2">
                      <div className="font-medium mr-2">Target:</div>
                      <Tag color="green">{mapping.target_column}</Tag>
                    </div>
                    <div className="text-xs text-gray-500">
                      <div className="font-medium mb-1">Sample Values:</div>
                      <div className="flex flex-wrap gap-2">
                        {mapping.examples.map((example, i) => (
                          <Tag key={i} color="default">{example}</Tag>
                        ))}
                      </div>
                    </div>
                  </Col>
                </Row>
              </Card>
            ))}
          </div>
        </Spin>
      </Modal>
    </div>
  );
};

export default MappingPage;