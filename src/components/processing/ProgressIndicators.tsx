'use client';

import React, { useState, useEffect } from 'react';
import { Card, Progress, Typography, Row, Col, Statistic, Tag, Space, Tooltip } from 'antd';
import { ClockCircleOutlined, DollarOutlined, DatabaseOutlined, ThunderboltOutlined, FileTextOutlined, CheckCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import type { JobStatus } from '@/types/api';

const { Title, Text } = Typography;

interface ProgressIndicatorsProps {
  jobs: JobStatus[];
  className?: string;
}

interface ProcessingMetrics {
  totalJobs: number;
  activeJobs: number;
  completedJobs: number;
  failedJobs: number;
  overallProgress: number;
  estimatedTimeRemaining: string;
  totalCost: number;
  processingRate: number;
  averageSuccessRate: number;
  cacheHitRate: number;
}

const ProgressIndicators: React.FC<ProgressIndicatorsProps> = ({ jobs, className }) => {
  const [metrics, setMetrics] = useState<ProcessingMetrics>({
    totalJobs: 0,
    activeJobs: 0,
    completedJobs: 0,
    failedJobs: 0,
    overallProgress: 0,
    estimatedTimeRemaining: 'N/A',
    totalCost: 0,
    processingRate: 0,
    averageSuccessRate: 0,
    cacheHitRate: 0
  });

  const [animatedProgress, setAnimatedProgress] = useState(0);

  // Calculate metrics from jobs
  useEffect(() => {
    const calculateMetrics = (): ProcessingMetrics => {
      const totalJobs = jobs.length;
      const activeJobs = jobs.filter(j => j.status === 'processing' || j.status === 'submitted').length;
      const completedJobs = jobs.filter(j => j.status === 'completed').length;
      const failedJobs = jobs.filter(j => j.status === 'error').length;
      
      // Calculate overall progress
      let totalProgress = 0;
      let progressJobs = 0;
      
      jobs.forEach(job => {
        if (job.status === 'completed') {
          totalProgress += 100;
          progressJobs++;
        } else if (job.status === 'processing' && 'progress' in job) {
          totalProgress += job.progress;
          progressJobs++;
        } else if (job.status === 'error' || job.status === 'cancelled') {
          progressJobs++;
        }
      });

      const overallProgress = progressJobs > 0 ? Math.round(totalProgress / progressJobs) : 0;

      // Calculate ETA for active jobs
      const processingJobs = jobs.filter(j => j.status === 'processing' && 'progress' in j);
      let avgTimeRemaining = 0;

      if (processingJobs.length > 0) {
        const timeEstimates = processingJobs.map(job => {
          const progress = 'progress' in job ? job.progress : 0;
          if (progress <= 0) return 0;
          
          const elapsed = Date.now() - new Date(job.timestamp).getTime();
          const totalEstimated = (elapsed / progress) * 100;
          const remaining = Math.max(0, totalEstimated - elapsed);
          return remaining;
        });

        avgTimeRemaining = timeEstimates.reduce((sum, time) => sum + time, 0) / timeEstimates.length;
      }

      const formatTimeRemaining = (ms: number) => {
        if (ms <= 0) return 'N/A';
        const minutes = Math.floor(ms / (1000 * 60));
        const seconds = Math.floor((ms % (1000 * 60)) / 1000);
        if (minutes > 0) return `${minutes}m ${seconds}s`;
        return `${seconds}s`;
      };

      // Calculate cost (mock data - in real implementation, this would come from backend)
      const totalCost = jobs.reduce((sum, job) => {
        // Mock cost calculation
        return sum + (Math.random() * 0.1);
      }, 0);

      // Calculate processing rate (files/hour)
      const completedJobsWithTime = jobs.filter(j => 
        j.status === 'completed' && 'endTime' in j && j.endTime
      );
      
      let processingRate = 0;
      if (completedJobsWithTime.length > 0) {
        const totalDuration = completedJobsWithTime.reduce((sum, job) => {
          const duration = new Date(('endTime' in job ? job.endTime : '') || '').getTime() - new Date(job.timestamp).getTime();
          return sum + duration;
        }, 0);
        
        const avgDurationHours = totalDuration / (completedJobsWithTime.length * 1000 * 60 * 60);
        processingRate = avgDurationHours > 0 ? Math.round(1 / avgDurationHours) : 0;
      }

      // Calculate success rate
      const finishedJobs = completedJobs + failedJobs;
      const averageSuccessRate = finishedJobs > 0 ? Math.round((completedJobs / finishedJobs) * 100) : 0;

      // Mock cache hit rate
      const cacheHitRate = Math.floor(Math.random() * 40) + 60; // 60-100%

      return {
        totalJobs,
        activeJobs,
        completedJobs,
        failedJobs,
        overallProgress,
        estimatedTimeRemaining: formatTimeRemaining(avgTimeRemaining),
        totalCost,
        processingRate,
        averageSuccessRate,
        cacheHitRate
      };
    };

    setMetrics(calculateMetrics());
  }, [jobs]);

  // Animate progress bar
  useEffect(() => {
    const targetProgress = metrics.overallProgress;
    const startProgress = animatedProgress;
    const duration = 1000; // 1 second
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function for smooth animation
      const easeOutQuart = (t: number) => 1 - Math.pow(1 - t, 4);
      const currentProgress = startProgress + (targetProgress - startProgress) * easeOutQuart(progress);
      
      setAnimatedProgress(currentProgress);
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    animate();
  }, [metrics.overallProgress]);

  const getProgressStatus = () => {
    if (metrics.failedJobs > 0 && metrics.activeJobs === 0) return 'exception';
    if (metrics.activeJobs === 0 && metrics.completedJobs > 0) return 'success';
    return 'active';
  };

  const getProgressColor = () => {
    if (metrics.failedJobs > 0 && metrics.activeJobs === 0) return '#ff4d4f';
    if (metrics.activeJobs === 0 && metrics.completedJobs > 0) return '#52c41a';
    return '#1890ff';
  };

  return (
    <div className={className}>
      <Row gutter={[16, 16]}>
        {/* Main Progress Card */}
        <Col span={24}>
          <Card>
            <div className="text-center mb-4">
              <Title level={4} className="mb-2">Overall Processing Progress</Title>
              <div className="relative">
                <Progress
                  type="circle"
                  percent={Math.round(animatedProgress)}
                  size={120}
                  strokeWidth={8}
                  status={getProgressStatus()}
                  strokeColor={getProgressColor()}
                  className="mb-4"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-700">
                      {Math.round(animatedProgress)}%
                    </div>
                    <div className="text-xs text-gray-500">
                      {metrics.activeJobs > 0 ? 'Processing' : 'Complete'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <Row gutter={16}>
              <Col span={6}>
                <Statistic
                  title="Total Jobs"
                  value={metrics.totalJobs}
                  prefix={<FileTextOutlined />}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="Active"
                  value={metrics.activeJobs}
                  prefix={<ThunderboltOutlined />}
                  valueStyle={{ color: '#1890ff' }}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="Completed"
                  value={metrics.completedJobs}
                  prefix={<CheckCircleOutlined />}
                  valueStyle={{ color: '#52c41a' }}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="Failed"
                  value={metrics.failedJobs}
                  prefix={<ExclamationCircleOutlined />}
                  valueStyle={{ color: '#ff4d4f' }}
                />
              </Col>
            </Row>
          </Card>
        </Col>

        {/* Performance Metrics */}
        <Col span={12}>
          <Card title="Performance Metrics" className="h-full">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <div className="flex items-center">
                  <ClockCircleOutlined className="mr-2 text-blue-500" />
                  <Text>Estimated Time Remaining</Text>
                </div>
                <Text strong className="text-lg">
                  {metrics.estimatedTimeRemaining}
                </Text>
              </div>

              <div className="flex justify-between items-center">
                <div className="flex items-center">
                  <ThunderboltOutlined className="mr-2 text-orange-500" />
                  <Text>Processing Rate</Text>
                </div>
                <Text strong className="text-lg">
                  {metrics.processingRate} jobs/hr
                </Text>
              </div>

              <div className="flex justify-between items-center">
                <div className="flex items-center">
                  <CheckCircleOutlined className="mr-2 text-green-500" />
                  <Text>Success Rate</Text>
                </div>
                <div className="flex items-center">
                  <Text strong className="text-lg mr-2">
                    {metrics.averageSuccessRate}%
                  </Text>
                  <Progress
                    percent={metrics.averageSuccessRate}
                    size="small"
                    strokeColor="#52c41a"
                    className="flex-1 ml-2"
                  />
                </div>
              </div>

              <div className="flex justify-between items-center">
                <div className="flex items-center">
                  <DatabaseOutlined className="mr-2 text-purple-500" />
                  <Text>Cache Hit Rate</Text>
                </div>
                <div className="flex items-center">
                  <Text strong className="text-lg mr-2">
                    {metrics.cacheHitRate}%
                  </Text>
                  <Progress
                    percent={metrics.cacheHitRate}
                    size="small"
                    strokeColor="#722ed1"
                    className="flex-1 ml-2"
                  />
                </div>
              </div>
            </div>
          </Card>
        </Col>

        {/* Cost & Efficiency */}
        <Col span={12}>
          <Card title="Cost & Efficiency" className="h-full">
            <div className="space-y-4">
              <div className="text-center">
                <Statistic
                  title="Total Processing Cost"
                  value={metrics.totalCost}
                  precision={4}
                  prefix={<DollarOutlined />}
                  suffix="USD"
                  className="mb-4"
                />
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <Text>Cost per Job</Text>
                  <Text strong>
                    ${metrics.totalJobs > 0 ? (metrics.totalCost / metrics.totalJobs).toFixed(4) : '0.0000'}
                  </Text>
                </div>

                <div className="flex justify-between items-center">
                  <Text>Cache Savings</Text>
                  <div className="flex items-center">
                    <Text strong className="text-green-600 mr-2">
                      ${(metrics.totalCost * (metrics.cacheHitRate / 100) * 0.3).toFixed(4)}
                    </Text>
                    <Tag color="green">
                      {Math.round(metrics.cacheHitRate * 0.3)}% saved
                    </Tag>
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <Text>Efficiency Score</Text>
                  <div className="flex items-center">
                    <Text strong className="mr-2">
                      {Math.round((metrics.averageSuccessRate + metrics.cacheHitRate) / 2)}%
                    </Text>
                    <Progress
                      percent={Math.round((metrics.averageSuccessRate + metrics.cacheHitRate) / 2)}
                      size="small"
                      strokeColor="#52c41a"
                      className="flex-1 ml-2"
                    />
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default ProgressIndicators;