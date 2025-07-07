'use client';

import React, { useState } from 'react';
import { Card, Button, List, Tag, Alert, Space, Modal, Typography, Divider } from 'antd';
import { PlayCircleOutlined, StopOutlined, ReloadOutlined, DeleteOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import type { JobStatus } from '@/types/api';

const { Title, Text } = Typography;

interface RecoveryRecommendation {
  action: string;
  description: string;
  risk_level: 'low' | 'medium' | 'high';
}

interface ErrorAnalysisData {
  error_patterns: Array<{
    error_type: string;
    count: number;
    recent_occurrences: string[];
    suggested_fix?: string;
  }>;
  batch_summary: {
    total_files: number;
    failed_files: number;
    error_rate: number;
    most_common_errors: string[];
  };
  recovery_recommendations: RecoveryRecommendation[];
}

interface BatchRecoveryProps {
  batchId: string;
  batchInfo: JobStatus;
  analysisData?: ErrorAnalysisData;
  onRecovery: (batchId: string, action: string) => Promise<void>;
}

const BatchRecovery: React.FC<BatchRecoveryProps> = ({
  batchId,
  batchInfo,
  analysisData,
  onRecovery
}) => {
  const [loading, setLoading] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    visible: boolean;
    action: string;
    title: string;
    description: string;
    riskLevel: 'low' | 'medium' | 'high';
  }>({
    visible: false,
    action: '',
    title: '',
    description: '',
    riskLevel: 'low'
  });

  const handleRecoveryAction = async (action: string) => {
    setLoading(true);
    try {
      await onRecovery(batchId, action);
    } finally {
      setLoading(false);
      setConfirmModal({ ...confirmModal, visible: false });
    }
  };

  const showConfirmModal = (action: string, title: string, description: string, riskLevel: 'low' | 'medium' | 'high' = 'low') => {
    setConfirmModal({
      visible: true,
      action,
      title,
      description,
      riskLevel
    });
  };

  const getRiskLevelColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'high': return 'red';
      case 'medium': return 'orange';
      case 'low': return 'green';
      default: return 'default';
    }
  };

  const getErrorMessage = (batchInfo: JobStatus) => {
    if (batchInfo.status === 'error') {
      return 'error' in batchInfo ? batchInfo.error : 'Unknown error occurred';
    }
    return batchInfo.message || 'No error details available';
  };

  const quickRecoveryActions = [
    {
      key: 'retry',
      title: 'Retry Batch',
      description: 'Retry the entire batch with the same configuration',
      icon: <ReloadOutlined />,
      type: 'primary' as const,
      riskLevel: 'low' as const,
      action: () => showConfirmModal(
        'retry',
        'Retry Batch',
        'This will restart the entire batch processing with the same configuration. Previously successful files may be reprocessed.',
        'low'
      )
    },
    {
      key: 'resume',
      title: 'Resume from Checkpoint',
      description: 'Resume processing from the last successful checkpoint',
      icon: <PlayCircleOutlined />,
      type: 'default' as const,
      riskLevel: 'low' as const,
      action: () => showConfirmModal(
        'resume',
        'Resume from Checkpoint',
        'This will resume processing from the last successful checkpoint, skipping already processed files.',
        'low'
      )
    },
    {
      key: 'retry_failed',
      title: 'Retry Failed Files Only',
      description: 'Only retry the files that failed during processing',
      icon: <ExclamationCircleOutlined />,
      type: 'default' as const,
      riskLevel: 'low' as const,
      action: () => showConfirmModal(
        'retry_failed',
        'Retry Failed Files Only',
        'This will only retry the files that failed, leaving successful files unchanged.',
        'low'
      )
    }
  ];

  return (
    <Card title="Recovery Options" className="h-full">
      <div className="space-y-4">
        {/* Error Information */}
        <Alert
          message="Batch Processing Failed"
          description={getErrorMessage(batchInfo)}
          type="error"
          showIcon
          className="mb-4"
        />

        {/* Batch Information */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <Title level={5} className="mb-2">Batch Information</Title>
          <div className="space-y-2">
            <div className="flex justify-between">
              <Text>Batch ID:</Text>
              <Text code className="text-xs">{batchId}</Text>
            </div>
            <div className="flex justify-between">
              <Text>Job ID:</Text>
              <Text code className="text-xs">{batchInfo.jobId}</Text>
            </div>
            <div className="flex justify-between">
              <Text>Status:</Text>
              <Tag color="red">{batchInfo.status.toUpperCase()}</Tag>
            </div>
            {'endTime' in batchInfo && batchInfo.endTime && (
              <div className="flex justify-between">
                <Text>Failed At:</Text>
                <Text>{new Date(batchInfo.endTime).toLocaleString()}</Text>
              </div>
            )}
          </div>
        </div>

        {/* Quick Recovery Actions */}
        <div>
          <Title level={5} className="mb-3">Quick Recovery Actions</Title>
          <List
            dataSource={quickRecoveryActions}
            renderItem={(action) => (
              <List.Item className="border-l-4 border-blue-200 pl-4">
                <div className="w-full">
                  <div className="flex justify-between items-start mb-2">
                    <div className="flex-1">
                      <div className="flex items-center mb-1">
                        {action.icon}
                        <Text strong className="ml-2">{action.title}</Text>
                        <Tag color={getRiskLevelColor(action.riskLevel)} className="ml-2">
                          {action.riskLevel} risk
                        </Tag>
                      </div>
                      <Text className="text-sm text-gray-600">{action.description}</Text>
                    </div>
                    <Button
                      type={action.type}
                      icon={action.icon}
                      onClick={action.action}
                      loading={loading}
                      size="small"
                    >
                      {action.title}
                    </Button>
                  </div>
                </div>
              </List.Item>
            )}
          />
        </div>

        {/* AI-Powered Recovery Recommendations */}
        {analysisData?.recovery_recommendations && analysisData.recovery_recommendations.length > 0 && (
          <div>
            <Divider />
            <Title level={5} className="mb-3">AI Recovery Recommendations</Title>
            <List
              dataSource={analysisData.recovery_recommendations}
              renderItem={(rec) => (
                <List.Item className="border-l-4 border-green-200 pl-4">
                  <div className="w-full">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <div className="flex items-center mb-1">
                          <Text strong>{rec.action}</Text>
                          <Tag color={getRiskLevelColor(rec.risk_level)} className="ml-2">
                            {rec.risk_level} risk
                          </Tag>
                        </div>
                        <Text className="text-sm text-gray-600">{rec.description}</Text>
                      </div>
                      <Button
                        type="dashed"
                        size="small"
                        onClick={() => showConfirmModal(
                          rec.action.toLowerCase().replace(/\s+/g, '_'),
                          rec.action,
                          rec.description,
                          rec.risk_level
                        )}
                        loading={loading}
                      >
                        Apply
                      </Button>
                    </div>
                  </div>
                </List.Item>
              )}
            />
          </div>
        )}

        {/* Danger Zone */}
        <div>
          <Divider />
          <Title level={5} className="mb-3 text-red-600">Danger Zone</Title>
          <Space>
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={() => showConfirmModal(
                'cancel',
                'Cancel Batch',
                'This will permanently cancel the batch and clean up all associated resources. This action cannot be undone.',
                'high'
              )}
              loading={loading}
            >
              Cancel Batch
            </Button>
          </Space>
        </div>
      </div>

      {/* Confirmation Modal */}
      <Modal
        title={confirmModal.title}
        open={confirmModal.visible}
        onOk={() => handleRecoveryAction(confirmModal.action)}
        onCancel={() => setConfirmModal({ ...confirmModal, visible: false })}
        okText="Confirm"
        cancelText="Cancel"
        confirmLoading={loading}
        okButtonProps={{
          danger: confirmModal.riskLevel === 'high',
          type: confirmModal.riskLevel === 'high' ? 'primary' : 'default'
        }}
      >
        <div className="space-y-3">
          <Alert
            message={`Risk Level: ${confirmModal.riskLevel.toUpperCase()}`}
            type={confirmModal.riskLevel === 'high' ? 'error' : confirmModal.riskLevel === 'medium' ? 'warning' : 'info'}
            showIcon
          />
          <Text>{confirmModal.description}</Text>
        </div>
      </Modal>
    </Card>
  );
};

export default BatchRecovery;