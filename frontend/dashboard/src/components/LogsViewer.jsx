import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import Badge from './Badge.jsx';

const LEVEL_COLORS = {
  debug: 'bg-slate-100 text-slate-500',
  info: 'bg-blue-100 text-blue-700',
  warning: 'bg-amber-100 text-amber-700',
  error: 'bg-red-100 text-red-700',
};

export default function LogsViewer({ integrationId }) {
  const [logs, setLogs] = useState([]);
  const [level, setLevel] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const { logs: rows } = await api.logs.forIntegration(integrationId, { level });
      setLogs(rows);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [integrationId, level]);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <select value={level} onChange={(e) => setLevel(e.target.value)} className="border border-slate-300 rounded px-2 py-1 text-xs">
          <option value="">All levels</option>
          <option value="debug">debug</option>
          <option value="info">info</option>
          <option value="warning">warning</option>
          <option value="error">error</option>
        </select>
        <button onClick={load} className="text-xs text-slate-500 hover:underline">
          Refresh
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {loading ? (
        <p className="text-sm text-slate-500">Loading logs…</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-slate-500">No logs yet.</p>
      ) : (
        <div className="space-y-1 max-h-80 overflow-y-auto">
          {logs.map((log) => (
            <div key={log.id} className="flex items-start gap-2 text-xs border-b border-slate-100 py-1.5">
              <span className="text-slate-400 shrink-0 w-36">{new Date(log.createdAt).toLocaleString()}</span>
              <span className={`shrink-0 px-1.5 py-0.5 rounded font-medium ${LEVEL_COLORS[log.level] || ''}`}>{log.level}</span>
              <span className="text-slate-700 break-words">{log.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
