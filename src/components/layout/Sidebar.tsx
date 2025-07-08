"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FileOutlined,
  SettingOutlined,
  DashboardOutlined,
  CheckCircleOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  ToolOutlined
} from "@ant-design/icons";

const navItems = [
  { path: "/selection", label: "File Selection", icon: <FileOutlined /> },
  { path: "/processing", label: "Processing", icon: <SettingOutlined /> },
  { path: "/monitoring", label: "Monitoring", icon: <DashboardOutlined /> },
  { path: "/mapping", label: "Mapping Review", icon: <CheckCircleOutlined /> },
  { path: "/recovery", label: "Recovery Center", icon: <ToolOutlined /> },
];

export const Sidebar = () => {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  // Emit custom event when sidebar state changes
  const toggleCollapsed = () => {
    const newState = !collapsed;
    setCollapsed(newState);
    
    // Dispatch custom event for ClientLayout to listen to
    const event = new CustomEvent('sidebarStateChange', {
      detail: { collapsed: newState }
    });
    window.dispatchEvent(event);
  };

  return (
    <div
      className={`bg-white border-r border-gray-200 transition-all duration-300 ${
        collapsed ? "w-20" : "w-64"
      } h-screen fixed left-0 top-0 z-10 flex flex-col`}
    >
      <div className="flex items-center h-16 px-4 border-b border-gray-200">
        {!collapsed ? (
          <div className="flex items-center">
            <button
              onClick={toggleCollapsed}
              className="p-2 rounded-md hover:bg-gray-100 mr-2"
            >
              {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            </button>
            <div className="flex items-center">
              <div className="w-7 h-7 rounded-md bg-blue-500 flex items-center justify-center text-white font-bold mr-2">S</div>
              <span className="text-xl font-medium text-gray-700">SmartBDX</span>
            </div>
          </div>
        ) : (
          <button
            onClick={toggleCollapsed}
            className="p-2 rounded-md hover:bg-gray-100 mx-auto"
          >
            {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
          </button>
        )}
      </div>
      
      
      <nav className="flex-grow overflow-y-auto">
        <div className="mb-6">
          <div className={`px-4 py-2 ${collapsed ? "hidden" : ""}`}>
            <h3 className="text-sm font-medium text-gray-500 mb-2">SmartBDX</h3>
          </div>
          <ul>
            {navItems.map((item) => (
              <li key={item.path} className="mb-1">
                <Link
                  href={item.path}
                  className={`flex items-center px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-r-full ${
                    pathname === item.path ? "bg-blue-100 font-medium" : ""
                  }`}
                >
                  <span className="text-lg w-6">{item.icon}</span>
                  {!collapsed && <span className="ml-4">{item.label}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </nav>
    </div>
  );
};

export default Sidebar;