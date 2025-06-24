"use client";

import { useState } from "react";
import { Dropdown, Avatar, Tooltip } from "antd";
import type { MenuProps } from "antd";
import { useAuth } from "@/services/auth";

const UserMenu = () => {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  const items: MenuProps["items"] = [
    {
      key: "account",
      label: (
        <div className="p-2">
          <div className="flex items-center mb-2">
            <Avatar size={40} className="bg-red-500">
              {user?.name?.charAt(0) || "U"}
            </Avatar>
            <div className="ml-3">
              <div className="font-medium">{user?.name || "User"}</div>
              <div className="text-sm text-gray-500">{user?.email || "user@example.com"}</div>
            </div>
          </div>
          <button className="mt-2 border border-gray-300 rounded-full px-4 py-1 text-sm w-full hover:bg-gray-50">
            Manage your Account
          </button>
        </div>
      ),
    },
    {
      type: "divider",
    },
    {
      key: "profile",
      label: "Profile",
    },
    {
      key: "settings",
      label: "Settings",
    },
    {
      type: "divider",
    },
    {
      key: "logout",
      label: "Logout",
      onClick: logout,
    },
  ];

  return (
    <Dropdown
      menu={{ items }}
      trigger={["click"]}
      open={open}
      onOpenChange={setOpen}
      popupRender={(menu) => (
        <div className="bg-white rounded-lg shadow-lg overflow-hidden">
          {menu}
        </div>
      )}
    >
      <div className="cursor-pointer">
        <Tooltip title={user?.name || "User"} placement="bottom">
          <Avatar size={32} className="bg-red-500 cursor-pointer hover:opacity-90 transition-opacity">
            {user?.name?.charAt(0) || "U"}
          </Avatar>
        </Tooltip>
      </div>
    </Dropdown>
  );
};

export default UserMenu;