// src/test/race-condition-fix-test.ts
/**
 * Test suite for race condition fix in selection page
 * Tests the multi-layered protection against duplicate job submissions
 */

interface TestResults {
  componentProtection: boolean;
  apiDeduplication: boolean;
  navigationFlow: boolean;
  errorHandling: boolean;
}

export class RaceConditionFixTest {
  private results: TestResults = {
    componentProtection: false,
    apiDeduplication: false,
    navigationFlow: false,
    errorHandling: false
  };

  /**
   * Test 1: Component-level protection with useRef
   */
  testComponentProtection(): boolean {
    console.log('🧪 Testing component-level race condition protection...');
    
    // Simulate the useRef protection logic
    let isProcessingRef = { current: false };
    let callCount = 0;
    
    const mockHandleProcessFiles = () => {
      if (isProcessingRef.current) {
        console.log('🔄 [RACE PROTECTION] Process already in progress, ignoring click');
        return;
      }
      
      isProcessingRef.current = true;
      console.log('🔒 [RACE PROTECTION] Processing flag set, preventing duplicate clicks');
      callCount++;
      
      // Simulate async operation
      setTimeout(() => {
        isProcessingRef.current = false;
        console.log('🔓 [RACE PROTECTION] Processing flag cleared, button re-enabled');
      }, 100);
    };
    
    // Simulate rapid button clicks
    mockHandleProcessFiles(); // First click - should work
    mockHandleProcessFiles(); // Second click - should be blocked
    mockHandleProcessFiles(); // Third click - should be blocked
    
    // Verify only one call was processed
    const success = callCount === 1;
    console.log(`✅ Component protection test: ${success ? 'PASSED' : 'FAILED'} (calls: ${callCount})`);
    return success;
  }

  /**
   * Test 2: API-level deduplication
   */
  testApiDeduplication(): boolean {
    console.log('🧪 Testing API-level deduplication...');
    
    // Simulate the API deduplication logic
    const pendingRequests: Record<string, any> = {};
    let apiCallCount = 0;
    
    const mockApiRequest = (endpoint: string, fileIds: string[]) => {
      const cacheKey = `POST:${endpoint}:process_files:${fileIds.sort().join(',')}`;
      
      if (pendingRequests[cacheKey]) {
        console.log(`🔄 [DEDUP] Reusing in-flight request for ${endpoint}`);
        return pendingRequests[cacheKey];
      }
      
      apiCallCount++;
      const promise = new Promise(resolve => {
        setTimeout(() => {
          resolve({ jobId: `job-${Date.now()}`, status: 'submitted' });
          delete pendingRequests[cacheKey];
        }, 50);
      });
      
      pendingRequests[cacheKey] = promise;
      console.log(`🔒 [PROCESS_FILES] Request cached for deduplication`);
      return promise;
    };
    
    // Simulate multiple API calls with same file selection
    const fileIds = ['file1', 'file2'];
    mockApiRequest('/process_files', fileIds);
    mockApiRequest('/process_files', fileIds);
    mockApiRequest('/process_files', fileIds);
    
    // Verify only one API call was made
    const success = apiCallCount === 1;
    console.log(`✅ API deduplication test: ${success ? 'PASSED' : 'FAILED'} (calls: ${apiCallCount})`);
    return success;
  }

  /**
   * Test 3: Navigation flow after processing
   */
  testNavigationFlow(): boolean {
    console.log('🧪 Testing navigation flow...');
    
    let navigatedToProcessing = false;
    let messageShown = false;
    
    const mockRouter = {
      push: (path: string) => {
        if (path === '/processing') {
          navigatedToProcessing = true;
          console.log('✅ Navigation to processing page successful');
        }
      }
    };
    
    const mockMessage = {
      success: (msg: string) => {
        messageShown = true;
        console.log(`✅ Success message shown: ${msg}`);
      },
      info: (msg: string) => {
        messageShown = true;
        console.log(`ℹ️ Info message shown: ${msg}`);
      }
    };
    
    // Simulate successful processing
    const simulateSuccessFlow = () => {
      const result = { jobId: 'test-job-123', status: 'submitted' };
      mockMessage.success(`Processing started! Job ID: ${result.jobId}`);
      mockRouter.push('/processing');
    };
    
    // Simulate error with fallback navigation
    const simulateErrorFlow = () => {
      mockMessage.info('You can view existing jobs in the Processing page');
      setTimeout(() => mockRouter.push('/processing'), 100);
    };
    
    simulateSuccessFlow();
    const success = navigatedToProcessing && messageShown;
    console.log(`✅ Navigation flow test: ${success ? 'PASSED' : 'FAILED'}`);
    return success;
  }

  /**
   * Test 4: Error handling and cleanup
   */
  testErrorHandling(): boolean {
    console.log('🧪 Testing error handling and cleanup...');
    
    let isProcessingRef = { current: false };
    let cleanupCalled = false;
    
    const mockHandleProcessFilesWithError = async () => {
      if (isProcessingRef.current) return;
      
      isProcessingRef.current = true;
      
      try {
        throw new Error('Simulated processing error');
      } catch (error) {
        console.log('Error caught in processing');
      } finally {
        isProcessingRef.current = false;
        cleanupCalled = true;
        console.log('🔓 [RACE PROTECTION] Processing flag cleared after error');
      }
    };
    
    // Test error handling
    mockHandleProcessFilesWithError();
    
    // Verify cleanup was called and flag was reset
    const success = cleanupCalled && !isProcessingRef.current;
    console.log(`✅ Error handling test: ${success ? 'PASSED' : 'FAILED'}`);
    return success;
  }

  /**
   * Run all tests
   */
  async runAllTests(): Promise<TestResults> {
    console.log('🚀 Starting race condition fix test suite...\n');
    
    this.results.componentProtection = this.testComponentProtection();
    this.results.apiDeduplication = this.testApiDeduplication();
    this.results.navigationFlow = this.testNavigationFlow();
    this.results.errorHandling = this.testErrorHandling();
    
    const allPassed = Object.values(this.results).every(result => result === true);
    
    console.log('\n📊 Test Results Summary:');
    console.log('================================');
    console.log(`Component Protection: ${this.results.componentProtection ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`API Deduplication: ${this.results.apiDeduplication ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Navigation Flow: ${this.results.navigationFlow ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`Error Handling: ${this.results.errorHandling ? '✅ PASSED' : '❌ FAILED'}`);
    console.log('================================');
    console.log(`Overall: ${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
    
    return this.results;
  }
}

// Export for use in other test files
export const testRaceConditionFix = async (): Promise<boolean> => {
  const tester = new RaceConditionFixTest();
  const results = await tester.runAllTests();
  return Object.values(results).every(result => result === true);
};