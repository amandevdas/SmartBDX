"use client";

import { useState, useEffect } from "react";
import { Card, Table, Badge, Button, Tabs, Alert, Spin, Statistic, Row, Col } from "antd";
import { DownloadOutlined, CheckCircleOutlined, CloseCircleOutlined, ClockCircleOutlined } from "@ant-design/icons";
import type { ColumnsType } from "antd/es/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

interface BatchSummary {
  id: string;
  startTime: string;
  endTime?: string;
  status: "completed" | "failed" | "processing" | "paused";
  totalFiles: number;
  completedFiles: number;
  errorCount: number;
  processingTime: number; // in seconds
}

const MonitoringPage = () => {
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [activeTab, setActiveTab] = useState("1");

  useEffect(() => {
    setLoading(true);
    // Fetch real batch data from API
    fetch('/api/batches')
      .then(res => res.json())
      .then(data => {
        setBatches(data.data || []);
        setLoading(false);
      })
      .catch(err => {
        setError(err);
        setLoading(false);
      });
  }, []);

  // Calculate summary statistics
  const totalBatches = batches.length;
  const completedBatches = batches.filter(b => b.status === "completed").length;
  const failedBatches = batches.filter(b => b.status === "failed").length;
  const activeBatches = batches.filter(b => b.status === "processing" || b.status === "paused").length;
  
  const totalFiles = batches.reduce((sum, batch) => sum + batch.totalFiles, 0);
  const completedFiles = batches.reduce((sum, batch) => sum + batch.completedFiles, 0);
  const totalErrors = batches.reduce((sum, batch) => sum + batch.errorCount, 0);
  
  const avgProcessingTime = batches.length > 0 
    ? batches.reduce((sum, batch) => sum + batch.processingTime, 0) / batches.length 
    : 0;

  // Prepare chart data
  const statusChartData = [
    { name: "Completed", value: completedBatches, color: "#52c41a" },
    { name: "Failed", value: failedBatches, color: "#f5222d" },
    { name: "Active", value: activeBatches, color: "#1890ff" },
  ];

  const fileProcessingData = [
    { name: "Completed", value: completedFiles, color: "#52c41a" },
    { name: "Pending", value: totalFiles - completedFiles, color: "#faad14" },
  ];

  const batchTimeData = batches.map(batch => ({
    name: batch.id,
    time: Math.round(batch.processingTime / 60), // Convert to minutes
  }));

  const columns: ColumnsType<BatchSummary> = [
    {
      title: "Batch ID",
      dataIndex: "id",
      key: "id",
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      render: (status) => {
        let color = "";
        let icon = null;
        
        switch (status) {
          case "completed":
            color = "success";
            icon = <CheckCircleOutlined />;
            break;
          case "failed":
            color = "error";
            icon = <CloseCircleOutlined />;
            break;
          case "processing":
            color = "processing";
            icon = <ClockCircleOutlined />;
            break;
          case "paused":
            color = "warning";
            icon = <ClockCircleOutlined />;
            break;
        }
        
        return <Badge status={color as any} text={status.charAt(0).toUpperCase() + status.slice(1)} />;
      },
      filters: [
        { text: "Completed", value: "completed" },
        { text: "Failed", value: "failed" },
        { text: "Processing", value: "processing" },
        { text: "Paused", value: "paused" },
      ],
      onFilter: (value, record) => record.status === value,
    },
    {
      title: "Start Time",
      dataIndex: "startTime",
      key: "startTime",
      render: (time) => new Date(time).toLocaleString(),
      sorter: (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    },
    {
      title: "End Time",
      dataIndex: "endTime",
      key: "endTime",
      render: (time) => time ? new Date(time).toLocaleString() : "-",
    },
    {
      title: "Files",
      key: "files",
      render: (_, record) => `${record.completedFiles}/${record.totalFiles}`,
    },
    {
      title: "Errors",
      dataIndex: "errorCount",
      key: "errorCount",
      sorter: (a, b) => a.errorCount - b.errorCount,
    },
    {
      title: "Processing Time",
      key: "processingTime",
      render: (_, record) => {
        const minutes = Math.floor(record.processingTime / 60);
        const seconds = record.processingTime % 60;
        return `${minutes}m ${seconds}s`;
      },
      sorter: (a, b) => a.processingTime - b.processingTime,
    },
    {
      title: "Actions",
      key: "actions",
      render: (_, record) => (
        <Button 
          icon={<DownloadOutlined />} 
          type="text"
          onClick={() => console.log(`Download results for ${record.id}`)}
        >
          Download
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Monitoring Dashboard</h1>
      </div>

      {error && (
        <Alert type="error" message="Failed to load batch data" description={error.message} className="mb-4" />
      )}

      <Spin spinning={loading}>
        <Row gutter={16} className="mb-6">
          <Col span={6}>
            <Card>
              <Statistic
                title="Total Batches"
                value={totalBatches}
                valueStyle={{ color: "#1890ff" }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="Completed Batches"
                value={completedBatches}
                valueStyle={{ color: "#52c41a" }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="Failed Batches"
                value={failedBatches}
                valueStyle={{ color: "#f5222d" }}
              />
            </Card>
          </Col>
          <Col span={6}>
            <Card>
              <Statistic
                title="Total Errors"
                value={totalErrors}
                valueStyle={{ color: totalErrors > 0 ? "#f5222d" : "#52c41a" }}
              />
            </Card>
          </Col>
        </Row>

        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          className="mb-6"
          items={[
            {
              key: "1",
              label: "Summary Charts",
              children: (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card title="Batch Status">
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={statusChartData}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="value"
                            label={({ name, percent }) => `${name}: ${(percent ? (percent * 100).toFixed(0) : 0)}%`}
                          >
                            {statusChartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                  
                  <Card title="File Processing">
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={fileProcessingData}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            outerRadius={80}
                            fill="#8884d8"
                            dataKey="value"
                            label={({ name, percent }) => `${name}: ${(percent ? (percent * 100).toFixed(0) : 0)}%`}
                          >
                            {fileProcessingData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                  
                  <Card title="Processing Time by Batch (minutes)" className="col-span-2">
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={batchTimeData}
                          margin={{
                            top: 5,
                            right: 30,
                            left: 20,
                            bottom: 5,
                          }}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="time" fill="#8884d8" name="Processing Time (minutes)" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </Card>
                </div>
              )
            },
            {
              key: "2",
              label: "Batch Details",
              children: (
                <Table
                  columns={columns}
                  dataSource={batches}
                  rowKey="id"
                  pagination={{ pageSize: 10 }}
                />
              )
            }
          ]}
        />

        {activeBatches > 0 && (
          <Alert
            message="Active Batches"
            description={`You have ${activeBatches} active batch${activeBatches > 1 ? 'es' : ''} running. Monitor their progress in the Processing Dashboard.`}
            type="info"
            showIcon
            action={
              <Button size="small" type="primary" href="/processing">
                View Processing
              </Button>
            }
          />
        )}
      </Spin>
    </div>
  );
};

export default MonitoringPage;