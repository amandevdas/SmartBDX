'use client';

import React, { useState } from 'react';
import { Card, Button, Alert, Space, Spin, Typography, Collapse, Tag } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined } from '@ant-design/icons';
import { apiClient } from '@/services/api';

const { Title, Paragraph, Text } = Typography;
const { Panel } = Collapse;

interface TestResult {
  name: string;
  status: 'pending' | 'running' | 'success' | 'error';
  message?: string;
  data?: any;
  duration?: number;
}

export default function Phase1IntegrationTest() {
  const [tests, setTests] = useState<TestResult[]>([
    { name: 'File Discovery with AI Insights', status: 'pending' },
    { name: 'Smart File Selection', status: 'pending' },
    { name: 'Submit Processing Job', status: 'pending' },
    { name: 'Get Batch Status', status: 'pending' },
    { name: 'Backend Health Check', status: 'pending' }
  ]);
  const [jobId, setJobId] = useState<string | null>(null);

  const updateTest = (index: number, updates: Partial<TestResult>) => {
    setTests(prev => prev.map((test, i) => i === index ? { ...test, ...updates } : test));
  };

  const runTest = async (index: number, testFn: () => Promise<any>) => {
    const startTime = Date.now();
    updateTest(index, { status: 'running' });
    
    try {
      const result = await testFn();
      const duration = Date.now() - startTime;
      updateTest(index, { 
        status: 'success', 
        message: 'Test completed successfully',
        data: result,
        duration 
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      updateTest(index, { 
        status: 'error', 
        message: error instanceof Error ? error.message : 'Unknown error',
        duration 
      });
    }
  };

  const testFileDiscovery = async () => {
    console.log('🔍 Testing File Discovery with AI Insights...');
    const files = await apiClient.discoverFilesWithSheets();
    
    if (!Array.isArray(files)) {
      throw new Error('Files response is not an array');
    }
    
    // Check for AI-enhanced fields
    const hasAIFields = files.some(file => 
      file.priority_score !== undefined || 
      file.ai_recommendation !== undefined ||
      file.cache_available !== undefined
    );
    
    return {
      fileCount: files.length,
      hasAIFields,
      sampleFile: files[0],
      aiEnhancedFiles: files.filter(f => f.priority_score && f.priority_score > 0).length
    };
  };

  const testSmartSelection = async () => {
    console.log('🧠 Testing Smart File Selection...');
    const selection = await apiClient.getSmartFileSelection({
      max_items: 5,
      priority_mode: 'failed_first'
    });
    
    return {
      hasRecommendations: !!selection.recommended_files,
      recommendedCount: selection.recommended_files?.length || 0,
      hasPriorityRanking: !!selection.priority_ranking,
      hasCostOptimization: !!selection.cost_optimization,
      hasCacheOpportunities: !!selection.cache_opportunities
    };
  };

  const testSubmitProcessingJob = async () => {
    console.log('🚀 Testing Submit Processing Job...');
    const result = await apiClient.submitProcessingJob({
      fileIds: ['test-file-1'],
      sheetSelections: { 'test-file-1': ['Sheet1'] }
    });
    
    if (!result.jobId) {
      throw new Error('No job ID returned from submitProcessingJob');
    }
    
    setJobId(result.jobId);
    return {
      jobId: result.jobId,
      status: result.status
    };
  };

  const testGetBatchStatus = async () => {
    console.log('📊 Testing Get Batch Status...');
    if (!jobId) {
      throw new Error('Job ID not set. Run "Submit Processing Job" test first.');
    }

    const status = await apiClient.getBatchStatus(jobId);
    
    if (!status.jobId) {
      throw new Error('No job ID returned from getBatchStatus');
    }

    return {
      jobId: status.jobId,
      status: status.status,
      progress: ('progress' in status ? status.progress : 0)
    };
  };

  const testBackendHealth = async () => {
    console.log('🏥 Testing Backend Health...');
    // Try to discover files as a health check
    const files = await apiClient.discoverFilesWithSheets();
    
    // Check if we're getting real data or fallback mock data
    const isRealData = files.some(file => 
      file.id?.startsWith('real-') || 
      file.path?.includes('/Volumes/')
    );
    
    return {
      isConnected: files.length > 0,
      isRealData,
      dataSource: isRealData ? 'Databricks Backend' : 'Mock/Fallback Data',
      fileCount: files.length
    };
  };

  const runAllTests = async () => {
    await runTest(0, testFileDiscovery);
    await runTest(1, testSmartSelection);
    await runTest(2, testSubmitProcessingJob);
    
    // Wait a bit and check if submit job was successful
    setTimeout(async () => {
      const currentTests = tests;
      if (currentTests[2].status === 'success') {
        await runTest(3, testGetBatchStatus);
      } else {
        updateTest(3, {
          status: 'error',
          message: 'Skipped: Submit Processing Job must complete successfully first'
        });
      }
    }, 100);
    
    await runTest(4, testBackendHealth);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success': return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'error': return <CloseCircleOutlined style={{ color: '#ff4d4f' }} />;
      case 'running': return <LoadingOutlined style={{ color: '#1890ff' }} />;
      default: return null;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'success';
      case 'error': return 'error';
      case 'running': return 'processing';
      default: return 'default';
    }
  };

  const overallStatus = tests.every(t => t.status === 'success') ? 'success' :
                      tests.some(t => t.status === 'error') ? 'error' :
                      tests.some(t => t.status === 'running') ? 'running' : 'pending';

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Title level={2}>🧪 Phase 1 Integration Test Suite</Title>
      <Paragraph>
        This test suite validates the Phase 1 integration between the frontend and the Databricks SmartBDX backend.
        All tests should pass for a successful integration.
      </Paragraph>

      <Alert
        message="Phase 1 Integration Status"
        description={
          overallStatus === 'success' ? 'All tests passed! Phase 1 integration is successful.' :
          overallStatus === 'error' ? 'Some tests failed. Check the details below.' :
          overallStatus === 'running' ? 'Tests are currently running...' :
          'Ready to run tests. Click "Run All Tests" to begin.'
        }
        type={overallStatus === 'success' ? 'success' : overallStatus === 'error' ? 'error' : 'info'}
        showIcon
        className="mb-6"
      />

      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Card>
          <Space>
            <Button type="primary" onClick={runAllTests} size="large">
              Run All Tests
            </Button>
            <Button onClick={() => setTests(prev => prev.map(t => ({ ...t, status: 'pending', message: undefined, data: undefined })))}>
              Reset Tests
            </Button>
          </Space>
        </Card>

        {tests.map((test, index) => (
          <Card key={index} title={
            <Space>
              {getStatusIcon(test.status)}
              <span>{test.name}</span>
              <Tag color={getStatusColor(test.status)}>
                {test.status.toUpperCase()}
              </Tag>
              {test.duration && (
                <Tag color="blue">{test.duration}ms</Tag>
              )}
            </Space>
          }>
            {test.status === 'running' && (
              <Spin indicator={<LoadingOutlined style={{ fontSize: 24 }} spin />} />
            )}
            
            {test.message && (
              <Paragraph>
                <Text type={test.status === 'error' ? 'danger' : 'success'}>
                  {test.message}
                </Text>
              </Paragraph>
            )}

            {test.data && (
              <Collapse size="small">
                <Panel header="Test Data" key="1">
                  <pre style={{ fontSize: '12px', overflow: 'auto', maxHeight: '300px' }}>
                    {JSON.stringify(test.data, null, 2)}
                  </pre>
                </Panel>
              </Collapse>
            )}

            <Space>
              <Button 
                size="small" 
                onClick={() => runTest(index, [
                  testFileDiscovery,
                  testSmartSelection,
                  testSubmitProcessingJob,
                  testGetBatchStatus,
                  testBackendHealth
                ][index])}
                disabled={test.status === 'running'}
              >
                Run Test
              </Button>
            </Space>
          </Card>
        ))}

        <Card title="Integration Summary">
          <Paragraph>
            <strong>What Phase 1 Tests:</strong>
          </Paragraph>
          <ul>
            <li><strong>File Discovery:</strong> Tests if the frontend can discover files with AI insights from Databricks</li>
            <li><strong>Smart Selection:</strong> Validates AI-powered file recommendations</li>
            <li><strong>Submit Processing Job:</strong> Ensures that a processing job can be successfully submitted.</li>
            <li><strong>Get Batch Status:</strong> Tests real-time batch monitoring capabilities</li>
            <li><strong>Backend Health:</strong> Verifies connection to Databricks and data source type</li>
          </ul>
          
          <Paragraph>
            <strong>Expected Behavior:</strong> Tests should either succeed with real Databricks data or gracefully fall back to mock data while maintaining all frontend functionality.
          </Paragraph>
        </Card>
      </Space>
    </div>
  );
}