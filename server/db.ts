/**
 * server/db.ts - MongoDB-Backed Persistence Engine
 * Connects to MongoDB (via MONGODB_URI and MONGODB_DB_NAME) to store and persist:
 * - Application Settings
 * - Camera & Video Source Configurations
 * - Tracked Examinee Candidates & Warning Scores
 * - Observed Activity Logs & Audit History
 * - Scoring Thresholds & Activity Weights
 * 
 * Clean, production-grade architecture with zero demo credentials and zero fake data.
 */
import { MongoClient, Db, Collection } from 'mongodb';
import fs from 'fs';
import path from 'path';
import {
  Candidate,
  ActivityRecord,
  CameraSource,
  ActivityTypeConfig,
  ScoreConfig,
  AppSettings,
  WarningLevel,
} from '../src/types.js';

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'exam_monitoring.json');

const DEFAULT_ACTIVITY_TYPES: ActivityTypeConfig[] = [
  {
    id: 'act-head-turn',
    name: 'Head or posture rotation',
    description: 'Frequent head turning or sustained orientation shift away from desk',
    scoreWeight: 7,
    severity: 'medium',
  },
  {
    id: 'act-rapid-shift',
    name: 'Rapid position shift',
    description: 'Sudden jerky motion or rapid posture reconfiguration',
    scoreWeight: 10,
    severity: 'high',
  },
  {
    id: 'act-displaced',
    name: 'Displaced from seat position',
    description: 'Observed displacement away from baseline seating area',
    scoreWeight: 16,
    severity: 'high',
  },
  {
    id: 'act-frequent-mov',
    name: 'Frequent movement detected',
    description: 'Sustained continuous physical motion confirmed across temporal frames',
    scoreWeight: 8,
    severity: 'medium',
  },
  {
    id: 'act-observable-mov',
    name: 'Observable movement',
    description: 'Noticeable movement or desk-level activity',
    scoreWeight: 4,
    severity: 'low',
  },
];

const DEFAULT_SCORE_CONFIG: ScoreConfig = {
  normalMax: 35,
  warningMax: 70,
  highWarningMin: 71,
  maxScore: 100,
};

const DEFAULT_SETTINGS: AppSettings = {
  appName: 'Exam Hall Monitoring Assistant',
  cvModelPath: process.env.CV_MODEL_PATH || 'yolov8n.pt',
  confidenceThreshold: 0.3,
  detectionIntervalMs: 250,
  adminId: process.env.ADMIN_USERNAME || 'admin',
};

class ExamDatabase {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private isMongoConnected: boolean = false;

  // In-memory runtime cache synchronized with MongoDB
  private camerasCache: CameraSource[] = [];
  private candidatesCache: Candidate[] = [];
  private activitiesCache: ActivityRecord[] = [];
  private activityTypesCache: ActivityTypeConfig[] = DEFAULT_ACTIVITY_TYPES;
  private scoreConfigCache: ScoreConfig = DEFAULT_SCORE_CONFIG;
  private settingsCache: AppSettings = DEFAULT_SETTINGS;

  private initPromise: Promise<void> | null = null;

  constructor() {
    this.initPromise = this.init();
  }

  public async init(): Promise<void> {
    const mongoUri = process.env.MONGODB_URI;
    const dbName = process.env.MONGODB_DB_NAME || 'exam_monitoring';

    if (mongoUri && mongoUri.trim() !== '') {
      try {
        console.log(`[DB] Connecting to MongoDB instance...`);
        this.client = new MongoClient(mongoUri);
        await this.client.connect();
        this.db = this.client.db(dbName);
        this.isMongoConnected = true;
        console.log(`[DB] Successfully connected to MongoDB database: "${dbName}"`);

        await this.loadFromMongo();
        return;
      } catch (err: any) {
        console.error(`[DB] MongoDB connection failed: ${err?.message || err}.`);
        console.warn(`[DB] Retrying MongoDB or operating in local persistence mode.`);
      }
    } else {
      console.log(`[DB] MONGODB_URI not set. Operating with local file persistence at ${DB_FILE}`);
    }

    // Fallback to local JSON file persistence if MongoDB is not configured or offline
    this.loadFromLocalFile();
  }

