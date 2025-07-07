'use client';

import { useState } from 'react';

interface PredictiveInsightsProps {
  data: any;
  loading: boolean;
  error: string | null;
}

export default function PredictiveInsights({ data, loading, error }: PredictiveInsightsProps) {
  const [selectedView, setSelectedView] = useState('predictions');

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white p-6 rounded-lg shadow">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-8 bg-gray-200 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <div className="flex items-center">
          <svg className="w-5 h-5 text-red-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h3 className="text-red-800 font-medium">Error Loading Predictive Insights</h3>
            <p className="text-red-600 text-sm mt-1">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const insightsData = data || {};
  const {
    predictive_analytics = {},
    processing_patterns = {},
    ai_model_performance = {},
    optimization_insights = {},
    predictions = {},
    quality_metrics = {},
    recommendations = []
  } = insightsData;

  const getConfidenceColor = (score: number) => {
    if (score >= 0.9) return 'text-green-600';
    if (score >= 0.7) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getAccuracyColor = (score: number) => {
    if (score >= 0.9) return 'bg-green-500';
    if (score >= 0.8) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-gray-900">Predictive Insights & AI Analytics</h2>
        <div className="flex space-x-2">
          {['predictions', 'patterns', 'optimization', 'quality'].map((view) => (
            <button
              key={view}
              onClick={() => setSelectedView(view)}
              className={`px-3 py-1 rounded-md text-sm font-medium capitalize ${
                selectedView === view
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {view}
            </button>
          ))}
        </div>
      </div>

      {/* Predictions View */}
      {selectedView === 'predictions' && (
        <div className="space-y-6">
          {/* Key Predictions */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Next 24h Files</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {predictive_analytics.expected_files_next_24h || 0}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center">
                <div className="p-2 bg-green-100 rounded-lg">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Expected Cost</p>
                  <p className="text-2xl font-bold text-gray-900">
                    ${(predictive_analytics.expected_cost || 0).toFixed(2)}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Processing Time</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {Math.floor((predictive_analytics.expected_processing_time || 0) / 60)}m
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Confidence Score</p>
                  <p className={`text-2xl font-bold ${getConfidenceColor(predictive_analytics.confidence_score)}`}>
                    {((predictive_analytics.confidence_score || 0) * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Future Predictions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Next 24 Hours</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Files to Process</span>
                  <span className="font-medium">{predictions.next_24h?.files_to_process || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Estimated Duration</span>
                  <span className="font-medium">{predictions.next_24h?.estimated_duration || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Estimated Cost</span>
                  <span className="font-medium">{predictions.next_24h?.estimated_cost || 'N/A'}</span>
                </div>
                <div className="mt-4">
                  <p className="text-sm text-gray-600 mb-2">Risk Factors:</p>
                  <ul className="text-sm text-gray-700 space-y-1">
                    {(predictions.next_24h?.risk_factors || []).map((risk: string, index: number) => (
                      <li key={index} className="flex items-start">
                        <svg className="w-4 h-4 text-yellow-500 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                        </svg>
                        {risk}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Next Week</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Files to Process</span>
                  <span className="font-medium">{predictions.next_week?.files_to_process || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Estimated Duration</span>
                  <span className="font-medium">{predictions.next_week?.estimated_duration || 'N/A'}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Estimated Cost</span>
                  <span className="font-medium">{predictions.next_week?.estimated_cost || 'N/A'}</span>
                </div>
                <div className="mt-4">
                  <p className="text-sm text-gray-600 mb-2">Trends:</p>
                  <ul className="text-sm text-gray-700 space-y-1">
                    {(predictions.next_week?.trends || []).map((trend: string, index: number) => (
                      <li key={index} className="flex items-start">
                        <svg className="w-4 h-4 text-green-500 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                        </svg>
                        {trend}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Peak Load Prediction */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Peak Load Prediction</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">
                  {predictive_analytics.peak_load_prediction?.time || 'N/A'}
                </div>
                <div className="text-sm text-gray-600">Peak Time</div>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">
                  {predictive_analytics.peak_load_prediction?.expected_files || 0}
                </div>
                <div className="text-sm text-gray-600">Expected Files</div>
              </div>
              <div className="text-center p-4 bg-orange-50 rounded-lg">
                <div className="text-2xl font-bold text-orange-600">
                  {((predictive_analytics.peak_load_prediction?.load_percentage || 0) * 100).toFixed(1)}%
                </div>
                <div className="text-sm text-gray-600">Load Percentage</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Processing Patterns View */}
      {selectedView === 'patterns' && (
        <div className="space-y-6">
          {/* File Types Distribution */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900 mb-4">File Types Distribution</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {(processing_patterns.most_common_file_types || []).map((type: any, index: number) => (
                <div key={index} className="flex items-center p-4 bg-gray-50 rounded-lg">
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-900">{type.type?.replace(/_/g, ' ').toUpperCase()}</h4>
                    <div className="mt-2 text-sm text-gray-600">
                      <div>Count: {type.count}</div>
                      <div>Percentage: {(type.percentage * 100).toFixed(1)}%</div>
                    </div>
                  </div>
                  <div className="ml-4">
                    <div className="w-16 h-16 bg-blue-200 rounded-full flex items-center justify-center">
                      <span className="text-sm font-medium text-blue-800">
                        {(type.percentage * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Processing Time Analysis */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Processing Time by Type</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      File Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Average Time
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Min Time
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Max Time
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {Object.entries(processing_patterns.processing_time_by_type || {}).map(([key, value]: [string, any]) => (
                    <tr key={key}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {key.replace(/_/g, ' ').toUpperCase()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {value.avg}s
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {value.min}s
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {value.max}s
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Error Patterns */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Error Patterns Analysis</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(processing_patterns.error_patterns || []).map((pattern: any, index: number) => (
                <div key={index} className="p-4 bg-red-50 rounded-lg border border-red-200">
                  <h4 className="font-medium text-red-900">{pattern.pattern?.replace(/_/g, ' ').toUpperCase()}</h4>
                  <div className="mt-2 text-sm text-red-700">
                    <div>Frequency: {pattern.frequency}</div>
                    <div>Avg Recovery Time: {pattern.avg_recovery_time}s</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Optimization View */}
      {selectedView === 'optimization' && (
        <div className="space-y-6">
          {/* AI Model Performance */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900 mb-4">AI Model Performance</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">
                  {((ai_model_performance.mapping_accuracy || 0) * 100).toFixed(1)}%
                </div>
                <div className="text-sm text-gray-600">Mapping Accuracy</div>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">
                  {((ai_model_performance.structure_detection_accuracy || 0) * 100).toFixed(1)}%
                </div>
                <div className="text-sm text-gray-600">Structure Detection</div>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">
                  {((ai_model_performance.cache_hit_prediction_accuracy || 0) * 100).toFixed(1)}%
                </div>
                <div className="text-sm text-gray-600">Cache Prediction</div>
              </div>
              <div className="text-center p-4 bg-orange-50 rounded-lg">
                <div className="text-2xl font-bold text-orange-600">
                  {((ai_model_performance.false_positive_rate || 0) * 100).toFixed(2)}%
                </div>
                <div className="text-sm text-gray-600">False Positive Rate</div>
              </div>
            </div>
          </div>

          {/* Bottlenecks */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Performance Bottlenecks</h3>
            <div className="space-y-4">
              {(optimization_insights.bottlenecks || []).map((bottleneck: any, index: number) => (
                <div key={index} className="border-l-4 border-red-500 pl-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-medium text-gray-900">{bottleneck.component?.replace(/_/g, ' ').toUpperCase()}</h4>
                      <p className="text-sm text-gray-600 mt-1">{bottleneck.suggested_fix}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium text-red-600">
                        Impact: {(bottleneck.impact_score * 100).toFixed(0)}%
                      </div>
                      <div className="text-sm text-gray-500">
                        {bottleneck.estimated_improvement}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Efficiency Opportunities */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Efficiency Opportunities</h3>
            <div className="space-y-4">
              {(optimization_insights.efficiency_opportunities || []).map((opportunity: any, index: number) => (
                <div key={index} className="border-l-4 border-green-500 pl-4">
                  <h4 className="font-medium text-gray-900">{opportunity.opportunity?.replace(/_/g, ' ').toUpperCase()}</h4>
                  <div className="mt-2 text-sm text-gray-600">
                    {opportunity.opportunity === 'batch_size_optimization' && (
                      <div>
                        <div>Current Average: {opportunity.current_avg}</div>
                        <div>Recommended: {opportunity.recommended_avg}</div>
                      </div>
                    )}
                    {opportunity.opportunity === 'peak_hour_shifting' && (
                      <div>
                        <div>Current Peak: {opportunity.current_peak}</div>
                        <div>Recommended: {opportunity.recommended_shift}</div>
                      </div>
                    )}
                    <div className="mt-1 text-green-600 font-medium">
                      {opportunity.potential_savings}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Quality View */}
      {selectedView === 'quality' && (
        <div className="space-y-6">
          {/* Quality Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center">
                <div className="p-2 bg-green-100 rounded-lg">
                  <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Data Quality</p>
                  <p className={`text-2xl font-bold ${getConfidenceColor(quality_metrics.data_quality_score)}`}>
                    {((quality_metrics.data_quality_score || 0) * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Processing Accuracy</p>
                  <p className={`text-2xl font-bold ${getConfidenceColor(quality_metrics.processing_accuracy)}`}>
                    {((quality_metrics.processing_accuracy || 0) * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center">
                <div className="p-2 bg-purple-100 rounded-lg">
                  <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Customer Satisfaction</p>
                  <p className={`text-2xl font-bold ${getConfidenceColor(quality_metrics.customer_satisfaction)}`}>
                    {((quality_metrics.customer_satisfaction || 0) * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex items-center">
                <div className="p-2 bg-orange-100 rounded-lg">
                  <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-gray-600">Model Confidence</p>
                  <p className={`text-2xl font-bold ${getConfidenceColor(ai_model_performance.model_confidence_avg)}`}>
                    {((ai_model_performance.model_confidence_avg || 0) * 100).toFixed(1)}%
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Improvement Areas */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Improvement Areas</h3>
            <ul className="space-y-3">
              {(quality_metrics.improvement_areas || []).map((area: string, index: number) => (
                <li key={index} className="flex items-start">
                  <svg className="w-5 h-5 text-yellow-500 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <span className="text-sm text-gray-700">{area}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Recommendations */}
      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-medium text-gray-900 mb-4">AI Recommendations</h3>
        <ul className="space-y-3">
          {recommendations.map((rec: string, index: number) => (
            <li key={index} className="flex items-start">
              <svg className="w-5 h-5 text-blue-500 mr-2 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <span className="text-sm text-gray-700">{rec}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}