'use client';

import React, { useState, useCallback } from 'react';
import { Card, Button, Space, Badge, Alert, Spin, Row, Col, Statistic, Tabs, Tooltip, Tag } from 'antd';
import {
  RocketOutlined,
  ThunderboltOutlined,
  ClockCircleOutlined,
  StarOutlined,
  FileTextOutlined,
  DollarOutlined,
  TrophyOutlined,
  ReloadOutlined
} from '@ant-design/icons';
import type { SmartFileSelection } from '@/types/api';

interface SmartSelectionPanelProps {
  onAlgorithmChange: (algorithm: string) => void;
  onApplySelection: (selection: SmartFileSelection) => void;
  smartSelection: SmartFileSelection | null;
  loading: boolean;
  currentAlgorithm: string;
}

interface SelectionAlgorithm {
  key: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  description: string;
  useCase: string;
}

const algorithms: SelectionAlgorithm[] = [
  {
    key: 'failed_first',
    label: 'Failed First',
    icon: <RocketOutlined />,
    color: '#ff4d4f',
    description: 'Prioritize previously failed items for immediate attention',
    useCase: 'Perfect for resolving processing issues and clearing backlogs'
  },
  {
    key: 'newest_first',
    label: 'Recent Files',
    icon: <ClockCircleOutlined />,
    color: '#1890ff',
    description: 'Process most recently modified files first',
    useCase: 'Ideal for processing the latest data submissions'
  },
  {
    key: 'largest_first',
    label: 'Largest First',
    icon: <FileTextOutlined />,
    color: '#722ed1',
    description: 'Handle larger files with more data first',
    useCase: 'Best for comprehensive data processing workflows'
  },
  {
    key: 'high_priority',
    label: 'High Priority',
    icon: <TrophyOutlined />,
    color: '#faad14',
    description: 'Use AI priority scoring algorithm',
    useCase: 'Leverages machine learning for optimal file selection'
  },
  {
    key: 'random_sample',
    label: 'Random Sample',
    icon: <ReloadOutlined />,
    color: '#52c41a',
    description: 'Random sampling for testing and validation',
    useCase: 'Great for quality assurance and testing workflows'
  }
];

export const SmartSelectionPanel: React.FC<SmartSelectionPanelProps> = ({
  onAlgorithmChange,
  onApplySelection,
  smartSelection,
  loading,
  currentAlgorithm
}) => {
  const [selectedAlgorithm, setSelectedAlgorithm] = useState<string>(currentAlgorithm);

  const handleAlgorithmSelect = useCallback((algorithm: string) => {
    setSelectedAlgorithm(algorithm);
    onAlgorithmChange(algorithm);
  }, [onAlgorithmChange]);

  const handleApplySelection = useCallback(() => {
    if (smartSelection) {
      onApplySelection(smartSelection);
    }
  }, [smartSelection, onApplySelection]);

  const currentAlgorithmConfig = algorithms.find(a => a.key === selectedAlgorithm);

  return (
    <Card
      title={
        <Space>
          <StarOutlined style={{ color: '#1890ff' }} />
          <span>AI Smart Selection</span>
          <Badge count={smartSelection?.recommended_files?.length || 0} showZero />
        </Space>
      }
      extra={
        <Button
          type="primary"
          icon={<StarOutlined />}
          onClick={handleApplySelection}
          disabled={!smartSelection?.recommended_files?.length}
          loading={loading}
        >
          Apply Smart Selection
        </Button>
      }
      className="mb-6"
    >
      <Spin spinning={loading}>
        <div className="space-y-6">
          {/* Algorithm Selection */}
          <div>
            <h4 className="text-lg font-semibold mb-3">Selection Algorithm</h4>
            <Tabs
              activeKey={selectedAlgorithm}
              onChange={handleAlgorithmSelect}
              type="card"
              size="small"
              items={algorithms.map(algorithm => ({
                key: algorithm.key,
                label: (
                  <Space>
                    <span style={{ color: algorithm.color }}>{algorithm.icon}</span>
                    <span>{algorithm.label}</span>
                  </Space>
                ),
                children: (
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-gray-700 mb-2">{algorithm.description}</p>
                    <p className="text-sm text-gray-500">
                      <strong>Use Case:</strong> {algorithm.useCase}
                    </p>
                  </div>
                )
              }))}
            />
          </div>

          {/* Smart Selection Results */}
          {smartSelection && (
            <div>
              <h4 className="text-lg font-semibold mb-3">AI Recommendations</h4>
              
              {/* Statistics Row */}
              <Row gutter={16} className="mb-4">
                <Col span={6}>
                  <Statistic
                    title="Recommended Files"
                    value={smartSelection.recommended_files?.length || 0}
                    prefix={<RocketOutlined style={{ color: '#52c41a' }} />}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="Cost Savings"
                    value={smartSelection.cost_optimization?.potential_savings || 0}
                    prefix={<DollarOutlined style={{ color: '#1890ff' }} />}
                    precision={2}
                    suffix="USD"
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="Cache Hits"
                    value={smartSelection.cache_opportunities?.length || 0}
                    prefix={<ThunderboltOutlined style={{ color: '#faad14' }} />}
                  />
                </Col>
                <Col span={6}>
                  <Statistic
                    title="Priority Items"
                    value={smartSelection.priority_ranking?.length || 0}
                    prefix={<TrophyOutlined style={{ color: '#722ed1' }} />}
                  />
                </Col>
              </Row>

              {/* AI Insights */}
              {smartSelection.cost_optimization?.cache_recommendations && (
                <Alert
                  message="AI Optimization Insights"
                  description={
                    <div className="space-y-2">
                      {smartSelection.cost_optimization.cache_recommendations.map((recommendation, index) => (
                        <div key={index} className="flex items-start space-x-2">
                          <ThunderboltOutlined className="text-blue-500 mt-1" />
                          <span>{recommendation}</span>
                        </div>
                      ))}
                    </div>
                  }
                  type="info"
                  showIcon
                  className="mb-4"
                />
              )}

              {/* Priority Rankings */}
              {smartSelection.priority_ranking && smartSelection.priority_ranking.length > 0 && (
                <div className="bg-blue-50 p-4 rounded-lg">
                  <h5 className="font-semibold text-blue-900 mb-2">Priority Rankings</h5>
                  <div className="space-y-2">
                    {smartSelection.priority_ranking.slice(0, 3).map((item, index) => (
                      <div key={item.file_id} className="flex items-center justify-between p-2 bg-white rounded">
                        <div className="flex items-center space-x-2">
                          <Badge count={index + 1} style={{ backgroundColor: '#1890ff' }} />
                          <span className="font-medium">{item.file_id}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Tag color={
                            item.processing_urgency === 'urgent' ? 'red' :
                            item.processing_urgency === 'high' ? 'orange' :
                            item.processing_urgency === 'medium' ? 'blue' : 'green'
                          }>
                            {item.processing_urgency.toUpperCase()}
                          </Tag>
                          <span className="text-sm text-gray-600">Score: {item.priority_score}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Current Algorithm Info */}
          {currentAlgorithmConfig && (
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="flex items-center space-x-2 mb-2">
                <span style={{ color: currentAlgorithmConfig.color }}>
                  {currentAlgorithmConfig.icon}
                </span>
                <span className="font-semibold">{currentAlgorithmConfig.label} Algorithm</span>
              </div>
              <p className="text-sm text-gray-600 mb-1">{currentAlgorithmConfig.description}</p>
              <p className="text-xs text-gray-500">{currentAlgorithmConfig.useCase}</p>
            </div>
          )}
        </div>
      </Spin>
    </Card>
  );
};