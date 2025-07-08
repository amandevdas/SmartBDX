// DEPRECATED: This file is deprecated in favor of lib/databricks-client.ts
// This is kept for backward compatibility but should not be used in new code.

// Re-export from the main databricks client
export { DatabricksClient } from '../lib/databricks-client';

// Create a singleton instance for backward compatibility
import { DatabricksClient } from '../lib/databricks-client';
export const databricksClient = new DatabricksClient();

// Legacy type re-exports for backward compatibility
export type { 
  FileItem as FileMeta,
  ProcessRequest,
  JobStatus
} from '../types/api';

// Mock implementation for backward compatibility
export class SmartBDXError extends Error {
  constructor(
    message: string,
    public operation: string,
    public databricksError?: string
  ) {
    super(message);
    this.name = 'SmartBDXError';
  }
}

export function handleSmartBDXError(error: any, operation: string): SmartBDXError {
  if (error instanceof SmartBDXError) {
    return error;
  }
  const message = error.message || 'Unknown SmartBDX error';
  return new SmartBDXError(message, operation, error.toString());
}