import { CameraConfig, Student, Seat, Classroom, ExamEvent, ExamSession, SystemSettings, GlobalPerson } from '../src/types.js';

class InMemoryDatabase {
  private settings: SystemSettings = {
    system_name: 'Smart Classroom Exam Monitoring System',
    anomaly_sensitivity: 0.65,
    warning_threshold: 0.5,
    critical_threshold: 0.8,
    default_primary_camera: 'cam-1',
    auto_unlatch_time_sec: 15,
    dark_mode_default: false
  };

  private cameras: CameraConfig[] = [
    {
      camera_id: 'cam-1',
      name: 'CCTV Camera 1 (Exam Hall)',
      source_type: 'gdrive',
      source_url: 'https://drive.google.com/file/d/1Ww9Yv7WprUGF0cDLZPfQpZ2szGB7saIG/view?usp=drivesdk',
      classroom_id: 'room-101',
      status: 'online',
      is_primary: true,
      enabled: true,
      resolution: { width: 1920, height: 1080 },
      target_fps: 15,
      actual_fps: 15,
      quality_score: 95,
      view_angle_description: 'Front wide-angle ceiling view overlooking rows 1-5'
    }
  ];

  private students: Student[] = [
    {
      id: 'stu-101',
      student_id_number: '2026-001',
      name: 'Alexander Wright',
      classroom_id: 'room-101',
      seat_id: 'seat-A1',
      status: 'present',
      unified_suspicion_score: 0.05,
      active_observations: []
    },
    {
      id: 'stu-102',
      student_id_number: '2026-002',
      name: 'Sophia Chen',
      classroom_id: 'room-101',
      seat_id: 'seat-A2',
      status: 'present',
      unified_suspicion_score: 0.02,
      active_observations: []
    },
    {
      id: 'stu-103',
      student_id_number: '2026-003',
      name: 'Marcus Vance',
      classroom_id: 'room-101',
      seat_id: 'seat-B1',
      status: 'present',
      unified_suspicion_score: 0.12,
      active_observations: []
    },
    {
      id: 'stu-104',
      student_id_number: '2026-004',
      name: 'Elena Rostova',
      classroom_id: 'room-101',
      seat_id: 'seat-B2',
      status: 'present',
      unified_suspicion_score: 0.04,
      active_observations: []
    },
    {
      id: 'stu-105',
      student_id_number: '2026-005',
      name: 'David Kim',
      classroom_id: 'room-101',
      seat_id: 'seat-C1',
      status: 'present',
      unified_suspicion_score: 0.08,
      active_observations: []
    }
  ];

  private classrooms: Classroom[] = [
    { id: 'room-101', name: 'Main Examination Hall A', building: 'Academic Tower 3', room_number: '101', total_seats: 30 }
  ];

  private seats: Seat[] = [
    { seat_id: 'seat-A1', classroom_id: 'room-101', row: 1, column: 1, label: 'Seat A1', assigned_student_id: 'stu-101' },
    { seat_id: 'seat-A2', classroom_id: 'room-101', row: 1, column: 2, label: 'Seat A2', assigned_student_id: 'stu-102' },
    { seat_id: 'seat-B1', classroom_id: 'room-101', row: 2, column: 1, label: 'Seat B1', assigned_student_id: 'stu-103' },
    { seat_id: 'seat-B2', classroom_id: 'room-101', row: 2, column: 2, label: 'Seat B2', assigned_student_id: 'stu-104' },
    { seat_id: 'seat-C1', classroom_id: 'room-101', row: 3, column: 1, label: 'Seat C1', assigned_student_id: 'stu-105' }
  ];

  private events: ExamEvent[] = [];
  private globalPersons: GlobalPerson[] = [];
  private activeSession: ExamSession = {
    id: 'session-active',
    title: 'Final Examination: Advanced Data Structures',
    status: 'active',
    start_time: Date.now() - 3600000,
    course_code: 'CS-401',
    proctor_name: 'Lead Proctor'
  };

  isFallback(): boolean {
    return true;
  }

  async getSettings(): Promise<SystemSettings> {
    return { ...this.settings };
  }

