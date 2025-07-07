// src/app/processing/page.tsx
'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Modal, Button, message, Spin, Row, Col, Alert, Popconfirm, Tabs } from 'antd';
import { DeleteOutlined, ReloadOutlined, EyeOutlined } from '@ant-design/icons';
import { usePolling, apiRequest } from '../../hooks/useApi';
import type { JobStatus, ProcessedFile } from '../../types/api';
import { useAppContext } from '@/context/AppContext';
import BatchCard from '@/components/processing/BatchCard';
import ProcessingStream from '@/components/processing/ProcessingStream';
import ProgressIndicators from '@/components/processing/ProgressIndicators';

// The JobItem now directly uses the JobStatus from context, ensuring type compatibility
type JobItem = JobStatus & {
  id: string; // Add id for table rowKey
  batchId?: string;
  completed_files?: number;
  total_files?: number;
  current_file?: string;
  files?: ProcessedFile[];
};

export default function ProcessingPage() {
  const { jobs, updateJob, loadJobs, jobsLoading } = useAppContext();
  const [initialLoading, setInitialLoading] = useState(true);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [selectedJob, setSelectedJob] = useState<JobStatus | null>(null);
  const [clearingJobs, setClearingJobs] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  // Ref to prevent duplicate execution in React Strict Mode
  const hasInitialized = useRef(false);

  const showDetailsModal = (job: JobStatus) => {
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

  const handleJobAction = async (jobId: string, action: 'pause' | 'resume' | 'stop') => {
    try {
      message.loading(`${action.charAt(0).toUpperCase() + action.slice(1)}ing job...`, 0);
      
      // In a real implementation, this would call the appropriate API endpoint
      await apiRequest(`/jobs/${jobId}/${action}`, {
        method: 'POST',
      });
      
      message.destroy();
      message.success(`Job ${action}ed successfully`);
      
      // Update job status locally
      const newStatus = action === 'pause' ? 'paused' : 
                       action === 'resume' ? 'processing' : 'cancelled';
      updateJob({ jobId, status: newStatus as any });
      
    } catch (error) {
      message.destroy();
      console.error(`Error ${action}ing job:`, error);
      message.error(`Failed to ${action} job`);
    }
  };

  // Load jobs from KV store when component mounts - ROBUST: Handle React Strict Mode
  useEffect(() => {
    if (!hasInitialized.current) {
      console.log('🔄 Processing page: Starting initial load sequence');
      hasInitialized.current = true;
      
      let isMounted = true;
      
      const initializeJobs = async () => {
        try {
          await loadJobs();
        } catch (error) {
          if (isMounted) {
            console.error('Failed to load jobs:', error);
          }
        } finally {
          if (isMounted) {
            setInitialLoading(false);
          }
        }
      };

      initializeJobs();
      
      return () => {
        isMounted = false;
      };
    } else {
      console.log('🔄 [STRICT MODE] Skipping duplicate execution - already initialized');
    }
  }, []); // FIXED: Removed unstable loadJobs dependency

  const pollingFetcher = useCallback(async () => {
    // STABILIZED: Use runtime state checking instead of dependency-based checking
    const currentJobs = jobs; // Access jobs at runtime
    const activeJobs = currentJobs.filter(job =>
      (job.status === 'processing' || job.status === 'submitted') && job.batchId
    );

    if (activeJobs.length === 0) return null;

    try {
      console.log(`🔄 Polling ${activeJobs.length} active jobs via Databricks...`);
      
      // Get status updates for each active batch using the Databricks backend
      const updates = await Promise.all(
        activeJobs.map(async (job) => {
          try {
            const response = await apiRequest<{data: any}>('/databricks', {
              method: 'POST',
              body: JSON.stringify({
                operation: 'get_batch_status',
                parameters: { batch_id: job.batchId }
              })
            });
            
            const data = response?.data || response;
            return {
              jobId: job.jobId,
              batchId: job.batchId,
              status: data.status || job.status,
              progress: data.progress || ('progress' in job ? job.progress : 0),
              message: data.current_file || data.message || job.message,
              // Enhanced backend data
              rate_limit_status: data.rate_limit_status,
              checkpoint_data: data.checkpoint_data,
              cost_estimate: data.cost_estimate,
              cache_utilization: data.cache_utilization,
              completed_files: data.completed_files,
              total_files: data.total_files,
              current_file: data.current_file
            };
          } catch (error) {
            console.warn(`Failed to get status for batch ${job.batchId}:`, error);
            return {
              jobId: job.jobId,
              batchId: job.batchId,
              status: job.status,
              progress: ('progress' in job ? job.progress : 0),
              message: job.message
            };
          }
        })
      );
      
      console.log(`✅ Received ${updates.length} batch status updates from Databricks`);
      return updates;
    } catch (error) {
      console.error('Polling error:', error);
      return null;
    }
  }, []); // FIXED: Removed jobs dependency to prevent function recreation

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

  if (initialLoading) {
    return (
      <div className="p-6 flex justify-center items-center h-64">
        <Spin tip="Loading Jobs..." size="large">
          <div className="p-8" />
        </Spin>
      </div>
    );
  }

  const tabItems = [
    {
      key: 'overview',
      label: 'Overview',
      children: (
        <div className="space-y-6">
          <ProgressIndicators jobs={jobs} />
          <Row gutter={[16, 16]}>
            <Col span={14}>
              <div className="space-y-4">
                {jobs.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-600">No processing jobs found. Submit files from the Selection page.</p>
                  </div>
                ) : (
                  jobs.map(job => (
                    <BatchCard
                      key={job.jobId}
                      job={job}
                      onViewDetails={showDetailsModal}
                      onPause={(jobId) => handleJobAction(jobId, 'pause')}
                      onResume={(jobId) => handleJobAction(jobId, 'resume')}
                      onStop={(jobId) => handleJobAction(jobId, 'stop')}
                    />
                  ))
                )}
              </div>
            </Col>
            <Col span={10}>
              <ProcessingStream jobs={jobs} />
            </Col>
          </Row>
        </div>
      )
    },
    {
      key: 'batches',
      label: 'Batch Details',
      children: (
        <div className="space-y-4">
          {jobs.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-600">No processing jobs found. Submit files from the Selection page.</p>
            </div>
          ) : (
            jobs.map(job => (
              <BatchCard
                key={job.jobId}
                job={job}
                onViewDetails={showDetailsModal}
                onPause={(jobId) => handleJobAction(jobId, 'pause')}
                onResume={(jobId) => handleJobAction(jobId, 'resume')}
                onStop={(jobId) => handleJobAction(jobId, 'stop')}
              />
            ))
          )}
        </div>
      )
    },
    {
      key: 'stream',
      label: 'Live Stream',
      children: (
        <ProcessingStream 
          jobs={jobs} 
          maxEvents={200}
          showFilters={true}
          autoScroll={true}
        />
      )
    }
  ];

  return (
    <div className="p-6">
      <header className="mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Processing Dashboard</h1>
            <p className="text-gray-600">Monitor and manage batch processing jobs</p>
          </div>
          <div className="flex space-x-2">
            <Button
              icon={<ReloadOutlined />}
              onClick={loadJobs}
              loading={jobsLoading}
            >
              Refresh
            </Button>
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
        </div>
      </header>

      {pollingError && (
        <Alert 
          message="Polling Error" 
          description={pollingError} 
          type="error" 
          showIcon 
          className="mb-4" 
        />
      )}

      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={tabItems}
        size="large"
        className="bg-white rounded-lg shadow-sm"
      />

      {selectedJob && (
        <Modal
          title={`Files for Batch: ${selectedJob.batchId}`}
          open={isModalVisible}
          onOk={handleModalClose}
          onCancel={handleModalClose}
          width={800}
          footer={[
            <Button key="back" onClick={handleModalClose}>
              Close
            </Button>,
          ]}
        >
          <div className="space-y-4">
            <div className="bg-gray-50 p-4 rounded-lg">
              <h4 className="font-semibold mb-2">Batch Information</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Job ID:</span> {selectedJob.jobId}
                </div>
                <div>
                  <span className="font-medium">Batch ID:</span> {selectedJob.batchId}
                </div>
                <div>
                  <span className="font-medium">Status:</span> {selectedJob.status}
                </div>
                <div>
                  <span className="font-medium">Started:</span> {new Date(selectedJob.timestamp).toLocaleString()}
                </div>
              </div>
            </div>
            
            <div>
              <h4 className="font-semibold mb-2">Files ({selectedJob.files?.length || 0})</h4>
              <ul className="list-disc list-inside pl-4 space-y-1">
                {(selectedJob.files || []).map((file) => (
                  <li key={file.id} className="text-sm">
                    <strong>{file.name}</strong>: {file.sheets.join(', ') || 'All sheets'}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}