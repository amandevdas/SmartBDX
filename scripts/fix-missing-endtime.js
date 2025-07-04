#!/usr/bin/env node

/**
 * Fix Missing endTime for Completed Jobs
 * 
 * This script finds completed/error jobs that are missing endTime
 * and estimates the endTime based on when the job was likely completed.
 * 
 * Usage: node scripts/fix-missing-endtime.js
 */

const { createClient } = require('redis');

const JOB_PREFIX = 'smartbdx:job:';
const JOBS_KEY = 'smartbdx:jobs';

async function fixMissingEndTime() {
  console.log('🔧 Starting fix for missing endTime fields...');
  
  const redis = createClient({ 
    url: process.env.KV_URL || 'redis://localhost:6379' 
  });
  
  try {
    await redis.connect();
    console.log('✅ Connected to Redis');
    
    // Get all job IDs
    const jobIds = await redis.sMembers(JOBS_KEY);
    console.log(`📋 Found ${jobIds.length} jobs to check`);
    
    let fixedCount = 0;
    let skippedCount = 0;
    
    for (const jobId of jobIds) {
      try {
        const jobData = await redis.get(`${JOB_PREFIX}${jobId}`);
        if (!jobData) {
          console.warn(`⚠️ No data found for job ${jobId}`);
          continue;
        }
        
        const job = JSON.parse(jobData);
        
        // Check if job is completed/error but missing endTime
        if ((job.status === 'completed' || job.status === 'error') && !job.endTime) {
          console.log(`🔍 Fixing job ${jobId} (${job.status})`);
          
          // Estimate endTime based on timestamp + reasonable processing time
          // For missing endTime, we'll use timestamp + 30 seconds as a reasonable estimate
          const startTime = new Date(job.timestamp || job.createdAt);
          const estimatedEndTime = new Date(startTime.getTime() + 30000); // +30 seconds
          
          // Update the job with estimated endTime
          const updatedJob = {
            ...job,
            endTime: estimatedEndTime.toISOString()
          };
          
          await redis.set(`${JOB_PREFIX}${jobId}`, JSON.stringify(updatedJob));
          
          console.log(`✅ Fixed job ${jobId}: endTime set to ${estimatedEndTime.toISOString()}`);
          fixedCount++;
        } else {
          skippedCount++;
        }
      } catch (error) {
        console.error(`❌ Error processing job ${jobId}:`, error.message);
      }
    }
    
    console.log('\n📊 Summary:');
    console.log(`✅ Fixed jobs: ${fixedCount}`);
    console.log(`⏩ Skipped jobs: ${skippedCount}`);
    console.log(`📋 Total jobs checked: ${jobIds.length}`);
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await redis.quit();
    console.log('🔌 Disconnected from Redis');
  }
}

// Run the fix
if (require.main === module) {
  fixMissingEndTime().catch(console.error);
}

module.exports = { fixMissingEndTime };