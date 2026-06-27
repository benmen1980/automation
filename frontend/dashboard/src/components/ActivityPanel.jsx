import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import Badge from './Badge.jsx';

const LEVEL_COLORS = {
  debug: 'bg-slate-100 text-slate-500',
  info: 'bg-blue-100 text-blue-700',
  warning: 'bg-amber-100 text-amber-700',
  error: 'bg-red-100 text-red-700',
};

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : '-';
}

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
  if (metadata.reason === 'invalid_or_missing_priority_bpm_token') {
    return `Priority BPM token rejected. Header checked: ${metadata.providedHeaderName || 'none'}. ${metadata.nextStep || ''}`;
  }
  if (metadata.nextStep) return String(metadata.nextStep);
  if (metadata.error) return String(metadata.error);
  if (metadata.errorMessage) return String(metadata.errorMessage);
  if (metadata.status || metadata.statusCode) return `status ${metadata.status || metadata.statusCode}`;
  return '';
}

function logSummary(log) {
  const metadata = parseMetadata(log.metadata);
  return metadataSummary(metadata) || log.message || '';
}

function firstProblemLog(logs) {
  return logs.find((log) => log.level === 'error') || logs.find((log) => log.level === 'warning');
}

function executionCause(execution, logs) {
  if (execution?.errorMessage) return execution.errorMessage;
  const problemLog = firstProblemLog(logs);
  return problemLog ? logSummary(problemLog) : '';
}

function sortByNewest(a, b) {
  return new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime();
}

function groupLogsByExecution(logs) {
  const grouped = new Map();
  for (const log of logs) {
    if (!log.executionId) continue;
    if (!grouped.has(log.executionId)) grouped.set(log.executionId, []);
    grouped.get(log.executionId).push(log);
  }
  for (const rows of grouped.values()) {
    rows.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }
  return grouped;
}

function buildActivityItems(executions, logs) {
  const logsByExecution = groupLogsByExecution(logs);
  const executionItems = executions.map((execution) => {
    const relatedLogs = logsByExecution.get(execution.id) || [];
    const cause = executionCause(execution, relatedLogs);
    return {
      key: `execution:${execution.id}`,
      type: 'execution',
      id: execution.id,
      execution,
      logs: relatedLogs,
      timestamp: execution.startedAt || execution.createdAt,
      title: `${execution.triggerType || 'run'} ${execution.executionMode || ''}`.trim(),
      status: execution.status,
      cause,
      logCount: relatedLogs.length,
    };
  });

  const rejectedAttemptItems = logs
    .filter((log) => {
      const metadata = parseMetadata(log.metadata);
      return !log.executionId && (metadata?.reason || log.level === 'warning' || log.level === 'error');
    })
    .map((log) => {
      const metadata = parseMetadata(log.metadata);
      return {
        key: `log:${log.id}`,
        type: 'webhook_attempt',
        id: log.id,
        log,
        timestamp: log.createdAt,
        title: metadata?.reason === 'invalid_or_missing_priority_bpm_token' ? 'Rejected webhook attempt' : log.message,
        status: metadata?.status || log.level,
        cause: logSummary(log),
        logCount: 1,
      };
    });

  return [...executionItems, ...rejectedAttemptItems].sort(sortByNewest);
}

