'use client';

import React, { useState, useCallback } from 'react';
import { Card, Row, Col, Input, Select, Slider, DatePicker, Switch, Button, Space, Tag, Collapse, Tooltip } from 'antd';
import { 
  FilterOutlined,
  ClearOutlined,
  SearchOutlined,
  FileTextOutlined,
  CalendarOutlined,
  ThunderboltOutlined,
  StarOutlined
} from '@ant-design/icons';
import type { FileItem } from '@/types/api';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;
const { Panel } = Collapse;

interface FilterOptions {
  filePatterns: string[];
  sheetPatterns: string[];
  priorityRange: [number, number];
  statusFilters: string[];
  sizeRange: [number, number];
  dateRange: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null;
  cacheAvailable: boolean | null;
  aiRecommendation: string | null;
  hasErrors: boolean | null;
}

interface AdvancedFiltersProps {
  files: FileItem[];
  onFiltersChange: (filteredFiles: FileItem[]) => void;
  onFiltersReset: () => void;
  disabled?: boolean;
}

const defaultFilters: FilterOptions = {
  filePatterns: [],
  sheetPatterns: [],
  priorityRange: [0, 100],
  statusFilters: [],
  sizeRange: [0, 100],
  dateRange: null,
  cacheAvailable: null,
  aiRecommendation: null,
  hasErrors: null
};

