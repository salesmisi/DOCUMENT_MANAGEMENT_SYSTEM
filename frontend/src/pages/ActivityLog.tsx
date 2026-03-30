import React, { useState, useRef, useEffect } from 'react';
import { formatDate } from '../utils/locale';
import { Activity, Download, Search, Filter, Clock, FileSpreadsheet, FileText, ChevronDown } from 'lucide-react';
import { useDocuments } from '../context/DocumentContext';
import { AutocompleteSearch } from '../components/AutocompleteSearch';
import { useNotifications } from '../context/NotificationContext';
export function ActivityLog() {
  const { activityLogs, refreshLogs } = useDocuments();
  const { deleteNotificationsByType } = useNotifications();
  const [search, setSearch] = useState('');
  const [filterAction, setFilterAction] = useState('all');
  const [filterRole, setFilterRole] = useState('all');
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleExport = async (format: 'excel' | 'pdf') => {
    setExportOpen(false);
    try {
      const token = localStorage.getItem('dms_token');
      const endpoint = format === 'pdf' ? 'download-pdf' : 'download';
      const res = await fetch(`http://localhost:5000/api/activity-logs/${endpoint}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const ext = format === 'pdf' ? 'pdf' : 'xlsx';
      a.download = `Activity_Logs_${new Date().toISOString().split('T')[0]}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);

      // After successful download, archive the logs
      await fetch('http://localhost:5000/api/activity-logs/download-and-archive', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });

      // Delete any activity-log-export notifications
      await deleteNotificationsByType('activity-log-export');

      // Refresh the logs to show cleared state
      if (refreshLogs) {
        await refreshLogs();
      }
    } catch (err) {
      console.error('Export failed:', err);
    }
  };
  const filtered = activityLogs.filter((log) => {
    const matchSearch =
    !search ||
    log.userName.toLowerCase().includes(search.toLowerCase()) ||
    log.target.toLowerCase().includes(search.toLowerCase()) ||
    log.action.toLowerCase().includes(search.toLowerCase());
    const matchAction =
    filterAction === 'all' || log.action.includes(filterAction.toUpperCase());
    const matchRole = filterRole === 'all' || log.userRole === filterRole;
    return matchSearch && matchAction && matchRole;
  });
  const logSuggestions = React.useMemo(() =>
    activityLogs.flatMap((log) => [log.userName, log.target]).filter(Boolean),
    [activityLogs]
  );
  const actionColors: Record<string, string> = {
    DOCUMENT_UPLOAD: 'bg-blue-100 text-blue-700',
    DOCUMENT_APPROVED: 'bg-green-100 text-green-700',
    DOCUMENT_REJECTED: 'bg-red-100 text-red-700',
    DOCUMENT_DOWNLOAD: 'bg-purple-100 text-purple-700',
    DOCUMENT_ARCHIVED: 'bg-orange-100 text-orange-700',
    DOCUMENT_TRASHED: 'bg-red-100 text-red-600',
    DOCUMENT_RESTORED: 'bg-teal-100 text-teal-700',
    DOCUMENT_PERMANENTLY_DELETED: 'bg-red-200 text-red-800',
    FOLDER_CREATED: 'bg-blue-100 text-blue-700',
    FOLDER_DELETED: 'bg-red-100 text-red-600',
    USER_CREATED: 'bg-blue-100 text-blue-700',
    USER_DELETED: 'bg-red-100 text-red-700',
    CREATE_DEPARTMENT: 'bg-blue-100 text-blue-700',
    DEPARTMENT_DELETED: 'bg-red-100 text-red-700',
    USER_LOGIN: 'bg-gray-100 text-gray-600',
    USER_LOGOUT: 'bg-orange-100 text-orange-700',
    USER_UPDATED: 'bg-indigo-100 text-indigo-700',
    SCAN_DOCUMENT: 'bg-cyan-100 text-cyan-700'
  };
  const formatTimestamp = (ts: string) => formatDate(ts, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const roleColors: Record<string, string> = {
    admin: 'bg-yellow-100 text-yellow-800',
    manager: 'bg-blue-100 text-blue-800',
    staff: 'bg-gray-100 text-gray-700'
  };
  const actionTypes = [
  {
    value: 'all',
    label: 'All Actions'
  },
  {
    value: 'UPLOAD',
    label: 'Uploads'
  },
  {
    value: 'APPROVED',
    label: 'Approvals'
  },
  {
    value: 'REJECTED',
    label: 'Rejections'
  },
  {
    value: 'DOWNLOAD',
    label: 'Downloads'
  },
  {
    value: 'ARCHIVED',
    label: 'Archives'
  },
  {
    value: 'DELETED',
    label: 'Deletions'
  },
  {
    value: 'LOGIN',
    label: 'Logins'
  },
  {
    value: 'LOGOUT',
    label: 'Logouts'
  },
  {
    value: 'USER_UPDATED',
    label: 'User Updates'
  }];

  return (
    <div className="space-y-6">
      <div className="bg-[#005F02] rounded-2xl p-6 text-white flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-1 flex items-center gap-3">
            <Activity size={28} />
            Activity Log
          </h2>
          <p className="text-[#C0B87A] text-sm">
            Complete audit trail — {activityLogs.length} entries
          </p>
        </div>
        <div className="relative" ref={exportRef}>
          <button
            onClick={() => setExportOpen(!exportOpen)}
            className="flex items-center gap-2 px-4 py-2 bg-[#C0B87A] text-[#005F02] text-sm font-semibold rounded-xl hover:bg-[#F2E3BB] transition-colors">
            <Download size={16} />
            Export
            <ChevronDown size={14} />
          </button>
          {exportOpen && (
            <div className="absolute right-0 mt-2 w-44 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-50">
              <button
                onClick={() => handleExport('excel')}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-green-50 transition-colors">
                <FileSpreadsheet size={16} className="text-green-600" />
                Export as Excel
              </button>
              <button
                onClick={() => handleExport('pdf')}
                className="w-full flex items-center gap-3 px-4 py-3 text-sm text-gray-700 hover:bg-red-50 transition-colors border-t border-gray-50">
                <FileText size={16} className="text-red-500" />
                Export as PDF
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <AutocompleteSearch
          value={search}
          onChange={setSearch}
          suggestions={logSuggestions}
          placeholder="Search by user, action, or target..."
          className="bg-white rounded-xl px-4 py-2.5 shadow-sm border border-gray-100 flex-1 min-w-48"
        />
        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value)}
          className="text-sm border border-gray-200 bg-white rounded-xl px-3 py-2.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#427A43] shadow-sm">

          {actionTypes.map((a) =>
          <option key={a.value} value={a.value}>
              {a.label}
            </option>
          )}
        </select>
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value)}
          className="text-sm border border-gray-200 bg-white rounded-xl px-3 py-2.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#427A43] shadow-sm">

          <option value="all">All Roles</option>
          <option value="admin">Admin</option>
          <option value="manager">Manager</option>
          <option value="staff">Staff</option>
        </select>
      </div>

      <p className="text-sm text-gray-500 px-1">
        Showing{' '}
        <span className="font-medium text-gray-700">{filtered.length}</span> of{' '}
        {activityLogs.length} entries
      </p>

      {/* Log Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                Timestamp
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                User
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                Action
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">
                Target
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden xl:table-cell">
                IP Address
              </th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden xl:table-cell">
                Details
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.length === 0 ?
            <tr>
                <td colSpan={6} className="py-12 text-center text-gray-400">
                  <Activity size={40} className="mx-auto mb-3 opacity-30" />
                  <p>No log entries found</p>
                </td>
              </tr> :

            filtered.map((log) =>
            <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Clock size={12} />
                      {formatTimestamp(log.timestamp)}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-medium text-gray-800 text-xs">
                        {log.userName}
                      </p>
                      <span
                    className={`px-1.5 py-0.5 rounded text-xs font-medium capitalize ${roleColors[log.userRole] || 'bg-gray-100 text-gray-600'}`}>

                        {log.userRole}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium ${actionColors[log.action] || 'bg-gray-100 text-gray-600'}`}>

                      {log.action.replace(/_/g, ' ')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs hidden lg:table-cell max-w-48 truncate">
                    {log.target}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs hidden xl:table-cell font-mono">
                    {log.ipAddress}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs hidden xl:table-cell max-w-48 truncate">
                    {log.details || '—'}
                  </td>
                </tr>
            )
            }
          </tbody>
        </table>
      </div>
    </div>);

}