'use client';

import React from 'react';
import { Card, Tag, Space, Tooltip, Badge, Progress } from 'antd';
import { 
  FileTextOutlined,
  ThunderboltOutlined,
  ClockCircleOutlined,
  DollarOutlined,
  StarOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  RocketOutlined,
  WarningOutlined
} from '@ant-design/icons';
import type { FileItem } from '@/types/api';

interface FileMetadataCardProps {
  file: FileItem;
  showAIInsights?: boolean;
  showCacheStatus?: boolean;
  showProcessingEstimates?: boolean;
  compact?: boolean;
}

export const FileMetadataCard: React.FC<FileMetadataCardProps> = ({
  file,
  showAIInsights = true,
  showCacheStatus = true,
  showProcessingEstimates = true,
  compact = false
}) => {
  const formatFileSize = (bytes: number): string => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const formatProcessingTime = (seconds: number | undefined): string => {
    if (typeof seconds !== 'number') return 'Unknown';
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const getPriorityColor = (score: number | undefined): string => {
    if (typeof score !== 'number') return 'default';
    if (score >= 90) return 'red';
    if (score >= 70) return 'orange';
    if (score >= 40) return 'blue';
    return 'default';
  };

  const getPriorityLevel = (score: number | undefined): string => {
    if (typeof score !== 'number') return 'Unknown';
    if (score >= 90) return 'Urgent';
    if (score >= 70) return 'High';
    if (score >= 40) return 'Medium';
    return 'Low';
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'ready': return 'green';
      case 'processing': return 'blue';
      case 'completed': return 'cyan';
      case 'error': return 'red';
      default: return 'default';
    }
  };

  const getAIRecommendationIcon = (recommendation: string | undefined) => {
    switch (recommendation) {
      case 'high_priority':
        return <RocketOutlined style={{ color: '#ff4d4f' }} />;
      case 'cache_available':
        return <ThunderboltOutlined style={{ color: '#52c41a' }} />;
      case 'skip':
        return <WarningOutlined style={{ color: '#d9d9d9' }} />;
      default:
        return null;
    }
  };

  const getAIRecommendationText = (recommendation: string | undefined): string => {
    switch (recommendation) {
      case 'high_priority': return 'HIGH PRIORITY';
      case 'cache_available': return 'CACHE AVAILABLE';
      case 'skip': return 'SKIP RECOMMENDED';
      default: return 'NO RECOMMENDATION';
    }
  };

  if (compact) {
    return (
      <div className="p-3 border rounded-lg bg-white hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <FileTextOutlined />
            <span className="font-medium text-sm">{file.name}</span>
          </div>
          <div className="flex items-center space-x-2">
            <Tag color={getStatusColor(file.status)}>
              {file.status.toUpperCase()}
            </Tag>
            {showAIInsights && file.ai_recommendation && (
              <Tooltip title={getAIRecommendationText(file.ai_recommendation)}>
                {getAIRecommendationIcon(file.ai_recommendation)}
              </Tooltip>
            )}
            {showCacheStatus && file.cache_available && (
              <Tooltip title="Cache available">
                <ThunderboltOutlined style={{ color: '#52c41a' }} />
              </Tooltip>
            )}
          </div>
        </div>
        <div className="mt-2 text-xs text-gray-500">
          {formatFileSize(file.size)} • {formatProcessingTime(file.estimated_processing_time)}
        </div>
      </div>
    );
  }

  return (
    <Card 
      size="small"
      className="mb-4 hover:shadow-md transition-shadow"
      title={
        <Space>
          <FileTextOutlined />
          <span className="font-medium">{file.name}</span>
          <Tag color={getStatusColor(file.status)}>
            {file.status.toUpperCase()}
          </Tag>
        </Space>
      }
    >
      <div className="space-y-3">
        {/* Basic File Info */}
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-gray-500">Size</div>
            <div className="font-medium">{formatFileSize(file.size)}</div>
          </div>
          <div>
            <div className="text-gray-500">Modified</div>
            <div className="font-medium">
              {file.lastModified ? new Date(file.lastModified).toLocaleDateString() : 'Unknown'}
            </div>
          </div>
          <div>
            <div className="text-gray-500">Sheets</div>
            <div className="font-medium">{file.sheets?.length || 0}</div>
          </div>
        </div>

        {/* AI Insights Section */}
        {showAIInsights && (
          <div className="border-t pt-3">
            <h5 className="text-sm font-semibold mb-2 flex items-center">
              <StarOutlined className="mr-1 text-blue-500" />
              AI Insights
            </h5>
            <div className="space-y-2">
              {/* Priority Score */}
              {typeof file.priority_score === 'number' && (
                <div className="flex items-center justify-between">
                  <span className="text-sm">Priority Score</span>
                  <div className="flex items-center space-x-2">
                    <Badge count={file.priority_score} style={{ backgroundColor: getPriorityColor(file.priority_score) }} />
                    <Tag color={getPriorityColor(file.priority_score)}>
                      {getPriorityLevel(file.priority_score)}
                    </Tag>
                  </div>
                </div>
              )}

              {/* AI Recommendation */}
              {file.ai_recommendation && (
                <div className="flex items-center justify-between">
                  <span className="text-sm">AI Recommendation</span>
                  <div className="flex items-center space-x-1">
                    {getAIRecommendationIcon(file.ai_recommendation)}
                    <span className="text-sm font-medium">
                      {getAIRecommendationText(file.ai_recommendation)}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Cache Status Section */}
        {showCacheStatus && (
          <div className="border-t pt-3">
            <h5 className="text-sm font-semibold mb-2 flex items-center">
              <ThunderboltOutlined className="mr-1 text-yellow-500" />
              Cache Status
            </h5>
            <div className="flex items-center justify-between">
              <span className="text-sm">Cache Available</span>
              <div className="flex items-center space-x-2">
                {file.cache_available ? (
                  <>
                    <CheckCircleOutlined style={{ color: '#52c41a' }} />
                    <span className="text-sm text-green-600 font-medium">Yes</span>
                  </>
                ) : (
                  <>
                    <ExclamationCircleOutlined style={{ color: '#faad14' }} />
                    <span className="text-sm text-yellow-600 font-medium">No</span>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Processing Estimates Section */}
        {showProcessingEstimates && (
          <div className="border-t pt-3">
            <h5 className="text-sm font-semibold mb-2 flex items-center">
              <ClockCircleOutlined className="mr-1 text-blue-500" />
              Processing Estimates
            </h5>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm">Estimated Time</span>
                <span className="text-sm font-medium">
                  {formatProcessingTime(file.estimated_processing_time)}
                </span>
              </div>
              
              {/* Estimated Cost */}
              <div className="flex items-center justify-between">
                <span className="text-sm">Estimated Cost</span>
                <span className="text-sm font-medium text-green-600">
                  ${((file.size / 1024 / 1024) * 0.1).toFixed(2)}
                </span>
              </div>

              {/* Complexity Indicator */}
              <div className="flex items-center justify-between">
                <span className="text-sm">Complexity</span>
                <div className="flex items-center space-x-2">
                  <Progress 
                    percent={Math.min((file.size / 1024 / 1024) * 10, 100)} 
                    size="small" 
                    style={{ width: '60px' }}
                    strokeColor={
                      file.size > 10 * 1024 * 1024 ? '#ff4d4f' :
                      file.size > 5 * 1024 * 1024 ? '#faad14' : '#52c41a'
                    }
                  />
                  <span className="text-xs text-gray-500">
                    {file.size > 10 * 1024 * 1024 ? 'High' :
                     file.size > 5 * 1024 * 1024 ? 'Medium' : 'Low'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};