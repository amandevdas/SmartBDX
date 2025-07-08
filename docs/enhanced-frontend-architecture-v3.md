# SmartBDX Enhanced Frontend Architecture v3
## Complete Redesign Based on API Gateway v3 Capabilities

> **Key Innovation**: The API Gateway v3 introduces a complete **mapping workflow** with UI-driven approval system, requiring fundamental changes to frontend architecture.

---

## 🏗️ **New Architecture Overview**

### **Core Principles**
1. **Workflow-Driven Design** - Built around the new mapping approval workflow
2. **Real-Time Operations** - Live monitoring and progress tracking
3. **Progressive Enhancement** - Graceful handling of limited functionality
4. **Modular Components** - Match backend's module availability system
5. **Data-Driven UX** - Rich metadata and analytics integration

---

## 📋 **Available API Operations Analysis**

### **Core Operations (6 Total)**
```typescript
interface SmartBDXOperations {
  // File Management
  discover_files_with_sheets: (params: DiscoveryParams) => FileMetadata[]
  
  // Processing Engine
  process_files: (params: ProcessingParams) => ProcessingResult
  
  // Monitoring & Recovery
  get_batch_status: (batchId?: string) => BatchStatus
  resume_failed_batch: (batchId: string) => ResumeResult
  
  // NEW: Mapping Workflow
  get_mapping_results: (params: MappingQuery) => MappingResults
  approve_mappings: (params: ApprovalParams) => ApprovalResult
}
```

### **Enhanced Capabilities**
- ✅ **Vector Search Integration** for intelligent column mapping
- ✅ **Persistent Mapping Storage** with approval workflow
- ✅ **Real-time Progress Tracking** with detailed metrics
- ✅ **Graceful Degradation** when modules unavailable
- ✅ **Production-Ready Infrastructure** with checkpointing

---

## 🎯 **New Frontend Architecture**

### **1. Application Structure**

```
src/
├── app/
│   ├── (dashboard)/
│   │   ├── page.tsx                 # Main operational dashboard
│   │   └── system-health/
│   ├── (workflows)/
│   │   ├── discovery/
│   │   │   ├── page.tsx             # File discovery & selection
│   │   │   └── components/
│   │   ├── processing/
│   │   │   ├── page.tsx             # Batch processing control
│   │   │   ├── [batchId]/
│   │   │   │   ├── page.tsx         # Individual batch monitoring
│   │   │   │   └── recovery/
│   │   │   └── components/
│   │   └── mapping/                 # NEW: Mapping workflow
│   │       ├── page.tsx             # Mapping dashboard
│   │       ├── review/
│   │       │   └── [fileId]/
│   │       │       └── page.tsx     # Mapping review interface
│   │       └── components/
│   └── (analytics)/
│       ├── performance/
│       ├── usage/
│       └── insights/
├── components/
│   ├── core/                        # Core UI components
│   ├── workflows/                   # Workflow-specific components
│   ├── mapping/                     # NEW: Mapping components
│   ├── monitoring/                  # Real-time monitoring
│   └── shared/                      # Shared utilities
├── hooks/
│   ├── useSmartBDXApi.ts           # Enhanced API integration
│   ├── useRealTimeMonitoring.ts    # Live monitoring
│   ├── useMappingWorkflow.ts       # NEW: Mapping workflow
│   └── useSystemHealth.ts          # System status monitoring
├── services/
│   ├── api/
│   │   ├── smartbdx-client.ts      # Enhanced API client
│   │   ├── mapping-service.ts      # NEW: Mapping operations
│   │   └── monitoring-service.ts   # Real-time monitoring
│   └── workflow/
│       ├── discovery-flow.ts
│       ├── processing-flow.ts
│       └── mapping-flow.ts         # NEW: Mapping workflow
└── types/
    ├── api.ts                      # API response types
    ├── mapping.ts                  # NEW: Mapping types
    └── workflow.ts                 # Workflow state types
```

### **2. Core Pages & Components**

