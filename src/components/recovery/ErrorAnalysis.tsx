'use client';

import React from 'react';
import { Card, List, Tag, Progress, Alert, Spin, Typography, Empty } from 'antd';
import { ExclamationCircleOutlined, BugOutlined, WarningOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

interface ErrorPattern {
  error_type: string;
  count: number;
  recent_occurrences: string[];
  suggested_fix?: string;
}

interface BatchSummary {
  total_files: number;
  failed_files: number;
  error_rate: number;
  most_common_errors: string[];
}

interface RecoveryRecommendation {
  action: string;
  description: string;
  risk_level: 'low' | 'medium' | 'high';
}

interface ErrorAnalysisData {
  error_patterns: ErrorPattern[];
  batch_summary: BatchSummary;
  recovery_recommendations: RecoveryRecommendation[];
}

interface ErrorAnalysisProps {
  batchId: string;
  analysisData?: ErrorAnalysisData;
  loading?: boolean;
}

const ErrorAnalysis: React.FC<ErrorAnalysisProps> = ({ batchId, analysisData, loading }) => {
  if (loading) {
    return (
      <Card title="Error Analysis" className="h-full">
        <div className="flex justify-center items-center h-64">
          <Spin tip="Analyzing errors..." />
        </div>
      </Card>
    );
  }

  if (!analysisData) {
    return (
      <Card title="Error Analysis" className="h-full">
        <Empty 
          description="No error analysis available"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      </Card>
    );
  }

  const { error_patterns, batch_summary } = analysisData;

  const getErrorSeverityColor = (errorType: string) => {
    const lowerType = errorType.toLowerCase();
    if (lowerType.includes('timeout') || lowerType.includes('rate')) return 'orange';
    if (lowerType.includes('permission') || lowerType.includes('auth')) return 'red';
    if (lowerType.includes('format') || lowerType.includes('parse')) return 'blue';
    return 'default';
  };

  const getRiskLevelColor = (riskLevel: string) => {
    switch (riskLevel) {
      case 'high': return 'red';
      case 'medium': return 'orange';
      case 'low': return 'green';
      default: return 'default';
    }
  };

  return (
    <Card title="Error Analysis" className="h-full">
      <div className="space-y-4">
        {/* Batch Summary */}
        <div className="bg-gray-50 p-4 rounded-lg">
          <Title level={5} className="mb-2">Batch Summary</Title>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Text strong>Total Files:</Text>
              <div className="text-lg">{batch_summary.total_files}</div>
            </div>
            <div>
              <Text strong>Failed Files:</Text>
              <div className="text-lg text-red-600">{batch_summary.failed_files}</div>
            </div>
          </div>
          <div className="mt-2">
            <Text strong>Error Rate:</Text>
            <Progress
              percent={Math.round(batch_summary.error_rate * 100)}
              status="exception"
              className="mt-1"
            />
          </div>
        </div>

        {/* Error Patterns */}
        <div>
          <Title level={5} className="mb-2">
            <BugOutlined className="mr-2" />
            Error Patterns
          </Title>
          {error_patterns.length === 0 ? (
            <Alert message="No error patterns identified" type="info" />
          ) : (
            <List
              dataSource={error_patterns}
              renderItem={(pattern) => (
                <List.Item className="border-l-4 border-red-200 pl-4">
                  <div className="w-full">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <Tag color={getErrorSeverityColor(pattern.error_type)} className="mb-1">
                          {pattern.error_type}
                        </Tag>
                        <Text className="ml-2 text-sm text-gray-600">
                          {pattern.count} occurrence{pattern.count > 1 ? 's' : ''}
                        </Text>
                      </div>
                      <ExclamationCircleOutlined className="text-red-500" />
                    </div>
                    
                    {pattern.suggested_fix && (
                      <div className="bg-blue-50 p-2 rounded text-sm">
                        <Text strong>Suggested Fix: </Text>
                        <Text>{pattern.suggested_fix}</Text>
                      </div>
                    )}
                    
                    {pattern.recent_occurrences.length > 0 && (
                      <div className="mt-2">
                        <Text className="text-xs text-gray-500">
                          Last occurrence: {new Date(pattern.recent_occurrences[0]).toLocaleString()}
                        </Text>
                      </div>
                    )}
                  </div>
                </List.Item>
              )}
            />
          )}
        </div>

        {/* Recovery Recommendations */}
        {analysisData.recovery_recommendations && analysisData.recovery_recommendations.length > 0 && (
          <div>
            <Title level={5} className="mb-2">
              <WarningOutlined className="mr-2" />
              Recovery Recommendations
            </Title>
            <List
              dataSource={analysisData.recovery_recommendations}
              renderItem={(rec) => (
                <List.Item className="border-l-4 border-blue-200 pl-4">
                  <div className="w-full">
                    <div className="flex justify-between items-start mb-1">
                      <Text strong>{rec.action}</Text>
                      <Tag color={getRiskLevelColor(rec.risk_level)}>
                        {rec.risk_level} risk
                      </Tag>
                    </div>
                    <Text className="text-sm text-gray-600">{rec.description}</Text>
                  </div>
                </List.Item>
              )}
            />
          </div>
        )}
      </div>
    </Card>
  );
};

export default ErrorAnalysis;