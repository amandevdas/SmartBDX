// src/app/selection/page.tsx
'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Table, Checkbox, Input, Space, message, Spin, Tooltip, Alert, Progress, Tabs } from 'antd';
import { SearchOutlined, ReloadOutlined } from '@ant-design/icons';
import { apiRequest } from '@/hooks/useApi';
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

  // Initial data fetch
  useEffect(() => {
    if (!isInitialFilesLoaded) {
      fetchFiles(true).then(() => {
        setInitialFilesLoaded(true);
      });
    }
  }, [fetchFiles, isInitialFilesLoaded, setInitialFilesLoaded]);

  // Slow loading message handler
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (filesLoading) {
      timer = setTimeout(() => {
        setShowSlowLoadMessage(true);
      }, 5000);
    } else {
      setShowSlowLoadMessage(false);
    }
    return () => clearTimeout(timer);
  }, [filesLoading]);

  // UI Handlers
  const handleRefreshClick = useCallback(() => {
    fetchFiles(true);
  }, [fetchFiles]);

  const handleSheetSelection = useCallback((fileId: string, newSelection: string[]) => {
    setSelectedSheets(prev => ({ ...prev, [fileId]: newSelection }));
  }, []);

  const handleSelectFile = useCallback((fileId: string, checked: boolean) => {
    setSelectedFiles(prev =>
      checked ? [...prev, fileId] : prev.filter(id => id !== fileId)
    );
    if (!checked) {
      setSelectedSheets(prev => {
        const updated = { ...prev };
        delete updated[fileId];
        return updated;
      });
      setExpandedRowKeys(prev => prev.filter(key => key !== fileId));
    }
  }, []);

  const filteredFiles = useMemo(() => {
    return files.filter(file => {
      const matchesSearch = file.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'all' || file.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [files, searchTerm, statusFilter]);

  const handleSelectAll = useCallback((checked: boolean) => {
    if (checked) {
      const selectableFiles = filteredFiles.filter(file => file.status === 'ready');
      setSelectedFiles(selectableFiles.map(f => f.id));
    } else {
      setSelectedFiles([]);
      setSelectedSheets({});
      setExpandedRowKeys([]);
    }
  }, [filteredFiles]);

  // Job Submission
  const submitJob = useCallback(async (processData: ProcessRequest): Promise<JobStatus> => {
    setSubmitLoading(true);
    setSubmitError(null);
    try {
      const response = await apiRequest<JobStatus>('/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(processData),
      });
      if (!response.jobId) {
        throw new Error('Server did not return a job ID');
      }
      return response;
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to start processing.';
      setSubmitError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setSubmitLoading(false);
    }
  }, []);

  const handleProcessFiles = useCallback(async () => {
    if (selectedFiles.length === 0) {
      message.warning('Please select at least one file.');
      return;
    }

    // --- Validation Logic ---
    for (const fileId of selectedFiles) {
      const sheets = selectedSheets[fileId];
      if (!sheets || sheets.length === 0) {
        const file = files.find(f => f.id === fileId);
        message.warning(`Please select at least one sheet for "${file?.name || fileId}".`);
        
        // Expand the row to prompt user for selection
        if (!expandedRowKeys.includes(fileId)) {
          setExpandedRowKeys(prev => [...prev, fileId]);
        }
        return; // Stop the submission
      }
    }
    // --- End Validation Logic ---

    const processData: ProcessRequest = {
      fileIds: selectedFiles,
      sheetSelections: selectedSheets,
      options: { priority: 'normal' },
    };
    try {
      const result = await submitJob(processData);
      message.success(`Processing started! Job ID: ${result.jobId}`);
      addJob(result);
      setSelectedFiles([]);
      setSelectedSheets({});
      setExpandedRowKeys([]);
      router.push('/processing');
    } catch (error) {
      // Error is handled in submitJob
    }
  }, [selectedFiles, selectedSheets, files, expandedRowKeys, submitJob, router, addJob]);

  // Memoized data for rendering
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
          disabled={record.status !== 'ready'}
        />
      ),
    },
    { title: 'File Name', dataIndex: 'name', key: 'name', sorter: (a, b) => a.name.localeCompare(b.name) },
    { title: 'Status', dataIndex: 'status', key: 'status' },
    { title: 'Size', dataIndex: 'size', key: 'size', render: (size) => `${(size / 1024 / 1024).toFixed(2)} MB` },
    {
      title: 'Last Modified',
      dataIndex: 'lastModified',
      key: 'lastModified',
      render: (date: Date) => date ? new Date(date).toLocaleString() : '-',
      sorter: (a, b) => (new Date(a.lastModified || 0).getTime()) - (new Date(b.lastModified || 0).getTime()),
    },
  ], [selectedFiles, filteredFiles, handleSelectAll, handleSelectFile]);

  if (filesError) {
    return <div className="p-6"><Alert message="Error Loading Files" description={filesError} type="error" showIcon /></div>;
  }

  return (
    <React.Fragment>
      <div className="p-6 bg-gray-50 min-h-full">
        <header className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">File Selection</h1>
          <p className="text-gray-600">Select files and sheets for processing.</p>
        </header>

        <div className="mb-4 bg-white p-4 rounded-lg border border-gray-200">
          <div className="flex justify-between items-center">
            <Space>
              <Search
                placeholder="Search files..."
                allowClear
                style={{ width: 300 }}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <Button icon={<ReloadOutlined />} onClick={handleRefreshClick} loading={filesLoading}>
                Refresh
              </Button>
            </Space>
            <Button
              type="primary"
              size="large"
              disabled={selectedFiles.length === 0}
              loading={submitLoading}
              onClick={handleProcessFiles}
            >
              Process Selected ({selectedFiles.length})
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

        {submitError && <Alert message="Processing Error" description={submitError} type="error" showIcon closable className="mb-4" />}

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