#### **A. Enhanced Dashboard (`/dashboard`)**
```typescript
interface DashboardView {
  sections: {
    systemHealth: SystemHealthWidget
    activeBatches: BatchMonitoringWidget
    pendingMappings: MappingWorkflowWidget    // NEW
    recentActivity: ActivityStreamWidget
    quickActions: ActionButtonsWidget
  }
  realTimeUpdates: {
    batchProgress: boolean
    systemStatus: boolean
    mappingQueue: boolean                     // NEW
  }
}

// Key Features:
// - Real-time system health monitoring
// - Live batch progress tracking
// - Mapping workflow status (NEW)
// - Quick access to all operations
// - Module availability indicators
```

#### **B. Mapping Workflow Pages (NEW)**

**Mapping Dashboard (`/mapping`)**
```typescript
interface MappingDashboard {
  overview: {
    pendingReviews: number
    completedMappings: number
    batchesWithMappings: BatchSummary[]
  }
  filters: {
    batchId?: string
    filePattern?: string
    confidenceThreshold?: number
    status: 'pending' | 'approved' | 'rejected'
  }
  actions: {
    bulkApprove: (mappings: MappingItem[]) => void
    exportMappings: () => void
    viewDetails: (mapping: MappingItem) => void
  }
}
```

**Mapping Review Interface (`/mapping/review/[fileId]`)**
```typescript
interface MappingReviewPage {
  fileContext: {
    fileName: string
    sheetName: string
    batchId: string
    totalColumns: number
    reviewProgress: number
  }
  
  mappingList: {
    sourceColumn: string
    proposedTarget: string
    confidence: number
    sampleValues: string[]
    alternatives: string[]
    userDecision?: 'approve' | 'reject' | 'modify'
  }[]
  
  bulkActions: {
    approveHighConfidence: () => void
    rejectLowConfidence: () => void
    autoMapByPattern: () => void
  }
  
  navigationControls: {
    nextFile: () => void
    previousFile: () => void
    saveAndExit: () => void
  }
}

// Key Features:
// - Side-by-side source/target column comparison
// - Confidence score visualization
// - Sample data preview
// - Alternative suggestions
// - Bulk approval actions
// - Progress tracking
// - Keyboard shortcuts for efficiency
```

#### **C. Enhanced Processing Pages**

**Processing Control (`/processing`)**
```typescript
interface ProcessingControl {
  batchConfiguration: {
    selectedFiles: FileSelection[]
    mappingEnabled: boolean              // NEW: Mapping toggle
    mappingOptions: {                    // NEW: Mapping configuration
      vectorThreshold: number
      autoApproveThreshold: number
      reviewRequired: boolean
    }
    processingOptions: {
      batchSize: number
      rateLimits: RateLimitConfig
    }
  }
  
  preProcessingChecks: {
    systemHealth: SystemStatus
    moduleAvailability: ModuleStatus
    mappingReadiness: MappingStatus      // NEW
    estimatedTime: number
    estimatedCost: number
  }
}
```

**Batch Monitoring (`/processing/[batchId]`)**
```typescript
interface BatchMonitoring {
  progressTracking: {
    overall: ProgressMetrics
    perFile: FileProgress[]
    realTimeUpdates: boolean
  }
  
  mappingProgress: {                     // NEW: Mapping-specific progress
    totalMappings: number
    pendingReview: number
    autoApproved: number
    confidenceDistribution: ConfidenceStats
  }
  
  actionControls: {
    pauseBatch: () => void
    resumeBatch: () => void
    viewMappings: () => void             // NEW: Navigate to mapping review
    downloadResults: () => void
  }
  
  errorAnalysis: {
    failedItems: FailedItem[]
    errorPatterns: ErrorPattern[]
    recoveryOptions: RecoveryAction[]
  }
}
```

### **3. Enhanced API Integration**

