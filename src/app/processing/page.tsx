// src/app/processing/page.tsx
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Table, Modal, Button, Tag, Space, Card, Statistic, message, Spin, Row, Col, Alert, Popconfirm } from 'antd';
import { EyeOutlined, DeleteOutlined } from '@ant-design/icons';
import { usePolling, apiRequest } from '../../hooks/useApi';
import type { JobStatus, ProcessedFile } from '../../types/api';
import { useAppContext } from '@/context/AppContext';
import type { ColumnsType } from 'antd/es/table';

// The JobItem now directly uses the JobStatus from context, ensuring type compatibility
interface JobItem extends JobStatus {
  id: string; // Add id for table rowKey
  batchId?: string;
  completed_files?: number;
  total_files?: number;
  current_file?: string;
  files?: ProcessedFile[];
}

export default function ProcessingPage() {
  const { jobs, updateJob, loadJobs, jobsLoading } = useAppContext();
  const [initialLoading, setInitialLoading] = useState(true);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedJob, setSelectedJob] = useState<JobItem | null>(null);
  const [clearingJobs, setClearingJobs] = useState(false);

  const showDetailsModal = (job: JobItem) => {
    setSelectedJob(job);
    setIsModalVisible(true);
  };

  const handleModalClose = () => {
    setIsModalVisible(false);
    setSelectedJob(null);
  };

  const handleClearAllJobs = async () => {
    setClearingJobs(true);
    try {
      const response = await apiRequest<{
        success: boolean;
        data: { deletedCount: number };
        message: string;
      }>('/jobs/clear', {
        method: 'DELETE',
      });
      
      if (response.success) {
        message.success(`Successfully cleared ${response.data.deletedCount} jobs`);
        // Reload jobs to update the UI
        await loadJobs();
      } else {
        message.error('Failed to clear jobs');
      }
    } catch (error) {
      console.error('Error clearing jobs:', error);
      message.error('Failed to clear jobs');
    } finally {
      setClearingJobs(false);
    }
  };

  // Load jobs from KV store when component mounts
  useEffect(() => {
    const initializeJobs = async () => {
      try {
        await loadJobs();
      } catch (error) {
        console.error('Failed to load jobs:', error);
      } finally {
        setInitialLoading(false);
      }
    };

    initializeJobs();
  }, [loadJobs]);

  const pollingFetcher = useCallback(async () => {
    const activeJobs = jobs.filter(job =>
      (job.status === 'processing' || job.status === 'submitted') && job.batchId
    );

    if (activeJobs.length === 0) return null;

    try {
      const batchIds = activeJobs.map(job => job.batchId!);
      const updates = await apiRequest<any[]>('/jobs/status', {
        method: 'POST',
        body: JSON.stringify({ batchIds }),
      });
      return updates;
    } catch (error) {
      console.error('Polling error:', error);
      return null;
    }
  }, [jobs]);

  const shouldPoll = useMemo(() => 
    jobs.some(job => job.status === 'processing' || job.status === 'submitted'),
    [jobs]
  );

  const { data: statusData, error: pollingError } = usePolling(
    pollingFetcher,
    5000,
    shouldPoll
  );

  useEffect(() => {
    if (statusData && Array.isArray(statusData)) {
      statusData.forEach(update => {
        if (update && update.jobId) {
          // The update from the bulk API should match Partial<JobStatus> & { jobId: string }
          updateJob(update);
        }
      });
    }
  }, [statusData, updateJob]);

  const getStatusColor = useCallback((status: string) => {
    const colors: { [key: string]: string } = {
      submitted: 'blue',
      processing: 'orange',
      completed: 'green',
      error: 'red',
      paused: 'purple',
      cancelled: 'gray'
    };
    return colors[status] || 'default';
  }, []);

  const getProgressStatus = useCallback((status: string) => {
    if (status === 'error') return 'exception';
    if (status === 'completed') return 'success';
    return 'active';
  }, []);

  const columns: ColumnsType<JobItem> = useMemo(() => [
    { title: 'Job ID', dataIndex: 'jobId', key: 'jobId', width: 250, render: (id: string) => <span className="font-mono text-xs">{id}</span> },
    { title: 'Batch ID', dataIndex: 'batchId', key: 'batchId', width: 250, render: (id: string) => <span className="font-mono text-xs">{id}</span> },
    {
      title: 'Status',
      dataIndex: 'status',
      width: 150,
      key: 'status',
      render: (status: string, record: JobItem) => (
        <Space direction="vertical" size="small">
          <Tag color={getStatusColor(status)}>{status.toUpperCase()}</Tag>
          {record.status === 'processing' && record.current_file && (
            <span className="text-xs text-gray-500">Processing: {record.current_file}</span>
          )}
        </Space>
      )
    },
    {
      title: 'Details',
      key: 'details',
      align: 'center' as const,
      width: 120,
      render: (_: any, record: JobItem) => (
        <Button
          icon={<EyeOutlined />}
          onClick={() => showDetailsModal(record)}
          disabled={!record.files || record.files.length === 0}
        >
          View Files
        </Button>
      ),
    },
    {
      title: 'Date',
      dataIndex: 'timestamp',
      key: 'date',
      width: 120,
      render: (ts: string) => ts ? new Date(ts).toLocaleDateString() : 'N/A'
    },
    {
      title: 'Time Taken',
      key: 'timeTaken',
      width: 120,
      render: (_: any, record: JobItem) => {
        if (!record.timestamp) return 'N/A';
        if (record.status !== 'completed' && record.status !== 'error') {
          return <Tag color="blue">In progress...</Tag>;
        }
        const start = new Date(record.timestamp).getTime();
        const end = record.endTime ? new Date(record.endTime).getTime() : Date.now();
        const duration = Math.round((end - start) / 1000);
        
        if (duration < 60) return `${duration}s`;
        const minutes = Math.floor(duration / 60);
        const seconds = duration % 60;
        return `${minutes}m ${seconds}s`;
      }
    }
  ], [getStatusColor]);

  const stats = useMemo(() => ({
    total: jobs.length,
    processing: jobs.filter(j => j.status === 'processing').length,
    completed: jobs.filter(j => j.status === 'completed').length,
    errors: jobs.filter(j => j.status === 'error').length,
  }), [jobs]);

  if (initialLoading) {
    return (
      <div className="p-6 flex justify-center items-center h-64">
        <Spin tip="Loading Jobs..." size="large">
          <div className="p-8" />
        </Spin>
      </div>
    );
  }

  return (
    <div className="p-6">
      <header className="mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Processing Dashboard</h1>
            <p className="text-gray-600">Monitor batch processing jobs</p>
          </div>
          {jobs.length > 0 && process.env.NODE_ENV === 'development' && (
            <Popconfirm
              title="Clear All Jobs"
              description="Are you sure you want to clear all jobs? This action cannot be undone."
              onConfirm={handleClearAllJobs}
              okText="Yes, Clear All"
              cancelText="Cancel"
              okButtonProps={{ danger: true }}
            >
              <Button
                danger
                icon={<DeleteOutlined />}
                loading={clearingJobs}
                disabled={clearingJobs}
              >
                Clear All Jobs
              </Button>
            </Popconfirm>
          )}
        </div>
      </header>

      <Row gutter={16} className="mb-6">
        <Col span={4}><Card><Statistic title="Total Jobs" value={stats.total} /></Card></Col>
        <Col span={4}><Card><Statistic title="Processing" value={stats.processing} valueStyle={{ color: '#fa8c16' }} /></Card></Col>
        <Col span={4}><Card><Statistic title="Completed" value={stats.completed} valueStyle={{ color: '#52c41a' }} /></Card></Col>
        <Col span={4}><Card><Statistic title="Errors" value={stats.errors} valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
      </Row>

      {pollingError && <Alert message="Polling Error" description={pollingError} type="error" showIcon className="mb-4" />}

      <Card>
        <Table
          columns={columns}
          dataSource={jobs.map(j => ({ ...j, id: j.jobId }))}
          rowKey="id"
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: 'No processing jobs found. Submit files from the Selection page.' }}
        />
      </Card>

      {selectedJob && (
        <Modal
          title={`Files for Batch: ${selectedJob.batchId}`}
          visible={isModalVisible}
          onOk={handleModalClose}
          onCancel={handleModalClose}
          footer={[
            <Button key="back" onClick={handleModalClose}>
              Close
            </Button>,
          ]}
        >
          <ul className="list-disc list-inside pl-4">
            {(selectedJob.files || []).map((file) => (
              <li key={file.id} className="mb-2">
                <strong>{file.name}</strong>: {file.sheets.join(', ') || 'All sheets'}
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  );
}