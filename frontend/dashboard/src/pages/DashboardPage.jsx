import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import Badge from '../components/Badge.jsx';

function NewIntegrationForm({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', type: 'webhook', codeFolder: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.integrations.create(form);
      setForm({ name: '', description: '', type: 'webhook', codeFolder: '' });
      setOpen(false);
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-sm font-medium text-slate-700 border border-slate-300 rounded px-3 py-1.5 hover:bg-slate-100"
      >
        + New integration
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-lg p-4 mb-6 space-y-3">
      <p className="text-sm text-slate-500">
        Registers an integration whose <code>integration.js</code> + <code>handler.js</code> already exist on disk
        under <code>codeFolder</code> (see CLAUDE.md section 8.3 — code is never uploaded from the dashboard).
      </p>
      <div className="grid grid-cols-2 gap-3">
        <input
          required
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="border border-slate-300 rounded px-3 py-2 text-sm"
        />
        <select
          value={form.type}
          onChange={(e) => setForm({ ...form, type: e.target.value })}
          className="border border-slate-300 rounded px-3 py-2 text-sm"
        >
          <option value="webhook">webhook</option>
          <option value="scheduled">scheduled</option>
        </select>
        <input
          placeholder="Description (optional)"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="border border-slate-300 rounded px-3 py-2 text-sm col-span-2"
        />
        <input
          required
          placeholder="codeFolder, e.g. src/integrations/user_001/my-integration"
          value={form.codeFolder}
          onChange={(e) => setForm({ ...form, codeFolder: e.target.value })}
          className="border border-slate-300 rounded px-3 py-2 text-sm col-span-2"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="bg-slate-800 text-white rounded px-3 py-1.5 text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
        >
          Create
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-slate-500 px-3 py-1.5">
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function DashboardPage() {
  const [integrations, setIntegrations] = useState([]);
  const [lastExecutions, setLastExecutions] = useState({});
  const [loading, setLoading] = useState(true);
  const [runningId, setRunningId] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const { integrations: list } = await api.integrations.list();
      setIntegrations(list);
      const entries = await Promise.all(
        list.map(async (integration) => {
          try {
            const { executions } = await api.executions.listForIntegration(integration.id);
            return [integration.id, executions[0] || null];
          } catch {
            return [integration.id, null];
          }
        })
      );
      setLastExecutions(Object.fromEntries(entries));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function quickRun(integration) {
    setRunningId(integration.id);
    try {
      await api.executions.run(integration.id, { executionMode: 'test', payload: {} });
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setRunningId(null);
    }
  }

  if (loading) return <p className="text-slate-500">Loading integrations…</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-slate-800">My Integrations</h1>
        <NewIntegrationForm onCreated={load} />
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      {integrations.length === 0 ? (
        <p className="text-slate-500 text-sm">No integrations yet.</p>
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
          {integrations.map((integration) => {
            const lastExec = lastExecutions[integration.id];
            return (
              <div key={integration.id} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0">
                  <Link to={`/integrations/${integration.id}`} className="font-medium text-slate-800 hover:underline">
                    {integration.name}
                  </Link>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge value={integration.type} />
                    <Badge value={integration.status} />
                    {lastExec ? (
                      <span className="text-xs text-slate-500">
                        last run: <Badge value={lastExec.status} />
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">never run</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => quickRun(integration)}
                  disabled={runningId === integration.id || !integration.manualRunEnabled}
                  className="text-sm font-medium text-slate-700 border border-slate-300 rounded px-3 py-1.5 hover:bg-slate-100 disabled:opacity-50 shrink-0"
                >
                  {runningId === integration.id ? 'Running…' : 'Run test'}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