#### **SmartBDX API Client**
```typescript
class SmartBDXApiClient {
  // Core Operations
  async discoverFiles(params: DiscoveryParams): Promise<FileMetadata[]>
  async processFiles(params: ProcessingParams): Promise<ProcessingResult>
  async getBatchStatus(batchId?: string): Promise<BatchStatus>
  async resumeFailedBatch(batchId: string): Promise<ResumeResult>
  
  // NEW: Mapping Operations
  async getMappingResults(params: MappingQuery): Promise<MappingResults>
  async approveMappings(params: ApprovalParams): Promise<ApprovalResult>
  
  // Enhanced Features
  async getSystemHealth(): Promise<SystemHealth>
  streamBatchProgress(batchId: string): Observable<ProgressUpdate>
  streamMappingUpdates(): Observable<MappingUpdate>
}

// Usage Example:
const client = new SmartBDXApiClient(config)

// Start processing with mapping
const result = await client.processFiles({
  files: selectedFiles,
  enable_mapping: true,
  batch_id: generateBatchId()
})

// Monitor progress in real-time
client.streamBatchProgress(result.data.batch_id)
  .subscribe(update => {
    setBatchProgress(update)
    
    // Check for mapping results
    if (update.mappings_ready) {
      navigateToMappingReview()
    }
  })
```

#### **Mapping Workflow Service**
```typescript
class MappingWorkflowService {
  async getPendingMappings(filters: MappingFilters): Promise<MappingItem[]>
  
  async submitMappingDecisions(decisions: MappingDecision[]): Promise<void>
  
  async getFileContext(fileId: string): Promise<FileContext>
  
  async exportApprovedMappings(format: 'json' | 'csv'): Promise<Blob>
  
  // Bulk operations
  async bulkApproveByConfidence(threshold: number): Promise<BulkResult>
  async bulkRejectByPattern(pattern: string): Promise<BulkResult>
  
  // Analytics
  async getMappingStatistics(): Promise<MappingStats>
  async getConfidenceDistribution(): Promise<ConfidenceStats>
}
```

### **4. Real-Time Updates Architecture**

#### **WebSocket Integration**
```typescript
interface RealTimeUpdates {
  connections: {
    batchProgress: WebSocket
    systemHealth: WebSocket
    mappingUpdates: WebSocket           // NEW
  }
  
  handlers: {
    onBatchUpdate: (update: BatchUpdate) => void
    onSystemChange: (status: SystemStatus) => void
    onMappingReady: (notification: MappingNotification) => void  // NEW
    onError: (error: ErrorEvent) => void
  }
  
  subscriptions: {
    subscribeToBatch: (batchId: string) => Subscription
    subscribeToMappings: (fileId?: string) => Subscription    // NEW
    subscribeToSystem: () => Subscription
  }
}

// Implementation
const useRealTimeUpdates = () => {
  const [batchUpdates, setBatchUpdates] = useState<BatchUpdate[]>([])
  const [mappingUpdates, setMappingUpdates] = useState<MappingUpdate[]>([])
  
  useEffect(() => {
    const ws = new WebSocket(`${WS_URL}/batch-updates`)
    ws.onmessage = (event) => {
      const update = JSON.parse(event.data)
      setBatchUpdates(prev => [...prev, update])
      
      // Check for mapping readiness
      if (update.type === 'mappings_ready') {
        setMappingUpdates(prev => [...prev, update])
        // Show notification to user
        showMappingReadyNotification(update.batchId)
      }
    }
    
    return () => ws.close()
  }, [])
  
  return { batchUpdates, mappingUpdates }
}
```

### **5. Enhanced State Management**

