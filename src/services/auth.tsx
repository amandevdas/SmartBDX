"use client";

// SmartBDX Authentication Service
// Prepared for Azure AD integration with MSAL
// Currently using enhanced mock implementation

import React, { useState, useEffect, createContext, useContext, ReactNode } from 'react';

interface User {
  id: string;
  name: string;
  email: string;
  token: string;
  roles: string[];
  tenant: string;
  expiresAt: Date;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => void;
  getToken: () => string | null;
  refreshToken: () => Promise<void>;
  hasRole: (role: string) => boolean;
}

// Create a context for authentication
const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  login: async () => {},
  logout: () => {},
  getToken: () => null,
  refreshToken: async () => {},
  hasRole: () => false,
});

// Mock user for demo purposes
const MOCK_USER: User = {
  id: '1',
  name: 'John Doe',
  email: 'john.doe@example.com',
  token: 'mock-token-12345',
  roles: ['user', 'bdx_analyst'],
  tenant: 'smartbdx-dev',
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours from now
};

// Provider component that wraps the app and makes auth available
export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check if user is already logged in
    const storedUser = localStorage.getItem('smartbdx_user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setIsLoading(false);
  }, []);

  const login = async () => {
    // In a real implementation, this would redirect to Azure AD login
    // and handle the authentication flow
    setIsLoading(true);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // For demo purposes, use mock user
    setUser(MOCK_USER);
    localStorage.setItem('smartbdx_user', JSON.stringify(MOCK_USER));
    setIsLoading(false);
  };

  const logout = () => {
    // In a real implementation, this would sign out from Azure AD
    setUser(null);
    localStorage.removeItem('smartbdx_user');
  };

  const getToken = () => {
    return user?.token || null;
  };

  const refreshToken = async () => {
    // TODO: Implement Azure AD token refresh
    // For now, extend mock token expiry
    if (user) {
      const updatedUser = {
        ...user,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
      };
      setUser(updatedUser);
      localStorage.setItem('smartbdx_user', JSON.stringify(updatedUser));
    }
  };

  const hasRole = (role: string) => {
    return user?.roles.includes(role) || false;
  };

  const value = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    logout,
    getToken,
    refreshToken,
    hasRole,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Custom hook to use the auth context
export const useAuth = () => useContext(AuthContext);

// HOC to protect routes
export const withAuth = (Component: React.ComponentType) => {
  const AuthenticatedComponent = (props: any) => {
    const { isAuthenticated, isLoading } = useAuth();
    
    // If auth is still loading, show nothing
    if (isLoading) {
      return <div>Loading...</div>;
    }
    
    // If not authenticated, redirect to login
    if (!isAuthenticated) {
      // In a client component, we would use router.push('/login')
      // For now, just redirect using window.location
      if (typeof window !== 'undefined') {
        window.location.href = '/login';
      }
      return <div>Redirecting to login...</div>;
    }
    
    // If authenticated, render the component
    return <Component {...props} />;
  };
  
  return AuthenticatedComponent;
};