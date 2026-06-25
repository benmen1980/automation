import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';
import Badge from '../components/Badge.jsx';

function NewUserForm({ onCreated }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', password: '', role: 'user', slug: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await api.admin.users.create(form);
      setForm({ email: '', name: '', password: '', role: 'user', slug: '' });
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
      <button onClick={() => setOpen(true)} className="text-sm font-medium text-slate-700 border border-slate-300 rounded px-3 py-1.5 hover:bg-slate-100">
        + New user
      </button>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-lg p-4 mb-4 space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <input
          required
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          className="border border-slate-300 rounded px-3 py-2 text-sm"
        />
        <input
          required
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="border border-slate-300 rounded px-3 py-2 text-sm"
        />
        <input
          required
          type="password"
          placeholder="Temporary password"
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
          className="border border-slate-300 rounded px-3 py-2 text-sm"
        />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="border border-slate-300 rounded px-3 py-2 text-sm">
          <option value="user">user</option>
          <option value="viewer">viewer</option>
          <option value="admin">admin</option>
        </select>
        <input
          placeholder="Slug (optional, e.g. user_003)"
          value={form.slug}
          onChange={(e) => setForm({ ...form, slug: e.target.value })}
          className="border border-slate-300 rounded px-3 py-2 text-sm col-span-2"
        />
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={submitting} className="bg-slate-800 text-white rounded px-3 py-1.5 text-sm font-medium hover:bg-slate-700 disabled:opacity-50">
          Create
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-slate-500 px-3 py-1.5">
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function AdminPage() {
  const [users, setUsers] = useState([]);
  const [integrations, setIntegrations] = useState([]);
  const [failedExecutions, setFailedExecutions] = useState([]);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [{ users: u }, { integrations: i }] = await Promise.all([api.admin.users.list(), api.integrations.list({ scope: 'all' })]);
      setUsers(u);
      setIntegrations(i);

      const failedPerIntegration = await Promise.all(
        i.map(async (integration) => {
          try {
            const { executions } = await api.executions.listForIntegration(integration.id);
            return executions.filter((e) => e.status === 'failed').map((e) => ({ ...e, integrationName: integration.name }));
          } catch {
            return [];
          }
        })
      );
      setFailedExecutions(
        failedPerIntegration
          .flat()
          .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
          .slice(0, 20)
      );

      fetch((import.meta.env.VITE_API_URL || '') + '/health')
        .then((r) => r.json())
        .then(setHealth)
        .catch(() => setHealth(null));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function toggleUserStatus(user) {
    await api.admin.users.update(user.id, { status: user.status === 'active' ? 'disabled' : 'active' });
    load();
  }

  const usersById = Object.fromEntries(users.map((u) => [u.id, u]));

  if (loading) return <p className="text-slate-500">Loading…</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-slate-800">Admin</h1>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="bg-white border border-slate-200 rounded-lg p-4">
        <h2 className="font-medium text-slate-800 mb-2">System status</h2>
        <p className="text-sm text-slate-600">
          API: {health ? <Badge value="active">ok</Badge> : <Badge value="failed">unreachable</Badge>} · {users.length} users ·{' '}
          {integrations.length} integrations · {failedExecutions.length} recent failed executions
        </p>
      </section>

      <section>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-medium text-slate-800">Users</h2>
          <NewUserForm onCreated={load} />
        </div>
        <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
          {users.map((user) => (
            <div key={user.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <div>
                <span className="font-medium text-slate-800">{user.name}</span>{' '}
                <span className="text-slate-500">{user.email}</span>{' '}
                <span className="text-slate-400">({user.slug})</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge value={user.role} />
                <Badge value={user.status} />
                <button onClick={() => toggleUserStatus(user)} className="text-slate-500 hover:underline text-xs">
                  {user.status === 'active' ? 'Disable' : 'Activate'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-medium text-slate-800 mb-2">All integrations</h2>
        <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
          {integrations.map((integration) => (
            <div key={integration.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <div>
                <Link to={`/integrations/${integration.id}`} className="font-medium text-slate-800 hover:underline">
                  {integration.name}
                </Link>{' '}
                <span className="text-slate-400">— owner: {usersById[integration.userId]?.email || integration.userId}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge value={integration.type} />
                <Badge value={integration.status} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="font-medium text-slate-800 mb-2">Recent failed executions</h2>
        {failedExecutions.length === 0 ? (
          <p className="text-sm text-slate-500">None — nice.</p>
        ) : (
          <div className="bg-white border border-slate-200 rounded-lg divide-y divide-slate-100">
            {failedExecutions.map((exec) => (
              <div key={exec.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <div>
                  <span className="font-medium text-slate-800">{exec.integrationName}</span>{' '}
                  <span className="text-slate-400">{new Date(exec.createdAt).toLocaleString()}</span>
                </div>
                <Link to={`/executions/${exec.id}`} className="text-slate-600 hover:underline text-xs">
                  Details
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