  async updateSettings(updates: Partial<SystemSettings>): Promise<SystemSettings> {
    this.settings = { ...this.settings, ...updates };
    return { ...this.settings };
  }

  async getCameras(): Promise<CameraConfig[]> {
    return [...this.cameras];
  }

  async getCameraById(id: string): Promise<CameraConfig | null> {
    return this.cameras.find(c => c.camera_id === id) || null;
  }

  async addCamera(cam: CameraConfig): Promise<CameraConfig> {
    const existingIdx = this.cameras.findIndex(c => c.camera_id === cam.camera_id);
    if (existingIdx >= 0) {
      this.cameras[existingIdx] = cam;
    } else {
      this.cameras.push(cam);
    }
    return cam;
  }

  async updateCamera(id: string, updates: Partial<CameraConfig>): Promise<CameraConfig | null> {
    const cam = this.cameras.find(c => c.camera_id === id);
    if (!cam) return null;
    Object.assign(cam, updates);
    return { ...cam };
  }

  async deleteCamera(id: string): Promise<boolean> {
    const lenBefore = this.cameras.length;
    this.cameras = this.cameras.filter(c => c.camera_id !== id);
    return this.cameras.length < lenBefore;
  }

  async setPrimaryCamera(id: string): Promise<void> {
    this.cameras.forEach(c => {
      c.is_primary = c.camera_id === id;
    });
    this.settings.default_primary_camera = id;
  }

  async getStudents(): Promise<Student[]> {
    return [...this.students];
  }

  async addStudent(stu: Student): Promise<Student> {
    const existing = this.students.find(s => s.id === stu.id);
    if (existing) {
      Object.assign(existing, stu);
      return existing;
    }
    this.students.push(stu);
    return stu;
  }

  async updateStudent(id: string, updates: Partial<Student>): Promise<Student | null> {
    const s = this.students.find(stu => stu.id === id);
    if (!s) return null;
    Object.assign(s, updates);
    return { ...s };
  }

  async deleteStudent(id: string): Promise<boolean> {
    const len = this.students.length;
    this.students = this.students.filter(s => s.id !== id);
    return this.students.length < len;
  }

  async getClassrooms(): Promise<Classroom[]> {
    return [...this.classrooms];
  }

  async getSeats(classroomId?: string): Promise<Seat[]> {
    if (classroomId) {
      return this.seats.filter(s => s.classroom_id === classroomId);
    }
    return [...this.seats];
  }

  async updateSeat(seatId: string, updates: Partial<Seat>): Promise<Seat | null> {
    const seat = this.seats.find(s => s.seat_id === seatId);
    if (!seat) return null;
    Object.assign(seat, updates);
    return { ...seat };
  }

  async getActiveSession(): Promise<ExamSession> {
    return { ...this.activeSession };
  }

  async getEvents(limit = 50, severity?: string): Promise<ExamEvent[]> {
    let evts = [...this.events];
    if (severity) {
      evts = evts.filter(e => e.severity === severity);
    }
    evts.sort((a, b) => b.timestamp - a.timestamp);
    return evts.slice(0, limit);
  }

  async recordEvent(evt: ExamEvent): Promise<ExamEvent> {
    this.events.unshift(evt);
    if (this.events.length > 2000) {
      this.events = this.events.slice(0, 2000);
    }
    return evt;
  }

  async clearEvents(): Promise<number> {
    const count = this.events.length;
    this.events = [];
    return count;
  }

  async clearExamData(scopes?: string[]): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    if (!scopes || scopes.includes('events')) {
      counts.events = this.events.length;
      this.events = [];
    }
    if (!scopes || scopes.includes('candidates')) {
      counts.candidates = this.globalPersons.length;
      this.globalPersons = [];
    }
    return counts;
  }

  async getGlobalPersons(): Promise<GlobalPerson[]> {
    return [...this.globalPersons];
  }

  async saveGlobalPersons(persons: GlobalPerson[]): Promise<void> {
    this.globalPersons = [...persons];
  }
}

export const db = new InMemoryDatabase();

export async function initDatabase(): Promise<void> {
  console.log('[Database] In-memory database initialized with persistent defaults.');
}