function LogLine({ log }) {
  const metadata = parseMetadata(log.metadata);
  const [open, setOpen] = useState(log.level === 'warning');
  const summary = metadataSummary(metadata);
  const summaryColor = log.level === 'warning' ? 'text-amber-700' : 'text-red-700';

  return (
    <div className={`rounded-md border px-2 py-2 text-xs ${log.level === 'error' ? 'border-red-100 bg-red-50/50' : log.level === 'warning' ? 'border-amber-100 bg-amber-50/50' : 'border-slate-100 bg-white'}`}>
      <div className="grid gap-2 lg:grid-cols-[8rem_4.5rem_minmax(0,1fr)_auto] lg:items-start">
        <span className="text-slate-400">{formatDate(log.createdAt)}</span>
        <span className={`w-fit rounded px-1.5 py-0.5 font-medium ${LEVEL_COLORS[log.level] || 'bg-slate-100 text-slate-600'}`}>{log.level}</span>
        <div className="min-w-0">
          <p className="break-words text-slate-700">{log.message}</p>
          {summary && <p className={`mt-1 break-words font-medium ${summaryColor}`}>{summary}</p>}
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

function ActivityRow({ item, selected, onSelect }) {
  const isFailed = item.status === 'failed' || item.status === 'rejected' || item.status === 'error';
  return (
    <button
      type="button"
      onClick={() => onSelect(item.key)}
      className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${selected ? 'border-[#306cb4] bg-[#e9faff]' : 'border-slate-200 bg-white hover:border-[#97dbf3] hover:bg-slate-50'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-800">{item.title}</span>
            <Badge value={item.status || 'unknown'} />
          </div>
          <p className="mt-1 text-xs text-slate-500">{formatDate(item.timestamp)} · {item.type === 'execution' ? `${item.logCount} log events` : 'no execution created'}</p>
          {isFailed && item.cause && <p className="mt-1 break-words text-xs font-medium text-red-700">{item.cause}</p>}
        </div>
        <span className="shrink-0 text-xs font-medium text-[#306cb4]">{selected ? 'Selected' : 'Open'}</span>
      </div>
    </button>
  );
}

function SelectedDetails({ item, logs, loading }) {
  if (!item) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
        No activity yet.
      </div>
    );
  }

  const isExecution = item.type === 'execution';
  const metadata = parseMetadata(item.log?.metadata);
  const cause = item.cause || (isExecution ? 'No error was recorded for this execution.' : logSummary(item.log));
  const tone = item.status === 'success' ? 'border-emerald-100 bg-emerald-50 text-emerald-800' : item.status === 'rejected' || item.status === 'failed' || item.status === 'error' ? 'border-red-100 bg-red-50 text-red-800' : 'border-slate-200 bg-slate-50 text-slate-700';

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{isExecution ? 'Selected execution' : 'Selected webhook attempt'}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-800">{item.title}</p>
            <Badge value={item.status || 'unknown'} />
          </div>
          <p className="mt-1 text-xs text-slate-500">{formatDate(item.timestamp)}</p>
        </div>
        {isExecution && (
          <Link to={`/executions/${item.id}`} className="text-xs font-medium text-[#306cb4] hover:underline">
            Open execution page
          </Link>
        )}
      </div>

      <dl className="mt-3 grid gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs sm:grid-cols-[5.5rem_minmax(0,1fr)]">
        {isExecution ? (
          <>
            <dt className="font-semibold text-slate-500">Trigger</dt>
            <dd className="text-slate-700">{item.execution.triggerType || '-'}</dd>
            <dt className="font-semibold text-slate-500">Mode</dt>
            <dd className="text-slate-700">{item.execution.executionMode || '-'}</dd>
            <dt className="font-semibold text-slate-500">Started</dt>
            <dd className="text-slate-700">{formatDate(item.execution.startedAt)}</dd>
            <dt className="font-semibold text-slate-500">Finished</dt>
            <dd className="text-slate-700">{formatDate(item.execution.finishedAt)}</dd>
            <dt className="font-semibold text-slate-500">Execution ID</dt>
            <dd className="break-all font-mono text-slate-700">{item.id}</dd>
          </>
        ) : (
          <>
            <dt className="font-semibold text-slate-500">Trigger</dt>
            <dd className="text-slate-700">webhook</dd>
            <dt className="font-semibold text-slate-500">Header</dt>
            <dd className="text-slate-700">{metadata?.providedHeaderName || 'none'}</dd>
            <dt className="font-semibold text-slate-500">Execution</dt>
            <dd className="text-slate-700">No execution created</dd>
            <dt className="font-semibold text-slate-500">Received</dt>
            <dd className="text-slate-700">{formatDate(item.timestamp)}</dd>
          </>
        )}
      </dl>

      <div className={`mt-3 rounded-md border px-3 py-2 text-sm ${tone}`}>
        <p className="text-xs font-semibold uppercase tracking-wide">{item.status === 'success' ? 'Result' : 'Cause'}</p>
        <p className="mt-1 leading-5">{cause}</p>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Complete log for selected row</h3>
          <span className="text-xs text-slate-400">{loading ? 'Loading...' : `${logs.length} events`}</span>
        </div>
        {loading ? (
          <p className="text-sm text-slate-500">Loading logs...</p>
        ) : logs.length === 0 ? (
          <p className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500">No logs are attached to this row yet.</p>
        ) : (
          <div className="max-h-[32rem] space-y-2 overflow-y-auto pr-1">
            {logs.map((log) => <LogLine key={log.id} log={log} />)}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ActivityPanel({ integrationId, executions, onRefresh, selectedExecutionId }) {
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [selectedKey, setSelectedKey] = useState('');
  const [selectedLogs, setSelectedLogs] = useState([]);
  const [loadingSelectedLogs, setLoadingSelectedLogs] = useState(false);
  const [selectedReloadKey, setSelectedReloadKey] = useState(0);

  async function loadLogs() {
    setLoadingLogs(true);
    setError('');
    try {
      const { logs: rows } = await api.logs.forIntegration(integrationId, { take: 300 });
      setLogs(rows);
      return rows;
    } catch (err) {
      setError(err.message);
      return [];
    } finally {
      setLoadingLogs(false);
    }
  }

  async function refreshActivity() {
    setRefreshing(true);
    try {
      await Promise.all([onRefresh?.(), loadLogs()]);
      setSelectedReloadKey((value) => value + 1);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    loadLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [integrationId]);

  const activityItems = useMemo(() => buildActivityItems(executions, logs), [executions, logs]);
  const selectedItem = activityItems.find((item) => item.key === selectedKey) || activityItems[0] || null;

  useEffect(() => {
    if (selectedExecutionId) setSelectedKey(`execution:${selectedExecutionId}`);
  }, [selectedExecutionId]);

  useEffect(() => {
    if (!selectedItem) {
      setSelectedKey('');
      return;
    }
    if (selectedKey !== selectedItem.key) setSelectedKey(selectedItem.key);
  }, [selectedItem, selectedKey]);

  useEffect(() => {
    let cancelled = false;
    async function loadSelectedLogs() {
      if (!selectedItem) {
        setSelectedLogs([]);
        return;
      }
      if (selectedItem.type === 'webhook_attempt') {
        setSelectedLogs([selectedItem.log]);
        return;
      }
      setLoadingSelectedLogs(true);
      try {
        const { logs: rows } = await api.logs.forExecution(selectedItem.id);
        if (!cancelled) setSelectedLogs(rows);
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setSelectedLogs(selectedItem.logs || []);
        }
      } finally {
        if (!cancelled) setLoadingSelectedLogs(false);
      }
    }
    loadSelectedLogs();
    return () => {
      cancelled = true;
    };
  }, [selectedItem?.key, selectedReloadKey]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs leading-5 text-slate-500">
          Click any row to see the cause and the complete log for that run or webhook attempt.
        </p>
        <button type="button" onClick={refreshActivity} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
          {refreshing ? 'Refreshing...' : 'Refresh activity'}
        </button>
      </div>

      {error && <p className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="grid gap-4">
        <div>
          {loadingLogs && activityItems.length === 0 ? (
            <p className="text-sm text-slate-500">Loading activity...</p>
          ) : activityItems.length === 0 ? (
            <p className="text-sm text-slate-500">No executions or webhook attempts yet.</p>
          ) : (
            <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {activityItems.map((item) => (
                <ActivityRow key={item.key} item={item} selected={item.key === selectedItem?.key} onSelect={setSelectedKey} />
              ))}
            </div>
          )}
        </div>

        <SelectedDetails item={selectedItem} logs={selectedLogs} loading={loadingSelectedLogs} />
      </div>
    </div>
  );
}
