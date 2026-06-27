import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import Badge from '../components/Badge.jsx';
import { useAuth } from '../context/AuthContext.jsx';

function NewIntegrationForm({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', description: '', type: 'webhook', codeFolder: '', userId: '' });
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.admin.users
      .list()
      .then((data) => {
        const activeUsers = (data.users || []).filter((item) => item.status === 'active');
        setUsers(activeUsers);
        setForm((prev) => ({ ...prev, userId: prev.userId || activeUsers[0]?.id || '' }));
      })
      .catch((err) => setError(err.message));
  }, [open]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.integrations.create(form);
      setForm({ name: '', description: '', type: 'webhook', codeFolder: '', userId: '' });
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
        className="rounded-full border border-[#306cb4] px-4 py-2 text-sm font-semibold text-[#0b5869] transition hover:bg-[#e9faff]"
      >
        Register generated integration
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mb-6 space-y-3 rounded-xl border border-[#97dbf3]/70 bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-500">
        Registers an integration whose <code>integration.js</code> + <code>handler.js</code> already exist on disk
        under <code>codeFolder</code>.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 text-xs font-medium text-slate-600">
          Owner
          <select
            required
            value={form.userId}
            onChange={(e) => setForm({ ...form, userId: e.target.value })}
            className="mt-1 w-full border border-slate-300 rounded px-3 py-2 text-sm"
          >
            {users.map((item) => (
              <option key={item.id} value={item.id}>{item.name} ({item.email})</option>
            ))}
          </select>
          <span className="mt-1 block text-xs font-normal text-slate-400">
            The selected user will see and own this integration.
          </span>
        </label>
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
          className="rounded-full bg-[#306cb4] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#028baa] disabled:opacity-50"
        >
          {submitting ? 'Creating...' : 'Create'}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-slate-500 px-3 py-1.5">
          Cancel
        </button>
      </div>
    </form>
  );
}

function shortId(id) {
  return id ? id.slice(0, 8) : '-';
}

export default function DashboardPage() {
  const { user, isAdmin } = useAuth();
  const [integrations, setIntegrations] = useState([]);
  const [lastExecutions, setLastExecutions] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState('');
  const canDelete = user?.role !== 'viewer';

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

  async function handleDelete(integration) {
    const confirmed = window.confirm(`Delete "${integration.name}" and its executions, logs, credentials, and settings?`);
    if (!confirmed) return;
    setError('');
    setDeletingId(integration.id);
    try {
      await api.integrations.delete(integration.id);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setDeletingId('');
    }
  }

  if (loading) return <p className="text-slate-500">Loading integrations...</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#0b5869]">My Integrations</h1>
          <p className="mt-1 text-sm text-slate-500">
            {user?.role === 'viewer'
              ? 'Open an integration to inspect settings, executions, and logs.'
              : 'Open an integration to test, configure credentials, or inspect logs.'}
          </p>
        </div>
        {isAdmin ? (
          <NewIntegrationForm onCreated={load} />
        ) : (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
            Need a new integration? Ask an admin to register a generated integration after the checklist is complete.
          </div>
        )}
      </div>

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      {integrations.length === 0 ? (
        <p className="text-slate-500 text-sm">No integrations yet.</p>
      ) : (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-[#97dbf3]/60 bg-white shadow-sm">
          {integrations.map((integration) => {
            const lastExec = lastExecutions[integration.id];
            return (
              <div key={integration.id} className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link to={`/integrations/${integration.id}`} className="font-semibold text-slate-900 hover:text-[#028baa]">
                      {integration.name}
                    </Link>
                    <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600" title={integration.id}>
                      ID #{shortId(integration.id)}
                    </span>
                  </div>
                  <p className="mt-1 break-all font-mono text-[11px] text-slate-400">{integration.id}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <Badge value={integration.type} />
                    <Badge value={integration.status} />
                    {lastExec ? (
                      <span className="text-xs text-slate-500">
                        last run: <Badge value={lastExec.status} /> {lastExec.startedAt ? new Date(lastExec.startedAt).toLocaleString() : ''}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">never run</span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                  <Link
                    to={`/integrations/${integration.id}`}
                    className="rounded-full border border-[#306cb4]/70 px-4 py-2 text-center text-sm font-semibold text-[#0b5869] transition hover:bg-[#e9faff]"
                  >
                    Open details
                  </Link>
                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => handleDelete(integration)}
                      disabled={deletingId === integration.id}
                      className="rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50"
                    >
                      {deletingId === integration.id ? 'Deleting...' : 'Delete'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
