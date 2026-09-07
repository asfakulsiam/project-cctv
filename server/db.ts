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
};

/**
 * Connect to MongoDB or activate fallback in-memory store
 */
export async function initDatabase(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (uri && uri.trim().length > 0) {
    try {
      console.log('[Database] Connecting to MongoDB instance at:', uri.replace(/:([^:@]{1,})@/, ':****@'));
      mongoClient = new MongoClient(uri, { serverSelectionTimeoutMS: 3000 });
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
    memoryStore.settings.push({ ...DEFAULT_SETTINGS, default_primary_camera: '' });
  }
  // Production startup starts completely clean: 0 demo cameras, 0 dummy students, 0 fake seats
  console.log(`[Database] In-memory store ready. Clean database with ${memoryStore.cameras.length} camera records.`);
}

async function seedDatabaseIfEmpty(): Promise<void> {
  if (!mongoDb) return;
  const count = await mongoDb.collection('settings').countDocuments();
  if (count === 0) {
    await mongoDb.collection('settings').insertOne({ ...DEFAULT_SETTINGS, default_primary_camera: '' });
    console.log('[Database] Real MongoDB initialized with base settings (0 demo records).');
  }
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
    if (!isUsingFallback && mongoDb) {
      await mongoDb.collection('students').updateOne({ id }, { $set: updates });
      return this.getStudentById(id);
    }
    const idx = memoryStore.students.findIndex(s => s.id === id);
    if (idx !== -1) {
      memoryStore.students[idx] = { ...memoryStore.students[idx], ...updates };
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
    // Keep reasonable history size in memory
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
