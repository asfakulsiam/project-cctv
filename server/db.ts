/**
 * Smart Classroom Exam Monitoring System
 * Database Layer - MongoDB with Resilient In-Memory Fallback
 * 
 * Supports full MongoDB connection when MONGODB_URI is provided,
 * and maintains continuous, zero-failure operations with an in-memory
 * document store if an external MongoDB instance is not configured.
 */

import { MongoClient, Db } from 'mongodb';
import { 
  AppSettings, 
  CameraConfig, 
  ClassroomRecord, 
  SeatRecord, 
  StudentRecord, 
  BehaviorEvent, 
  ExamSession 
} from '../src/types.js';

let mongoClient: MongoClient | null = null;
let mongoDb: Db | null = null;
let isUsingFallback = true;

// In-memory document storage for development/preview resilience
interface StorageCollections {
  settings: AppSettings[];
  cameras: CameraConfig[];
  classrooms: ClassroomRecord[];
  seats: SeatRecord[];
  students: StudentRecord[];
  events: BehaviorEvent[];
  sessions: ExamSession[];
}

const memoryStore: StorageCollections = {
  settings: [],
  cameras: [],
  classrooms: [],
  seats: [],
  students: [],
  events: [],
  sessions: []
};

// Production Default Settings (Configurable via Environment Variables or Admin Settings)
const DEFAULT_SETTINGS: AppSettings = {
  id: 'settings-default',
  app_name: process.env.APP_NAME || 'Smart Classroom Exam Monitoring System',
  app_logo_text: process.env.APP_LOGO_TEXT || 'AI Proctor',
  app_description: 'Academic Computer Vision & Multi-Camera Behavior Analysis Monitoring Platform',
  classroom_display_title: process.env.CLASSROOM_DISPLAY_TITLE || 'Exam Hall Live Monitoring',
  default_primary_camera: 'cam-1',
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
};

const DEFAULT_CLASSROOMS: ClassroomRecord[] = [
  {
    id: 'hall-a',
    name: 'Exam Hall Alpha (Room 301)',
    code: 'ROOM-301',
    building: 'Engineering Block 3',
    capacity: 24,
    camera_ids: ['cam-1', 'cam-2']
  }
];

const DEFAULT_STUDENTS: StudentRecord[] = process.env.DEMO_MODE === 'true' ? [
  { id: 'stu-1', student_id_number: 'STU-2026-001', name: 'Alex Johnson', classroom_id: 'hall-a', seat_id: 'seat-1', status: 'absent', unified_suspicion_score: 0, current_score: 0, cumulative_score: 0, max_score: 0, warning_level: 'normal', active_observations: [] },
  { id: 'stu-2', student_id_number: 'STU-2026-002', name: 'Sarah Chen', classroom_id: 'hall-a', seat_id: 'seat-2', status: 'absent', unified_suspicion_score: 0, current_score: 0, cumulative_score: 0, max_score: 0, warning_level: 'normal', active_observations: [] }
] : [];

const DEFAULT_SEATS: SeatRecord[] = [];

/**
 * Connect to MongoDB or activate fallback in-memory store
 */
export async function initDatabase(): Promise<void> {
  let uri = process.env.MONGODB_URI;
  if (uri && uri.trim().length > 0) {
    const cleanUri = uri.trim().replace(/\s+/g, '');
    try {
      console.log('[Database] Connecting to MongoDB instance at:', cleanUri.replace(/:([^:@]{1,})@/, ':****@'));
      mongoClient = new MongoClient(cleanUri, { serverSelectionTimeoutMS: 3000 });
      await mongoClient.connect();
      mongoDb = mongoClient.db();
      isUsingFallback = false;
      console.log('[Database] Successfully connected to MongoDB database:', mongoDb.databaseName);
      await seedDatabaseIfEmpty();
      return;
    } catch (err: any) {
      console.warn('[Database] MongoDB connection attempt failed, switching to resilient in-memory store:', err.message);
      isUsingFallback = true;
    }
  } else {
    console.log('[Database] No MONGODB_URI configured. Running with resilient in-memory document store.');
    isUsingFallback = true;
  }

  seedMemoryStore();
}

