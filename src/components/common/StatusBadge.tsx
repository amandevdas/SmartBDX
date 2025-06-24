"use client";

import { Tag } from "antd";

type StatusType = "pending" | "processing" | "completed" | "failed";

interface StatusBadgeProps {
  status: StatusType;
}

export const StatusBadge = ({ status }: StatusBadgeProps) => {
  const statusConfig: Record<StatusType, { color: string; text: string }> = {
    pending: { color: "default", text: "Pending" },
    processing: { color: "processing", text: "Processing" },
    completed: { color: "success", text: "Completed" },
    failed: { color: "error", text: "Failed" },
  };

  const config = statusConfig[status] || statusConfig.pending;

  return <Tag color={config.color}>{config.text}</Tag>;
};

export default StatusBadge;