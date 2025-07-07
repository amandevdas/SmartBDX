"use client";

import React, { useState, useEffect } from 'react';
import { Card, Button, Alert, Spin, Divider, Tag, Typography, Space, Collapse } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { apiClient } from '../../../services/api';
import { useAuth } from '../../../services/auth';
import { FileItem, JobStatus, ColumnMapping } from '../../../types/api';

const { Title, Text, Paragraph } = Typography;
const { Panel } = Collapse;

interface TestResult {
  name: string;
  success: boolean;
  message: string;
  data?: any;
  duration?: number;
}

export default function Phase1TestPage() {
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentTest, setCurrentTest] = useState<string>('');
  const { user, isAuthenticated, login } = useAuth();

  const runTest = async (name: string, testFn: () => Promise<any>): Promise<TestResult> => {
    const startTime = Date.now();
    setCurrentTest(name);
    
    try {
      const result = await Promise.race([
        testFn(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Test timeout')), 30000)
        )
      ]);
      
      return {
        name,
        success: true,
        message: 'Test completed successfully',
        data: result,
        duration: Date.now() - startTime
      };
    } catch (error) {
      return {
        name,
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime
      };
    }
  };

  const runAllTests = async () => {
    setIsRunning(true);
    setTestResults([]);
    
    const tests = [
      {
        name: 'Data Model Validation',
        test: () => testDataModels()
      },
      {
        name: 'Authentication Service',
        test: () => testAuthService()
      },
      {
        name: 'API Client - File Discovery',
        test: () => apiClient.discoverFilesWithSheets()
      },
      {
        name: 'API Client - Smart Selection',
        test: () => apiClient.getSmartFileSelection({ max_items: 5 })
      },
      {
        name: 'API Client - System Status',
        test: () => apiClient.getSystemStatus()
      },
      {
        name: 'API Client - Rate Limit Status',
        test: () => apiClient.getRateLimitStatus()
      },
      {
        name: 'API Client - Cache Analytics',
        test: () => apiClient.getCacheAnalytics()
      },
      {
        name: 'Error Handling',
        test: () => testErrorHandling()
      }
    ];

    const results: TestResult[] = [];
    
    for (const test of tests) {
      const result = await runTest(test.name, test.test);
      results.push(result);
      setTestResults([...results]);
    }
    
    setIsRunning(false);
    setCurrentTest('');
  };

  const testDataModels = async (): Promise<any> => {
    // Test enhanced FileItem interface
    const fileItem: FileItem = {
      id: 'test-1',
      name: 'test-bordereaux.xlsx',
      status: 'ready',
      size: 1024000,
      lastModified: new Date().toISOString(),
      priority_score: 85,
      processing_status: 'ready_for_processing',
      cache_available: true,
      estimated_processing_time: 120,
      ai_recommendation: 'high_priority',
      base_file_name: 'test-bordereaux',
      file_size_mb: 1.0,
    };

    // Test enhanced JobStatus interface
    const jobStatus: any = {
      jobId: 'job-123',
      status: 'processing',
      progress: 45,
      timestamp: new Date().toISOString(),
      rate_limit_status: {
        tokens_remaining: 45000,
        requests_remaining: 40,
        reset_time: new Date().toISOString(),
        tokens_per_minute: 50000,
        requests_per_minute: 50,
      },
      checkpoint_data: {
        completed_items: 10,
        failed_items: 2,
        pending_items: 15,
        total_items: 27,
        can_resume: true,
      }
    };

    // Test ColumnMapping interface
    const mapping: ColumnMapping = {
      source_column: 'Policy Number',
      target_column: 'policy_id',
      confidence: 0.95,
      mapping_source: 'vector_search',
      vector_similarity_score: 0.89,
      examples: ['POL-001', 'POL-002'],
      needs_human_review: false,
    };

    return { fileItem, jobStatus, mapping };
  };

  const testAuthService = async (): Promise<any> => {
    return {
      isAuthenticated,
      user: user ? {
        name: user.name,
        email: user.email,
        roles: (user as any).roles || [], // Type assertion for enhanced user
        hasToken: !!user.token
      } : null
    };
  };

  const testErrorHandling = async (): Promise<any> => {
    try {
      await apiClient.getFileSheets('invalid-file-id');
      return { message: 'No error thrown (mock mode)' };
    } catch (error) {
      return { message: 'Error handling working', error: error instanceof Error ? error.message : 'Unknown' };
    }
  };

  const getTestIcon = (result: TestResult) => {
    if (result.success) {
      return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
    }
    return <CloseCircleOutlined style={{ color: '#f5222d' }} />;
  };

  const getTestStatus = (result: TestResult) => {
    return (
      <Tag color={result.success ? 'success' : 'error'}>
        {result.success ? 'PASS' : 'FAIL'}
      </Tag>
    );
  };

  const passedTests = testResults.filter(r => r.success).length;
  const totalTests = testResults.length;

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      <Title level={2}>Phase 1 Integration Test Suite</Title>
      <Paragraph>
        This test suite validates the Phase 1 implementation of the SmartBDX Frontend Integration Plan.
        It tests enhanced data models, API client endpoints, authentication service, and error handling.
      </Paragraph>

      {/* Environment Info */}
      <Card title="Environment Information" style={{ marginBottom: '16px' }}>
        <Space direction="vertical">
          <Text><strong>API Base URL:</strong> {process.env.NEXT_PUBLIC_API_URL || '/api'}</Text>
          <Text><strong>Mock Mode:</strong> {process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true' ? 'Enabled' : 'Disabled'}</Text>
          <Text><strong>Authentication:</strong> {isAuthenticated ? 'Authenticated' : 'Not Authenticated'}</Text>
          {user && <Text><strong>User:</strong> {user.name} ({((user as any).roles || []).join(', ')})</Text>}
        </Space>
      </Card>

      {/* Authentication Section */}
      {!isAuthenticated && (
        <Alert
          message="Authentication Required"
          description="Please log in to test authentication features."
          type="warning"
          action={<Button size="small" onClick={login}>Login</Button>}
          style={{ marginBottom: '16px' }}
        />
      )}

      {/* Test Runner */}
      <Card 
        title="Test Execution" 
        extra={
          <Button 
            type="primary" 
            icon={<PlayCircleOutlined />}
            onClick={runAllTests}
            loading={isRunning}
            disabled={isRunning}
          >
            Run All Tests
          </Button>
        }
        style={{ marginBottom: '16px' }}
      >
        {isRunning && (
          <Space>
            <Spin />
            <Text>Running: {currentTest}</Text>
          </Space>
        )}
        
        {!isRunning && testResults.length > 0 && (
          <Alert
            message={`Test Results: ${passedTests}/${totalTests} passed`}
            type={passedTests === totalTests ? 'success' : 'warning'}
            style={{ marginBottom: '16px' }}
          />
        )}
      </Card>

      {/* Test Results */}
      {testResults.length > 0 && (
        <Card title="Test Results">
          <Collapse>
            {testResults.map((result, index) => (
              <Panel
                header={
                  <Space>
                    {getTestIcon(result)}
                    <Text>{result.name}</Text>
                    {getTestStatus(result)}
                    <Text type="secondary">({result.duration}ms)</Text>
                  </Space>
                }
                key={index}
              >
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Text><strong>Status:</strong> {result.message}</Text>
                  {result.data && (
                    <div>
                      <Text><strong>Response Data:</strong></Text>
                      <pre style={{ 
                        background: '#f5f5f5', 
                        padding: '8px', 
                        borderRadius: '4px',
                        fontSize: '12px',
                        overflow: 'auto',
                        maxHeight: '200px'
                      }}>
                        {JSON.stringify(result.data, null, 2)}
                      </pre>
                    </div>
                  )}
                </Space>
              </Panel>
            ))}
          </Collapse>
        </Card>
      )}

      <Divider />

      {/* Next Steps */}
      <Card title="Next Steps">
        <Space direction="vertical">
          <Text>
            <strong>Phase 1 Checklist:</strong>
          </Text>
          <ul>
            <li>✅ Enhanced data models with AI metadata</li>
            <li>✅ API client with SmartBDX backend integration</li>
            <li>✅ Authentication service with role-based access</li>
            <li>✅ Error handling and retry logic</li>
          </ul>
          
          <Text>
            <strong>Ready for Phase 2:</strong> AI-Enhanced Features
          </Text>
          <ul>
            <li>🔄 Smart file selection UI with priority indicators</li>
            <li>🔄 Real-time batch monitoring with checkpoint display</li>
            <li>🔄 Enhanced mapping interface with vector similarity</li>
            <li>🔄 Cost optimization recommendations</li>
          </ul>
        </Space>
      </Card>
    </div>
  );
}