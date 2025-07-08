"use client";

import { useState } from "react";
import { Button, Card, Divider, Input, Form, Alert } from "antd";
import { UserOutlined, LockOutlined, WindowsOutlined } from "@ant-design/icons";
import { useRouter } from "next/navigation";
import Image from "next/image";

const LoginPage = () => {
  // const router = useRouter(); // TODO: Implement routing logic
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAzureLogin = () => {
    setLoading(true);
    setError(null);
    
    // Real Azure AD implementation required
    try {
      // TODO: Implement real Azure AD login flow
      setError("Azure AD integration not implemented - mock login removed");
      setLoading(false);
    } catch (error) {
      console.error('Login failed:', error);
      setError("Authentication failed");
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <Card className="w-full max-w-md shadow-lg">
        <div className="text-center mb-6">
          <div className="flex justify-center mb-4">
            <Image
              src="/vercel.svg"
              alt="SmartBDX Logo"
              width={120}
              height={40}
              className="dark:invert"
              priority
            />
          </div>
          <h1 className="text-2xl font-semibold">SmartBDX</h1>
          <p className="text-gray-500">Enterprise Data Ingestion Platform</p>
        </div>

        {error && (
          <Alert
            message="Authentication Error"
            description={error}
            type="error"
            showIcon
            className="mb-4"
          />
        )}

        <Button
          type="primary"
          icon={<WindowsOutlined />}
          size="large"
          block
          onClick={handleAzureLogin}
          loading={loading}
          className="mb-4"
        >
          Sign in with Microsoft Azure AD
        </Button>

        <Divider plain>Or sign in with credentials</Divider>

        <Form layout="vertical">
          <Form.Item
            label="Email"
            name="email"
            rules={[{ required: true, message: "Please input your email!" }]}
          >
            <Input prefix={<UserOutlined />} placeholder="Email" />
          </Form.Item>

          <Form.Item
            label="Password"
            name="password"
            rules={[{ required: true, message: "Please input your password!" }]}
          >
            <Input.Password prefix={<LockOutlined />} placeholder="Password" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" block>
              Sign In
            </Button>
          </Form.Item>
        </Form>

        <div className="text-center text-gray-500 text-xs mt-4">
          <p>Azure AD integration required for production use.</p>
        </div>
      </Card>
    </div>
  );
};

export default LoginPage;