#### **Workflow State**
```typescript
interface AppState {
  // Core state
  discovery: {
    availableFiles: FileMetadata[]
    selectedFiles: string[]
    discoveryStatus: 'idle' | 'loading' | 'complete' | 'error'
  }
  
  processing: {
    activeBatches: BatchInfo[]
    batchHistory: BatchSummary[]
    currentBatch?: string
  }
  
  // NEW: Mapping state
  mapping: {
    pendingReviews: MappingItem[]
    currentReview?: FileReview
    reviewProgress: ReviewProgress
    approvedMappings: ApprovedMapping[]
    mappingStatistics: MappingStats
  }
  
  system: {
    health: SystemHealth
    moduleStatus: ModuleStatus
    capabilities: SystemCapabilities
  }
  
  ui: {
    activeWorkflow: 'discovery' | 'processing' | 'mapping' | 'analytics'
    notifications: Notification[]
    modals: ModalState
  }
}

// Context Providers
export const AppStateProvider = ({ children }: PropsWithChildren) => {
  const [state, dispatch] = useReducer(appReducer, initialState)
  
  // Real-time updates
  useRealTimeUpdates(dispatch)
  
  return (
    <AppStateContext.Provider value={{ state, dispatch }}>
      {children}
    </AppStateContext.Provider>
  )
}
```

### **6. Component Library Enhancements**

#### **Mapping Components**
```typescript
// Mapping Review Table
const MappingReviewTable = ({
  mappings,
  onDecision,
  bulkActions
}: MappingReviewProps) => {
  return (
    <div className="mapping-review">
      <MappingToolbar bulkActions={bulkActions} />
      <VirtualizedTable
        data={mappings}
        columns={[
          { key: 'sourceColumn', title: 'Source Column' },
          { key: 'proposedTarget', title: 'Proposed Target' },
          { key: 'confidence', title: 'Confidence', 
            render: (value) => <ConfidenceBadge value={value} /> },
          { key: 'sampleValues', title: 'Sample Data',
            render: (values) => <SampleDataPreview values={values} /> },
          { key: 'actions', title: 'Decision',
            render: (_, row) => <MappingDecisionButtons 
              mapping={row} 
              onDecision={onDecision} 
            /> }
        ]}
        keyboardNavigation
        bulkSelection
      />
    </div>
  )
}

// Confidence Score Visualization
const ConfidenceBadge = ({ value }: { value: number }) => {
  const getColor = (confidence: number) => {
    if (confidence >= 0.8) return 'green'
    if (confidence >= 0.6) return 'yellow'
    return 'red'
  }
  
  return (
    <Badge 
      color={getColor(value)}
      className="confidence-badge"
    >
      {(value * 100).toFixed(1)}%
    </Badge>
  )
}

// Sample Data Preview
const SampleDataPreview = ({ values }: { values: string[] }) => {
  return (
    <Tooltip content={values.join(', ')}>
      <div className="sample-preview">
        {values.slice(0, 3).join(', ')}
        {values.length > 3 && '...'}
      </div>
    </Tooltip>
  )
}
```

#### **Enhanced Monitoring Components**
```typescript
// Real-time Progress Dashboard
const BatchProgressDashboard = ({ batchId }: { batchId: string }) => {
  const { progress, mappingStatus } = useRealTimeBatchProgress(batchId)
  
  return (
    <div className="progress-dashboard">
      <ProgressOverview progress={progress} />
      
      {/* NEW: Mapping progress section */}
      {mappingStatus.enabled && (
        <MappingProgressSection 
          status={mappingStatus}
          onReviewClick={() => navigateToMappingReview(batchId)}
        />
      )}
      
      <FileProgressGrid files={progress.files} />
      <ErrorAnalysisPanel errors={progress.errors} />
    </div>
  )
}

// Mapping Progress Section
const MappingProgressSection = ({ 
  status, 
  onReviewClick 
}: MappingProgressProps) => {
  return (
    <Card className="mapping-progress">
      <CardHeader>
        <h3>Column Mapping Progress</h3>
        <Badge variant="outline">
          {status.pendingReviews} pending reviews
        </Badge>
      </CardHeader>
      <CardContent>
        <ProgressBar 
          value={status.completionRate} 
          max={100}
          className="mb-4"
        />
        <div className="mapping-stats">
          <Stat label="Total Mappings" value={status.totalMappings} />
          <Stat label="Auto-Approved" value={status.autoApproved} />
          <Stat label="Needs Review" value={status.pendingReviews} />
          <Stat label="Avg Confidence" value={`${status.avgConfidence}%`} />
        </div>
        {status.pendingReviews > 0 && (
          <Button onClick={onReviewClick} className="w-full mt-4">
            Review Mappings ({status.pendingReviews})
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
```

