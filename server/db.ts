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
  ExamSession,
  GlobalPerson
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
  global_persons: GlobalPerson[];
}

const memoryStore: StorageCollections = {
  settings: [],
  cameras: [],
  classrooms: [],
  seats: [],
  students: [],
  events: [],
  sessions: [],
  global_persons: []
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

const DEFAULT_STUDENTS: StudentRecord[] = [
  { id: 'stu-1', student_id_number: 'S-1001', name: 'Alex Johnson', classroom_id: 'hall-a', person_id: 'P-001', global_person_id: 'P-001', seat_id: 'seat-1', status: 'present', unified_suspicion_score: 0, active_observations: [] },
  { id: 'stu-2', student_id_number: 'S-1002', name: 'Sarah Chen', classroom_id: 'hall-a', person_id: 'P-002', global_person_id: 'P-002', seat_id: 'seat-2', status: 'present', unified_suspicion_score: 0, active_observations: [] },
  { id: 'stu-3', student_id_number: 'S-1003', name: 'Michael Smith', classroom_id: 'hall-a', person_id: 'P-003', global_person_id: 'P-003', seat_id: 'seat-3', status: 'present', unified_suspicion_score: 0, active_observations: [] }
];

const DEFAULT_SEATS: SeatRecord[] = [
  { id: 'seat-1', classroom_id: 'hall-a', seat_label: 'A1', seat_number: 'A1', grid_row: 1, grid_col: 1, assigned_student_id: 'stu-1', camera_regions: { 'cam-1': { x: 0.1, y: 0.2, width: 0.25, height: 0.6 } } },
  { id: 'seat-2', classroom_id: 'hall-a', seat_label: 'A2', seat_number: 'A2', grid_row: 1, grid_col: 2, assigned_student_id: 'stu-2', camera_regions: { 'cam-1': { x: 0.38, y: 0.2, width: 0.25, height: 0.6 } } },
  { id: 'seat-3', classroom_id: 'hall-a', seat_label: 'A3', seat_number: 'A3', grid_row: 1, grid_col: 3, assigned_student_id: 'stu-3', camera_regions: { 'cam-1': { x: 0.65, y: 0.2, width: 0.25, height: 0.6 } } }
];

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
  
  // Seed sample students & seats ONLY if explicitly in DEMO_MODE
  if (process.env.DEMO_MODE === 'true') {
    if (memoryStore.students.length === 0) {
      memoryStore.students = [...DEFAULT_STUDENTS];
    }
    if (memoryStore.seats.length === 0) {
      memoryStore.seats = [...DEFAULT_SEATS];
    }
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

  if (process.env.DEMO_MODE === 'true') {
    const stuCount = await mongoDb.collection('students').countDocuments();
    if (stuCount === 0) {
      await mongoDb.collection('students').insertMany(DEFAULT_STUDENTS);
    }

    const seatCount = await mongoDb.collection('seats').countDocuments();
    if (seatCount === 0) {
      await mongoDb.collection('seats').insertMany(DEFAULT_SEATS);
    }
  }

  const classCount = await mongoDb.collection('classrooms').countDocuments();
  if (classCount === 0) {
    await mongoDb.collection('classrooms').insertMany(DEFAULT_CLASSROOMS);
  }

  console.log('[Database] Real MongoDB initialized with primary CCTV feed.');
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
  },

  // Persistent Global Persons
  async getGlobalPersons(): Promise<GlobalPerson[]> {
    if (!isUsingFallback && mongoDb) {
      return await mongoDb.collection<GlobalPerson>('global_persons').find({}).toArray();
    }
    return [...memoryStore.global_persons];
  },

  async saveGlobalPerson(person: GlobalPerson): Promise<GlobalPerson> {
    if (!isUsingFallback && mongoDb) {
      await mongoDb.collection('global_persons').replaceOne(
        { id: person.id },
        person,
        { upsert: true }
      );
      return person;
    }
    const idx = memoryStore.global_persons.findIndex(p => p.id === person.id);
    if (idx !== -1) {
      memoryStore.global_persons[idx] = { ...person };
    } else {
      memoryStore.global_persons.push({ ...person });
    }
    return person;
  },

  async deleteGlobalPerson(id: string): Promise<boolean> {
    if (!isUsingFallback && mongoDb) {
      const res = await mongoDb.collection('global_persons').deleteOne({ id });
      return res.deletedCount > 0;
    }
    const idx = memoryStore.global_persons.findIndex(p => p.id === id);
    if (idx !== -1) {
      memoryStore.global_persons.splice(idx, 1);
      return true;
    }
    return false;
  },

  async clearGlobalPersons(): Promise<void> {
    if (!isUsingFallback && mongoDb) {
      await mongoDb.collection('global_persons').deleteMany({});
      return;
    }
    memoryStore.global_persons = [];
  },

  async clearExamData(scopes: string[] = ['students', 'global_persons', 'events']): Promise<{ students: number; global_persons: number; events: number; seats: number }> {
    const result = { students: 0, global_persons: 0, events: 0, seats: 0 };
    const shouldClearStudents = scopes.includes('students');
    const shouldClearGlobalPersons = scopes.includes('global_persons');
    const shouldClearEvents = scopes.includes('events');
    const shouldClearSeats = scopes.includes('seats');

    if (isUsingFallback || !mongoDb) {
      if (shouldClearStudents) {
        result.students = memoryStore.students.length;
        memoryStore.students = [];
      }
      if (shouldClearGlobalPersons) {
        result.global_persons = memoryStore.global_persons.length;
        memoryStore.global_persons = [];
      }
      if (shouldClearEvents) {
        result.events = memoryStore.events.length;
        memoryStore.events = [];
      }
      if (shouldClearSeats) {
        result.seats = memoryStore.seats.length;
        memoryStore.seats = [];
      }
    } else {
      if (shouldClearStudents) {
        const res = await mongoDb.collection('students').deleteMany({});
        result.students = res.deletedCount || 0;
      }
      if (shouldClearGlobalPersons) {
        const res = await mongoDb.collection('global_persons').deleteMany({});
        result.global_persons = res.deletedCount || 0;
      }
      if (shouldClearEvents) {
        const res = await mongoDb.collection('events').deleteMany({});
        result.events = res.deletedCount || 0;
      }
      if (shouldClearSeats) {
        const res = await mongoDb.collection('seats').deleteMany({});
        result.seats = res.deletedCount || 0;
      }
    }
    return result;
  }
};
