'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, Row, Col, Statistic, Button, Alert, Progress, Space, Tag, Tooltip, Spin } from 'antd';
import { 
  ClockCircleOutlined, 
  DollarOutlined, 
  RocketOutlined,
  ExclamationCircleOutlined,
  ThunderboltOutlined,
  CheckCircleOutlined,
  WarningOutlined
} from '@ant-design/icons';
import type { FileItem } from '@/types/api';

interface ProcessingPreviewProps {
  selectedFiles: FileItem[];
  onStartProcessing: () => void;
  onAnalyzeFiles: () => void;
  loading?: boolean;
  disabled?: boolean;
}

interface ProcessingAnalysis {
  estimatedTime: number;
  estimatedCost: number;
  cacheHitRate: number;
  riskLevel: 'low' | 'medium' | 'high';
  recommendedBatchSize: number;
  warnings: string[];
}

export const ProcessingPreview: React.FC<ProcessingPreviewProps> = ({
  selectedFiles,
  onStartProcessing,
  onAnalyzeFiles,
  loading = false,
  disabled = false
}) => {
  const [analysis, setAnalysis] = useState<ProcessingAnalysis | null>(null);

  // Calculate basic analysis from selected files
  const calculateAnalysis = useCallback((): ProcessingAnalysis => {
    const totalFiles = selectedFiles.length;
    const totalSize = selectedFiles.reduce((sum, file) => sum + file.size, 0);
    const cacheAvailableCount = selectedFiles.filter(f => f.cache_available).length;
    
    // Estimate processing time (based on file size and complexity)
    const averageProcessingTime = selectedFiles.reduce((sum, file) => {
      return sum + (file.estimated_processing_time || 120); // Default 2 minutes
    }, 0) / Math.max(totalFiles, 1);
    
    const estimatedTime = Math.ceil(averageProcessingTime * totalFiles / 60); // Convert to minutes
    
    // Estimate cost (rough calculation)
    const estimatedCost = totalFiles * 0.50; // $0.50 per file estimate
    
    // Calculate cache hit rate
    const cacheHitRate = totalFiles > 0 ? (cacheAvailableCount / totalFiles) * 100 : 0;
    
    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high' = 'low';
    const warnings: string[] = [];
    
    if (totalFiles > 50) {
      riskLevel = 'high';
      warnings.push('Large batch size may increase processing time');
    } else if (totalFiles > 20) {
      riskLevel = 'medium';
      warnings.push('Medium batch size - monitor for rate limits');
    }
    
    if (cacheHitRate < 30) {
      warnings.push('Low cache hit rate - processing may be slower');
    }
    
    const failedFiles = selectedFiles.filter(f => f.status === 'error').length;
    if (failedFiles > 0) {
      warnings.push(`${failedFiles} files previously failed - may need attention`);
    }
    
    return {
      estimatedTime,
      estimatedCost,
      cacheHitRate,
      riskLevel,
      recommendedBatchSize: Math.min(totalFiles, 25),
      warnings
    };
  }, [selectedFiles]);

  useEffect(() => {
    if (selectedFiles.length > 0) {
      setAnalysis(calculateAnalysis());
    } else {
      setAnalysis(null);
    }
  }, [selectedFiles, calculateAnalysis]);

  if (selectedFiles.length === 0) {
    return (
      <Card title="Processing Preview" className="mb-6">
        <div className="text-center py-8 text-gray-500">
          <RocketOutlined className="text-4xl mb-4" />
          <p>Select files to see processing preview</p>
        </div>
      </Card>
    );
  }

  return (
    <Card 
      title={
        <Space>
          <RocketOutlined style={{ color: '#1890ff' }} />
          <span>Processing Preview</span>
          <Tag color="blue">{selectedFiles.length} files selected</Tag>
        </Space>
      }
      extra={
        <Space>
          <Button 
            icon={<CheckCircleOutlined />} 
            onClick={onAnalyzeFiles}
            loading={loading}
          >
            Analyze Further
          </Button>
          <Button 
            type="primary" 
            icon={<RocketOutlined />} 
            onClick={onStartProcessing}
            loading={loading}
            disabled={disabled}
            size="large"
          >
            Start Processing
          </Button>
        </Space>
      }
      className="mb-6"
    >
      <Spin spinning={loading}>
        {analysis && (
          <div className="space-y-6">
            {/* Main Statistics */}
            <Row gutter={16}>
              <Col span={6}>
                <Statistic
                  title="Estimated Time"
                  value={analysis.estimatedTime}
                  suffix="minutes"
                  prefix={<ClockCircleOutlined style={{ color: '#1890ff' }} />}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="Estimated Cost"
                  value={analysis.estimatedCost}
                  precision={2}
                  prefix={<DollarOutlined style={{ color: '#52c41a' }} />}
                  suffix="USD"
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="Cache Hit Rate"
                  value={analysis.cacheHitRate}
                  precision={1}
                  suffix="%"
                  prefix={<ThunderboltOutlined style={{ color: '#faad14' }} />}
                />
              </Col>
              <Col span={6}>
                <div className="text-center">
                  <div className="text-sm text-gray-500 mb-1">Risk Level</div>
                  <Tag 
                    color={
                      analysis.riskLevel === 'low' ? 'green' :
                      analysis.riskLevel === 'medium' ? 'orange' : 'red'
                    }
                    style={{ fontSize: '14px', padding: '4px 8px' }}
                  >
                    {analysis.riskLevel.toUpperCase()}
                  </Tag>
                </div>
              </Col>
            </Row>

            {/* Detailed Analysis */}
            <div className="bg-gray-50 p-4 rounded-lg">
              <h5 className="font-semibold mb-3">Batch Analysis</h5>
              <Row gutter={16}>
                <Col span={8}>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">
                      {selectedFiles.length}
                    </div>
                    <div className="text-sm text-gray-600">Total Files</div>
                  </div>
                </Col>
                <Col span={8}>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">
                      {selectedFiles.filter(f => f.cache_available).length}
                    </div>
                    <div className="text-sm text-gray-600">Cache Available</div>
                  </div>
                </Col>
                <Col span={8}>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">
                      {analysis.recommendedBatchSize}
                    </div>
                    <div className="text-sm text-gray-600">Recommended Size</div>
                  </div>
                </Col>
              </Row>
            </div>

            {/* Warnings and Recommendations */}
            {analysis.warnings.length > 0 && (
              <Alert
                message="Processing Considerations"
                description={
                  <ul className="list-disc pl-5 mt-2">
                    {analysis.warnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                }
                type="warning"
                showIcon
                icon={<WarningOutlined />}
              />
            )}

            {/* Progress Estimation */}
            <div className="bg-blue-50 p-4 rounded-lg">
              <h5 className="font-semibold text-blue-900 mb-2">Expected Processing Flow</h5>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm">File Discovery & Validation</span>
                  <span className="text-sm text-gray-600">~2 min</span>
                </div>
                <Progress percent={100} size="small" status="success" />
                
                <div className="flex justify-between items-center">
                  <span className="text-sm">AI Analysis & Mapping</span>
                  <span className="text-sm text-gray-600">~{Math.ceil(analysis.estimatedTime * 0.3)} min</span>
                </div>
                <Progress percent={0} size="small" />
                
                <div className="flex justify-between items-center">
                  <span className="text-sm">Data Processing</span>
                  <span className="text-sm text-gray-600">~{Math.ceil(analysis.estimatedTime * 0.7)} min</span>
                </div>
                <Progress percent={0} size="small" />
              </div>
            </div>

            {/* File Status Summary */}
            <div className="grid grid-cols-4 gap-4 text-center">
              <div className="p-3 bg-green-50 rounded-lg">
                <div className="text-lg font-bold text-green-600">
                  {selectedFiles.filter(f => f.status === 'ready').length}
                </div>
                <div className="text-sm text-gray-600">Ready</div>
              </div>
              <div className="p-3 bg-red-50 rounded-lg">
                <div className="text-lg font-bold text-red-600">
                  {selectedFiles.filter(f => f.status === 'error').length}
                </div>
                <div className="text-sm text-gray-600">Previous Errors</div>
              </div>
              <div className="p-3 bg-blue-50 rounded-lg">
                <div className="text-lg font-bold text-blue-600">
                  {selectedFiles.filter(f => f.status === 'completed').length}
                </div>
                <div className="text-sm text-gray-600">Completed</div>
              </div>
              <div className="p-3 bg-yellow-50 rounded-lg">
                <div className="text-lg font-bold text-yellow-600">
                  {selectedFiles.filter(f => f.status === 'processing').length}
                </div>
                <div className="text-sm text-gray-600">Processing</div>
              </div>
            </div>
          </div>
        )}
      </Spin>
    </Card>
  );
};