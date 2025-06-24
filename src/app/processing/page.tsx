"use client";

import { useState, useEffect } from "react";
import { Card, Progress, Button, Space, Select, InputNumber, Collapse, Alert, Spin } from "antd";
import { PauseCircleOutlined, PlayCircleOutlined, StopOutlined, SettingOutlined } from "@ant-design/icons";
const { Option } = Select;

interface BatchJob {
  id: string;
  status: "processing" | "paused" | "completed" | "failed";
  startTime: string;
  completedFiles: number;
  totalFiles: number;
  errors: number;
  parallelism: number;
  estimatedTimeRemaining?: number;
}

const ProcessingPage = () => {
  const [batches, setBatches] = useState<BatchJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [parallelism, setParallelism] = useState(4);
  const [priority, setPriority] = useState("normal");

  useEffect(() => {
    setLoading(true);
    // In a real implementation, fetch data from API
    // fetch('/api/status')
    //   .then(res => res.json())
    //   .then(data => {
    //     setBatches(data);
    //     setLoading(false);
    //   })
    //   .catch(err => {
    //     setError(err);
    //     setLoading(false);
    //   });

    // For demo purposes, simulate API call with mock data
    setTimeout(() => {
      const mockBatches: BatchJob[] = [
        {
          id: "batch-001",
          status: "processing",
          startTime: new Date(Date.now() - 1000 * 60 * 15).toISOString(), // 15 minutes ago
          completedFiles: 12,
          totalFiles: 20,
          errors: 0,
          parallelism: 4,
          estimatedTimeRemaining: 600, // 10 minutes
        },
        {
          id: "batch-002",
          status: "paused",
          startTime: new Date(Date.now() - 1000 * 60 * 45).toISOString(), // 45 minutes ago
          completedFiles: 5,
          totalFiles: 15,
          errors: 2,
          parallelism: 2,
        },
        {
          id: "batch-003",
          status: "completed",
          startTime: new Date(Date.now() - 1000 * 60 * 120).toISOString(), // 2 hours ago
          completedFiles: 10,
          totalFiles: 10,
          errors: 0,
          parallelism: 4,
        },
      ];
      
      setBatches(mockBatches);
      setLoading(false);
    }, 1000);
  }, []);

  const startBatch = (config: { parallelism: number; priority: string }) => {
    // In a real implementation, call API to start a new batch
    // fetch('/api/process/start', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(config),
    // })
    //   .then(res => res.json())
    //   .then(data => {
    //     setBatches(prev => [...prev, data]);
    //   })
    //   .catch(err => {
    //     setError(err);
    //   });

    // For demo purposes, simulate API call
    const newBatch: BatchJob = {
      id: `batch-${Date.now()}`,
      status: "processing",
      startTime: new Date().toISOString(),
      completedFiles: 0,
      totalFiles: 18,
      errors: 0,
      parallelism: config.parallelism,
      estimatedTimeRemaining: 1800, // 30 minutes
    };
    
    setBatches(prev => [...prev, newBatch]);
  };

  const pauseBatch = (batchId: string) => {
    // In a real implementation, call API to pause a batch
    // fetch(`/api/process/${batchId}/pause`, {
    //   method: 'POST',
    // })
    //   .then(() => {
    //     setBatches(prev => prev.map(batch => 
    //       batch.id === batchId ? { ...batch, status: 'paused' } : batch
    //     ));
    //   })
    //   .catch(err => {
    //     setError(err);
    //   });

    // For demo purposes, update state directly
    setBatches(prev => prev.map(batch => 
      batch.id === batchId ? { ...batch, status: 'paused' } : batch
    ));
  };

  const resumeBatch = (batchId: string) => {
    // In a real implementation, call API to resume a batch
    // fetch(`/api/process/${batchId}/resume`, {
    //   method: 'POST',
    // })
    //   .then(() => {
    //     setBatches(prev => prev.map(batch => 
    //       batch.id === batchId ? { ...batch, status: 'processing' } : batch
    //     ));
    //   })
    //   .catch(err => {
    //     setError(err);
    //   });

    // For demo purposes, update state directly
    setBatches(prev => prev.map(batch => 
      batch.id === batchId ? { ...batch, status: 'processing' } : batch
    ));
  };

  const stopBatch = (batchId: string) => {
    // In a real implementation, call API to stop a batch
    // fetch(`/api/process/${batchId}/stop`, {
    //   method: 'POST',
    // })
    //   .then(() => {
    //     setBatches(prev => prev.filter(batch => batch.id !== batchId));
    //   })
    //   .catch(err => {
    //     setError(err);
    //   });

    // For demo purposes, update state directly
    setBatches(prev => prev.filter(batch => batch.id !== batchId));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Processing Dashboard</h1>
        <Space>
          <Button type="primary" onClick={() => startBatch({ parallelism, priority })}>
            Start New Batch
          </Button>
        </Space>
      </div>

      <Card title="Processing Configuration" className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="mb-2 font-medium">Parallelism</div>
            <InputNumber
              min={1}
              max={16}
              value={parallelism}
              onChange={(value) => setParallelism(value || 4)}
              className="w-full"
            />
            <div className="mt-1 text-gray-500 text-sm">
              Number of files to process in parallel
            </div>
          </div>
          <div>
            <div className="mb-2 font-medium">Priority</div>
            <Select
              value={priority}
              onChange={setPriority}
              className="w-full"
            >
              <Option value="low">Low</Option>
              <Option value="normal">Normal</Option>
              <Option value="high">High</Option>
            </Select>
            <div className="mt-1 text-gray-500 text-sm">
              Processing priority for resource allocation
            </div>
          </div>
        </div>

        <Collapse
          className="mt-6"
          ghost
          items={[
            {
              key: "1",
              label: "Advanced Options",
              children: (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <div className="mb-2 font-medium">Error Handling</div>
                    <Select defaultValue="continue" className="w-full">
                      <Option value="continue">Continue on Error</Option>
                      <Option value="stop">Stop on Error</Option>
                    </Select>
                  </div>
                  <div>
                    <div className="mb-2 font-medium">Notification</div>
                    <Select defaultValue="all" className="w-full">
                      <Option value="all">All Events</Option>
                      <Option value="errors">Errors Only</Option>
                      <Option value="completion">Completion Only</Option>
                      <Option value="none">None</Option>
                    </Select>
                  </div>
                </div>
              )
            }
          ]}
        />
      </Card>

      <h2 className="text-xl font-medium mb-4">Active Batches</h2>
      
      {error && (
        <Alert type="error" message="Failed to load batches" description={error.message} className="mb-4" />
      )}
      
      <Spin spinning={loading}>
        <div className="space-y-4">
          {batches.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <p className="text-gray-500">No active batches</p>
              <Button type="primary" className="mt-4" onClick={() => startBatch({ parallelism, priority })}>
                Start New Batch
              </Button>
            </div>
          ) : (
            batches.map((batch) => (
              <Card key={batch.id} className="mb-4">
                <div className="flex justify-between items-center mb-4">
                  <div>
                    <h3 className="text-lg font-medium">Batch #{batch.id}</h3>
                    <p className="text-gray-500">Started: {new Date(batch.startTime).toLocaleString()}</p>
                  </div>
                  <Space>
                    {batch.status === "processing" ? (
                      <Button icon={<PauseCircleOutlined />} onClick={() => pauseBatch(batch.id)}>
                        Pause
                      </Button>
                    ) : batch.status === "paused" ? (
                      <Button icon={<PlayCircleOutlined />} onClick={() => resumeBatch(batch.id)}>
                        Resume
                      </Button>
                    ) : null}
                    <Button icon={<StopOutlined />} danger onClick={() => stopBatch(batch.id)}>
                      Stop
                    </Button>
                  </Space>
                </div>
                
                <div className="mb-2">
                  <div className="flex justify-between mb-1">
                    <span>Progress: {batch.completedFiles} of {batch.totalFiles} files</span>
                    <span>{Math.round((batch.completedFiles / batch.totalFiles) * 100)}%</span>
                  </div>
                  <Progress 
                    percent={Math.round((batch.completedFiles / batch.totalFiles) * 100)} 
                    status={batch.status === "failed" ? "exception" : undefined}
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-500">Status:</span>{" "}
                    <span className={`font-medium ${
                      batch.status === "completed" ? "text-green-600" : 
                      batch.status === "failed" ? "text-red-600" : 
                      batch.status === "processing" ? "text-blue-600" : 
                      "text-yellow-600"
                    }`}>
                      {batch.status.charAt(0).toUpperCase() + batch.status.slice(1)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">Errors:</span>{" "}
                    <span className="font-medium">{batch.errors}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Parallelism:</span>{" "}
                    <span className="font-medium">{batch.parallelism}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Estimated Time:</span>{" "}
                    <span className="font-medium">
                      {batch.estimatedTimeRemaining ? `${Math.ceil(batch.estimatedTimeRemaining / 60)} minutes` : "Calculating..."}
                    </span>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </Spin>
    </div>
  );
};

export default ProcessingPage;