### **7. Mobile-Responsive Design**

#### **Adaptive Layout**
```typescript
const ResponsiveLayout = ({ children }: LayoutProps) => {
  const isMobile = useMediaQuery('(max-width: 768px)')
  
  if (isMobile) {
    return (
      <MobileLayout>
        <MobileNavigation />
        <MobileContent>{children}</MobileContent>
      </MobileLayout>
    )
  }
  
  return (
    <DesktopLayout>
      <Sidebar />
      <MainContent>{children}</MainContent>
    </DesktopLayout>
  )
}

// Mobile-optimized mapping review
const MobileMappingReview = ({ mappings }: MappingReviewProps) => {
  const [currentIndex, setCurrentIndex] = useState(0)
  const currentMapping = mappings[currentIndex]
  
  return (
    <div className="mobile-mapping-review">
      <ProgressHeader 
        current={currentIndex + 1} 
        total={mappings.length} 
      />
      
      <SwipeableCard>
        <MappingCard mapping={currentMapping} />
        <MappingActions 
          onApprove={() => handleDecision('approve')}
          onReject={() => handleDecision('reject')}
          onSkip={() => setCurrentIndex(prev => prev + 1)}
        />
      </SwipeableCard>
      
      <NavigationControls 
        onPrevious={() => setCurrentIndex(prev => Math.max(0, prev - 1))}
        onNext={() => setCurrentIndex(prev => Math.min(mappings.length - 1, prev + 1))}
      />
    </div>
  )
}
```

---

## 🚀 **Implementation Roadmap**

### **Phase 1: Core Infrastructure (Week 1-2)**
- [ ] Set up new project structure
- [ ] Implement enhanced API client
- [ ] Create mapping workflow service
- [ ] Build real-time updates system

### **Phase 2: Mapping Workflow (Week 3-4)**
- [ ] Build mapping dashboard
- [ ] Implement mapping review interface
- [ ] Create bulk approval actions
- [ ] Add confidence visualization

### **Phase 3: Enhanced Monitoring (Week 5-6)**
- [ ] Upgrade batch monitoring
- [ ] Add mapping progress tracking
- [ ] Implement error analysis
- [ ] Build recovery workflows

### **Phase 4: Mobile & Polish (Week 7-8)**
- [ ] Mobile-responsive design
- [ ] Performance optimization
- [ ] Accessibility improvements
- [ ] Testing & documentation

---

## 📊 **Key Benefits of New Architecture**

### **For Users**
1. **Streamlined Workflow** - Complete mapping approval process
2. **Real-Time Insights** - Live progress and system monitoring
3. **Intelligent Automation** - Auto-approval based on confidence
4. **Mobile Accessibility** - Review mappings anywhere
5. **Error Recovery** - Comprehensive failure analysis and recovery

### **For Developers**
1. **Modular Design** - Clean separation of concerns
2. **Type Safety** - Full TypeScript integration
3. **Real-Time Ready** - Built-in WebSocket support
4. **Progressive Enhancement** - Graceful degradation
5. **Scalable Architecture** - Prepared for future enhancements

### **For Operations**
1. **Production Monitoring** - Real-time system health
2. **Workflow Efficiency** - Bulk operations and automation
3. **Quality Control** - Confidence-based approval workflow
4. **Analytics & Insights** - Comprehensive usage metrics
5. **Error Management** - Intelligent failure recovery

---

## 🎯 **Next Steps**

1. **Review & Approve** this architecture proposal
2. **Set up development environment** with new structure
3. **Implement core API client** with mapping support
4. **Build mapping workflow MVP** for immediate value
5. **Iterate based on user feedback** and usage patterns

This enhanced architecture fully leverages the powerful mapping workflow capabilities introduced in API Gateway v3, while maintaining the robust processing and monitoring features from previous versions.