/**
 * Smart Classroom Exam Monitoring System
 * Admin Student & Exam Candidate Manager
 * 
 * CORE ARCHITECTURAL INVARIANT:
 * "Strictly separate Registered Student, Exam Candidate, Global Person, and Camera Track."
 * - Registered Students: Roster in database, initially marked absent until observed.
 * - Exam Candidates: Confirmed Layer 3 physical persons observed by cameras in real time.
 */

import React, { useState } from 'react';
import { useMonitoring } from '../../context/MonitoringContext.js';
import { StudentRecord } from '../../types.js';
import { Users, Edit3, Trash2, Plus, Check, X, AlertCircle, RotateCcw, UserCheck, ShieldAlert } from 'lucide-react';

export function AdminStudentsManager() {
  const {
    students,
    seats,
    globalPersons,
    refreshData,
    settings,
    editCandidate,
    deleteCandidate,
    clearCurrentCandidates
  } = useMonitoring();

  const highThreshold = settings?.thresholds?.high_suspicion_threshold ?? 65;

  // Student editing
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [editIdNumber, setEditIdNumber] = useState<string>('');
  const [editName, setEditName] = useState<string>('');
  const [editSeatId, setEditSeatId] = useState<string>('');
  const [editNotes, setEditNotes] = useState<string>('');

  // Student adding
  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [newIdNumber, setNewIdNumber] = useState<string>('');
  const [newName, setNewName] = useState<string>('');
  const [newSeatId, setNewSeatId] = useState<string>('');
  const [newClassroom, setNewClassroom] = useState<string>('');

  // Candidate editing
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(null);
  const [candidateEditSeat, setCandidateEditSeat] = useState<string>('');
  const [candidateEditStudent, setCandidateEditStudent] = useState<string>('');

  // Clear confirmation
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleSaveCandidateEdit = async (personId: string) => {
    const success = await editCandidate(personId, {
      seat_id: candidateEditSeat || undefined,
      student_id: candidateEditStudent || null
    });
    if (success) {
      setFeedback({ type: 'success', message: `Candidate ${personId} metadata updated.` });
      setEditingCandidateId(null);
      setTimeout(() => setFeedback(null), 3000);
    } else {
      setFeedback({ type: 'error', message: 'Failed to update candidate.' });
    }
  };

  const handleDeleteCandidate = async (personId: string) => {
    if (!window.confirm(`Remove candidate ${personId} from active session? This will untrack them until newly detected.`)) return;
    const success = await deleteCandidate(personId);
    if (success) {
      setFeedback({ type: 'success', message: `Candidate ${personId} removed.` });
      setTimeout(() => setFeedback(null), 3000);
    } else {
      setFeedback({ type: 'error', message: 'Failed to remove candidate.' });
    }
  };

  const handleClearAllCandidates = async () => {
    const success = await clearCurrentCandidates();
    setShowClearConfirm(false);
    if (success) {
      setFeedback({ type: 'success', message: 'All current exam candidates cleared. System is reset for fresh camera capture.' });
      setTimeout(() => setFeedback(null), 4000);
    } else {
      setFeedback({ type: 'error', message: 'Failed to clear exam candidates.' });
    }
  };

  const startEdit = (student: StudentRecord) => {
    setEditingStudentId(student.id);
    setEditIdNumber(student.student_id_number);
    setEditName(student.name);
    setEditSeatId(student.seat_id || '');
    setEditNotes(student.notes || '');
  };

  const cancelEdit = () => {
    setEditingStudentId(null);
  };

  const saveEdit = async (studentId: string) => {
    const token = localStorage.getItem('admin_token');
    try {
      const res = await fetch(`/api/students/${studentId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          student_id_number: editIdNumber.trim(),
          name: editName.trim(),
          seat_id: editSeatId.trim(),
          notes: editNotes.trim()
        })
      });

      if (res.ok) {
        setFeedback({ type: 'success', message: 'Student ID record successfully updated.' });
        setEditingStudentId(null);
        await refreshData();
        setTimeout(() => setFeedback(null), 3000);
      } else {
        const data = await res.json();
        setFeedback({ type: 'error', message: data.error || 'Failed to update student.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    }
  };

  const handleAddStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = localStorage.getItem('admin_token');

    try {
      const res = await fetch('/api/students', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          student_id_number: newIdNumber.trim() || `STU-${Date.now().toString().slice(-4)}`,
          name: newName.trim(),
          seat_id: newSeatId.trim() || undefined,
          classroom_id: newClassroom.trim() || undefined
        })
      });

      if (res.ok) {
        setFeedback({ type: 'success', message: 'New candidate enrolled successfully.' });
        setIsAdding(false);
        setNewIdNumber('');
        setNewName('');
        setNewSeatId('');
        setNewClassroom('');
        await refreshData();
        setTimeout(() => setFeedback(null), 3000);
      } else {
        const data = await res.json();
        setFeedback({ type: 'error', message: data.error || 'Failed to add student.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    }
  };

  const handleDelete = async (studentId: string, studentName: string) => {
    if (!window.confirm(`Are you sure you want to remove ${studentName} (${studentId}) from the exam roster?`)) {
      return;
    }

    const token = localStorage.getItem('admin_token');
    try {
      const res = await fetch(`/api/students/${studentId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (res.ok) {
        setFeedback({ type: 'success', message: 'Student removed from database.' });
        await refreshData();
        setTimeout(() => setFeedback(null), 3000);
      } else {
        const data = await res.json();
        setFeedback({ type: 'error', message: data.error || 'Failed to delete student.' });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Notifications */}
      {feedback && (
        <div
          className={`p-3 rounded-lg flex items-center justify-between text-xs font-medium ${
            feedback.type === 'success'
              ? 'bg-emerald-950/80 border border-emerald-800 text-emerald-300'
              : 'bg-rose-950/80 border border-rose-800 text-rose-300'
          }`}
        >
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4" />
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* SECTION 1: CURRENT EXAM CANDIDATES (CAMERA CONFIRMED REAL PERSONS) */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 bg-slate-900 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <UserCheck className="w-5 h-5 text-emerald-400" />
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                Current Exam Candidates
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800/60">
                  {globalPersons.length} Active in Hall
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Live Layer 3 confirmed persons detected by camera. Clearing candidates resets runtime state for fresh capture without deleting registered students.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowClearConfirm(true)}
              className="px-3 py-1.5 bg-rose-950 hover:bg-rose-900 border border-rose-800/80 text-rose-300 rounded-lg text-xs font-medium flex items-center space-x-1.5 cursor-pointer transition-colors"
              title="Reset current candidates for fresh capture"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Clear Current Candidates</span>
            </button>
          </div>
        </div>

        {/* Clear Confirmation Modal */}
        {showClearConfirm && (
          <div className="p-4 bg-rose-950/40 border-b border-rose-800/60 flex items-center justify-between gap-4">
            <div className="flex items-center space-x-3 text-rose-200 text-xs">
              <ShieldAlert className="w-5 h-5 text-rose-400 flex-shrink-0" />
              <div>
                <p className="font-bold">Clear all active exam candidate tracks?</p>
                <p className="text-rose-300/80 text-[11px]">
                  This resets runtime active camera tracks. Registered students and past audit events remain safely preserved.
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleClearAllCandidates}
                className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white font-medium text-xs rounded transition-colors"
              >
                Confirm Clear
              </button>
              <button
                onClick={() => setShowClearConfirm(false)}
                className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Candidate Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 uppercase font-mono text-[10px]">
              <tr>
                <th className="px-4 py-3">Technical Person ID</th>
                <th className="px-4 py-3">Active Camera Tracks</th>
                <th className="px-4 py-3">Assigned Desk</th>
                <th className="px-4 py-3">Associated Student</th>
                <th className="px-4 py-3">Monitoring Risk</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-300">
              {globalPersons.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-slate-500 text-xs">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <Users className="w-7 h-7 text-slate-600 stroke-1" />
                      <p className="text-sm font-medium text-slate-400">0 Exam Candidates Detected</p>
                      <p className="text-xs text-slate-500 max-w-md">
                        The exam hall is currently empty. Candidates appear automatically when a real person is temporally confirmed by camera.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                globalPersons.map(gp => {
                  const isEditing = editingCandidateId === gp.id;
                  const trackList = gp.camera_tracks || [];

                  if (isEditing) {
                    return (
                      <tr key={gp.id} className="bg-indigo-950/20">
                        <td className="px-4 py-3 font-mono font-bold text-indigo-400">
                          {gp.id} <span className="text-[10px] text-slate-500">(immutable)</span>
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-400 text-[11px]">
                          {trackList.map(t => `${t.camera_id}:${t.track_id}`).join(', ') || 'None'}
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={candidateEditSeat}
                            onChange={e => setCandidateEditSeat(e.target.value)}
                            className="px-2 py-1 bg-slate-900 border border-indigo-500 rounded text-white text-xs"
                          >
                            <option value="">Unassigned</option>
                            {seats.map(s => (
                              <option key={s.id} value={s.id}>
                                {s.seat_label || s.id}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <select
                            value={candidateEditStudent}
                            onChange={e => setCandidateEditStudent(e.target.value)}
                            className="px-2 py-1 bg-slate-900 border border-indigo-500 rounded text-white text-xs"
                          >
                            <option value="">No Student Linked</option>
                            {students.map(s => (
                              <option key={s.id} value={s.id}>
                                {s.student_id_number} - {s.name}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3 font-mono text-slate-400">
                          {Math.round(gp.current_score || 0)} pts
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end space-x-1">
                            <button
                              onClick={() => handleSaveCandidateEdit(gp.id)}
                              className="p-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white"
                              title="Save Changes"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingCandidateId(null)}
                              className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                              title="Cancel"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={gp.id} className="hover:bg-slate-900/50 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-indigo-400">
                        {gp.id}
                      </td>
                      <td className="px-4 py-3 font-mono text-[11px]">
                        {trackList.length === 0 ? (
                          <span className="text-slate-500">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {trackList.map(t => (
                              <span
                                key={`${t.camera_id}-${t.track_id}`}
                                className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700 text-[10px]"
                              >
                                {t.camera_id}: {t.track_id}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-cyan-400">
                        {gp.seat_id?.toUpperCase() || <span className="text-slate-500">Unassigned</span>}
                      </td>
                      <td className="px-4 py-3">
                        {gp.associated_student_id || gp.student_id ? (
                          <div className="flex items-center space-x-1.5">
                            <span className="font-semibold text-white">
                              {gp.associated_student_name || gp.student_name}
                            </span>
                            <span className="text-[10px] font-mono text-indigo-400 bg-indigo-950 px-1 py-0.5 rounded">
                              {gp.student_id_number}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-500 italic">No student associated</span>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono">
                        <span className={(gp.current_score || 0) >= highThreshold ? 'text-rose-400 font-bold' : 'text-slate-300'}>
                          {Math.round(gp.current_score || 0)} pts
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end space-x-1.5">
                          <button
                            onClick={() => {
                              setEditingCandidateId(gp.id);
                              setCandidateEditSeat(gp.seat_id || '');
                              setCandidateEditStudent(gp.associated_student_id || gp.student_id || '');
                            }}
                            className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                            title="Edit Candidate Metadata & Seat"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteCandidate(gp.id)}
                            className="p-1.5 rounded hover:bg-rose-950 text-slate-500 hover:text-rose-400 transition-colors"
                            title="Remove Candidate from active session"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION 2: REGISTERED STUDENTS DATABASE (ENROLLMENT ROSTER) */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Users className="w-4 h-4 text-indigo-400" />
            <div>
              <h3 className="text-sm font-bold text-white">Registered Student Roster</h3>
              <p className="text-xs text-slate-400">Database of enrolled candidates. Registered students are not marked present without camera evidence.</p>
            </div>
          </div>
          <button
            onClick={() => setIsAdding(!isAdding)}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium flex items-center space-x-1.5 cursor-pointer transition-colors shadow-sm"
          >
            {isAdding ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            <span>{isAdding ? 'Cancel' : 'Enroll Candidate'}</span>
          </button>
        </div>

        {/* Add Student Form */}
        {isAdding && (
          <form onSubmit={handleAddStudent} className="p-4 bg-slate-900/60 border-b border-slate-800 grid grid-cols-1 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Student ID Number</label>
              <input
                type="text"
                value={newIdNumber}
                onChange={e => setNewIdNumber(e.target.value)}
                placeholder="e.g. STU-2024-001"
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Student Full Name *</label>
              <input
                type="text"
                required
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Alex Johnson"
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono uppercase text-slate-400 mb-1">Assigned Desk / Seat ID</label>
              <input
                type="text"
                value={newSeatId}
                onChange={e => setNewSeatId(e.target.value)}
                placeholder="e.g. seat-1"
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex items-end space-x-2">
              <button
                type="submit"
                className="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors"
              >
                Save to Database
              </button>
            </div>
          </form>
        )}

        {/* Student Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 uppercase font-mono text-[10px]">
              <tr>
                <th className="px-4 py-3">Student ID Number</th>
                <th className="px-4 py-3">Student Name</th>
                <th className="px-4 py-3">Assigned Desk</th>
                <th className="px-4 py-3">Exam Status</th>
                <th className="px-4 py-3">Cumulative Risk</th>
                <th className="px-4 py-3">Notes</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-300">
              {students.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <Users className="w-8 h-8 text-slate-600 stroke-1" />
                      <p className="text-sm font-medium text-slate-400">No students registered in roster</p>
                      <p className="text-xs text-slate-500 max-w-sm">
                        Database contains no exam candidate records. Click &quot;Enroll Candidate&quot; above to register new students.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
              {students.map(student => {
                const isEditing = editingStudentId === student.id;

                if (isEditing) {
                  return (
                    <tr key={student.id} className="bg-indigo-950/20">
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={editIdNumber}
                          onChange={e => setEditIdNumber(e.target.value)}
                          className="w-full px-2 py-1 bg-slate-900 border border-indigo-500 rounded font-mono text-white text-xs"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          className="w-full px-2 py-1 bg-slate-900 border border-indigo-500 rounded text-white text-xs"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={editSeatId}
                          onChange={e => setEditSeatId(e.target.value)}
                          placeholder="Seat ID (e.g. seat-1)"
                          className="px-2 py-1 bg-slate-900 border border-slate-700 rounded text-white text-xs"
                        />
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-400">
                        {student.status}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-slate-400">
                        {student.cumulative_score || 0} pts
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={editNotes}
                          onChange={e => setEditNotes(e.target.value)}
                          placeholder="Optional notes"
                          className="w-full px-2 py-1 bg-slate-900 border border-slate-700 rounded text-slate-300 text-xs"
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end space-x-1">
                          <button
                            onClick={() => saveEdit(student.id)}
                            className="p-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white"
                            title="Save Changes"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300"
                            title="Cancel"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }

                return (
                  <tr key={student.id} className="hover:bg-slate-900/50 transition-colors">
                    <td className="px-4 py-3 font-mono font-bold text-indigo-400">
                      {student.student_id_number}
                    </td>
                    <td className="px-4 py-3 font-semibold text-white">
                      {student.name}
                    </td>
                    <td className="px-4 py-3 font-mono text-cyan-400">
                      {student.seat_id?.toUpperCase() || 'N/A'}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          student.status === 'present'
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800/60'
                            : student.status === 'flagged'
                            ? 'bg-rose-950 text-rose-300 border border-rose-800/60'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {student.status.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono">
                      <span className={(student.cumulative_score || 0) >= highThreshold ? 'text-rose-400 font-bold' : 'text-slate-300'}>
                        {student.cumulative_score || 0}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-400 truncate max-w-xs">
                      {student.notes || '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end space-x-1">
                        <button
                          onClick={() => startEdit(student)}
                          className="p-1.5 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                          title="Edit Student Information & ID Number"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(student.id, student.name)}
                          className="p-1.5 rounded hover:bg-rose-950 text-slate-500 hover:text-rose-400 transition-colors"
                          title="Delete Student"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
