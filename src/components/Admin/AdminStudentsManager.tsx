/**
 * Smart Classroom Exam Monitoring System
 * Admin Student Management & ID Number Editor
 * 
 * CORE REQUIREMENT:
 * "From the Admin Panel, administrators must be able to edit/correct the
 * student ID number and student information for clearer identification."
 */

import React, { useState } from 'react';
import { useMonitoring } from '../../context/MonitoringContext.js';
import { StudentRecord } from '../../types.js';
import { Users, Edit3, Trash2, Plus, Check, X, AlertCircle } from 'lucide-react';

export function AdminStudentsManager() {
  const { students, refreshData } = useMonitoring();

  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [editIdNumber, setEditIdNumber] = useState<string>('');
  const [editName, setEditName] = useState<string>('');
  const [editSeatId, setEditSeatId] = useState<string>('');
  const [editNotes, setEditNotes] = useState<string>('');

  const [isAdding, setIsAdding] = useState<boolean>(false);
  const [newIdNumber, setNewIdNumber] = useState<string>('');
  const [newName, setNewName] = useState<string>('');
  const [newSeatId, setNewSeatId] = useState<string>('');
  const [newClassroom, setNewClassroom] = useState<string>('');

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

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
        setFeedback({ type: 'success', message: 'New student added to exam roster.' });
        setIsAdding(false);
        setNewName('');
        setNewIdNumber('');
        setNewSeatId('');
        await refreshData();
        setTimeout(() => setFeedback(null), 3000);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    }
  };

  const handleDelete = async (studentId: string, name: string) => {
    if (!confirm(`Are you sure you want to remove student "${name}"?`)) return;
    const token = localStorage.getItem('admin_token');

    try {
      const res = await fetch(`/api/students/${studentId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setFeedback({ type: 'success', message: `Student ${name} deleted.` });
        await refreshData();
        setTimeout(() => setFeedback(null), 3000);
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message });
    }
  };

  return (
    <div className="space-y-5">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div>
          <h2 className="text-base font-bold text-white flex items-center space-x-2">
            <Users className="w-5 h-5 text-indigo-400" />
            <span>Student Identification &amp; Roll Number Roster</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Correct student ID numbers, update candidate names, and adjust desk assignments.
          </p>
        </div>

        <button
          onClick={() => setIsAdding(!isAdding)}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add Candidate</span>
        </button>
      </div>

      {feedback && (
        <div className={`p-3 rounded-lg text-xs flex items-center space-x-2 ${
          feedback.type === 'success' ? 'bg-emerald-950/80 border border-emerald-800 text-emerald-300' : 'bg-rose-950/80 border border-rose-800 text-rose-300'
        }`}>
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Add Student Form */}
      {isAdding && (
        <form onSubmit={handleAddStudent} className="p-4 bg-slate-950 border border-indigo-500/40 rounded-xl space-y-3 text-xs">
          <h3 className="font-semibold text-white">Enroll New Student in Session</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-slate-400 mb-1">Student ID Number</label>
              <input
                type="text"
                value={newIdNumber}
                onChange={e => setNewIdNumber(e.target.value)}
                placeholder="STU-2026-XXXX"
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-white font-mono"
                required
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Full Name</label>
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="Student Full Name"
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-white"
                required
              />
            </div>
            <div>
              <label className="block text-slate-400 mb-1">Assigned Desk / Seat ID (Optional)</label>
              <input
                type="text"
                value={newSeatId}
                onChange={e => setNewSeatId(e.target.value)}
                placeholder="e.g. seat-1 or A-01"
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-white"
              />
            </div>
          </div>
          <div className="flex justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="px-3 py-1.5 rounded bg-slate-800 text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 rounded bg-indigo-600 text-white font-bold"
            >
              Enroll Candidate
            </button>
          </div>
        </form>
      )}

      {/* Students List Table */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 uppercase font-mono text-[10px]">
              <tr>
                <th className="px-4 py-3">Student ID Number</th>
                <th className="px-4 py-3">Student Name</th>
                <th className="px-4 py-3">Assigned Desk</th>
                <th className="px-4 py-3">Monitoring Score</th>
                <th className="px-4 py-3">Notes</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 text-slate-300">
              {students.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
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
                      <td className="px-4 py-3 font-mono font-bold text-slate-400">
                        {student.unified_suspicion_score} pts
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
                    <td className="px-4 py-3 font-mono">
                      <span className={student.unified_suspicion_score >= 60 ? 'text-rose-400 font-bold' : 'text-slate-300'}>
                        {student.unified_suspicion_score}
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
