import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

const LEVEL_COLORS = {
  debug: 'bg-slate-100 text-slate-500',
  info: 'bg-blue-100 text-blue-700',
  warning: 'bg-amber-100 text-amber-700',
  error: 'bg-red-100 text-red-700',
};

function parseMetadata(metadata) {
  if (!metadata) return null;
  if (typeof metadata === 'object') return metadata;
  try {
    return JSON.parse(metadata);
  } catch {
    return { raw: metadata };
  }
}

function metadataSummary(metadata) {
  if (!metadata) return '';
  if (metadata.error) return String(metadata.error);
  if (metadata.errorMessage) return String(metadata.errorMessage);
  if (metadata.status || metadata.statusCode) return `status ${metadata.status || metadata.statusCode}`;
  return '';
}

function LogRow({ log }) {
  const metadata = parseMetadata(log.metadata);
  const [open, setOpen] = useState(log.level === 'error');
  const summary = metadataSummary(metadata);

  return (
    <div className={`rounded-md border px-2 py-2 text-xs ${log.level === 'error' ? 'border-red-100 bg-red-50/50' : 'border-slate-100 bg-white'}`}>
      <div className="grid gap-2 lg:grid-cols-[9rem_4.5rem_minmax(0,1fr)_auto] lg:items-start">
        <span className="text-slate-400">{new Date(log.createdAt).toLocaleString()}</span>
        <span className={`w-fit rounded px-1.5 py-0.5 font-medium ${LEVEL_COLORS[log.level] || 'bg-slate-100 text-slate-600'}`}>{log.level}</span>
        <div className="min-w-0">
          <p className="break-words text-slate-700">{log.message}</p>
          {summary && <p className="mt-1 break-words font-medium text-red-700">{summary}</p>}
          {log.executionId && <p className="mt-1 break-all font-mono text-[11px] text-slate-400">execution: {log.executionId}</p>}
        </div>
        {metadata && (
          <button type="button" onClick={() => setOpen((value) => !value)} className="text-xs font-medium text-[#306cb4] hover:underline">
            {open ? 'Hide details' : 'Details'}
          </button>
        )}
      </div>
      {metadata && open && (
        <pre className="mt-2 max-h-64 overflow-auto rounded border border-slate-200 bg-white p-2 text-[11px] leading-5 text-slate-700">
          {JSON.stringify(metadata, null, 2)}
        </pre>
      )}
    </div>
  );
}

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
        <p className="text-sm text-slate-500">Loading logs...</p>
      ) : logs.length === 0 ? (
        <p className="text-sm text-slate-500">No logs yet.</p>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {logs.map((log) => <LogRow key={log.id} log={log} />)}
        </div>
      )}
    </div>
  );
}
