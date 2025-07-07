'use client';

import React, { useState, useEffect } from 'react';
import { Card, Row, Col, Alert, Spin, Button, message } from 'antd';
import { ReloadOutlined, BugOutlined } from '@ant-design/icons';
import { useAppContext } from '@/context/AppContext';
import { apiClient } from '@/services/api';
import ErrorAnalysis from '@/components/recovery/ErrorAnalysis';
import BatchRecovery from '@/components/recovery/BatchRecovery';
import type { JobStatus } from '@/types/api';

interface ErrorAnalysisData {
  error_patterns: Array<{
    error_type: string;
    count: number;
    recent_occurrences: string[];
    suggested_fix?: string;
  }>;
  batch_summary: {
    total_files: number;
    failed_files: number;
    error_rate: number;
    most_common_errors: string[];
  };
  recovery_recommendations: Array<{
    action: string;
    description: string;
    risk_level: 'low' | 'medium' | 'high';
  }>;
}

export default function RecoveryPage() {
  const { jobs, updateJob } = useAppContext();
  const [loading, setLoading] = useState(true);
  const [errorAnalysis, setErrorAnalysis] = useState<Record<string, ErrorAnalysisData>>({});
  const [selectedBatch, setSelectedBatch] = useState<string | null>(null);

  // Get failed batches from jobs
  const failedBatches = jobs.filter(job => job.status === 'error' && job.batchId);

  // Load error analysis for all failed batches
  useEffect(() => {
    const loadErrorAnalysis = async () => {
      if (failedBatches.length === 0) {
        setLoading(false);
        return;
      }

      try {
        const analysisPromises = failedBatches.map(async (batch) => {
          try {
            const analysis = await apiClient.analyzeBatchErrors(batch.batchId!);
            return { batchId: batch.batchId!, analysis };
          } catch (error) {
            console.warn(`Failed to analyze batch ${batch.batchId}:`, error);
            return { batchId: batch.batchId!, analysis: null };
          }
        });

        const results = await Promise.all(analysisPromises);
        const analysisMap: Record<string, ErrorAnalysisData> = {};
        
        results.forEach(({ batchId, analysis }) => {
          if (analysis) {
            analysisMap[batchId] = analysis;
          }
        });

        setErrorAnalysis(analysisMap);
      } catch (error) {
        console.error('Error loading batch analysis:', error);
        message.error('Failed to load error analysis');
      } finally {
        setLoading(false);
      }
    };

    loadErrorAnalysis();
  }, [failedBatches.length]);

  const handleBatchRecovery = async (batchId: string, action: string) => {
    try {
      message.loading('Initiating batch recovery...', 0);
      
      const response = await apiClient.resumeBatch(batchId);
      
      if (response.success) {
        message.destroy();
        message.success('Batch recovery initiated successfully');
        
        // Update job status
        const updatedJob = jobs.find(j => j.batchId === batchId);
        if (updatedJob) {
          updateJob({
            jobId: updatedJob.jobId,
            status: 'processing',
            message: 'Batch recovery in progress'
          });
        }
      } else {
        message.destroy();
        message.error('Failed to initiate batch recovery');
      }
    } catch (error) {
      message.destroy();
      console.error('Recovery error:', error);
      message.error('Failed to initiate batch recovery');
    }
  };

  const handleRefresh = async () => {
    setLoading(true);
    // Trigger re-analysis
    setErrorAnalysis({});
    window.location.reload();
  };

  if (loading) {
    return (
      <div className="p-6 flex justify-center items-center h-64">
        <Spin tip="Analyzing failed batches..." size="large">
          <div className="p-8" />
        </Spin>
      </div>
    );
  }

  if (failedBatches.length === 0) {
    return (
      <div className="p-6">
        <div className="text-center">
          <Card className="max-w-md mx-auto">
            <div className="text-center py-8">
              <BugOutlined className="text-4xl text-green-500 mb-4" />
              <h2 className="text-xl font-semibold mb-2">No Failed Batches</h2>
              <p className="text-gray-600">All your batches are running smoothly!</p>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <header className="mb-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Failed Batch Recovery Center</h1>
            <p className="text-gray-600">
              Analyze and recover from batch processing failures
            </p>
          </div>
          <Button
            icon={<ReloadOutlined />}
            onClick={handleRefresh}
            loading={loading}
          >
            Refresh Analysis
          </Button>
        </div>
      </header>

      {failedBatches.length > 0 && (
        <Alert
          message="Failed Batches Detected"
          description={`${failedBatches.length} batch${failedBatches.length > 1 ? 'es' : ''} failed and need attention. Review the analysis below for recovery options.`}
          type="warning"
          showIcon
          className="mb-6"
        />
      )}

      <Row gutter={[16, 16]}>
        {failedBatches.map((batch) => (
          <Col span={24} key={batch.batchId}>
            <Card
              title={
                <div className="flex justify-between items-center">
                  <span>Batch: {batch.batchId}</span>
                  <div className="text-sm text-gray-500">
                    Failed: {
                      (batch.status === 'error' || batch.status === 'completed' || batch.status === 'cancelled') && 'endTime' in batch && batch.endTime
                        ? new Date(batch.endTime).toLocaleString()
                        : 'Unknown'
                    }
                  </div>
                </div>
              }
              className="mb-4"
            >
              <Row gutter={[16, 16]}>
                {/* Error Analysis */}
                <Col span={12}>
                  <ErrorAnalysis
                    batchId={batch.batchId!}
                    analysisData={errorAnalysis[batch.batchId!]}
                    loading={!errorAnalysis[batch.batchId!]}
                  />
                </Col>

                {/* Recovery Options */}
                <Col span={12}>
                  <BatchRecovery
                    batchId={batch.batchId!}
                    batchInfo={batch}
                    analysisData={errorAnalysis[batch.batchId!]}
                    onRecovery={handleBatchRecovery}
                  />
                </Col>
              </Row>
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}