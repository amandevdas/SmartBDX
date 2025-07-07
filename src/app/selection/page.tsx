// src/app/selection/page.tsx
'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Table, Checkbox, Input, Space, message, Spin, Tooltip, Alert, Progress, Tabs, Badge, Tag, Card, Statistic, Row, Col } from 'antd';
import { SearchOutlined, ReloadOutlined, ThunderboltOutlined, RocketOutlined, ClockCircleOutlined, DollarOutlined, StarOutlined } from '@ant-design/icons';
import { apiRequest } from '@/hooks/useApi';
import { apiClient } from '@/services/api';
import type { FileItem, JobStatus, ProcessRequest, SmartFileSelection } from '@/types/api';
import type { ColumnsType } from 'antd/es/table';
import { useAppContext } from '@/context/AppContext';
import { SheetSelector } from '@/components/selection/SheetSelector';

const { Search } = Input;

export default function SelectionPage() {
  // Global State
  const router = useRouter();
  const {
    isInitialFilesLoaded,
    setInitialFilesLoaded,
    files,
    fetchFiles,
    filesLoading,
    filesError,
    fileSheets,
    addJob,
  } = useAppContext();

  // Local UI State
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showSlowLoadMessage, setShowSlowLoadMessage] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSheets, setSelectedSheets] = useState<{[fileId: string]: string[]}>({});
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedRowKeys, setExpandedRowKeys] = useState<React.Key[]>([]);
  
  // Phase 1 AI-Enhanced State
  const [smartSelection, setSmartSelection] = useState<SmartFileSelection | null>(null);
  const [smartSelectionLoading, setSmartSelectionLoading] = useState(false);
  const [showAIInsights, setShowAIInsights] = useState(true);
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  
  // FIXED: Atomic protection refs to prevent race conditions
  const hasInitialized = useRef(false);
  const isProcessingRef = useRef(false);
  const isLoadingSmartSelectionRef = useRef(false);
  const isRefreshingRef = useRef(false);
  
  // FIXED: Component mounted ref for cleanup
  const isMountedRef = useRef(true);

  // FIXED: Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // FIXED: Atomic smart selection loading with proper race condition protection
  const loadSmartSelection = useCallback(async () => {
    if (!showAIInsights || isLoadingSmartSelectionRef.current) {
      console.log('🔄 [ATOMIC] Smart selection already loading or disabled, skipping...');
      return;
    }
    
    // ATOMIC: Set both ref and state together
    isLoadingSmartSelectionRef.current = true;
    if (isMountedRef.current) {
      setSmartSelectionLoading(true);
    }
    
    try {
      console.log('🧠 Loading smart selection from Databricks backend...');
      const result = await apiClient.getSmartFileSelection({
        max_items: 10,
        priority_mode: 'failed_first'
      });
      
      console.log('✅ Smart selection loaded:', result);
      if (isMountedRef.current) {
        setSmartSelection(result);
      }
    } catch (error) {
      console.warn('⚠️ Smart selection unavailable:', error);
      // FIXED: Show user-visible feedback instead of silent failure
      if (isMountedRef.current) {
        message.warning('AI insights temporarily unavailable', 3);
        setSmartSelection(null);
      }
    } finally {
      // ALWAYS reset both ref and state
      isLoadingSmartSelectionRef.current = false;
      if (isMountedRef.current) {
        setSmartSelectionLoading(false);
      }
    }
  }, [showAIInsights]);

  // FIXED: Robust initial data fetch with proper race condition handling
  useEffect(() => {
    if (!isInitialFilesLoaded && !filesLoading && !hasInitialized.current) {
      console.log('🔄 Selection page: Starting initial load sequence');
      hasInitialized.current = true;
      setInitialFilesLoaded(true);
      
      const executeInitialization = async () => {
        try {
          // Sequential execution to avoid race conditions
          await fetchFiles(true);
          if (isMountedRef.current) {
            await loadSmartSelection();
          }
        } catch (error) {
          if (isMountedRef.current) {
            console.error('Error during initial load:', error);
            message.error('Failed to load initial data. Please refresh.', 5);
          }
        }
      };
      
      executeInitialization();
    } else if (hasInitialized.current) {
      console.log('🔄 [DEDUP] Skipping duplicate initialization - already completed');
    }
  }, [isInitialFilesLoaded, filesLoading, fetchFiles, loadSmartSelection]);

  // FIXED: Improved slow loading message with proper cleanup
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    
    if (filesLoading) {
      timer = setTimeout(() => {
        if (isMountedRef.current) {
          setShowSlowLoadMessage(true);
        }
      }, 5000);
    } else if (showSlowLoadMessage) {
      // Only update state if it needs to change
      setShowSlowLoadMessage(false);
    }
    
    return () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };
  }, [filesLoading, showSlowLoadMessage]);

  // UI Handlers
  const handleRefreshClick = useCallback(() => {
    if (!isRefreshingRef.current) {
      fetchFiles(true);
    }
  }, [fetchFiles]);

  const handleSheetSelection = useCallback((fileId: string, newSelection: string[]) => {
    setSelectedSheets(prev => ({ ...prev, [fileId]: newSelection }));
  }, []);

  // FIXED: Improved file selection with better state consistency
  const handleSelectFile = useCallback((fileId: string, checked: boolean) => {
    setSelectedFiles(prev =>
      checked ? [...prev, fileId] : prev.filter(id => id !== fileId)
    );
    
    if (!checked) {
      // Clean up related state consistently
      setSelectedSheets(prev => {
        const updated = { ...prev };
        delete updated[fileId];
        return updated;
      });
      
      // Only remove from expanded if it was actually expanded
      setExpandedRowKeys(prev => 
        prev.includes(fileId) ? prev.filter(key => key !== fileId) : prev
      );
    }
  }, []);

  // FIXED: Optimized filtering with better performance
  const filteredFiles = useMemo(() => {
    return files.filter(file => {
      const matchesSearch = file.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || file.status === statusFilter;
      
      // OPTIMIZED: Priority filtering with better logic
      let matchesPriority = true;
      if (priorityFilter !== 'all' && typeof file.priority_score === 'number') {
        switch (priorityFilter) {
          case 'urgent':
            matchesPriority = file.priority_score >= 90;
            break;
          case 'high':
            matchesPriority = file.priority_score >= 70 && file.priority_score < 90;
            break;
          case 'medium':
            matchesPriority = file.priority_score >= 40 && file.priority_score < 70;
            break;
          case 'low':
            matchesPriority = file.priority_score < 40;
            break;
          default:
            matchesPriority = true;
        }
      }
      
      return matchesSearch && matchesStatus && matchesPriority;
    });
  }, [files, searchTerm, statusFilter, priorityFilter]);

  // FIXED: Memoized configuration for better performance
  const priorityBadgeConfig = useMemo(() => ({
    urgent: { color: 'error' as const, threshold: 90, icon: '🔥' },
    high: { color: 'warning' as const, threshold: 70, icon: '⚡' },
    medium: { color: 'default' as const, threshold: 40, icon: '📋' },
    low: { color: 'default' as const, threshold: 0, icon: '📋' }
  }), []);

  // FIXED: Optimized badge functions with memoization
  const getPriorityBadge = useCallback((score: number | undefined) => {
    if (typeof score !== 'number') return null;
    
    const config = score >= 90 ? priorityBadgeConfig.urgent :
                   score >= 70 ? priorityBadgeConfig.high :
                   score >= 40 ? priorityBadgeConfig.medium :
                   priorityBadgeConfig.low;
    
    if (score >= 90) {
      return (
        <Badge count={config.icon} style={{ backgroundColor: '#ff4d4f' }}>
          <Tag color={config.color}>Urgent ({score})</Tag>
        </Badge>
      );
    } else {
      return <Tag color={config.color}>{config.threshold === 0 ? 'Low' : config.threshold === 40 ? 'Medium' : 'High'} Priority ({score})</Tag>;
    }
  }, [priorityBadgeConfig]);

  const getCacheIndicator = useCallback((available: boolean | undefined) => {
    if (typeof available !== 'boolean') return null;
    
    return available ? (
      <Tooltip title="Cached analysis available - fast processing estimated">
        <ThunderboltOutlined style={{ color: '#52c41a', fontSize: '16px' }} />
      </Tooltip>
    ) : null;
  }, []);

  const getAIRecommendation = useCallback((recommendation: string | undefined) => {
    if (!recommendation) return null;
    
    const configs = {
      'high_priority': { icon: <RocketOutlined style={{ color: '#ff4d4f' }} />, color: 'error' as const, text: 'HIGH PRIORITY' },
      'cache_available': { icon: <ThunderboltOutlined style={{ color: '#52c41a' }} />, color: 'success' as const, text: 'CACHE AVAILABLE' },
      'skip': { icon: <ClockCircleOutlined style={{ color: '#d9d9d9' }} />, color: 'default' as const, text: 'SKIP' }
    };
    
    const config = configs[recommendation as keyof typeof configs];
    if (!config) return null;
    
    return (
      <Tag icon={config.icon} color={config.color}>
        {config.text}
      </Tag>
    );
  }, []);

  const formatProcessingTime = useCallback((seconds: number | undefined) => {
    if (typeof seconds !== 'number') return '-';
    
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  }, []);

  // FIXED: Improved select all with better state management
  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      const selectableFiles = filteredFiles.filter(file => file.status !== 'processing');
      setSelectedFiles(selectableFiles.map(f => f.id));
      // Don't modify selectedSheets - let user select sheets individually
    } else {
      setSelectedFiles([]);
      setSelectedSheets({});
      setExpandedRowKeys([]);
    }
  }, [filteredFiles]);

  // FIXED: Enhanced validation function
  const validateFileSelections = useCallback((): string[] => {
    const errors: string[] = [];
    
    for (const fileId of selectedFiles) {
      const file = files.find(f => f.id === fileId);
      if (!file) {
        errors.push(`File with ID ${fileId} not found`);
        continue;
      }
      
      const availableSheets = fileSheets[fileId] || [];
      const selectedSheetsForFile = selectedSheets[fileId] || [];
      
      // Only require sheet selection if sheets are available AND more than 0
      if (availableSheets.length > 0 && selectedSheetsForFile.length === 0) {
        errors.push(`Please select at least one sheet for "${file.name}"`);
        
        // Auto-expand the row to help user
        if (!expandedRowKeys.includes(fileId)) {
          setExpandedRowKeys(prev => [...prev, fileId]);
        }
      }
    }
    
    return errors;
  }, [selectedFiles, files, fileSheets, selectedSheets, expandedRowKeys]);

  // Job Submission - unchanged but with better error handling
  const submitJob = useCallback(async (processData: ProcessRequest): Promise<JobStatus> => {
    setSubmitLoading(true);
    setSubmitError(null);
    
    try {
      console.log('🚀 Submitting processing job via Databricks backend...', processData);
      
      const response = await apiClient.submitProcessingJob(processData);
      
      if (!response.jobId) {
        throw new Error('Server did not return a job ID');
      }
      
      const jobStatus: JobStatus = {
        jobId: response.jobId,
        status: response.status as any,
        batchId: response.jobId,
        timestamp: new Date().toISOString(),
        message: 'Job submitted to Databricks for processing...',
        progress: 0
      };
      
      console.log('✅ Job submitted successfully:', jobStatus);
      return jobStatus;
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to start processing via Databricks backend.';
      console.error('❌ Job submission failed:', error);
      setSubmitError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setSubmitLoading(false);
    }
  }, []);

  // FIXED: Robust process handler with complete protection
  const handleProcessFiles = useCallback(async () => {
    // ATOMIC PROTECTION: Immediate check and set
    if (isProcessingRef.current) {
      console.log('🔄 [RACE PROTECTION] Process already in progress, ignoring click');
      return;
    }
    
    if (selectedFiles.length === 0) {
      message.warning('Please select at least one file.');
      return;
    }

    // Set processing flag IMMEDIATELY before any async operations
    isProcessingRef.current = true;
    console.log('🔒 [RACE PROTECTION] Processing flag set');

    try {
      // COMPREHENSIVE VALIDATION with batch error reporting
      const validationErrors = validateFileSelections();
      if (validationErrors.length > 0) {
        // Show all validation errors to user
        validationErrors.forEach(error => message.warning(error, 4));
        return; // Early return - finally block will clear flag
      }

      const processData: ProcessRequest = {
        fileIds: selectedFiles,
        sheetSelections: selectedSheets,
        options: { priority: 'normal' },
      };
      
      const result = await submitJob(processData);
      
      // SUCCESS: Clear state and navigate
      message.success(`Processing started! Job ID: ${result.jobId}`, 4);
      addJob(result);
      setSelectedFiles([]);
      setSelectedSheets({});
      setExpandedRowKeys([]);
      router.push('/processing');
      
    } catch (error) {
      // IMPROVED ERROR HANDLING: Don't force navigation on failure
      console.error('Job submission failed:', error);
      message.error('Failed to start processing. Please check your selection and try again.', 6);
      // Don't navigate on error - let user fix issues and retry
    } finally {
      // GUARANTEED CLEANUP: Always reset the processing flag
      isProcessingRef.current = false;
      console.log('🔓 [RACE PROTECTION] Processing flag cleared');
    }
  }, [selectedFiles, selectedSheets, validateFileSelections, submitJob, router, addJob]);

  // Enhanced table columns with AI insights - unchanged but with better error handling
  const columns: ColumnsType<FileItem> = useMemo(() => [
    {
      title: <Checkbox
        checked={selectedFiles.length === filteredFiles.length && filteredFiles.length > 0}
        indeterminate={selectedFiles.length > 0 && selectedFiles.length < filteredFiles.length}
        onChange={(e) => handleSelectAll(e.target.checked)}
      />,
      dataIndex: 'select',
      width: 50,
      render: (_, record) => (
        <Checkbox
          checked={selectedFiles.includes(record.id)}
          onChange={(e) => handleSelectFile(record.id, e.target.checked)}
          disabled={record.status === 'processing'}
        />
      ),
    },
    {
      title: 'File Name',
      dataIndex: 'name',
      key: 'name',
      sorter: (a, b) => a.name.localeCompare(b.name),
      render: (name, record) => (
        <div>
          <div style={{ fontWeight: 'bold' }}>{name}</div>
          {record.ai_recommendation && (
            <div style={{ marginTop: 4 }}>
              {getAIRecommendation(record.ai_recommendation)}
            </div>
          )}
        </div>
      )
    },
    {
      title: 'Priority & Status',
      key: 'priority_status',
      width: 180,
      render: (_, record) => (
        <Space direction="vertical" size="small">
          <div>{getPriorityBadge(record.priority_score)}</div>
          <Tag color={
            record.status === 'ready' ? 'green' :
            record.status === 'processing' ? 'blue' :
            record.status === 'completed' ? 'cyan' :
            record.status === 'error' ? 'red' : 'default'
          }>
            {record.status.toUpperCase()}
          </Tag>
        </Space>
      ),
      sorter: (a, b) => (a.priority_score || 0) - (b.priority_score || 0)
    },
    {
      title: 'Cache & Processing',
      key: 'cache_processing',
      width: 150,
      render: (_, record) => (
        <Space direction="vertical" size="small">
          <div>
            {getCacheIndicator(record.cache_available)}
            <span style={{ marginLeft: 8 }}>
              {record.cache_available ? 'Cached' : 'No Cache'}
            </span>
          </div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            Est: {formatProcessingTime(record.estimated_processing_time)}
          </div>
        </Space>
      )
    },
    {
      title: 'Size',
      dataIndex: 'size',
      key: 'size',
      width: 100,
      render: (size) => `${(size / 1024 / 1024).toFixed(2)} MB`,
      sorter: (a, b) => a.size - b.size
    },
    {
      title: 'Last Modified',
      dataIndex: 'lastModified',
      key: 'lastModified',
      width: 150,
      render: (date: Date) => date ? new Date(date).toLocaleString() : '-',
      sorter: (a, b) => (new Date(a.lastModified || 0).getTime()) - (new Date(b.lastModified || 0).getTime()),
    },
  ], [selectedFiles, filteredFiles, handleSelectAll, handleSelectFile, getPriorityBadge, getCacheIndicator, getAIRecommendation, formatProcessingTime]);

  // Smart selection actions
  const handleApplySmartSelection = useCallback(() => {
    if (!smartSelection?.recommended_files) {
      message.warning('No AI recommendations available');
      return;
    }
    
    const recommendedFileIds = smartSelection.recommended_files;
    const selectableFiles = recommendedFileIds.filter(fileId =>
      files.find(f => f.id === fileId)?.status === 'ready'
    );
    
    if (selectableFiles.length === 0) {
      message.info('No recommended files are currently available for processing');
      return;
    }
    
    setSelectedFiles(selectableFiles);
    message.success(`Selected ${selectableFiles.length} AI-recommended files`);
  }, [smartSelection, files]);

  // FIXED: Atomic refresh handler with proper race condition protection
  const handleRefreshWithAI = useCallback(async () => {
    if (isRefreshingRef.current || filesLoading || smartSelectionLoading) {
      console.log('🔄 [ATOMIC] Refresh already in progress, skipping...');
      return;
    }
    
    isRefreshingRef.current = true;
    
    try {
      // Sequential execution to prevent race conditions
      await fetchFiles(true);
      if (isMountedRef.current) {
        await loadSmartSelection();
      }
    } catch (error) {
      console.error('Error during refresh:', error);
      if (isMountedRef.current) {
        message.error('Failed to refresh data. Please try again.', 4);
      }
    } finally {
      isRefreshingRef.current = false;
    }
  }, [fetchFiles, loadSmartSelection, filesLoading, smartSelectionLoading]);

  // FIXED: Error display with better UX
  if (filesError) {
    return (
      <div className="p-6">
        <Alert 
          message="Error Loading Files" 
          description={filesError} 
          type="error" 
          showIcon 
          action={
            <Button size="small" onClick={handleRefreshClick}>
              Retry
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <React.Fragment>
      <div className="p-6 bg-gray-50 min-h-full">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">AI-Enhanced File Selection</h1>
          <p className="text-gray-600">Select files and sheets for processing with AI-powered insights and recommendations.</p>
        </header>

        {/* AI Insights Dashboard */}
        {showAIInsights && smartSelection && (
          <Card className="mb-6" title={
            <Space>
              <StarOutlined style={{ color: '#1890ff' }} />
              <span>AI Smart Selection Insights</span>
              <Badge count={smartSelection.recommended_files?.length || 0} />
            </Space>
          }>
            <Row gutter={16}>
              <Col span={6}>
                <Statistic
                  title="Recommended Files"
                  value={smartSelection.recommended_files?.length || 0}
                  prefix={<RocketOutlined style={{ color: '#52c41a' }} />}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="Potential Cost Savings"
                  value={smartSelection.cost_optimization?.potential_savings || 0}
                  prefix={<DollarOutlined style={{ color: '#1890ff' }} />}
                  precision={2}
                />
              </Col>
              <Col span={6}>
                <Statistic
                  title="Cache Opportunities"
                  value={smartSelection.cache_opportunities?.length || 0}
                  prefix={<ThunderboltOutlined style={{ color: '#faad14' }} />}
                />
              </Col>
              <Col span={6}>
                <div>
                  <Button
                    type="primary"
                    icon={<StarOutlined />}
                    onClick={handleApplySmartSelection}
                    disabled={!smartSelection.recommended_files?.length}
                  >
                    Apply Smart Selection
                  </Button>
                </div>
              </Col>
            </Row>
            {smartSelection.cost_optimization?.cache_recommendations && (
              <div style={{ marginTop: 16 }}>
                <Alert
                  message="AI Recommendations"
                  description={smartSelection.cost_optimization.cache_recommendations.join('. ')}
                  type="info"
                  showIcon
                />
              </div>
            )}
          </Card>
        )}

        <div className="mb-4 bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex justify-between items-center mb-3">
            <Space>
              <Search
                placeholder="Search files..."
                allowClear
                style={{ width: 300 }}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <Button 
                icon={<ReloadOutlined />} 
                onClick={handleRefreshWithAI} 
                loading={filesLoading || smartSelectionLoading || isRefreshingRef.current}
              >
                Refresh with AI
              </Button>
            </Space>
            <Button
              type="primary"
              size="large"
              disabled={selectedFiles.length === 0 || submitLoading || isProcessingRef.current}
              loading={submitLoading}
              onClick={handleProcessFiles}
            >
              {submitLoading ? 'Processing...' : `Process Selected (${selectedFiles.length})`}
            </Button>
          </div>
          
          {/* Priority Filter */}
          <div className="flex items-center space-x-4">
            <span className="text-sm font-medium text-gray-700">Priority Filter:</span>
            <Space>
              {['all', 'urgent', 'high', 'medium', 'low'].map(priority => (
                <Button
                  key={priority}
                  size="small"
                  type={priorityFilter === priority ? 'primary' : 'default'}
                  onClick={() => setPriorityFilter(priority)}
                >
                  {priority.charAt(0).toUpperCase() + priority.slice(1)}
                  {priority !== 'all' && (
                    <Badge
                      count={files.filter(f => {
                        if (typeof f.priority_score !== 'number') return false;
                        switch (priority) {
                          case 'urgent': return f.priority_score >= 90;
                          case 'high': return f.priority_score >= 70 && f.priority_score < 90;
                          case 'medium': return f.priority_score >= 40 && f.priority_score < 70;
                          case 'low': return f.priority_score < 40;
                          default: return false;
                        }
                      }).length}
                      style={{ backgroundColor: '#1890ff', marginLeft: 4 }}
                    />
                  )}
                </Button>
              ))}
            </Space>
          </div>
        </div>

        <Tabs
          activeKey={statusFilter}
          onChange={setStatusFilter}
          className="mb-4"
          items={[
            { key: 'all', label: `All (${files.length})` },
            { key: 'ready', label: `Ready (${files.filter(f => f.status === 'ready').length})` },
            { key: 'processing', label: `Processing (${files.filter(f => f.status === 'processing').length})` },
            { key: 'completed', label: `Completed (${files.filter(f => f.status === 'completed').length})` },
            { key: 'error', label: `Error (${files.filter(f => f.status === 'error').length})` },
          ]}
        />

        {submitError && (
          <Alert 
            message="Processing Error" 
            description={submitError} 
            type="error" 
            showIcon 
            closable 
            className="mb-4"
            onClose={() => setSubmitError(null)}
          />
        )}

        <div className="bg-white p-4 rounded-lg border border-gray-200">
          <Spin spinning={filesLoading} tip="Loading files...">
            <Table
              columns={columns}
              dataSource={filteredFiles}
              rowKey="id"
              pagination={{ showSizeChanger: true, showQuickJumper: true, pageSize: 20 }}
              scroll={{ x: 800 }}
              expandable={{
                expandedRowKeys,
                onExpand: (expanded, record) => {
                  const keys = expanded ? [...expandedRowKeys, record.id] : expandedRowKeys.filter(k => k !== record.id);
                  setExpandedRowKeys(keys);
                },
                expandedRowRender: (record) => (
                  <SheetSelector
                    allSheets={fileSheets[record.id] || []}
                    selectedSheets={selectedSheets[record.id] || []}
                    onSelectionChange={(newSelection) => handleSheetSelection(record.id, newSelection)}
                  />
                ),
                rowExpandable: (record) => (fileSheets[record.id] || []).length > 0,
              }}
            />
          </Spin>
        </div>
      </div>

      {showSlowLoadMessage && filesLoading && (
        <div className="fixed bottom-4 right-4 z-50">
          <Alert
            message="Databricks cluster is starting..."
            description="This may take a few minutes. Please wait."
            type="info"
            showIcon
            closable
            onClose={() => setShowSlowLoadMessage(false)}
          />
        </div>
      )}
    </React.Fragment>
  );
}