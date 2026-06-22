import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api/client.js';
import Badge from '../components/Badge.jsx';

function pretty(jsonString) {
  if (!jsonString) return null;
  try {
    return JSON.stringify(JSON.parse(jsonString), null, 2);
  } catch {
    return jsonString;
  }
}

export default function ExecutionPage() {
  const { executionId } = useParams();
  const navigate = useNavigate();
  const [execution, setExecution] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [replaying, setReplaying] = useState(false);
  const [replayMode, setReplayMode] = useState('test');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [{ execution: e }, { logs: l }] = await Promise.all([
        api.executions.get(executionId),
        api.logs.forExecution(executionId),
      ]);
      setExecution(e);
      setLogs(l);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [executionId]);

  async function handleReplay() {
    setReplaying(true);
    setError('');
    try {
      const { execution: newExec } = await api.executions.replay(executionId, { executionMode: replayMode });
      navigate(`/executions/${newExec.id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setReplaying(false);
    }
  }

  if (loading) return <p className="text-slate-500">Loading…</p>;
  if (!execution) return <p className="text-red-600">{error || 'Execution not found.'}</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/integrations/${execution.integrationId}`} className="text-sm text-slate-500 hover:underline">
          ← Back to integration
        </Link>
        <div className="flex items-center justify-between mt-2">
          <h1 className="text-xl font-semibold text-slate-800">Execution {execution.id.slice(0, 10)}…</h1>
          <Badge value={execution.status} />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="bg-white border border-slate-200 rounded-lg p-4 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-slate-400">Trigger type</p>
          <p>{execution.triggerType}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Execution mode</p>
          <p>{execution.executionMode}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Started</p>
          <p>{execution.startedAt ? new Date(execution.startedAt).toLocaleString() : '—'}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Finished</p>
          <p>{execution.finishedAt ? new Date(execution.finishedAt).toLocaleString() : '—'}</p>
        </div>
        {execution.sourceExecutionId && (
          <div className="col-span-2">
            <p className="text-xs text-slate-400">Replayed from</p>
            <Link to={`/executions/${execution.sourceExecutionId}`} className="text-slate-600 hover:underline">
              {execution.sourceExecutionId}
            </Link>
          </div>
        )}
      </section>

      {execution.errorMessage && (
        <section className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h2 className="font-medium text-red-700 mb-2">Error</h2>
          <p className="text-sm text-red-700">{execution.errorMessage}</p>
        </section>
      )}

      <section className="bg-white border border-slate-200 rounded-lg p-4">
        <h2 className="font-medium text-slate-800 mb-2">Input payload</h2>
        <pre className="bg-slate-50 border border-slate-200 rounded p-2 text-xs overflow-x-auto">{pretty(execution.inputPayload) || '—'}</pre>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-4">
        <h2 className="font-medium text-slate-800 mb-2">Output payload</h2>
        <pre className="bg-slate-50 border border-slate-200 rounded p-2 text-xs overflow-x-auto">{pretty(execution.outputPayload) || '—'}</pre>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-4">
        <h2 className="font-medium text-slate-800 mb-3">Replay</h2>
        <div className="flex items-center gap-2">
          <select value={replayMode} onChange={(e) => setReplayMode(e.target.value)} className="border border-slate-300 rounded px-2 py-1.5 text-sm">
            <option value="test">test</option>
            <option value="dry_run">dry_run</option>
            <option value="mock_output">mock_output</option>
          </select>
          <button
            onClick={handleReplay}
            disabled={replaying}
            className="bg-slate-800 text-white rounded px-4 py-1.5 text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
          >
            {replaying ? 'Replaying…' : 'Replay as test'}
          </button>
        </div>
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-4">
        <h2 className="font-medium text-slate-800 mb-3">Logs</h2>
        {logs.length === 0 ? (
          <p className="text-sm text-slate-500">No logs for this execution.</p>
        ) : (
          <div className="space-y-1 max-h-96 overflow-y-auto">
            {logs.map((log) => (
              <div key={log.id} className="flex items-start gap-2 text-xs border-b border-slate-100 py-1.5">
                <span className="text-slate-400 shrink-0 w-36">{new Date(log.createdAt).toLocaleString()}</span>
                <span className="shrink-0 px-1.5 py-0.5 rounded font-medium bg-slate-100 text-slate-600">{log.level}</span>
                <span className="text-slate-700 break-words">{log.message}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
