// src/app/selection/page.tsx - Simplified for backend-supported operations only
'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Table, Checkbox, Input, Space, message, Spin, Alert, Tabs } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { apiClient } from '@/services/api';
import type { FileItem, JobStatus, ProcessRequest } from '@/types/api';
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
  
  // Atomic protection refs to prevent race conditions
  const hasInitialized = useRef(false);
  const isProcessingRef = useRef(false);
  const isRefreshingRef = useRef(false);
  
  // Component mounted ref for cleanup
  const isMountedRef = useRef(true);

  // Cleanup on unmount
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Robust initial data fetch
  useEffect(() => {
    if (!isInitialFilesLoaded && !filesLoading && !hasInitialized.current) {
      console.log('🔄 Selection page: Starting initial load sequence');
      hasInitialized.current = true;
      setInitialFilesLoaded(true);
      
      const executeInitialization = async () => {
        try {
          await fetchFiles(true);
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
  }, [isInitialFilesLoaded, filesLoading, fetchFiles]);

  // Slow loading message
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    
    if (filesLoading) {
      timer = setTimeout(() => {
        if (isMountedRef.current) {
          setShowSlowLoadMessage(true);
        }
      }, 5000);
    } else if (showSlowLoadMessage) {
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

  // File selection with state consistency
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
      
      setExpandedRowKeys(prev => 
        prev.includes(fileId) ? prev.filter(key => key !== fileId) : prev
      );
    }
  }, []);

  // Basic file filtering
  const filteredFiles = useMemo(() => {
    return files.filter(file => {
      const matchesSearch = file.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || file.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [files, searchTerm, statusFilter]);

  // Select all files
  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      const selectableFiles = filteredFiles.filter(file => file.status !== 'processing');
      setSelectedFiles(selectableFiles.map(f => f.id));
    } else {
      setSelectedFiles([]);
      setSelectedSheets({});
      setExpandedRowKeys([]);
    }
  }, [filteredFiles]);

  // File selection validation
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
      
      if (availableSheets.length > 0 && selectedSheetsForFile.length === 0) {
        errors.push(`Please select at least one sheet for "${file.name}"`);
        
        if (!expandedRowKeys.includes(fileId)) {
          setExpandedRowKeys(prev => [...prev, fileId]);
        }
      }
    }
    
    return errors;
  }, [selectedFiles, files, fileSheets, selectedSheets, expandedRowKeys]);

  // Job submission
  const submitJob = useCallback(async (processData: ProcessRequest): Promise<JobStatus> => {
    setSubmitLoading(true);
    setSubmitError(null);
    
    try {
      console.log('🚀 Submitting processing job via backend...', processData);
      
      const response = await apiClient.submitProcessingJob(processData);
      
      if (!response.jobId) {
        throw new Error('Server did not return a job ID');
      }
      
      const jobStatus: JobStatus = {
        jobId: response.jobId,
        status: response.status as any,
        batchId: response.jobId,
        timestamp: new Date().toISOString(),
        message: 'Job submitted for processing...',
        progress: 0
      };
      
      console.log('✅ Job submitted successfully:', jobStatus);
      return jobStatus;
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to start processing.';
      console.error('❌ Job submission failed:', error);
      setSubmitError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setSubmitLoading(false);
    }
  }, []);

  // Process files handler
  const handleProcessFiles = useCallback(async () => {
    if (isProcessingRef.current) {
      console.log('🔄 [RACE PROTECTION] Process already in progress, ignoring click');
      return;
    }
    
    if (selectedFiles.length === 0) {
      message.warning('Please select at least one file.');
      return;
    }

    isProcessingRef.current = true;
    console.log('🔒 [RACE PROTECTION] Processing flag set');

    try {
      const validationErrors = validateFileSelections();
      if (validationErrors.length > 0) {
        validationErrors.forEach(error => message.warning(error, 4));
        return;
      }

      const processData: ProcessRequest = {
        fileIds: selectedFiles,
        sheetSelections: selectedSheets,
        options: { 
          priority: 'normal',
          enable_mapping: true  // Enable mapping for backend processing
        },
      };
      
      const result = await submitJob(processData);
      
      message.success(`Processing started! Job ID: ${result.jobId}`, 4);
      addJob(result);
      setSelectedFiles([]);
      setSelectedSheets({});
      setExpandedRowKeys([]);
      router.push('/processing');
      
    } catch (error) {
      console.error('Job submission failed:', error);
      message.error('Failed to start processing. Please check your selection and try again.', 6);
    } finally {
      isProcessingRef.current = false;
      console.log('🔓 [RACE PROTECTION] Processing flag cleared');
    }
  }, [selectedFiles, selectedSheets, validateFileSelections, submitJob, router, addJob]);

  // Selected file objects available for processing preview if needed
  // const selectedFileObjects = useMemo(() => {
  //   return selectedFiles.map(id => files.find(f => f.id === id)).filter(Boolean) as FileItem[];
  // }, [selectedFiles, files]);

  // Basic table columns
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
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      render: (status) => (
        <span className={`px-2 py-1 rounded text-sm ${
          status === 'ready' ? 'bg-green-100 text-green-800' :
          status === 'processing' ? 'bg-blue-100 text-blue-800' :
          status === 'completed' ? 'bg-cyan-100 text-cyan-800' :
          status === 'error' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800'
        }`}>
          {status.toUpperCase()}
        </span>
      ),
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
  ], [selectedFiles, filteredFiles, handleSelectAll, handleSelectFile]);

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
          <h1 className="text-2xl font-bold text-gray-900">File Selection</h1>
          <p className="text-gray-600">Select files and sheets for processing with mapping support.</p>
        </header>

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
                onClick={handleRefreshClick} 
                loading={filesLoading || isRefreshingRef.current}
              >
                Refresh
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