export const AdvancedFilters: React.FC<AdvancedFiltersProps> = ({
  files,
  onFiltersChange,
  onFiltersReset,
  disabled = false
}) => {
  const [filters, setFilters] = useState<FilterOptions>(defaultFilters);
  const [isExpanded, setIsExpanded] = useState(false);

  // Calculate max file size for slider
  const maxFileSize = Math.max(...files.map(f => f.size / 1024 / 1024), 100); // MB

  const applyFilters = useCallback(() => {
    let filteredFiles = [...files];

    // File pattern filter
    if (filters.filePatterns.length > 0) {
      filteredFiles = filteredFiles.filter(file =>
        filters.filePatterns.some(pattern =>
          file.name.toLowerCase().includes(pattern.toLowerCase())
        )
      );
    }

    // Priority range filter
    filteredFiles = filteredFiles.filter(file => {
      if (typeof file.priority_score !== 'number') return true;
      return file.priority_score >= filters.priorityRange[0] && 
             file.priority_score <= filters.priorityRange[1];
    });

    // Status filter
    if (filters.statusFilters.length > 0) {
      filteredFiles = filteredFiles.filter(file =>
        filters.statusFilters.includes(file.status)
      );
    }

    // Size range filter
    filteredFiles = filteredFiles.filter(file => {
      const sizeMB = file.size / 1024 / 1024;
      return sizeMB >= filters.sizeRange[0] && sizeMB <= filters.sizeRange[1];
    });

    // Date range filter
    if (filters.dateRange && filters.dateRange[0] && filters.dateRange[1]) {
      filteredFiles = filteredFiles.filter(file => {
        if (!file.lastModified) return false;
        const fileDate = dayjs(file.lastModified);
        return fileDate.isAfter(filters.dateRange![0]) && 
               fileDate.isBefore(filters.dateRange![1]);
      });
    }

    // Cache available filter
    if (filters.cacheAvailable !== null) {
      filteredFiles = filteredFiles.filter(file =>
        file.cache_available === filters.cacheAvailable
      );
    }

    // AI recommendation filter
    if (filters.aiRecommendation) {
      filteredFiles = filteredFiles.filter(file =>
        file.ai_recommendation === filters.aiRecommendation
      );
    }

    // Has errors filter
    if (filters.hasErrors !== null) {
      filteredFiles = filteredFiles.filter(file =>
        filters.hasErrors ? file.status === 'error' : file.status !== 'error'
      );
    }

    onFiltersChange(filteredFiles);
  }, [files, filters, onFiltersChange]);

  const handleFilterChange = useCallback((key: keyof FilterOptions, value: any) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
  }, [filters]);

  const handleReset = useCallback(() => {
    setFilters(defaultFilters);
    onFiltersReset();
  }, [onFiltersReset]);

  const getActiveFiltersCount = useCallback(() => {
    let count = 0;
    if (filters.filePatterns.length > 0) count++;
    if (filters.statusFilters.length > 0) count++;
    if (filters.priorityRange[0] > 0 || filters.priorityRange[1] < 100) count++;
    if (filters.sizeRange[0] > 0 || filters.sizeRange[1] < maxFileSize) count++;
    if (filters.dateRange) count++;
    if (filters.cacheAvailable !== null) count++;
    if (filters.aiRecommendation) count++;
    if (filters.hasErrors !== null) count++;
    return count;
  }, [filters, maxFileSize]);

  React.useEffect(() => {
    applyFilters();
  }, [applyFilters]);

  return (
    <Card 
      className="mb-4"
      title={
        <Space>
          <FilterOutlined />
          <span>Advanced Filters</span>
          {getActiveFiltersCount() > 0 && (
            <Tag color="blue">{getActiveFiltersCount()} active</Tag>
          )}
        </Space>
      }
      extra={
        <Space>
          <Button 
            icon={<ClearOutlined />} 
            onClick={handleReset}
            disabled={disabled || getActiveFiltersCount() === 0}
          >
            Clear All
          </Button>
          <Button 
            type={isExpanded ? 'default' : 'primary'} 
            icon={<FilterOutlined />}
            onClick={() => setIsExpanded(!isExpanded)}
            disabled={disabled}
          >
            {isExpanded ? 'Hide Filters' : 'Show Filters'}
          </Button>
        </Space>
      }
    >
      <Collapse activeKey={isExpanded ? ['filters'] : []} ghost>
        <Panel key="filters" header="" showArrow={false}>
          <div className="space-y-6">
            {/* File Pattern Filters */}
            <Row gutter={16}>
              <Col span={12}>
                <div className="mb-2">
                  <label className="text-sm font-medium flex items-center">
                    <FileTextOutlined className="mr-1" />
                    File Name Patterns
                  </label>
                </div>
                <Select
                  mode="tags"
                  style={{ width: '100%' }}
                  placeholder="Enter file name patterns (e.g., claims, premium)"
                  value={filters.filePatterns}
                  onChange={(value) => handleFilterChange('filePatterns', value)}
                  disabled={disabled}
                />
              </Col>
              <Col span={12}>
                <div className="mb-2">
                  <label className="text-sm font-medium flex items-center">
                    <SearchOutlined className="mr-1" />
                    Status Filters
                  </label>
                </div>
                <Select
                  mode="multiple"
                  style={{ width: '100%' }}
                  placeholder="Select file statuses"
                  value={filters.statusFilters}
                  onChange={(value) => handleFilterChange('statusFilters', value)}
                  disabled={disabled}
                  options={[
                    { value: 'ready', label: 'Ready' },
                    { value: 'processing', label: 'Processing' },
                    { value: 'completed', label: 'Completed' },
                    { value: 'error', label: 'Error' }
                  ]}
                />
              </Col>
            </Row>

            {/* Priority and Size Filters */}
            <Row gutter={16}>
              <Col span={12}>
                <div className="mb-2">
                  <label className="text-sm font-medium flex items-center">
                    <StarOutlined className="mr-1" />
                    Priority Score Range: {filters.priorityRange[0]} - {filters.priorityRange[1]}
                  </label>
                </div>
                <Slider
                  range
                  min={0}
                  max={100}
                  value={filters.priorityRange}
                  onChange={(value) => handleFilterChange('priorityRange', value)}
                  disabled={disabled}
                  marks={{
                    0: '0',
                    40: '40',
                    70: '70',
                    90: '90',
                    100: '100'
                  }}
                />
              </Col>
              <Col span={12}>
                <div className="mb-2">
                  <label className="text-sm font-medium flex items-center">
                    <FileTextOutlined className="mr-1" />
                    File Size Range (MB): {filters.sizeRange[0]} - {filters.sizeRange[1]}
                  </label>
                </div>
                <Slider
                  range
                  min={0}
                  max={maxFileSize}
                  value={filters.sizeRange}
                  onChange={(value) => handleFilterChange('sizeRange', value)}
                  disabled={disabled}
                  step={0.1}
                />
              </Col>
            </Row>

            {/* Date Range Filter */}
            <Row gutter={16}>
              <Col span={12}>
                <div className="mb-2">
                  <label className="text-sm font-medium flex items-center">
                    <CalendarOutlined className="mr-1" />
                    Last Modified Date Range
                  </label>
                </div>
                <RangePicker
                  style={{ width: '100%' }}
                  value={filters.dateRange}
                  onChange={(dates) => handleFilterChange('dateRange', dates)}
                  disabled={disabled}
                />
              </Col>
              <Col span={12}>
                <div className="mb-2">
                  <label className="text-sm font-medium flex items-center">
                    <ThunderboltOutlined className="mr-1" />
                    AI Recommendation
                  </label>
                </div>
                <Select
                  style={{ width: '100%' }}
                  placeholder="Select AI recommendation"
                  value={filters.aiRecommendation}
                  onChange={(value) => handleFilterChange('aiRecommendation', value)}
                  disabled={disabled}
                  allowClear
                  options={[
                    { value: 'high_priority', label: 'High Priority' },
                    { value: 'cache_available', label: 'Cache Available' },
                    { value: 'skip', label: 'Skip Recommended' }
                  ]}
                />
              </Col>
            </Row>

            {/* Toggle Filters */}
            <Row gutter={16}>
              <Col span={8}>
                <div className="flex items-center justify-between p-3 border rounded">
                  <span className="text-sm font-medium">Cache Available</span>
                  <Space>
                    <Button
                      size="small"
                      type={filters.cacheAvailable === true ? 'primary' : 'default'}
                      onClick={() => handleFilterChange('cacheAvailable', 
                        filters.cacheAvailable === true ? null : true)}
                      disabled={disabled}
                    >
                      Yes
                    </Button>
                    <Button
                      size="small"
                      type={filters.cacheAvailable === false ? 'primary' : 'default'}
                      onClick={() => handleFilterChange('cacheAvailable', 
                        filters.cacheAvailable === false ? null : false)}
                      disabled={disabled}
                    >
                      No
                    </Button>
                  </Space>
                </div>
              </Col>
              <Col span={8}>
                <div className="flex items-center justify-between p-3 border rounded">
                  <span className="text-sm font-medium">Has Previous Errors</span>
                  <Space>
                    <Button
                      size="small"
                      type={filters.hasErrors === true ? 'primary' : 'default'}
                      onClick={() => handleFilterChange('hasErrors', 
                        filters.hasErrors === true ? null : true)}
                      disabled={disabled}
                    >
                      Yes
                    </Button>
                    <Button
                      size="small"
                      type={filters.hasErrors === false ? 'primary' : 'default'}
                      onClick={() => handleFilterChange('hasErrors', 
                        filters.hasErrors === false ? null : false)}
                      disabled={disabled}
                    >
                      No
                    </Button>
                  </Space>
                </div>
              </Col>
            </Row>

            {/* Filter Summary */}
            <div className="bg-gray-50 p-3 rounded">
              <div className="text-sm text-gray-600">
                <strong>Filter Results:</strong> {files.length} files match the current filters
              </div>
            </div>
          </div>
        </Panel>
      </Collapse>
    </Card>
  );
};