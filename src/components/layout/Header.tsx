"use client";

import {
  SearchOutlined,
  QuestionCircleOutlined,
  SettingOutlined,
  AppstoreOutlined,
  BellOutlined
} from "@ant-design/icons";
import { Badge, Input, Tooltip } from "antd";
import UserMenu from "./UserMenu";
import { useState } from "react";

export const Header = () => {
  const [searchFocused, setSearchFocused] = useState(false);

  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 fixed top-0 right-0 left-0 z-10">
      <div className="flex-1 flex items-center">
        <span className="text-xl font-bold text-blue-600 ml-4">SmartBDX</span>
      </div>
      
      <div className={`flex-grow max-w-2xl transition-all ${searchFocused ? 'scale-105' : ''}`}>
        <div className={`bg-blue-50 rounded-full flex items-center px-4 py-2 transition-all ${searchFocused ? 'bg-white shadow-md' : 'hover:bg-gray-100'}`}>
          <SearchOutlined className="text-gray-500 mr-3" />
          <Input
            placeholder="Search files"
            variant="borderless"
            className="bg-transparent flex-grow"
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
        </div>
      </div>
      
      <div className="flex items-center space-x-5 flex-1 justify-end">
        <Tooltip title="Help">
          <QuestionCircleOutlined className="text-xl text-gray-600 cursor-pointer hover:text-gray-800" />
        </Tooltip>
        <Tooltip title="Settings">
          <SettingOutlined className="text-xl text-gray-600 cursor-pointer hover:text-gray-800" />
        </Tooltip>
        <Tooltip title="Apps">
          <AppstoreOutlined className="text-xl text-gray-600 cursor-pointer hover:text-gray-800" />
        </Tooltip>
        <Tooltip title="Notifications">
          <Badge count={5} size="small">
            <BellOutlined className="text-xl text-gray-600 cursor-pointer hover:text-gray-800" />
          </Badge>
        </Tooltip>
        <UserMenu />
      </div>
    </header>
  );
};

export default Header;