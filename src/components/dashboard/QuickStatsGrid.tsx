"use client";

import { Card, Row, Col, Statistic } from "antd";
import { 
  FileOutlined, 
  ThunderboltOutlined, 
  DollarOutlined, 
  CheckCircleOutlined,
  RiseOutlined,
  FallOutlined
} from "@ant-design/icons";

interface QuickStatsData {
  totalFiles: number;
  activeBatches: number;
  monthlyProcessed: number;
  monthlyErrors: number;
  monthlySavings: number;
  successRate: number;
  averageProcessingTime: number;
  cacheHitRate: number;
  // Trend data
  trends?: {
    filesProcessed: number; // percentage change
    activeBatches: number;
    savings: number;
    successRate: number;
  };
}

interface QuickStatsGridProps {
  stats: QuickStatsData | null;
  loading?: boolean;
}

export const QuickStatsGrid: React.FC<QuickStatsGridProps> = ({ 
  stats, 
  loading = false 
}) => {
  if (loading) {
    return (
      <Row gutter={[16, 16]} className="mb-6">
        {[1, 2, 3, 4].map(i => (
          <Col key={i} xs={12} sm={6}>
            <Card loading />
          </Col>
        ))}
      </Row>
    );
  }

  if (!stats) {
    return (
      <Row gutter={[16, 16]} className="mb-6">
        <Col span={24}>
          <Card>
            <div className="text-center py-4">
              <p className="text-gray-600">Unable to load statistics</p>
            </div>
          </Card>
        </Col>
      </Row>
    );
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (remainingSeconds === 0) return `${minutes}m`;
    return `${minutes}m ${remainingSeconds.toFixed(0)}s`;
  };

  const getTrendIcon = (trend: number) => {
    if (trend > 0) return <RiseOutlined className="text-green-500" />;
    if (trend < 0) return <FallOutlined className="text-red-500" />;
    return null;
  };

  const getTrendColor = (trend: number) => {
    if (trend > 0) return 'text-green-600';
    if (trend < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  return (
    <div className="mb-6">
      <h3 className="text-lg font-semibold mb-4">Quick Stats</h3>
      <Row gutter={[16, 16]}>
        <Col xs={12} sm={6}>
          <Card hoverable className="text-center">
            <div className="flex items-center justify-center mb-2">
              <FileOutlined className="text-blue-500 text-2xl mr-2" />
              <span className="text-sm font-medium text-gray-600">Total Files</span>
            </div>
            <Statistic 
              value={stats.totalFiles} 
              valueStyle={{ fontSize: '24px', fontWeight: 'bold' }}
            />
            <div className="text-sm text-gray-500 mt-1">
              {stats.monthlyProcessed} processed this month
            </div>
            {stats.trends?.filesProcessed && (
              <div className={`text-xs mt-1 ${getTrendColor(stats.trends.filesProcessed)}`}>
                {getTrendIcon(stats.trends.filesProcessed)}
                {Math.abs(stats.trends.filesProcessed)}% vs last month
              </div>
            )}
          </Card>
        </Col>

        <Col xs={12} sm={6}>
          <Card hoverable className="text-center">
            <div className="flex items-center justify-center mb-2">
              <ThunderboltOutlined className="text-orange-500 text-2xl mr-2" />
              <span className="text-sm font-medium text-gray-600">Active Batches</span>
            </div>
            <Statistic 
              value={stats.activeBatches} 
              valueStyle={{ fontSize: '24px', fontWeight: 'bold' }}
            />
            <div className="text-sm text-gray-500 mt-1">
              Currently processing
            </div>
            {stats.trends?.activeBatches && (
              <div className={`text-xs mt-1 ${getTrendColor(stats.trends.activeBatches)}`}>
                {getTrendIcon(stats.trends.activeBatches)}
                {Math.abs(stats.trends.activeBatches)}% vs last hour
              </div>
            )}
          </Card>
        </Col>

        <Col xs={12} sm={6}>
          <Card hoverable className="text-center">
            <div className="flex items-center justify-center mb-2">
              <DollarOutlined className="text-green-500 text-2xl mr-2" />
              <span className="text-sm font-medium text-gray-600">Monthly Savings</span>
            </div>
            <Statistic 
              value={formatCurrency(stats.monthlySavings)}
              valueStyle={{ fontSize: '24px', fontWeight: 'bold' }}
            />
            <div className="text-sm text-gray-500 mt-1">
              {formatPercentage(stats.cacheHitRate)} cache hit rate
            </div>
            {stats.trends?.savings && (
              <div className={`text-xs mt-1 ${getTrendColor(stats.trends.savings)}`}>
                {getTrendIcon(stats.trends.savings)}
                {Math.abs(stats.trends.savings)}% vs last month
              </div>
            )}
          </Card>
        </Col>

        <Col xs={12} sm={6}>
          <Card hoverable className="text-center">
            <div className="flex items-center justify-center mb-2">
              <CheckCircleOutlined className="text-purple-500 text-2xl mr-2" />
              <span className="text-sm font-medium text-gray-600">Success Rate</span>
            </div>
            <Statistic 
              value={formatPercentage(stats.successRate)}
              valueStyle={{ fontSize: '24px', fontWeight: 'bold' }}
            />
            <div className="text-sm text-gray-500 mt-1">
              Avg: {formatTime(stats.averageProcessingTime)}
            </div>
            {stats.trends?.successRate && (
              <div className={`text-xs mt-1 ${getTrendColor(stats.trends.successRate)}`}>
                {getTrendIcon(stats.trends.successRate)}
                {Math.abs(stats.trends.successRate)}% vs last month
              </div>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default QuickStatsGrid;