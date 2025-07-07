"use client";

import { useState, useEffect } from "react";
import { Card, Row, Col, Spin } from "antd";
import { SystemHealthHero } from "@/components/dashboard/SystemHealthHero";
import { QuickStatsGrid } from "@/components/dashboard/QuickStatsGrid";
import { ActivityStream } from "@/components/dashboard/ActivityStream";
import { ActionCards } from "@/components/dashboard/ActionCards";
import { useSystemHealth } from "@/hooks/useSystemHealth";
import { useQuickStats } from "@/hooks/useQuickStats";
import { useActivityStream } from "@/hooks/useActivityStream";

interface DashboardProps {
  systemHealth?: any;
  quickStats?: any;
  recentActivity?: any;
}

export default function DashboardPage() {
  const { systemHealth, loading: healthLoading, error: healthError } = useSystemHealth();
  const { quickStats, loading: statsLoading, error: statsError } = useQuickStats();
  const { activityStream, loading: activityLoading, error: activityError } = useActivityStream();

  const isLoading = healthLoading || statsLoading || activityLoading;
  const hasError = healthError || statsError || activityError;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spin size="large" />
      </div>
    );
  }

  if (hasError) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="text-center">
          <h2 className="text-xl font-semibold mb-2">Unable to load dashboard</h2>
          <p className="text-gray-600">
            {healthError || statsError || activityError}
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">SmartBDX Dashboard</h1>
        <p className="text-gray-600 mt-2">
          Monitor system health, track performance, and manage data processing operations
        </p>
      </div>

      {/* System Health Hero Section */}
      <SystemHealthHero health={systemHealth} />

      {/* Quick Stats Grid */}
      <QuickStatsGrid stats={quickStats} />

      <Row gutter={[24, 24]}>
        <Col xs={24} lg={16}>
          {/* Recent Activity Stream */}
          <ActivityStream 
            activities={activityStream} 
            loading={activityLoading}
          />
        </Col>
        <Col xs={24} lg={8}>
          {/* Action Cards */}
          <ActionCards />
        </Col>
      </Row>
    </div>
  );
}