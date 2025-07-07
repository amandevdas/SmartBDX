"use client";

import { Card, Row, Col, Progress, Statistic } from "antd";
import { 
  CheckCircleOutlined, 
  ExclamationCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined
} from "@ant-design/icons";
import { HealthIndicator } from "./HealthIndicator";

interface SystemHealthData {
  overall: number;
  components: {
    ai: 'healthy' | 'warning' | 'error' | 'unknown';
    processing: 'healthy' | 'warning' | 'error' | 'unknown';
    cache: 'healthy' | 'warning' | 'error' | 'unknown';
    infrastructure: 'healthy' | 'warning' | 'error' | 'unknown';
  };
  lastUpdated?: string;
  uptime?: string;
  version?: string;
}

interface SystemHealthHeroProps {
  health: SystemHealthData | null;
  loading?: boolean;
}

export const SystemHealthHero: React.FC<SystemHealthHeroProps> = ({ 
  health, 
  loading = false 
}) => {
  if (loading) {
    return (
      <Card className="mb-6">
        <div className="flex items-center justify-center py-8">
          <LoadingOutlined className="text-2xl mr-2" />
          <span>Loading system health...</span>
        </div>
      </Card>
    );
  }

  if (!health) {
    return (
      <Card className="mb-6">
        <div className="text-center py-8">
          <ExclamationCircleOutlined className="text-2xl text-yellow-500 mb-2" />
          <p className="text-gray-600">System health data unavailable</p>
        </div>
      </Card>
    );
  }

  const getHealthGrade = (score: number): string => {
    if (score >= 90) return "Excellent";
    if (score >= 70) return "Good";
    if (score >= 50) return "Fair";
    return "Poor";
  };

  const getHealthColor = (score: number): string => {
    if (score >= 90) return "#52c41a"; // Green
    if (score >= 70) return "#1890ff"; // Blue
    if (score >= 50) return "#faad14"; // Orange
    return "#ff4d4f"; // Red
  };

  return (
    <Card className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">System Health</h2>
        <div className="flex items-center justify-center space-x-4">
          <Progress
            type="circle"
            percent={health.overall}
            size={120}
            strokeColor={getHealthColor(health.overall)}
            format={(percent) => (
              <div className="text-center">
                <div className="text-2xl font-bold">{percent}%</div>
                <div className="text-sm text-gray-600">{getHealthGrade(percent || 0)}</div>
              </div>
            )}
          />
          <div className="text-left">
            <div className="text-sm text-gray-600">Last Updated</div>
            <div className="font-medium">{health.lastUpdated || 'Just now'}</div>
            {health.uptime && (
              <>
                <div className="text-sm text-gray-600 mt-2">Uptime</div>
                <div className="font-medium">{health.uptime}</div>
              </>
            )}
          </div>
        </div>
      </div>

      <Row gutter={[16, 16]}>
        <Col xs={12} sm={6}>
          <HealthIndicator 
            label="AI Services" 
            status={health.components.ai}
            icon="🤖"
          />
        </Col>
        <Col xs={12} sm={6}>
          <HealthIndicator 
            label="Processing" 
            status={health.components.processing}
            icon="⚡"
          />
        </Col>
        <Col xs={12} sm={6}>
          <HealthIndicator 
            label="Cache" 
            status={health.components.cache}
            icon="🗄️"
          />
        </Col>
        <Col xs={12} sm={6}>
          <HealthIndicator 
            label="Infrastructure" 
            status={health.components.infrastructure}
            icon="🏗️"
          />
        </Col>
      </Row>
    </Card>
  );
};

export default SystemHealthHero;