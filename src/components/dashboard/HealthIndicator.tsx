"use client";

import { Card, Badge } from "antd";
import { 
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  CloseCircleOutlined,
  QuestionCircleOutlined
} from "@ant-design/icons";

type HealthStatus = 'healthy' | 'warning' | 'error' | 'unknown';

interface HealthIndicatorProps {
  label: string;
  status: HealthStatus;
  icon?: string;
  detail?: string;
}

export const HealthIndicator: React.FC<HealthIndicatorProps> = ({
  label,
  status,
  icon,
  detail
}) => {
  const getStatusConfig = (status: HealthStatus) => {
    switch (status) {
      case 'healthy':
        return {
          color: '#52c41a',
          bgColor: '#f6ffed',
          borderColor: '#b7eb8f',
          statusIcon: <CheckCircleOutlined className="text-green-500" />,
          statusText: 'Healthy',
          emoji: '🟢'
        };
      case 'warning':
        return {
          color: '#faad14',
          bgColor: '#fffbe6',
          borderColor: '#ffe58f',
          statusIcon: <ExclamationCircleOutlined className="text-yellow-500" />,
          statusText: 'Warning',
          emoji: '🟡'
        };
      case 'error':
        return {
          color: '#ff4d4f',
          bgColor: '#fff2f0',
          borderColor: '#ffadd2',
          statusIcon: <CloseCircleOutlined className="text-red-500" />,
          statusText: 'Error',
          emoji: '🔴'
        };
      default:
        return {
          color: '#8c8c8c',
          bgColor: '#f5f5f5',
          borderColor: '#d9d9d9',
          statusIcon: <QuestionCircleOutlined className="text-gray-500" />,
          statusText: 'Unknown',
          emoji: '⚪'
        };
    }
  };

  const config = getStatusConfig(status);

  return (
    <Card 
      size="small" 
      className={`text-center transition-all duration-200 hover:shadow-md`}
      style={{ 
        backgroundColor: config.bgColor,
        borderColor: config.borderColor,
        borderWidth: 1
      }}
    >
      <div className="flex flex-col items-center">
        <div className="text-2xl mb-1">
          {icon || config.emoji}
        </div>
        <div className="text-sm font-medium text-gray-700 mb-1">
          {label}
        </div>
        <Badge 
          color={config.color}
          text={config.statusText}
          className="text-xs"
        />
        {detail && (
          <div className="text-xs text-gray-500 mt-1">
            {detail}
          </div>
        )}
      </div>
    </Card>
  );
};

export default HealthIndicator;