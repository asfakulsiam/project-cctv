/**
 * src/components/CandidateList.tsx - Examinee Candidate Roster & Warning Management
 * Lists all tracked candidates, their cumulative score, warning badges, seat assignments,
 * and allows invigilators to edit candidate metadata or clear individual warnings.
 * Fully responsive and supports Light / Dark / System themes.
 */
import React, { useState } from 'react';
import {
  Users,
  Search,
  CheckCircle,
  Edit2,
  MapPin,
  RefreshCw,
  Trash2,
  Download,
} from 'lucide-react';
import { Candidate } from '../types.js';

interface CandidateListProps {
  candidates: Candidate[];
  onRefresh: () => void;
  onClearWarning: (pId: string) => Promise<void>;
  onUpdateCandidate: (candidate: Candidate) => Promise<void>;
  onClearActivities?: () => Promise<void>;
  onClearCandidates?: () => Promise<void>;
  onDeleteCandidate?: (candidateId: string) => Promise<void>;
  onOpenExport?: () => void;
}

export const CandidateList: React.FC<CandidateListProps> = ({
  candidates,
  onRefresh,
  onClearWarning,
  onUpdateCandidate,
  onClearActivities,
  onClearCandidates,
  onDeleteCandidate,
  onOpenExport,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [warningFilter, setWarningFilter] = useState<string>('all');
  const [editingCandidate, setEditingCandidate] = useState<Candidate | null>(null);
  const [editName, setEditName] = useState<string>('');
  const [editSeat, setEditSeat] = useState<string>('');
  const [editNotes, setEditNotes] = useState<string>('');
  const [isClearingActivities, setIsClearingActivities] = useState<boolean>(false);
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);
  const [isClearingCandidates, setIsClearingCandidates] = useState<boolean>(false);
  const [showClearCandidatesConfirm, setShowClearCandidatesConfirm] = useState<boolean>(false);

  const handleClearAllActivities = async () => {
    if (!onClearActivities) return;
    setIsClearingActivities(true);
    try {
      await onClearActivities();
      setShowClearConfirm(false);
    } finally {
      setIsClearingActivities(false);
    }
  };

  const handleClearAllCandidates = async () => {
    if (!onClearCandidates) return;
    setIsClearingCandidates(true);
    try {
      await onClearCandidates();
      setShowClearCandidatesConfirm(false);
    } finally {
      setIsClearingCandidates(false);
    }
  };

  const filteredCandidates = candidates.filter((c) => {
    const candidateId = c.id || (c as any).pId || '';
    const candidateName = c.studentName || c.name || '';
    const candidateSeat = c.seatNumber || '';

    if (warningFilter !== 'all' && c.warningLevel !== warningFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchesPid = candidateId.toLowerCase().includes(q);
      const matchesName = candidateName.toLowerCase().includes(q);
      const matchesSeat = candidateSeat.toLowerCase().includes(q);
      if (!matchesPid && !matchesName && !matchesSeat) return false;
    }
    return true;
  });

  const handleStartEdit = (candidate: Candidate) => {
    setEditingCandidate(candidate);
    setEditName(candidate.studentName || candidate.name || '');
    setEditSeat(candidate.seatNumber || '');
    setEditNotes(candidate.notes || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCandidate) return;

    await onUpdateCandidate({
      ...editingCandidate,
      studentName: editName.trim() || undefined,
      name: editName.trim() || undefined,
      seatNumber: editSeat.trim() || undefined,
      notes: editNotes.trim() || undefined,
    });

    setEditingCandidate(null);
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 py-6 space-y-6 min-w-0">
      {/* Header & Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight flex items-center gap-2 text-neutral-900 dark:text-white">
            <Users className="w-5 h-5 text-blue-500" />
            <span>Tracked Candidates Roster</span>
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            Confirmed persons tracked across video frames with associated seat allocations and activity scores.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {onClearCandidates && (
            <>
              {showClearCandidatesConfirm ? (
                <div className="flex items-center gap-1.5 p-1 rounded-lg text-xs bg-red-50 border border-red-200 dark:bg-red-950/90 dark:border-red-800">
                  <span className="text-red-800 dark:text-red-200 font-medium px-1">Delete ALL candidates?</span>
                  <button
                    type="button"
                    onClick={handleClearAllCandidates}
                    disabled={isClearingCandidates}
                    className="cursor-pointer px-2 py-0.5 rounded bg-red-600 hover:bg-red-500 text-white font-semibold text-[11px] transition-colors"
                  >
                    {isClearingCandidates ? 'Deleting...' : 'Confirm'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowClearCandidatesConfirm(false)}
                    className="cursor-pointer px-2 py-0.5 rounded text-[11px] transition-colors bg-neutral-200 hover:bg-neutral-300 text-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-300"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowClearCandidatesConfirm(true)}
                  className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 bg-red-50 border-red-200 text-red-700 hover:bg-red-100 dark:bg-red-600/20 dark:border-red-600/50 dark:text-red-300 dark:hover:bg-red-600 dark:hover:text-white"
                  title="Delete all tracked candidates from roster when exam ends"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-500 dark:text-red-400" />
                  <span>Delete All Candidates</span>
                </button>
              )}
            </>
          )}

          {onClearActivities && (
            <>
              {showClearConfirm ? (
                <div className="flex items-center gap-1.5 p-1 rounded-lg text-xs bg-red-50 border border-red-200 dark:bg-red-950/80 dark:border-red-800/80">
                  <span className="text-red-800 dark:text-red-200 px-1 font-medium">Clear all activities?</span>
                  <button
                    type="button"
                    onClick={handleClearAllActivities}
                    disabled={isClearingActivities}
                    className="cursor-pointer px-2 py-0.5 rounded bg-red-600 hover:bg-red-500 text-white font-medium text-[11px] transition-colors"
                  >
                    {isClearingActivities ? 'Clearing...' : 'Confirm'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowClearConfirm(false)}
                    className="cursor-pointer px-2 py-0.5 rounded text-[11px] transition-colors bg-neutral-200 hover:bg-neutral-300 text-neutral-700 dark:bg-neutral-800 dark:hover:bg-neutral-700 dark:text-neutral-300"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(true)}
                  className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 bg-white border-neutral-300 text-neutral-700 hover:bg-neutral-50 dark:bg-neutral-900 dark:border-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white"
                  title="Clear all recorded activities from history"
                >
                  <Trash2 className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
                  <span>Clear Activities</span>
                </button>
              )}
            </>
          )}

          <button
            type="button"
            onClick={onRefresh}
            className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 bg-white border-neutral-300 text-neutral-700 hover:bg-neutral-50 dark:bg-neutral-900 dark:border-neutral-800 dark:text-neutral-300 dark:hover:text-white dark:hover:bg-neutral-800"
            title="Refresh and pull active candidates"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>

          {onOpenExport && (
            <button
              type="button"
              onClick={onOpenExport}
              className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 text-neutral-950 hover:bg-emerald-400 text-xs font-semibold transition-colors shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
              title="Export candidate scores and roster to CSV or JSON"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Roster & Scores</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 transition-colors bg-white/90 border-neutral-200 shadow-sm dark:bg-neutral-900/80 dark:border-neutral-800">
        <div className="flex items-center gap-2 w-full sm:w-72">
          <div className="relative w-full">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-neutral-400 dark:text-neutral-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by P-ID, Name, or Seat..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-400 bg-neutral-50 border border-neutral-300 text-neutral-900 dark:bg-neutral-950 dark:border-neutral-800 dark:text-neutral-200 dark:placeholder-neutral-500"
            />
          </div>
        </div>

        {/* Status Filter Buttons */}
        <div className="flex items-center gap-1.5 p-1 rounded-lg border text-xs bg-neutral-100 border-neutral-200 dark:bg-neutral-950 dark:border-neutral-800 flex-wrap">
          <button
            type="button"
            onClick={() => setWarningFilter('all')}
            className={`cursor-pointer px-3 py-1 rounded-md font-medium transition-all ${
              warningFilter === 'all'
                ? 'bg-white text-neutral-900 shadow-sm font-semibold dark:bg-neutral-800 dark:text-white'
                : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200'
            }`}
          >
            All ({candidates.length})
          </button>
          <button
            type="button"
            onClick={() => setWarningFilter('normal')}
            className={`cursor-pointer px-3 py-1 rounded-md font-medium transition-all ${
              warningFilter === 'normal'
                ? 'bg-white text-neutral-900 shadow-sm font-semibold dark:bg-neutral-800 dark:text-white'
                : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200'
            }`}
          >
            Normal
          </button>
          <button
            type="button"
            onClick={() => setWarningFilter('warning')}
            className={`cursor-pointer px-3 py-1 rounded-md font-medium transition-all ${
              warningFilter === 'warning'
                ? 'bg-amber-100 text-amber-900 border border-amber-300 font-semibold dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800'
                : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200'
            }`}
          >
            Warning
          </button>
          <button
            type="button"
            onClick={() => setWarningFilter('high')}
            className={`cursor-pointer px-3 py-1 rounded-md font-medium transition-all ${
              warningFilter === 'high'
                ? 'bg-red-100 text-red-900 border border-red-300 font-semibold dark:bg-red-950 dark:text-red-100 dark:border-red-800'
                : 'text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-200'
            }`}
          >
            High Warning
          </button>
        </div>
      </div>

      {/* Candidate Cards Grid */}
      {filteredCandidates.length === 0 ? (
        <div className="rounded-xl py-16 text-center text-neutral-500 space-y-2 border transition-colors bg-white/70 border-neutral-200 dark:bg-neutral-900/40 dark:border-neutral-800">
          <Users className="w-10 h-10 mx-auto text-neutral-400 dark:text-neutral-600 stroke-1" />
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">No candidates found</p>
          <p className="text-xs text-neutral-500 max-w-sm mx-auto">
            Candidates are registered when humans are tracked in the CCTV video.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 min-w-0">
          {filteredCandidates.map((c) => {
            const isHigh = c.warningLevel === 'high';
            const isWarn = c.warningLevel === 'warning';
            const candidateId = c.id || (c as any).pId || 'P-?';
            const displayName = c.studentName || c.name || `Candidate ${candidateId}`;
            const displayScore = c.currentScore ?? c.score ?? 0;
            const isTracked = c.isCurrentlyTracked ?? c.activeInFrame ?? false;

            return (
              <div
                key={candidateId}
                className={`rounded-xl border p-4 transition-all space-y-3.5 relative overflow-hidden shadow-sm min-w-0 ${
                  isHigh
                    ? 'bg-red-50/50 border-red-300 dark:bg-neutral-900/90 dark:border-red-500/80 dark:shadow-red-950/40'
                    : isWarn
                    ? 'bg-amber-50/40 border-amber-300 dark:bg-neutral-900/90 dark:border-amber-500/70'
                    : 'bg-white border-neutral-200 dark:bg-neutral-900/70 dark:border-neutral-800'
                }`}
              >
                {/* Top card bar */}
                <div className="flex items-start justify-between gap-3 min-w-0">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center font-mono font-bold text-base border shrink-0 ${
                        isHigh
                          ? 'bg-red-100 border-red-300 text-red-900 dark:bg-red-950/80 dark:border-red-600 dark:text-red-100'
                          : isWarn
                          ? 'bg-amber-100 border-amber-300 text-amber-900 dark:bg-amber-950/80 dark:border-amber-600 dark:text-amber-200'
                          : 'bg-neutral-100 border-neutral-300 text-neutral-900 dark:bg-neutral-800 dark:border-neutral-700 dark:text-white'
                      }`}
                    >
                      {candidateId}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-semibold text-sm truncate text-neutral-900 dark:text-white">
                        {displayName}
                      </h3>
                      <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                        <span className="flex items-center gap-1 truncate">
                          <MapPin className="w-3 h-3 text-neutral-400 dark:text-neutral-500 shrink-0" />
                          <span className="truncate">{c.seatNumber || 'Desk Unassigned'}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Warning Badge */}
                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider border select-none shrink-0 ${
                      isHigh
                        ? 'bg-red-600 text-white border-red-700 dark:bg-red-950 dark:text-red-100 dark:border-red-500 shadow-sm'
                        : isWarn
                        ? 'bg-amber-500 text-neutral-950 border-amber-600 dark:bg-amber-950/90 dark:text-amber-200 dark:border-amber-500/70'
                        : 'bg-neutral-100 text-neutral-700 border-neutral-300 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700'
                    }`}
                  >
                    {isHigh && <span className="w-1.5 h-1.5 rounded-full bg-white dark:bg-red-400 animate-ping" />}
                    <span>{c.warningLevel}</span>
                  </span>
                </div>

                {/* Activity Score Progress Bar */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-neutral-500 dark:text-neutral-400 font-medium">Activity Score:</span>
                    <span className="font-mono font-bold text-sm text-neutral-900 dark:text-white">
                      {displayScore} <span className="text-neutral-400 dark:text-neutral-500 text-xs font-normal">/ 100</span>
                    </span>
                  </div>
                  <div className="w-full h-2 rounded-full overflow-hidden border bg-neutral-200 border-neutral-300 dark:bg-neutral-950 dark:border-neutral-800">
                    <div
                      style={{ width: `${Math.min(displayScore, 100)}%` }}
                      className={`h-full rounded-full transition-all duration-300 ${
                        isHigh
                          ? 'bg-red-500 shadow-sm'
                          : isWarn
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      }`}
                    />
                  </div>
                </div>

                {/* Details & Observable Activities */}
                <div className="text-xs space-y-1.5 p-2.5 rounded-lg border bg-neutral-50/80 border-neutral-200 dark:bg-neutral-950/60 dark:border-neutral-800/80">
                  <div className="flex items-center justify-between gap-2 text-neutral-500 dark:text-neutral-400">
                    <span className="shrink-0">Observation:</span>
                    <span className="font-medium truncate text-neutral-800 dark:text-neutral-200">
                      {c.lastActivity || 'None recorded'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400">
                    <span>Tracking:</span>
                    <span
                      className={`font-medium ${
                        isTracked ? 'text-emerald-600 dark:text-emerald-400' : 'text-neutral-400 dark:text-neutral-500'
                      }`}
                    >
                      {isTracked ? '● Active in feed' : '○ Standby'}
                    </span>
                  </div>
                </div>

                {/* Actions Bar */}
                <div className="flex items-center justify-between pt-1 border-t border-neutral-200 dark:border-neutral-800 gap-1">
                  <div className="flex items-center gap-1">
                    {/* Edit details */}
                    <button
                      type="button"
                      onClick={() => handleStartEdit(c)}
                      className="cursor-pointer flex items-center gap-1.5 text-xs px-2 py-1 rounded transition-colors text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:text-white dark:hover:bg-neutral-800"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>Edit</span>
                    </button>

                    {/* Delete candidate */}
                    {onDeleteCandidate && (
                      <button
                        type="button"
                        onClick={() => onDeleteCandidate(candidateId)}
                        className="cursor-pointer flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors text-neutral-400 hover:text-red-600 hover:bg-red-50 dark:text-neutral-500 dark:hover:text-red-400 dark:hover:bg-neutral-800"
                        title="Delete candidate from roster"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>Delete</span>
                      </button>
                    )}
                  </div>

                  {/* Clear Warning Button */}
                  <button
                    type="button"
                    onClick={() => onClearWarning(candidateId)}
                    className="cursor-pointer flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium border transition-colors bg-neutral-100 text-neutral-800 hover:bg-neutral-200 border-neutral-300 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700 dark:hover:text-white dark:border-neutral-700"
                    title="Clears current warning status for this candidate"
                  >
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Clear Warning</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Candidate Modal */}
      {editingCandidate && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-md rounded-2xl p-5 space-y-4 shadow-2xl border transition-colors bg-white border-neutral-200 text-neutral-900 dark:bg-neutral-900 dark:border-neutral-800 dark:text-neutral-200">
            <div className="flex items-center justify-between border-b pb-3 border-neutral-200 dark:border-neutral-800">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-white">
                Edit Candidate {editingCandidate.id || (editingCandidate as any).pId} Details
              </h3>
              <button
                type="button"
                onClick={() => setEditingCandidate(null)}
                className="cursor-pointer text-xs p-1 text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-neutral-600 dark:text-neutral-400 mb-1">Student / Candidate Name:</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="e.g. John Smith"
                  className="w-full rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-neutral-400 bg-neutral-50 border border-neutral-300 text-neutral-900 dark:bg-neutral-950 dark:border-neutral-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-neutral-600 dark:text-neutral-400 mb-1">Assigned Seat / Desk Number:</label>
                <input
                  type="text"
                  value={editSeat}
                  onChange={(e) => setEditSeat(e.target.value)}
                  placeholder="e.g. Desk A-14"
                  className="w-full rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-neutral-400 bg-neutral-50 border border-neutral-300 text-neutral-900 dark:bg-neutral-950 dark:border-neutral-800 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-neutral-600 dark:text-neutral-400 mb-1">Supervisor Notes:</label>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Observational notes from manual teacher review..."
                  rows={3}
                  className="w-full rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-neutral-400 resize-none bg-neutral-50 border border-neutral-300 text-neutral-900 dark:bg-neutral-950 dark:border-neutral-800 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingCandidate(null)}
                  className="cursor-pointer px-3 py-2 rounded-lg text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="cursor-pointer px-4 py-2 rounded-lg font-semibold transition-colors bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-950 dark:hover:bg-white"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
