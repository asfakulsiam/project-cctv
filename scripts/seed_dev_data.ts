/**
 * Smart Classroom Exam Monitoring System
 * Standalone Development & Testing Data Seed Script
 * 
 * NOTE: This script is for offline local development and test automation ONLY.
 * It is NEVER imported or executed in any production startup path.
 * 
 * Usage: npm run seed:dev
 */

import { MongoClient } from 'mongodb';

async function runDevSeed() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.log('[Dev Seed] MONGODB_URI not set. In development, configure MONGODB_URI to seed sample documents into MongoDB.');
    process.exit(0);
  }

  console.log('[Dev Seed] Connecting to MongoDB for development seeding...');
  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();

  console.log('[Dev Seed] Target database:', db.databaseName);
  console.log('[Dev Seed] Seeding sample development records...');

  // Example development entities
  await db.collection('settings').updateOne(
    { id: 'settings-default' },
    {
      $setOnInsert: {
        id: 'settings-default',
        app_name: 'Smart Classroom Exam Monitoring System',
        app_logo_text: 'AI Proctor',
        app_description: 'Academic Computer Vision & Multi-Camera Behavior Analysis Monitoring Platform',
        classroom_display_title: 'Examination Hall Live Monitoring',
        default_primary_camera: '',
        suspicion_weights: {
          face_hidden: 20,
          phone_detected: 40,
          repeated_looking: 25,
          leaving_seat: 30,
          multiple_persons: 35,
          abnormal_movement: 15
        },
        thresholds: {
          looking_duration_sec: 3.5,
          face_hidden_duration_sec: 4.0,
          leave_seat_grace_sec: 5.0,
          phone_confidence_min: 0.65,
          high_suspicion_threshold: 65,
          warning_suspicion_threshold: 35,
          movement_threshold_px: 25
        },
        processing_fps: 15,
        allow_public_classroom_display: true
      }
    },
    { upsert: true }
  );

  console.log('[Dev Seed] Development seed completed successfully.');
  await client.close();
}

runDevSeed().catch(err => {
  console.error('[Dev Seed] Error running dev seed:', err);
  process.exit(1);
});
