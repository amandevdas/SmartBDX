'use client';

import React, { useState } from 'react';
import { Button, Card, Spin, Alert, Typography } from 'antd';
import { apiClient } from '@/services/api';

const { Title, Paragraph, Text } = Typography;

export default function ApiTestPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<any | null>(null);

  const runTest = async () => {
    setLoading(true);
    setError(null);
    setData(null);

    try {
      const result = await apiClient.discoverFilesWithSheets();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Title level={2}>🧪 API Test Page</Title>
      <Paragraph>
        This page makes a single, direct call to the `discoverFilesWithSheets` method in the `apiClient`.
      </Paragraph>
      <Card>
        <Button type="primary" onClick={runTest} loading={loading}>
          Run Test
        </Button>
      </Card>

      {loading && <Spin tip="Loading..." />}

      {error && (
        <Alert
          message="Error"
          description={error}
          type="error"
          showIcon
          className="mt-4"
        />
      )}

      {data && (
        <Card title="API Response" className="mt-4">
          <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {JSON.stringify(data, null, 2)}
          </pre>
        </Card>
      )}
    </div>
  );
}