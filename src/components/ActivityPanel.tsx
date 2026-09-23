/**
 * src/components/ActivityPanel.tsx - Observed Activity Audit Log Component
 * Displays a timeline table of recorded activity events with filtering by Candidate P-ID,
 * Activity Type, Camera, or Warning Level, plus CSV export and clear log capabilities.
 * Fully responsive and supports Light / Dark / System themes.
 */
import React, { useState, useMemo } from 'react';
import {
  Activity,
  Filter,
  Search,
  Download,
  Camera,
  RefreshCw,
  Clock,
  Trash2,
} from 'lucide-react';
import { ActivityRecord, CameraSource, ActivityTypeConfig } from '../types.js';

interface ActivityPanelProps {
  activities: ActivityRecord[];
  cameras: CameraSource[];
  activityTypes: ActivityTypeConfig[];
  onRefresh: () => void;
  onClearActivities?: () => Promise<void>;
  onDeleteActivity?: (id: string) => Promise<void>;
  onOpenExport?: () => void;
}

export const ActivityPanel: React.FC<ActivityPanelProps> = ({
  activities,
  cameras,
  activityTypes,
  onRefresh,
  onClearActivities,
  onDeleteActivity,
  onOpenExport,
}) => {
  const [selectedPid, setSelectedPid] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedWarning, setSelectedWarning] = useState<string>('all');
  const [selectedCamera, setSelectedCamera] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isClearing, setIsClearing] = useState<boolean>(false);
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleDeleteActivity = async (id: string) => {
    if (!onDeleteActivity) return;
    if (!confirm('Are you sure you want to delete this activity record from the database?')) return;
    setDeletingId(id);
    try {
      await onDeleteActivity(id);
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearActivities = async () => {
    if (!onClearActivities) return;
    setIsClearing(true);
    try {
      await onClearActivities();
      setShowClearConfirm(false);
    } finally {
      setIsClearing(false);
    }
  };

  // Extract unique P-IDs for filter dropdown
  const uniquePids = useMemo(() => {
    const set = new Set<string>();
    activities.forEach((a) => set.add(a.pId));
    return Array.from(set).sort((a, b) => {
      const numA = parseInt(a.replace('P-', ''), 10) || 0;
      const numB = parseInt(b.replace('P-', ''), 10) || 0;
      return numA - numB;
    });
  }, [activities]);

  // Filtered activities
  const filteredActivities = useMemo(() => {
    return activities.filter((act) => {
      if (selectedPid !== 'all' && act.pId !== selectedPid) return false;
      if (selectedType !== 'all' && act.activityType !== selectedType) return false;
      if (selectedWarning !== 'all' && act.warningLevel !== selectedWarning) return false;
      if (selectedCamera !== 'all' && act.cameraId !== selectedCamera) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesPid = act.pId.toLowerCase().includes(q);
        const matchesType = act.activityType.toLowerCase().includes(q);
        const matchesDetails = act.details.toLowerCase().includes(q);
        if (!matchesPid && !matchesType && !matchesDetails) return false;
      }
      return true;
    });
  }, [activities, selectedPid, selectedType, selectedWarning, selectedCamera, searchQuery]);

  const handleExportCsv = () => {
    if (filteredActivities.length === 0) return;

    const headers = ['P-ID', 'Activity Details', 'Score Change', 'Score After', 'Warning Level', 'Time', 'Camera ID'];
    const rows = filteredActivities.map((a) => [
      a.pId,
      `"${a.activityType} - ${a.details.replace(/"/g, '""')}"`,
      `+${a.scoreChange}`,
      a.scoreAfter,
      a.warningLevel,
      a.timeDisplay,
      a.cameraName || a.cameraId,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `exam_hall_activities_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="w-full max-w-7xl mx-auto px-3 sm:px-6 py-6 space-y-6 min-w-0">
      {/* Header & Overview */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight flex items-center gap-2 text-neutral-900 dark:text-white">
            <Activity className="w-5 h-5 text-emerald-500" />
            <span>Activity History & Event Observations</span>
          </h2>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
            Chronological record of observable movements and events confirmed across temporal video frames.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {onClearActivities && (
            <>
              {showClearConfirm ? (
                <div className="flex items-center gap-1.5 p-1 rounded-lg text-xs bg-red-50 border border-red-200 dark:bg-red-950/80 dark:border-red-800/80">
                  <span className="text-red-800 dark:text-red-200 px-1 font-medium">Clear all?</span>
                  <button
                    type="button"
                    onClick={handleClearActivities}
                    disabled={isClearing}
                    className="cursor-pointer px-2 py-0.5 rounded bg-red-600 hover:bg-red-500 text-white font-medium text-[11px] transition-colors"
                  >
                    {isClearing ? 'Clearing...' : 'Confirm'}
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
                  disabled={activities.length === 0}
                  className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-all disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 bg-red-50 border-red-200 text-red-700 hover:bg-red-100 dark:bg-red-950/40 dark:border-red-900/60 dark:text-red-300 dark:hover:bg-red-900/60 dark:hover:text-white"
                  title="Clear all recorded activities from history"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear All</span>
                </button>
              )}
            </>
          )}

          <button
            type="button"
            onClick={onRefresh}
            className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 bg-white border-neutral-300 text-neutral-700 hover:bg-neutral-50 dark:bg-neutral-900 dark:border-neutral-800 dark:text-neutral-300 dark:hover:text-white dark:hover:bg-neutral-800"
            title="Refresh active candidates & activities"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (onOpenExport) {
                onOpenExport();
              } else {
                handleExportCsv();
              }
            }}
            disabled={filteredActivities.length === 0}
            className="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 text-neutral-950 hover:bg-emerald-400 text-xs font-semibold transition-colors disabled:opacity-50 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
            title="Export activity logs and candidate scores to CSV or JSON"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Report</span>
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="p-3.5 rounded-xl border space-y-3 transition-colors bg-white/90 border-neutral-200 shadow-sm dark:bg-neutral-900/80 dark:border-neutral-800">
        <div className="flex items-center gap-2 text-xs font-semibold text-neutral-700 dark:text-neutral-300">
          <Filter className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
          <span>Filters & Search</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {/* Search Query */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-neutral-400 dark:text-neutral-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search activity or P-ID..."
              className="w-full pl-8 pr-3 py-1.5 rounded-lg text-xs placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-neutral-400 bg-neutral-50 border border-neutral-300 text-neutral-900 dark:bg-neutral-950 dark:border-neutral-800 dark:text-neutral-200 dark:placeholder-neutral-500"
            />
          </div>

          {/* Filter by Candidate P-ID */}
          <div>
            <select
              value={selectedPid}
              onChange={(e) => setSelectedPid(e.target.value)}
              className="cursor-pointer w-full px-2.5 py-1.5 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-neutral-400 bg-neutral-50 border border-neutral-300 text-neutral-900 dark:bg-neutral-950 dark:border-neutral-800 dark:text-neutral-200"
            >
              <option value="all">All Candidates (P-IDs)</option>
              {uniquePids.map((pid) => (
                <option key={pid} value={pid}>
                  Candidate {pid}
                </option>
              ))}
            </select>
          </div>

          {/* Filter by Activity Type */}
          <div>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="cursor-pointer w-full px-2.5 py-1.5 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-neutral-400 bg-neutral-50 border border-neutral-300 text-neutral-900 dark:bg-neutral-950 dark:border-neutral-800 dark:text-neutral-200"
            >
              <option value="all">All Activity Types</option>
              {activityTypes.map((type) => (
                <option key={type.id} value={type.name}>
                  {type.name}
                </option>
              ))}
            </select>
          </div>

          {/* Filter by Warning Level */}
          <div>
            <select
              value={selectedWarning}
              onChange={(e) => setSelectedWarning(e.target.value)}
              className="cursor-pointer w-full px-2.5 py-1.5 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-neutral-400 bg-neutral-50 border border-neutral-300 text-neutral-900 dark:bg-neutral-950 dark:border-neutral-800 dark:text-neutral-200"
            >
              <option value="all">All Warning Levels</option>
              <option value="normal">Normal</option>
              <option value="warning">Warning (Amber)</option>
              <option value="high">High Warning (Red)</option>
            </select>
          </div>

          {/* Filter by Camera */}
          <div>
            <select
              value={selectedCamera}
              onChange={(e) => setSelectedCamera(e.target.value)}
              className="cursor-pointer w-full px-2.5 py-1.5 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-neutral-400 bg-neutral-50 border border-neutral-300 text-neutral-900 dark:bg-neutral-950 dark:border-neutral-800 dark:text-neutral-200"
            >
              <option value="all">All Cameras</option>
              {cameras.map((cam) => (
                <option key={cam.id} value={cam.id}>
                  {cam.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Activity Table Container */}
      <div className="rounded-xl overflow-hidden border shadow-sm transition-colors bg-white/90 border-neutral-200 dark:bg-neutral-900/60 dark:border-neutral-800 min-w-0">
        {filteredActivities.length === 0 ? (
          <div className="py-16 text-center text-neutral-500 space-y-2">
            <Activity className="w-10 h-10 mx-auto text-neutral-400 dark:text-neutral-600 stroke-1" />
            <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">No activities recorded yet</p>
            <p className="text-xs text-neutral-500 max-w-sm mx-auto">
              As the teacher observes the live video, computer vision will record observable activities and display them here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-xs min-w-[700px]">
              <thead className="border-b font-medium select-none bg-neutral-50 text-neutral-600 border-neutral-200 dark:bg-neutral-950/80 dark:border-neutral-800 dark:text-neutral-400">
                <tr>
                  <th className="py-3 px-4 w-20">P-ID</th>
                  <th className="py-3 px-4">Observable Activity</th>
                  <th className="py-3 px-4 w-28">Score Change</th>
                  <th className="py-3 px-4 w-36">Resulting Score</th>
                  <th className="py-3 px-4 w-32">Warning Level</th>
                  <th className="py-3 px-4 w-32">Time</th>
                  <th className="py-3 px-4 w-32">Camera Source</th>
                  {onDeleteActivity && <th className="py-3 px-4 w-16 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200 dark:divide-neutral-800/60 text-neutral-700 dark:text-neutral-300 font-normal">
                {filteredActivities.map((act) => {
                  const isHigh = act.warningLevel === 'high';
                  const isWarn = act.warningLevel === 'warning';

                  return (
                    <tr
                      key={act.id}
                      className="hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors duration-100"
                    >
                      {/* P-ID */}
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded font-mono font-bold text-[11px] bg-neutral-100 text-neutral-900 border border-neutral-300 dark:bg-neutral-800 dark:text-white dark:border-neutral-700">
                          {act.pId}
                        </span>
                      </td>

                      {/* Details */}
                      <td className="py-3 px-4 min-w-[200px]">
                        <div className="font-medium text-neutral-900 dark:text-white text-[13px]">{act.activityType}</div>
                        <div className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5 break-words">{act.details}</div>
                      </td>

                      {/* Score Change */}
                      <td className="py-3 px-4">
                        <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                          +{act.scoreChange}
                        </span>
                      </td>

                      {/* Resulting Score */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-medium">{act.scoreAfter}/100</span>
                          <div className="w-16 h-1.5 rounded-full bg-neutral-200 dark:bg-neutral-800 overflow-hidden">
                            <div
                              style={{ width: `${Math.min(100, act.scoreAfter)}%` }}
                              className={`h-full rounded-full ${
                                isHigh
                                  ? 'bg-red-500'
                                  : isWarn
                                  ? 'bg-amber-400'
                                  : 'bg-emerald-400'
                              }`}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Warning Level Badge */}
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                            isHigh
                              ? 'bg-red-50 text-red-800 border-red-300 dark:bg-red-950/80 dark:text-red-200 dark:border-red-500/80 shadow-sm'
                              : isWarn
                              ? 'bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/80 dark:text-amber-200 dark:border-amber-500/70'
                              : 'bg-neutral-100 text-neutral-700 border-neutral-300 dark:bg-neutral-800 dark:text-neutral-300 dark:border-neutral-700'
                          }`}
                        >
                          {isHigh && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />}
                          <span className="capitalize">{act.warningLevel}</span>
                        </span>
                      </td>

                      {/* Timestamp */}
                      <td className="py-3 px-4 font-mono text-neutral-500 dark:text-neutral-400">
                        <div className="flex items-center gap-1 whitespace-nowrap">
                          <Clock className="w-3 h-3 text-neutral-400 dark:text-neutral-500" />
                          <span>{act.timeDisplay}</span>
                        </div>
                      </td>

                      {/* Camera */}
                      <td className="py-3 px-4 text-neutral-500 dark:text-neutral-400">
                        <div className="flex items-center gap-1.5 whitespace-nowrap">
                          <Camera className="w-3 h-3 text-neutral-400 dark:text-neutral-500" />
                          <span>{act.cameraName || act.cameraId}</span>
                        </div>
                      </td>

                      {/* Delete Action */}
                      {onDeleteActivity && (
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => handleDeleteActivity(act.id)}
                            disabled={deletingId === act.id}
                            className="cursor-pointer p-1 text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded transition-colors disabled:opacity-50"
                            title="Delete activity record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer info */}
        <div className="px-4 py-3 border-t text-[11px] flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-neutral-500 bg-neutral-50 border-neutral-200 dark:bg-neutral-950/80 dark:border-neutral-800 dark:text-neutral-400">
          <span>Showing {filteredActivities.length} of {activities.length} recorded events</span>
          <span>Observations recorded for supervisor manual verification</span>
        </div>
      </div>
    </div>
  );
};
