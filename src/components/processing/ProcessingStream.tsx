'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, List, Tag, Typography, Space, Avatar, Button, Tooltip, Badge } from 'antd';
import { FileTextOutlined, CheckCircleOutlined, CloseCircleOutlined, LoadingOutlined, PauseCircleOutlined, DatabaseOutlined, ClockCircleOutlined } from '@ant-design/icons';
import type { JobStatus } from '@/types/api';

const { Text, Title } = Typography;

interface ProcessingEvent {
  id: string;
  timestamp: string;
  type: 'file_started' | 'file_completed' | 'file_failed' | 'batch_started' | 'batch_completed' | 'batch_failed' | 'batch_paused';
  batchId: string;
  fileId?: string;
  fileName?: string;
  message: string;
  details?: {
    sheets?: string[];
    duration?: number;
    cost?: number;
    cache_hit?: boolean;
    error?: string;
    progress?: number;
  };
}

interface ProcessingStreamProps {
  jobs: JobStatus[];
  maxEvents?: number;
  autoScroll?: boolean;
  showFilters?: boolean;
}

const ProcessingStream: React.FC<ProcessingStreamProps> = ({ 
  jobs, 
  maxEvents = 100, 
  autoScroll = true,
  showFilters = true
}) => {
  const [events, setEvents] = useState<ProcessingEvent[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<ProcessingEvent[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedBatches, setSelectedBatches] = useState<string[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  // Fetch real processing events from backend API or WebSocket/SSE
  useEffect(() => {
    if (isPaused) return;

    const fetchProcessingEvents = async () => {
      try {
        // Get batch IDs from current jobs to fetch events for
        const batchIds = jobs.map(job => job.batchId).filter(Boolean);
        
        if (batchIds.length === 0) {
          setEvents([]);
          return;
        }

        // Fetch real events from backend
        const response = await fetch('/api/processing/events', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchIds, maxEvents })
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success && data.data) {
            setEvents(data.data);
          }
        } else {
          console.error('Failed to fetch processing events');
          setEvents([]);
        }
      } catch (error) {
        console.error('Error fetching processing events:', error);
        setEvents([]);
      }
    };

    fetchProcessingEvents();
    
    // Set up polling for real-time updates (in production, use WebSocket/SSE)
    const interval = setInterval(fetchProcessingEvents, 5000);
    
    return () => clearInterval(interval);
  }, [jobs, maxEvents, isPaused]);

  // Filter events
  useEffect(() => {
    let filtered = events;

    if (selectedTypes.length > 0) {
      filtered = filtered.filter(event => selectedTypes.includes(event.type));
    }

    if (selectedBatches.length > 0) {
      filtered = filtered.filter(event => selectedBatches.includes(event.batchId));
    }

    setFilteredEvents(filtered);
  }, [events, selectedTypes, selectedBatches]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (autoScroll && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [filteredEvents, autoScroll]);

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'file_started':
        return <LoadingOutlined className="text-blue-500" />;
      case 'file_completed':
        return <CheckCircleOutlined className="text-green-500" />;
      case 'file_failed':
        return <CloseCircleOutlined className="text-red-500" />;
      case 'batch_started':
        return <DatabaseOutlined className="text-blue-500" />;
      case 'batch_completed':
        return <CheckCircleOutlined className="text-green-500" />;
      case 'batch_failed':
        return <CloseCircleOutlined className="text-red-500" />;
      case 'batch_paused':
        return <PauseCircleOutlined className="text-orange-500" />;
      default:
        return <FileTextOutlined />;
    }
  };

  const getEventColor = (type: string) => {
    switch (type) {
      case 'file_started':
      case 'batch_started':
        return 'blue';
      case 'file_completed':
      case 'batch_completed':
        return 'green';
      case 'file_failed':
      case 'batch_failed':
        return 'red';
      case 'batch_paused':
        return 'orange';
      default:
        return 'default';
    }
  };

  const formatEventType = (type: string) => {
    return type.replace(/_/g, ' ').toUpperCase();
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '';
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}m ${secs}s`;
  };

  const formatCost = (cost?: number) => {
    if (!cost) return '';
    return `$${cost.toFixed(4)}`;
  };

  const eventTypeFilters = [
    { type: 'file_started', label: 'File Started', color: 'blue' },
    { type: 'file_completed', label: 'File Completed', color: 'green' },
    { type: 'file_failed', label: 'File Failed', color: 'red' },
    { type: 'batch_started', label: 'Batch Started', color: 'blue' },
    { type: 'batch_completed', label: 'Batch Completed', color: 'green' },
    { type: 'batch_failed', label: 'Batch Failed', color: 'red' },
    { type: 'batch_paused', label: 'Batch Paused', color: 'orange' }
  ];

  const activeBatches = Array.from(new Set(events.map(e => e.batchId)));

  return (
    <Card
      title={
        <div className="flex justify-between items-center">
          <div className="flex items-center">
            <Title level={5} className="mb-0 mr-3">Processing Stream</Title>
            <Badge count={filteredEvents.length} className="mr-3" />
            {jobs.some(j => j.status === 'processing') && (
              <Badge status="processing" text="Live" />
            )}
          </div>
          <Space>
            <Button
              size="small"
              onClick={() => setIsPaused(!isPaused)}
              type={isPaused ? 'primary' : 'default'}
            >
              {isPaused ? 'Resume' : 'Pause'}
            </Button>
            <Button
              size="small"
              onClick={() => {
                setEvents([]);
                setFilteredEvents([]);
              }}
            >
              Clear
            </Button>
          </Space>
        </div>
      }
      className="h-96"
    >
      {showFilters && (
        <div className="mb-4 space-y-2">
          <div>
            <Text strong className="mr-2">Event Types:</Text>
            <Space wrap>
              {eventTypeFilters.map(filter => (
                <Tag.CheckableTag
                  key={filter.type}
                  checked={selectedTypes.includes(filter.type)}
                  onChange={(checked) => {
                    if (checked) {
                      setSelectedTypes([...selectedTypes, filter.type]);
                    } else {
                      setSelectedTypes(selectedTypes.filter(t => t !== filter.type));
                    }
                  }}
                >
                  {filter.label}
                </Tag.CheckableTag>
              ))}
            </Space>
          </div>
          
          {activeBatches.length > 0 && (
            <div>
              <Text strong className="mr-2">Batches:</Text>
              <Space wrap>
                {activeBatches.map(batchId => (
                  <Tag.CheckableTag
                    key={batchId}
                    checked={selectedBatches.includes(batchId)}
                    onChange={(checked) => {
                      if (checked) {
                        setSelectedBatches([...selectedBatches, batchId]);
                      } else {
                        setSelectedBatches(selectedBatches.filter(b => b !== batchId));
                      }
                    }}
                  >
                    {batchId.slice(-8)}
                  </Tag.CheckableTag>
                ))}
              </Space>
            </div>
          )}
        </div>
      )}

      <div
        ref={listRef}
        className="max-h-64 overflow-y-auto"
        style={{ maxHeight: '240px' }}
      >
        <List
          dataSource={filteredEvents}
          renderItem={(event) => (
            <List.Item className="py-2 px-0">
              <div className="w-full">
                <div className="flex items-start space-x-3">
                  <Avatar
                    size="small"
                    icon={getEventIcon(event.type)}
                    className="flex-shrink-0"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-1">
                      <div className="flex items-center space-x-2">
                        <Tag color={getEventColor(event.type)} className="text-xs">
                          {formatEventType(event.type)}
                        </Tag>
                        <Text className="text-xs text-gray-500 font-mono">
                          {event.batchId.slice(-8)}
                        </Text>
                      </div>
                      <Tooltip title={new Date(event.timestamp).toLocaleString()}>
                        <Text className="text-xs text-gray-400">
                          {new Date(event.timestamp).toLocaleTimeString()}
                        </Text>
                      </Tooltip>
                    </div>
                    
                    <div className="text-sm mb-1">
                      {event.fileName && (
                        <span className="font-medium text-blue-600">{event.fileName}</span>
                      )}
                      <span className={event.fileName ? 'ml-2' : ''}>{event.message}</span>
                    </div>

                    {event.details && (
                      <div className="flex items-center space-x-4 text-xs text-gray-500">
                        {event.details.duration && (
                          <span>
                            <ClockCircleOutlined className="mr-1" />
                            {formatDuration(event.details.duration)}
                          </span>
                        )}
                        {event.details.cost && (
                          <span>
                            <DatabaseOutlined className="mr-1" />
                            {formatCost(event.details.cost)}
                          </span>
                        )}
                        {event.details.cache_hit && (
                          <Tag color="green" className="text-xs">
                            CACHE HIT
                          </Tag>
                        )}
                        {event.details.error && (
                          <span className="text-red-500 truncate max-w-xs">
                            {event.details.error}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </List.Item>
          )}
          locale={{
            emptyText: isPaused ? 'Stream paused' : 'No processing events'
          }}
        />
      </div>
    </Card>
  );
};

export default ProcessingStream;