"use client";

import { Card, Button, Space } from "antd";
import { 
  PlusOutlined,
  FileSearchOutlined,
  ThunderboltOutlined,
  BarChartOutlined,
  ToolOutlined,
  ArrowRightOutlined
} from "@ant-design/icons";
import { useRouter } from "next/navigation";

export const ActionCards: React.FC = () => {
  const router = useRouter();

  const actions = [
    {
      title: "Start Processing",
      description: "Select files and begin data processing",
      icon: <PlusOutlined className="text-blue-500" />,
      path: "/selection",
      color: "border-blue-200 bg-blue-50"
    },
    {
      title: "Smart Selection",
      description: "Use AI to select optimal files for processing",
      icon: <FileSearchOutlined className="text-purple-500" />,
      path: "/selection",
      color: "border-purple-200 bg-purple-50"
    },
    {
      title: "Monitor Jobs",
      description: "View active processing jobs and their status",
      icon: <ThunderboltOutlined className="text-orange-500" />,
      path: "/processing",
      color: "border-orange-200 bg-orange-50"
    },
    {
      title: "View Analytics",
      description: "Access performance metrics and insights",
      icon: <BarChartOutlined className="text-green-500" />,
      path: "/analytics",
      color: "border-green-200 bg-green-50"
    },
    {
      title: "Recovery Center",
      description: "Manage failed batches and error recovery",
      icon: <ToolOutlined className="text-red-500" />,
      path: "/recovery",
      color: "border-red-200 bg-red-50"
    }
  ];

  return (
    <Card title="Quick Actions" className="h-fit">
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        {actions.map((action, index) => (
          <Card
            key={index}
            size="small"
            hoverable
            className={`${action.color} transition-all duration-200`}
            onClick={() => router.push(action.path)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="text-2xl">
                  {action.icon}
                </div>
                <div>
                  <div className="font-medium text-gray-800">
                    {action.title}
                  </div>
                  <div className="text-xs text-gray-600">
                    {action.description}
                  </div>
                </div>
              </div>
              <ArrowRightOutlined className="text-gray-400" />
            </div>
          </Card>
        ))}
      </Space>
    </Card>
  );
};

export default ActionCards;