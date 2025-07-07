"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the dashboard
    router.push("/dashboard");
  }, [router]);

  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center">
        <h1 className="text-3xl font-bold mb-4">SmartBDX</h1>
        <p className="text-gray-600 mb-8">Enterprise Data Ingestion Platform</p>
        <div className="animate-pulse">Redirecting to dashboard...</div>
      </div>
    </div>
  );
}