function seedMemoryStore(): void {
  // Ensure default base settings exist if store is completely empty
  if (memoryStore.settings.length === 0) {
    memoryStore.settings.push({ ...DEFAULT_SETTINGS, default_primary_camera: 'cam-1' });
  } else if (!memoryStore.settings[0].default_primary_camera) {
    memoryStore.settings[0].default_primary_camera = 'cam-1';
  }

  // Pre-seed primary CCTV camera with the Google Drive video link
  if (memoryStore.cameras.length === 0) {
    memoryStore.cameras.push({
      camera_id: 'cam-1',
      name: 'CCTV Camera 1 (Exam Hall)',
      source_type: 'stream',
      source_url: 'https://drive.google.com/file/d/1Ww9Yv7WprUGF0cDLZPfQpZ2szGB7saIG/view?usp=drivesdk',
      classroom_id: 'hall-a',
      status: 'online',
      is_primary: true,
      enabled: true,
      resolution: { width: 1920, height: 1080 },
      target_fps: 15,
      actual_fps: 15,
      quality_score: 95,
      view_angle_description: 'Wide Optical CCTV Perspective',
      monitored_seats: []
    });
  }

  if (memoryStore.classrooms.length === 0) {
    memoryStore.classrooms = [...DEFAULT_CLASSROOMS];
  }
  if (memoryStore.students.length === 0) {
    memoryStore.students = [...DEFAULT_STUDENTS];
  }
  if (memoryStore.seats.length === 0) {
    memoryStore.seats = [...DEFAULT_SEATS];
  }

  console.log(`[Database] In-memory store ready with ${memoryStore.cameras.length} cameras, ${memoryStore.students.length} students.`);
}

async function seedDatabaseIfEmpty(): Promise<void> {
  if (!mongoDb) return;

  const count = await mongoDb.collection('settings').countDocuments();
  if (count === 0) {
    await mongoDb.collection('settings').insertOne({ ...DEFAULT_SETTINGS, default_primary_camera: 'cam-1' });
  }

  const camCount = await mongoDb.collection('cameras').countDocuments();
  if (camCount === 0) {
    await mongoDb.collection('cameras').insertOne({
      camera_id: 'cam-1',
      name: 'CCTV Camera 1 (Exam Hall)',
      source_type: 'stream',
      source_url: 'https://drive.google.com/file/d/1Ww9Yv7WprUGF0cDLZPfQpZ2szGB7saIG/view?usp=drivesdk',
      classroom_id: 'hall-a',
      status: 'online',
      is_primary: true,
      enabled: true,
      resolution: { width: 1920, height: 1080 },
      target_fps: 15,
      actual_fps: 15,
      quality_score: 95,
      view_angle_description: 'Wide Optical CCTV Perspective',
      monitored_seats: []
    });
  }

  const stuCount = await mongoDb.collection('students').countDocuments();
  if (stuCount === 0) {
    await mongoDb.collection('students').insertMany(DEFAULT_STUDENTS);
  }

  const seatCount = await mongoDb.collection('seats').countDocuments();
  if (seatCount === 0) {
    await mongoDb.collection('seats').insertMany(DEFAULT_SEATS);
  }

  const classCount = await mongoDb.collection('classrooms').countDocuments();
  if (classCount === 0) {
    await mongoDb.collection('classrooms').insertMany(DEFAULT_CLASSROOMS);
  }

  console.log('[Database] Real MongoDB initialized with primary CCTV feed and student database.');
}

