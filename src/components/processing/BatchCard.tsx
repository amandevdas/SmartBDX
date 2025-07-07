'use client';

import React from 'react';
import { Card, Progress, Tag, Typography, Space, Button, Tooltip, Row, Col, Statistic } from 'antd';
import { EyeOutlined, PauseCircleOutlined, PlayCircleOutlined, StopOutlined, DollarOutlined, ClockCircleOutlined, DatabaseOutlined } from '@ant-design/icons';
import type { JobStatus } from '@/types/api';

const { Text, Title } = Typography;

interface BatchCardProps {
  job: JobStatus & {
    id?: string;
    batchId?: string;
    completed_files?: number;
    total_files?: number;
    current_file?: string;
    files?: Array<{
      id: string;
      name: string;
      sheets: string[];
      status?: string;
    }>;
  };
  onViewDetails: (job: JobStatus) => void;
  onPause?: (jobId: string) => void;
  onResume?: (jobId: string) => void;
  onStop?: (jobId: string) => void;
}

const BatchCard: React.FC<BatchCardProps> = ({ job, onViewDetails, onPause, onResume, onStop }) => {
  const getStatusColor = (status: string) => {
    const colors: { [key: string]: string } = {
      submitted: 'blue',
      processing: 'orange',
      completed: 'green',
      error: 'red',
      paused: 'purple',
      cancelled: 'gray'
    };
    return colors[status] || 'default';
  };

  const getProgressPercent = () => {
    if (job.status === 'processing' || job.status === 'paused') {
      return 'progress' in job ? job.progress : 0;
    }
    if (job.status === 'completed') return 100;
    return 0;
  };

  const getProgressStatus = () => {
    if (job.status === 'error') return 'exception';
    if (job.status === 'completed') return 'success';
    if (job.status === 'paused') return 'normal';
    return 'active';
  };

  const formatDuration = (startTime: string, endTime?: string) => {
    const start = new Date(startTime).getTime();
    const end = endTime ? new Date(endTime).getTime() : Date.now();
    const duration = Math.round((end - start) / 1000);
    
    if (duration < 60) return `${duration}s`;
    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    return `${minutes}m ${seconds}s`;
  };

  const formatCost = (cost?: number) => {
    if (!cost) return 'N/A';
    return `$${cost.toFixed(4)}`;
  };

  const getETA = () => {
    if (job.status !== 'processing' || !('progress' in job)) return null;
    
    const progress = job.progress;
    if (progress <= 0) return 'Calculating...';
    
    const elapsed = Date.now() - new Date(job.timestamp).getTime();
    const totalEstimated = (elapsed / progress) * 100;
    const remaining = totalEstimated - elapsed;
    
    if (remaining <= 0) return 'Almost done';
    
    const minutes = Math.floor(remaining / (1000 * 60));
    const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
    
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  };

  const renderActionButtons = () => {
    const buttons = [];
    
    buttons.push(
      <Button
        key="view"
        icon={<EyeOutlined />}
        onClick={() => onViewDetails(job)}
        size="small"
      >
        Details
      </Button>
    );

    if (job.status === 'processing' && onPause) {
      buttons.push(
        <Button
          key="pause"
          icon={<PauseCircleOutlined />}
          onClick={() => onPause(job.jobId)}
          size="small"
        >
          Pause
        </Button>
      );
    }

    if (job.status === 'paused' && onResume) {
      buttons.push(
        <Button
          key="resume"
          icon={<PlayCircleOutlined />}
          onClick={() => onResume(job.jobId)}
          size="small"
          type="primary"
        >
          Resume
        </Button>
      );
    }

    if ((job.status === 'processing' || job.status === 'paused') && onStop) {
      buttons.push(
        <Button
          key="stop"
          icon={<StopOutlined />}
          onClick={() => onStop(job.jobId)}
          size="small"
          danger
        >
          Stop
        </Button>
      );
    }

    return buttons;
  };

  // Enhanced data from backend
  const enhancedData = job as JobStatus & {
    rate_limit_status?: any;
    checkpoint_data?: any;
    cost_estimate?: any;
    cache_utilization?: number;
    completed_files?: number;
    total_files?: number;
    current_file?: string;
  };

  return (
    <Card
      className="mb-4 shadow-sm hover:shadow-md transition-shadow"
      title={
        <div className="flex justify-between items-center">
          <div>
            <Title level={5} className="mb-0">
              Batch: {job.batchId || job.jobId}
            </Title>
            <Text className="text-sm text-gray-500">
              Job: {job.jobId}
            </Text>
          </div>
          <Space>
            <Tag color={getStatusColor(job.status)} className="px-3 py-1">
              {job.status.toUpperCase()}
            </Tag>
            {renderActionButtons()}
          </Space>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Progress Bar */}
        <div>
          <div className="flex justify-between items-center mb-2">
            <Text strong>Progress</Text>
            <Text className="text-sm text-gray-500">
              {getProgressPercent()}%
            </Text>
          </div>
          <Progress
            percent={getProgressPercent()}
            status={getProgressStatus()}
            strokeWidth={8}
            className="mb-2"
          />
          {job.status === 'processing' && (
            <div className="flex justify-between text-sm text-gray-500">
              <span>
                {enhancedData.current_file ? `Processing: ${enhancedData.current_file}` : job.message || 'Processing...'}
              </span>
              <span>ETA: {getETA()}</span>
            </div>
          )}
        </div>

        {/* Performance Metrics */}
        <Row gutter={16}>
          <Col span={6}>
            <Statistic
              title="Files"
              value={enhancedData.completed_files || 0}
              suffix={`/ ${enhancedData.total_files || 0}`}
              prefix={<DatabaseOutlined />}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="Duration"
              value={formatDuration(job.timestamp, (job.status === 'completed' || job.status === 'error' || job.status === 'cancelled') && 'endTime' in job ? job.endTime : undefined)}
              prefix={<ClockCircleOutlined />}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="Cost"
              value={formatCost(enhancedData.cost_estimate?.estimated_cost_usd)}
              prefix={<DollarOutlined />}
            />
          </Col>
          <Col span={6}>
            <Statistic
              title="Cache Hit"
              value={enhancedData.cache_utilization || 0}
              suffix="%"
              prefix={<DatabaseOutlined />}
            />
          </Col>
        </Row>

        {/* Rate Limiting Status */}
        {enhancedData.rate_limit_status && (
          <div className="bg-blue-50 p-3 rounded-lg">
            <div className="flex justify-between items-center">
              <Text strong className="text-blue-800">Rate Limit Status</Text>
              <Text className="text-sm text-blue-600">
                {enhancedData.rate_limit_status.requests_remaining} requests remaining
              </Text>
            </div>
            <Progress
              percent={Math.round((enhancedData.rate_limit_status.requests_remaining / enhancedData.rate_limit_status.requests_per_minute) * 100)}
              strokeColor="#1890ff"
              size="small"
              className="mt-2"
            />
          </div>
        )}

        {/* Checkpoint Information */}
        {enhancedData.checkpoint_data && (
          <div className="bg-green-50 p-3 rounded-lg">
            <div className="flex justify-between items-center mb-2">
              <Text strong className="text-green-800">Checkpoint Status</Text>
              <Text className="text-sm text-green-600">
                {enhancedData.checkpoint_data.can_resume ? 'Can Resume' : 'Cannot Resume'}
              </Text>
            </div>
            <Row gutter={8}>
              <Col span={6}>
                <Text className="text-xs text-gray-600">Completed</Text>
                <div className="text-sm font-semibold text-green-700">
                  {enhancedData.checkpoint_data.completed_items}
                </div>
              </Col>
              <Col span={6}>
                <Text className="text-xs text-gray-600">Failed</Text>
                <div className="text-sm font-semibold text-red-700">
                  {enhancedData.checkpoint_data.failed_items}
                </div>
              </Col>
              <Col span={6}>
                <Text className="text-xs text-gray-600">Pending</Text>
                <div className="text-sm font-semibold text-orange-700">
                  {enhancedData.checkpoint_data.pending_items}
                </div>
              </Col>
              <Col span={6}>
                <Text className="text-xs text-gray-600">Total</Text>
                <div className="text-sm font-semibold text-blue-700">
                  {enhancedData.checkpoint_data.total_items}
                </div>
              </Col>
            </Row>
          </div>
        )}

        {/* Error Display */}
        {job.status === 'error' && 'error' in job && (
          <div className="bg-red-50 p-3 rounded-lg">
            <Text strong className="text-red-800">Error Details</Text>
            <div className="text-sm text-red-600 mt-1">
              {job.error}
            </div>
          </div>
        )}

        {/* Timestamps */}
        <div className="text-xs text-gray-500 border-t pt-3">
          <div className="flex justify-between">
            <span>Started: {new Date(job.timestamp).toLocaleString()}</span>
            {((job.status === 'completed' || job.status === 'error' || job.status === 'cancelled') && 'endTime' in job && job.endTime) && (
              <span>Ended: {new Date(job.endTime).toLocaleString()}</span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
};

export default BatchCard;