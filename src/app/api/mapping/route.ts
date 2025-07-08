// API route for mapping operations
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const batch_id = searchParams.get('batch_id');
  const status = searchParams.get('status') || 'pending';
  
  try {
    const response = await fetch(`${process.env.DATABRICKS_HOST}/api/2.1/jobs/run-now`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.DATABRICKS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        job_id: parseInt(process.env.SMARTBDX_API_JOB_ID || ''),
        notebook_params: {
          operation: 'get_mapping_results',
          parameters: JSON.stringify({ batch_id, status })
        }
      })
    });

    if (!response.ok) {
      throw new Error('Failed to get mapping results');
    }

    const jobResponse = await response.json();
    
    // Wait for completion and get results
    const result = await waitForJobCompletion(jobResponse.run_id);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Mapping API error:', error);
    return NextResponse.json({ error: 'Failed to fetch mappings' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  
  try {
    const response = await fetch(`${process.env.DATABRICKS_HOST}/api/2.1/jobs/run-now`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.DATABRICKS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        job_id: parseInt(process.env.SMARTBDX_API_JOB_ID || ''),
        notebook_params: {
          operation: 'approve_mappings',
          parameters: JSON.stringify(body)
        }
      })
    });

    if (!response.ok) {
      throw new Error('Failed to approve mappings');
    }

    const jobResponse = await response.json();
    const result = await waitForJobCompletion(jobResponse.run_id);
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('Mapping approval error:', error);
    return NextResponse.json({ error: 'Failed to approve mappings' }, { status: 500 });
  }
}

async function waitForJobCompletion(runId: number): Promise<any> {
  const maxWait = 120000; // 2 minutes
  const pollInterval = 3000; // 3 seconds
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    const statusResponse = await fetch(`${process.env.DATABRICKS_HOST}/api/2.1/jobs/runs/get-output?run_id=${runId}`, {
      headers: {
        'Authorization': `Bearer ${process.env.DATABRICKS_TOKEN}`,
      },
    });

    const statusData = await statusResponse.json();
    
    if (statusData.metadata.state.life_cycle_state === 'TERMINATED') {
      if (statusData.metadata.state.result_state === 'SUCCESS') {
        return JSON.parse(statusData.notebook_output.result);
      } else {
        throw new Error(statusData.metadata.state.state_message || 'Job failed');
      }
    }

    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }

  throw new Error('Job timeout');
}