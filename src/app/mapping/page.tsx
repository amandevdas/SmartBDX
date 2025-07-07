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
    setLoading(true);
    // In a real implementation, fetch data from API
    // fetch('/api/mapping')
    //   .then(res => res.json())
    //   .then(data => {
    //     setFiles(data);
    //     setLoading(false);
    //   })
    //   .catch(err => {
    //     setError(err);
    //     setLoading(false);
    //   });

    // For demo purposes, simulate API call with mock data
    setTimeout(() => {
      const mockFiles: MappingFile[] = [
        {
          id: "file-001",
          file_name: "Q1_2023_Claims.xlsx",
          status: "pending",
          confidence: 0.85,
          column_count: 12,
          mapped_columns: 10,
          last_modified: "2023-04-15",
        },
        {
          id: "file-002",
          file_name: "Q2_2023_Claims.xlsx",
          status: "pending",
          confidence: 0.92,
          column_count: 12,
          mapped_columns: 12,
          last_modified: "2023-07-20",
        },
        {
          id: "file-003",
          file_name: "Q3_2023_Claims.xlsx",
          status: "approved",
          confidence: 0.78,
          column_count: 12,
          mapped_columns: 11,
          last_modified: "2023-10-10",
        },
        {
          id: "file-004",
          file_name: "Q4_2023_Claims.xlsx",
          status: "rejected",
          confidence: 0.65,
          column_count: 12,
          mapped_columns: 8,
          last_modified: "2024-01-05",
        },
        {
          id: "file-005",
          file_name: "Annual_Summary_2023.xlsx",
          status: "pending",
          confidence: 0.73,
          column_count: 15,
          mapped_columns: 12,
          last_modified: "2024-01-15",
        },
      ];
      
      setFiles(mockFiles);
      setLoading(false);
    }, 1000);
  }, []);

  const handleViewMapping = (file: MappingFile) => {
    setSelectedFile(file);
    setMappingLoading(true);
    setMappingModalVisible(true);
    setSelectedMappings([]);
    
    // In a real implementation, fetch mapping data from API
    // fetch(`/api/mapping/${file.id}`)
    //   .then(res => res.json())
    //   .then(data => {
    //     setMappings(data.mappings);
    //     setMappingLoading(false);
    //   })
    //   .catch(err => {
    //     setError(err);
    //     setMappingLoading(false);
    //   });

    // For demo purposes, simulate API call with mock data
    setTimeout(() => {
      const mockMappings: ColumnMapping[] = [
        {
          source_column: "Policy Number",
          target_column: "policy_id",
          confidence: 0.98,
          examples: ["POL-123456", "POL-789012"],
        },
        {
          source_column: "Insured Name",
          target_column: "insured_name",
          confidence: 0.95,
          examples: ["Acme Corp", "XYZ Ltd"],
        },
        {
          source_column: "Premium Amount",
          target_column: "premium",
          confidence: 0.92,
          examples: ["$1,200.00", "$950.50"],
        },
        {
          source_column: "Policy Start Date",
          target_column: "inception_date",
          confidence: 0.88,
          examples: ["01/01/2023", "15/02/2023"],
        },
        {
          source_column: "Policy End Date",
          target_column: "expiry_date",
          confidence: 0.87,
          examples: ["31/12/2023", "14/02/2024"],
        },
        {
          source_column: "Risk Location",
          target_column: "risk_address",
          confidence: 0.75,
          examples: ["123 Main St, New York", "456 Park Ave, Chicago"],
        },
        {
          source_column: "Coverage Type",
          target_column: "coverage_type",
          confidence: 0.82,
          examples: ["Property", "Liability"],
        },
        {
          source_column: "Limit of Liability",
          target_column: "limit",
          confidence: 0.79,
          examples: ["$1,000,000", "$500,000"],
        },
        {
          source_column: "Deductible",
          target_column: "deductible",
          confidence: 0.85,
          examples: ["$5,000", "$10,000"],
        },
        {
          source_column: "Broker Name",
          target_column: "broker",
          confidence: 0.68,
          examples: ["ABC Insurance", "XYZ Brokers"],
        },
        {
          source_column: "Policy Status",
          target_column: "status",
          confidence: 0.91,
          examples: ["Active", "Renewed"],
        },
        {
          source_column: "Commission Rate",
          target_column: "commission_pct",
          confidence: 0.72,
          examples: ["15%", "12.5%"],
        },
      ];
      
      setMappings(mockMappings);
      setMappingLoading(false);
    }, 1000);
  };

  const handleApproveMapping = () => {
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

    // For demo purposes, update state directly
    setFiles(prev => prev.map(file => 
      file.id === selectedFile?.id ? { ...file, status: 'approved' } : file
    ));
    setMappingModalVisible(false);
  };

  const handleRejectMapping = () => {
    // In a real implementation, call API to reject mapping
    // fetch(`/api/mapping/${selectedFile?.id}/reject`, {
    //   method: 'POST',
    // })
    //   .then(() => {
    //     setFiles(prev => prev.map(file => 
    //       file.id === selectedFile?.id ? { ...file, status: 'rejected' } : file
    //     ));
    //     setMappingModalVisible(false);
    //   })
    //   .catch(err => {
    //     setError(err);
    //   });

    // For demo purposes, update state directly
    setFiles(prev => prev.map(file => 
      file.id === selectedFile?.id ? { ...file, status: 'rejected' } : file
    ));
    setMappingModalVisible(false);
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