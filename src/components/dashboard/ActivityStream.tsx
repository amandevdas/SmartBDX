"use client";

import { Card, List, Badge, Empty, Spin } from "antd";
import { 
  CheckCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  FileOutlined,
  ThunderboltOutlined,
  DollarOutlined,
  UserOutlined
} from "@ant-design/icons";

interface ActivityEvent {
  id: string;
  type: 'batch_completed' | 'batch_started' | 'smart_selection' | 'cache_savings' | 'mapping_approved' | 'error' | 'warning';
  title: string;
  description: string;
  timestamp: string;
  metadata?: {
    batchId?: string;
    fileCount?: number;
    duration?: number;
    savings?: number;
    errorCount?: number;
  };
}

interface ActivityStreamProps {
  activities: ActivityEvent[];
  loading?: boolean;
  maxItems?: number;
}

export const ActivityStream: React.FC<ActivityStreamProps> = ({ 
  activities, 
  loading = false,
  maxItems = 10
}) => {
  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'batch_completed':
        return <CheckCircleOutlined className="text-green-500" />;
      case 'batch_started':
        return <ThunderboltOutlined className="text-blue-500" />;
      case 'smart_selection':
        return <FileOutlined className="text-purple-500" />;
      case 'cache_savings':
        return <DollarOutlined className="text-green-500" />;
      case 'mapping_approved':
        return <UserOutlined className="text-indigo-500" />;
      case 'error':
        return <ExclamationCircleOutlined className="text-red-500" />;
      case 'warning':
        return <ExclamationCircleOutlined className="text-yellow-500" />;
      default:
        return <ClockCircleOutlined className="text-gray-500" />;
    }
  };

  const getActivityBadge = (type: string) => {
    switch (type) {
      case 'batch_completed':
        return <Badge color="green" text="Completed" />;
      case 'batch_started':
        return <Badge color="blue" text="Started" />;
      case 'smart_selection':
        return <Badge color="purple" text="AI Selection" />;
      case 'cache_savings':
        return <Badge color="green" text="Savings" />;
      case 'mapping_approved':
        return <Badge color="cyan" text="Approved" />;
      case 'error':
        return <Badge color="red" text="Error" />;
      case 'warning':
        return <Badge color="orange" text="Warning" />;
      default:
        return <Badge color="default" text="Activity" />;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffInMinutes = Math.floor((now.getTime() - date.getTime()) / (1000 * 60));
    
    if (diffInMinutes < 1) return 'Just now';
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    if (diffInMinutes < 1440) return `${Math.floor(diffInMinutes / 60)}h ago`;
    return `${Math.floor(diffInMinutes / 1440)}d ago`;
  };

  const displayActivities = activities.slice(0, maxItems);

  return (
    <Card 
      title="Recent Activity" 
      extra={
        <Badge 
          count={activities.length} 
          overflowCount={99} 
          style={{ backgroundColor: '#52c41a' }}
        />
      }
    >
      {loading ? (
        <div className="text-center py-8">
          <Spin size="large" />
          <p className="text-gray-500 mt-2">Loading activities...</p>
        </div>
      ) : activities.length === 0 ? (
        <Empty 
          description="No recent activity"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : (
        <List
          itemLayout="horizontal"
          dataSource={displayActivities}
          renderItem={(activity) => (
            <List.Item>
              <List.Item.Meta
                avatar={getActivityIcon(activity.type)}
                title={
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{activity.title}</span>
                    <div className="flex items-center space-x-2">
                      {getActivityBadge(activity.type)}
                      <span className="text-xs text-gray-500">
                        {formatTimestamp(activity.timestamp)}
                      </span>
                    </div>
                  </div>
                }
                description={
                  <div>
                    <p className="text-gray-600">{activity.description}</p>
                    {activity.metadata && (
                      <div className="flex items-center space-x-4 mt-1 text-xs text-gray-500">
                        {activity.metadata.batchId && (
                          <span>Batch: {activity.metadata.batchId}</span>
                        )}
                        {activity.metadata.fileCount && (
                          <span>Files: {activity.metadata.fileCount}</span>
                        )}
                        {activity.metadata.duration && (
                          <span>Duration: {activity.metadata.duration}m</span>
                        )}
                        {activity.metadata.savings && (
                          <span>Savings: ${activity.metadata.savings}</span>
                        )}
                        {activity.metadata.errorCount && (
                          <span className="text-red-500">
                            Errors: {activity.metadata.errorCount}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                }
              />
            </List.Item>
          )}
        />
      )}
    </Card>
  );
};

export default ActivityStream;