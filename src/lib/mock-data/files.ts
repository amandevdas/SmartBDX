export const mockFilesData = {
    discover_files_with_sheets: [
      {
        id: 'file-001',
        name: 'Bordereaux_Claims_Q1_2023.xlsx',
        status: 'ready',
        size: 1024 * 25,
        lastModified: new Date('2023-04-15').toISOString(),
        priority_score: 95,
        cache_available: true,
        estimated_processing_time: 180,
        ai_recommendation: 'high_priority',
        sheets: ['Claims Data', 'Claim Details', 'Summary']
      },
      // ... more mock data
    ]
  };