  public async ensureConnected(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  private async loadFromMongo(): Promise<void> {
    if (!this.db) return;

    try {
      // 1. Settings
      const settingsColl = this.db.collection('settings');
      const savedSettings = await settingsColl.findOne({ _id: 'app_settings' as any });
      if (savedSettings) {
        this.settingsCache = {
          appName: savedSettings.appName || DEFAULT_SETTINGS.appName,
          cvModelPath: savedSettings.cvModelPath || DEFAULT_SETTINGS.cvModelPath,
          confidenceThreshold: savedSettings.confidenceThreshold ?? DEFAULT_SETTINGS.confidenceThreshold,
          detectionIntervalMs: savedSettings.detectionIntervalMs ?? DEFAULT_SETTINGS.detectionIntervalMs,
          adminId: process.env.ADMIN_USERNAME || 'admin',
        };
      } else {
        await settingsColl.insertOne({ _id: 'app_settings' as any, ...DEFAULT_SETTINGS });
        this.settingsCache = { ...DEFAULT_SETTINGS };
      }

      // 2. Score Config
      const scoreColl = this.db.collection('score_config');
      const savedScore = await scoreColl.findOne({ _id: 'score_config' as any });
      if (savedScore) {
        this.scoreConfigCache = {
          normalMax: savedScore.normalMax ?? DEFAULT_SCORE_CONFIG.normalMax,
          warningMax: savedScore.warningMax ?? DEFAULT_SCORE_CONFIG.warningMax,
          highWarningMin: savedScore.highWarningMin ?? DEFAULT_SCORE_CONFIG.highWarningMin,
          maxScore: 100,
        };
      } else {
        await scoreColl.insertOne({ _id: 'score_config' as any, ...DEFAULT_SCORE_CONFIG });
        this.scoreConfigCache = { ...DEFAULT_SCORE_CONFIG };
      }

      // 3. Activity Types
      const actTypesColl = this.db.collection('activity_types');
      const actTypesDocs = await actTypesColl.find({}).toArray();
      if (actTypesDocs.length > 0) {
        this.activityTypesCache = actTypesDocs.map((doc) => ({
          id: doc.id || doc._id.toString(),
          name: doc.name,
          description: doc.description || '',
          scoreWeight: Number(doc.scoreWeight),
          severity: doc.severity || 'medium',
        }));
      } else {
        await actTypesColl.insertMany(DEFAULT_ACTIVITY_TYPES.map((t) => ({ ...t, _id: t.id as any })));
        this.activityTypesCache = [...DEFAULT_ACTIVITY_TYPES];
      }

      // 4. Cameras
      const camerasColl = this.db.collection('cameras');
      const cameraDocs = await camerasColl.find({}).toArray();
      this.camerasCache = cameraDocs.map((doc) => ({
        id: doc.id || doc._id.toString(),
        name: doc.name,
        sourceType: doc.sourceType,
        sourceUrl: doc.sourceUrl,
        username: doc.username,
        password: doc.password,
        resolvedUrl: doc.resolvedUrl,
        location: doc.location || 'Exam Hall',
        enabled: doc.enabled !== false,
        status: doc.status || 'active',
        resolution: doc.resolution,
        description: doc.description,
      }));

      // 5. Candidates
      const candidatesColl = this.db.collection('candidates');
      const candidateDocs = await candidatesColl.find({}).toArray();
      this.candidatesCache = candidateDocs.map((doc) => ({
        id: doc.id || doc._id.toString(),
        trackerId: doc.trackerId,
        cameraId: doc.cameraId,
        studentName: doc.studentName,
        seatNumber: doc.seatNumber,
        firstSeen: doc.firstSeen,
        lastSeen: doc.lastSeen,
        currentScore: doc.currentScore ?? 0,
        warningLevel: doc.warningLevel || 'normal',
        warningCleared: doc.warningCleared === true,
        isCurrentlyTracked: doc.isCurrentlyTracked === true,
        lastActivity: doc.lastActivity,
        notes: doc.notes,
      }));

      // 6. Activities
      const activitiesColl = this.db.collection('activities');
      const activityDocs = await activitiesColl
        .find({})
        .sort({ timestamp: -1 })
        .limit(2000)
        .toArray();

      this.activitiesCache = activityDocs.map((doc) => ({
        id: doc.id || doc._id.toString(),
        pId: doc.pId,
        cameraId: doc.cameraId,
        cameraName: doc.cameraName,
        activityType: doc.activityType,
        details: doc.details,
        scoreChange: doc.scoreChange,
        scoreAfter: doc.scoreAfter,
        warningLevel: doc.warningLevel,
        timestamp: doc.timestamp,
        timeDisplay: doc.timeDisplay,
      }));

      console.log(
        `[DB] Loaded MongoDB state: ${this.camerasCache.length} cameras, ${this.candidatesCache.length} candidates, ${this.activitiesCache.length} activities.`
      );
    } catch (err: any) {
      console.error('[DB] Error reading collections from MongoDB:', err);
    }
  }

  private loadFromLocalFile() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        this.camerasCache = parsed.cameras || [];
        this.candidatesCache = parsed.candidates || [];
        this.activitiesCache = parsed.activities || [];
        this.activityTypesCache = parsed.activityTypes || DEFAULT_ACTIVITY_TYPES;
        this.scoreConfigCache = parsed.scoreConfig || DEFAULT_SCORE_CONFIG;
        this.settingsCache = parsed.settings || DEFAULT_SETTINGS;
      }
    } catch (err) {
      console.error('[DB] Local file load error:', err);
    }
  }

  private saveToLocalFile() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const data = {
        cameras: this.camerasCache,
        candidates: this.candidatesCache,
        activities: this.activitiesCache,
        activityTypes: this.activityTypesCache,
        scoreConfig: this.scoreConfigCache,
        settings: this.settingsCache,
      };
      fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
    } catch (err) {
      console.error('[DB] Local file save error:', err);
    }
  }

  // --- Settings ---
  public getSettings(): AppSettings {
    return this.settingsCache;
  }

  public async updateSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
    await this.ensureConnected();
    this.settingsCache = { ...this.settingsCache, ...settings };

    if (this.isMongoConnected && this.db) {
      await this.db.collection('settings').updateOne(
        { _id: 'app_settings' as any },
        { $set: this.settingsCache },
        { upsert: true }
      );
    } else {
      this.saveToLocalFile();
    }
    return this.settingsCache;
  }

  // --- Score Configuration ---
  public getScoreConfig(): ScoreConfig {
    return this.scoreConfigCache;
  }

  public async updateScoreConfig(config: Partial<ScoreConfig>): Promise<ScoreConfig> {
    await this.ensureConnected();
    this.scoreConfigCache = {
      ...this.scoreConfigCache,
      ...config,
      maxScore: 100,
    };

    // Recalculate warning levels for existing candidates
    this.candidatesCache.forEach((cand) => {
      cand.warningLevel = this.computeWarningLevel(cand.currentScore, cand.warningCleared);
    });

    if (this.isMongoConnected && this.db) {
      await this.db.collection('score_config').updateOne(
        { _id: 'score_config' as any },
        { $set: this.scoreConfigCache },
        { upsert: true }
      );

      // Batch update candidates in Mongo
      const bulk = this.db.collection('candidates').initializeUnorderedBulkOp();
      this.candidatesCache.forEach((c) => {
        bulk.find({ id: c.id }).updateOne({ $set: { warningLevel: c.warningLevel } });
      });
      if (this.candidatesCache.length > 0) {
        await bulk.execute();
      }
    } else {
      this.saveToLocalFile();
    }

    return this.scoreConfigCache;
  }

  public computeWarningLevel(score: number, warningCleared: boolean = false): WarningLevel {
    if (warningCleared) {
      return 'normal';
    }
    const { normalMax, warningMax } = this.scoreConfigCache;
    if (score > warningMax) {
      return 'high';
    }
    if (score > normalMax) {
      return 'warning';
    }
    return 'normal';
  }

  // --- Cameras ---
  public getCameras(): CameraSource[] {
    return this.camerasCache;
  }

  public getCamera(id: string): CameraSource | undefined {
    return this.camerasCache.find((c) => c.id === id);
  }

  public async saveCamera(camera: CameraSource): Promise<CameraSource> {
    await this.ensureConnected();
    const idx = this.camerasCache.findIndex((c) => c.id === camera.id);
    if (idx >= 0) {
      this.camerasCache[idx] = camera;
    } else {
      this.camerasCache.push(camera);
    }

    if (this.isMongoConnected && this.db) {
      await this.db.collection('cameras').replaceOne(
        { id: camera.id },
        { ...camera, id: camera.id },
        { upsert: true }
      );
    } else {
      this.saveToLocalFile();
    }
    return camera;
  }

  public async deleteCamera(id: string): Promise<boolean> {
    await this.ensureConnected();
    const lenBefore = this.camerasCache.length;
    this.camerasCache = this.camerasCache.filter((c) => c.id !== id);

    if (this.camerasCache.length !== lenBefore) {
      if (this.isMongoConnected && this.db) {
        await this.db.collection('cameras').deleteOne({ id });
      } else {
        this.saveToLocalFile();
      }
      return true;
    }
    return false;
  }

  // --- Candidates ---
  public getCandidates(): Candidate[] {
    return this.candidatesCache;
  }

  public getCandidate(id: string): Candidate | undefined {
    return this.candidatesCache.find((c) => c.id === id);
  }

  public async getOrCreateCandidate(cameraId: string, trackerId: number, explicitPid?: string): Promise<Candidate> {
    await this.ensureConnected();
    const targetPid = explicitPid || `P-${trackerId}`;
    const existing = this.candidatesCache.find(
      (c) => (c.cameraId === cameraId && c.trackerId === trackerId) || (explicitPid && c.id === explicitPid)
    );

    if (existing) {
      existing.lastSeen = new Date().toISOString();
      existing.isCurrentlyTracked = true;

      if (this.isMongoConnected && this.db) {
        await this.db.collection('candidates').updateOne(
          { id: existing.id },
          { $set: { lastSeen: existing.lastSeen, isCurrentlyTracked: true } }
        );
      } else {
        this.saveToLocalFile();
      }
      return existing;
    }

    const nowIso = new Date().toISOString();
    const newCandidate: Candidate = {
      id: targetPid,
      trackerId,
      cameraId,
      studentName: `Candidate ${targetPid}`,
      seatNumber: `Desk #${trackerId}`,
      firstSeen: nowIso,
      lastSeen: nowIso,
      currentScore: 0,
      warningLevel: 'normal',
      warningCleared: false,
      isCurrentlyTracked: true,
      lastActivity: 'Monitoring initiated',
    };

    this.candidatesCache.push(newCandidate);

    if (this.isMongoConnected && this.db) {
      await this.db.collection('candidates').insertOne({ ...newCandidate, _id: targetPid as any });
    } else {
      this.saveToLocalFile();
    }

    return newCandidate;
  }

  public async updateCandidate(id: string, updates: Partial<Candidate>): Promise<Candidate | null> {
    await this.ensureConnected();
    const candidate = this.candidatesCache.find((c) => c.id === id);
    if (!candidate) return null;

    if (updates.studentName !== undefined) candidate.studentName = updates.studentName;
    if (updates.seatNumber !== undefined) candidate.seatNumber = updates.seatNumber;
    if (updates.notes !== undefined) candidate.notes = updates.notes;
    if (updates.currentScore !== undefined) {
      candidate.currentScore = Math.max(0, Math.min(100, updates.currentScore));
      candidate.warningLevel = this.computeWarningLevel(candidate.currentScore, candidate.warningCleared);
    }
    if (updates.warningCleared !== undefined) {
      candidate.warningCleared = updates.warningCleared;
      candidate.warningLevel = this.computeWarningLevel(candidate.currentScore, candidate.warningCleared);
    }

    if (this.isMongoConnected && this.db) {
      await this.db.collection('candidates').replaceOne(
        { id },
        { ...candidate, id },
        { upsert: true }
      );
    } else {
      this.saveToLocalFile();
    }

    return candidate;
  }

  public async clearCandidateWarning(id: string): Promise<Candidate | null> {
    await this.ensureConnected();
    const candidate = this.candidatesCache.find((c) => c.id === id);
    if (!candidate) return null;

    candidate.warningCleared = true;
    candidate.warningLevel = 'normal';
    candidate.currentScore = 0;

    if (this.isMongoConnected && this.db) {
      await this.db.collection('candidates').updateOne(
        { id },
        { $set: { warningCleared: true, warningLevel: 'normal', currentScore: 0 } }
      );
    } else {
      this.saveToLocalFile();
    }

    return candidate;
  }

  public async removeCandidate(id: string): Promise<boolean> {
    await this.ensureConnected();
    const lenBefore = this.candidatesCache.length;
    this.candidatesCache = this.candidatesCache.filter((c) => c.id !== id);

    if (this.candidatesCache.length !== lenBefore) {
      if (this.isMongoConnected && this.db) {
        await this.db.collection('candidates').deleteOne({ id });
      } else {
        this.saveToLocalFile();
      }
      return true;
    }
    return false;
  }

  public async clearCandidates(): Promise<boolean> {
    await this.ensureConnected();
    this.candidatesCache = [];

    if (this.isMongoConnected && this.db) {
      await this.db.collection('candidates').deleteMany({});
    } else {
      this.saveToLocalFile();
    }
    return true;
  }

  public async setTrackingStatusAll(cameraId: string, isTracked: boolean): Promise<void> {
    await this.ensureConnected();
    this.candidatesCache.forEach((c) => {
      if (c.cameraId === cameraId) {
        c.isCurrentlyTracked = isTracked;
      }
    });

    if (this.isMongoConnected && this.db) {
      await this.db.collection('candidates').updateMany(
        { cameraId },
        { $set: { isCurrentlyTracked: isTracked } }
      );
    } else {
      this.saveToLocalFile();
    }
  }

  // --- Activities ---
  public async clearActivities(): Promise<boolean> {
    await this.ensureConnected();
    this.activitiesCache = [];
    this.candidatesCache.forEach((c) => {
      c.lastActivity = undefined;
      c.currentScore = 0;
      c.warningLevel = 'normal';
      c.warningCleared = true;
    });

    if (this.isMongoConnected && this.db) {
      await this.db.collection('activities').deleteMany({});
      await this.db.collection('candidates').updateMany(
        {},
        { $set: { lastActivity: undefined, currentScore: 0, warningLevel: 'normal', warningCleared: true } }
      );
    } else {
      this.saveToLocalFile();
    }

    return true;
  }

  public async deleteActivity(id: string): Promise<boolean> {
    await this.ensureConnected();
    const lenBefore = this.activitiesCache.length;
    this.activitiesCache = this.activitiesCache.filter((a) => a.id !== id);

    if (this.activitiesCache.length !== lenBefore) {
      if (this.isMongoConnected && this.db) {
        await this.db.collection('activities').deleteOne({ id });
      } else {
        this.saveToLocalFile();
      }
      return true;
    }
    return false;
  }

  public getActivities(filters?: {
    pId?: string;
    activityType?: string;
    warningLevel?: string;
    cameraId?: string;
    limit?: number;
  }): ActivityRecord[] {
    let result = [...this.activitiesCache];

    if (filters) {
      if (filters.pId) {
        const query = filters.pId.toLowerCase();
        result = result.filter((a) => a.pId.toLowerCase().includes(query));
      }
      if (filters.activityType) {
        result = result.filter((a) => a.activityType === filters.activityType);
      }
      if (filters.warningLevel) {
        result = result.filter((a) => a.warningLevel === filters.warningLevel);
      }
      if (filters.cameraId) {
        result = result.filter((a) => a.cameraId === filters.cameraId);
      }
    }

    result.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    if (filters?.limit && filters.limit > 0) {
      return result.slice(0, filters.limit);
    }
    return result;
  }

  public async recordActivity(params: {
    pId: string;
    cameraId: string;
    activityType: string;
    details: string;
    scoreWeight?: number;
  }): Promise<{ activity: ActivityRecord; updatedCandidate: Candidate }> {
    await this.ensureConnected();
    let candidate = this.candidatesCache.find((c) => c.id === params.pId);
    if (!candidate) {
      const match = params.pId.match(/^P-(\d+)$/);
      const trackerId = match ? parseInt(match[1], 10) : 1;
      candidate = await this.getOrCreateCandidate(params.cameraId, trackerId, params.pId);
    }

    let weight = params.scoreWeight;
    if (weight === undefined) {
      const typeConfig = this.activityTypesCache.find((t) => t.name === params.activityType);
      weight = typeConfig ? typeConfig.scoreWeight : 5;
    }

    const prevScore = candidate.currentScore;
    const newScore = Math.max(0, Math.min(100, prevScore + weight));
    candidate.currentScore = newScore;
    candidate.lastSeen = new Date().toISOString();
    candidate.lastActivity = `${params.activityType} (+${weight})`;

    if (newScore > this.scoreConfigCache.normalMax && candidate.warningCleared) {
      candidate.warningCleared = false;
    }

    candidate.warningLevel = this.computeWarningLevel(newScore, candidate.warningCleared);

    const now = new Date();
    const timeDisplay = now.toTimeString().split(' ')[0];
    const camera = this.getCamera(params.cameraId);

    const activity: ActivityRecord = {
      id: `act-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      pId: params.pId,
      cameraId: params.cameraId,
      cameraName: camera ? camera.name : params.cameraId,
      activityType: params.activityType,
      details: params.details,
      scoreChange: weight,
      scoreAfter: newScore,
      warningLevel: candidate.warningLevel,
      timestamp: now.toISOString(),
      timeDisplay,
    };

    this.activitiesCache.unshift(activity);
    if (this.activitiesCache.length > 5000) {
      this.activitiesCache = this.activitiesCache.slice(0, 5000);
    }

    if (this.isMongoConnected && this.db) {
      await this.db.collection('activities').insertOne({ ...activity, _id: activity.id as any });
      await this.db.collection('candidates').replaceOne(
        { id: candidate.id },
        { ...candidate, id: candidate.id },
        { upsert: true }
      );
    } else {
      this.saveToLocalFile();
    }

    return { activity, updatedCandidate: candidate };
  }

  // --- Activity Types ---
  public getActivityTypes(): ActivityTypeConfig[] {
    return this.activityTypesCache;
  }

  public async saveActivityType(type: ActivityTypeConfig): Promise<ActivityTypeConfig> {
    await this.ensureConnected();
    const idx = this.activityTypesCache.findIndex((t) => t.id === type.id);
    if (idx >= 0) {
      this.activityTypesCache[idx] = type;
    } else {
      this.activityTypesCache.push(type);
    }

    if (this.isMongoConnected && this.db) {
      await this.db.collection('activity_types').replaceOne(
        { id: type.id },
        { ...type, id: type.id },
        { upsert: true }
      );
    } else {
      this.saveToLocalFile();
    }

    return type;
  }

  public async deleteActivityType(id: string): Promise<boolean> {
    await this.ensureConnected();
    const lenBefore = this.activityTypesCache.length;
    this.activityTypesCache = this.activityTypesCache.filter((t) => t.id !== id);

    if (this.activityTypesCache.length !== lenBefore) {
      if (this.isMongoConnected && this.db) {
        await this.db.collection('activity_types').deleteOne({ id });
      } else {
        this.saveToLocalFile();
      }
      return true;
    }
    return false;
  }

  public async clearAllSessionData(): Promise<void> {
    await this.ensureConnected();
    this.candidatesCache = [];
    this.activitiesCache = [];

    if (this.isMongoConnected && this.db) {
      await this.db.collection('candidates').deleteMany({});
      await this.db.collection('activities').deleteMany({});
    } else {
      this.saveToLocalFile();
    }
  }
}

export const db = new ExamDatabase();