// Database Abstraction API
export const db = {
  isFallback: () => isUsingFallback,

  // Settings
  async getSettings(): Promise<AppSettings> {
    if (!isUsingFallback && mongoDb) {
      const doc = await mongoDb.collection<AppSettings>('settings').findOne({});
      if (doc) return doc;
    }
    return memoryStore.settings[0] || DEFAULT_SETTINGS;
  },

  async updateSettings(updates: Partial<AppSettings>): Promise<AppSettings> {
    if (!isUsingFallback && mongoDb) {
      await mongoDb.collection('settings').updateOne({}, { $set: updates }, { upsert: true });
      return this.getSettings();
    }
    memoryStore.settings[0] = { ...memoryStore.settings[0], ...updates };
    return memoryStore.settings[0];
  },

  // Cameras
  async getCameras(): Promise<CameraConfig[]> {
    if (!isUsingFallback && mongoDb) {
      return await mongoDb.collection<CameraConfig>('cameras').find({}).toArray();
    }
    return [...memoryStore.cameras];
  },

  async getCameraById(cameraId: string): Promise<CameraConfig | null> {
    if (!isUsingFallback && mongoDb) {
      return await mongoDb.collection<CameraConfig>('cameras').findOne({ camera_id: cameraId });
    }
    return memoryStore.cameras.find(c => c.camera_id === cameraId) || null;
  },

  async updateCamera(cameraId: string, updates: Partial<CameraConfig>): Promise<CameraConfig | null> {
    if (!isUsingFallback && mongoDb) {
      await mongoDb.collection('cameras').updateOne({ camera_id: cameraId }, { $set: updates });
      return this.getCameraById(cameraId);
    }
    const idx = memoryStore.cameras.findIndex(c => c.camera_id === cameraId);
    if (idx !== -1) {
      memoryStore.cameras[idx] = { ...memoryStore.cameras[idx], ...updates };
      return memoryStore.cameras[idx];
    }
    return null;
  },

  async setPrimaryCamera(cameraId: string): Promise<void> {
    if (!isUsingFallback && mongoDb) {
      await mongoDb.collection('cameras').updateMany({}, { $set: { is_primary: false } });
      await mongoDb.collection('cameras').updateOne({ camera_id: cameraId }, { $set: { is_primary: true } });
      return;
    }
    memoryStore.cameras.forEach(c => {
      c.is_primary = c.camera_id === cameraId;
    });
  },

  async addCamera(camera: CameraConfig): Promise<CameraConfig> {
    if (!isUsingFallback && mongoDb) {
      await mongoDb.collection('cameras').insertOne(camera);
      return camera;
    }
    memoryStore.cameras.push(camera);
    return camera;
  },

  async deleteCamera(cameraId: string): Promise<boolean> {
    if (!isUsingFallback && mongoDb) {
      const res = await mongoDb.collection('cameras').deleteOne({ camera_id: cameraId });
      return res.deletedCount > 0;
    }
    const idx = memoryStore.cameras.findIndex(c => c.camera_id === cameraId);
    if (idx !== -1) {
      memoryStore.cameras.splice(idx, 1);
      return true;
    }
    return false;
  },

  // Students
  async getStudents(): Promise<StudentRecord[]> {
    if (!isUsingFallback && mongoDb) {
      return await mongoDb.collection<StudentRecord>('students').find({}).toArray();
    }
    return [...memoryStore.students];
  },

  async getStudentById(id: string): Promise<StudentRecord | null> {
    if (!isUsingFallback && mongoDb) {
      return await mongoDb.collection<StudentRecord>('students').findOne({ id });
    }
    return memoryStore.students.find(s => s.id === id) || null;
  },

  async updateStudent(id: string, updates: Partial<StudentRecord>): Promise<StudentRecord | null> {
    const cleanUpdates = { ...updates };
    const toUnset: any = {};

    if ('person_id' in cleanUpdates && (cleanUpdates.person_id === null || cleanUpdates.person_id === undefined)) {
      delete cleanUpdates.person_id;
      toUnset.person_id = "";
    }
    if ('global_person_id' in cleanUpdates && (cleanUpdates.global_person_id === null || cleanUpdates.global_person_id === undefined)) {
      delete cleanUpdates.global_person_id;
      toUnset.global_person_id = "";
    }

    if (!isUsingFallback && mongoDb) {
      const updateDoc: any = {};
      if (Object.keys(cleanUpdates).length > 0) updateDoc.$set = cleanUpdates;
      if (Object.keys(toUnset).length > 0) updateDoc.$unset = toUnset;
      if (Object.keys(updateDoc).length > 0) {
        await mongoDb.collection('students').updateOne({ id }, updateDoc);
      }
      return this.getStudentById(id);
    }
    const idx = memoryStore.students.findIndex(s => s.id === id);
    if (idx !== -1) {
      memoryStore.students[idx] = { ...memoryStore.students[idx], ...cleanUpdates };
      if (toUnset.person_id !== undefined) {
        delete (memoryStore.students[idx] as any).person_id;
      }
      if (toUnset.global_person_id !== undefined) {
        delete (memoryStore.students[idx] as any).global_person_id;
      }
      return memoryStore.students[idx];
    }
    return null;
  },

  async addStudent(student: StudentRecord): Promise<StudentRecord> {
    if (!isUsingFallback && mongoDb) {
      await mongoDb.collection('students').insertOne(student);
      return student;
    }
    memoryStore.students.push(student);
    return student;
  },

  async deleteStudent(id: string): Promise<boolean> {
    if (!isUsingFallback && mongoDb) {
      const res = await mongoDb.collection('students').deleteOne({ id });
      return res.deletedCount > 0;
    }
    const idx = memoryStore.students.findIndex(s => s.id === id);
    if (idx !== -1) {
      memoryStore.students.splice(idx, 1);
      return true;
    }
    return false;
  },

  // Classrooms & Seats
  async getClassrooms(): Promise<ClassroomRecord[]> {
    if (!isUsingFallback && mongoDb) {
      return await mongoDb.collection<ClassroomRecord>('classrooms').find({}).toArray();
    }
    return [...memoryStore.classrooms];
  },

  async getSeats(classroomId?: string): Promise<SeatRecord[]> {
    if (!isUsingFallback && mongoDb) {
      const filter = classroomId ? { classroom_id: classroomId } : {};
      return await mongoDb.collection<SeatRecord>('seats').find(filter).toArray();
    }
    return classroomId 
      ? memoryStore.seats.filter(s => s.classroom_id === classroomId)
      : [...memoryStore.seats];
  },

  async updateSeat(seatId: string, updates: Partial<SeatRecord>): Promise<SeatRecord | null> {
    if (!isUsingFallback && mongoDb) {
      await mongoDb.collection('seats').updateOne({ id: seatId }, { $set: updates });
      return await mongoDb.collection<SeatRecord>('seats').findOne({ id: seatId });
    }
    const idx = memoryStore.seats.findIndex(s => s.id === seatId);
    if (idx !== -1) {
      memoryStore.seats[idx] = { ...memoryStore.seats[idx], ...updates };
      return memoryStore.seats[idx];
    }
    return null;
  },

  // Events
  async recordEvent(event: BehaviorEvent): Promise<BehaviorEvent> {
    if (!isUsingFallback && mongoDb) {
      await mongoDb.collection('events').insertOne(event);
      return event;
    }
    memoryStore.events.unshift(event);
    if (memoryStore.events.length > 500) {
      memoryStore.events.pop();
    }
    return event;
  },

  async getEvents(limit: number = 50, filterSeverity?: string): Promise<BehaviorEvent[]> {
    if (!isUsingFallback && mongoDb) {
      const query: any = {};
      if (filterSeverity && filterSeverity !== 'all') {
        query.severity = filterSeverity;
      }
      return await mongoDb.collection<BehaviorEvent>('events')
        .find(query)
        .sort({ timestamp: -1 })
        .limit(limit)
        .toArray();
    }
    let list = memoryStore.events;
    if (filterSeverity && filterSeverity !== 'all') {
      list = list.filter(e => e.severity === filterSeverity);
    }
    return list.slice(0, limit);
  },

  async clearEvents(): Promise<void> {
    if (!isUsingFallback && mongoDb) {
      await mongoDb.collection('events').deleteMany({});
      return;
    }
    memoryStore.events = [];
  },

  // Sessions
  async getActiveSession(): Promise<ExamSession | null> {
    if (!isUsingFallback && mongoDb) {
      return await mongoDb.collection<ExamSession>('sessions').findOne({ status: 'active' });
    }
    return memoryStore.sessions.find(s => s.status === 'active') || memoryStore.sessions[0] || null;
  }
};
