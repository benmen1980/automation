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
  const [reassigningIntegrationId, setReassigningIntegrationId] = useState('');
  const [sendgrid, setSendgrid] = useState({ apiKey: '', domain: '', fromEmail: '', recipients: '', configured: false });
  const [sendgridMessage, setSendgridMessage] = useState('');
  const [sendgridSaving, setSendgridSaving] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [{ users: u }, { integrations: i }, { sendgrid: s }] = await Promise.all([api.admin.users.list(), api.integrations.list({ scope: 'all' }), api.admin.sendgrid.get()]);
      setUsers(u);
      setIntegrations(i);
      setSendgrid((previous) => ({ ...previous, ...s }));

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

  async function saveSendgrid(event) {
    event.preventDefault();
    setSendgridSaving(true);
    setSendgridMessage('');
    try {
      const { sendgrid: saved } = await api.admin.sendgrid.save(sendgrid);
      setSendgrid((previous) => ({ ...previous, ...saved, apiKey: '' }));
      setSendgridMessage('SendGrid settings saved.');
    } catch (err) {
      setSendgridMessage(err.message);
    } finally {
      setSendgridSaving(false);
    }
  }

  async function testSendgrid() {
    setSendgridMessage('');
    try {
      const result = await api.admin.sendgrid.test();
      setSendgridMessage(result.message);
    } catch (err) {
      setSendgridMessage(err.message);
    }
  }

  async function handleReassignIntegration(integrationId, userUid) {
    setError('');
    setReassigningIntegrationId(integrationId);
    try {
      const { integration: updated } = await api.integrations.assignment(integrationId, userUid || null);
      setIntegrations((previous) =>
        previous.map((integration) => (integration.id === updated.id ? { ...integration, assignedUserUid: updated.assignedUserUid } : integration))
      );
    } catch (err) {
      setError(err.message);
      await load();
    } finally {
      setReassigningIntegrationId('');
    }
  }

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

      <section className="bg-white border border-slate-200 rounded-lg p-4">
        <h2 className="font-medium text-slate-800 mb-2">SendGrid error notifications</h2>
        <form onSubmit={saveSendgrid} className="space-y-3 max-w-xl">
          <label className="block text-sm font-medium text-slate-700">SendGrid API key<input type="password" placeholder={sendgrid.configured ? 'Saved — enter to replace' : 'Enter API key'} value={sendgrid.apiKey} onChange={(e) => setSendgrid({ ...sendgrid, apiKey: e.target.value })} className="mt-1 w-full border border-slate-300 rounded px-3 py-2 text-sm" /></label>
          <label className="block text-sm font-medium text-slate-700">SendGrid domain<input required placeholder="example.com" value={sendgrid.domain} onChange={(e) => setSendgrid({ ...sendgrid, domain: e.target.value })} className="mt-1 w-full border border-slate-300 rounded px-3 py-2 text-sm" /></label>
          <label className="block text-sm font-medium text-slate-700">From email<input required type="email" placeholder="automation@example.com" value={sendgrid.fromEmail} onChange={(e) => setSendgrid({ ...sendgrid, fromEmail: e.target.value })} className="mt-1 w-full border border-slate-300 rounded px-3 py-2 text-sm" /></label>
          <label className="block text-sm font-medium text-slate-700">Error mailing list<textarea required rows={4} placeholder="One email per line" value={sendgrid.recipients} onChange={(e) => setSendgrid({ ...sendgrid, recipients: e.target.value })} className="mt-1 w-full border border-slate-300 rounded px-3 py-2 text-sm" /></label>
          <div className="flex gap-2">
            <button type="submit" disabled={sendgridSaving} className="bg-slate-800 text-white rounded px-3 py-1.5 text-sm font-medium disabled:opacity-50">{sendgridSaving ? 'Saving...' : 'Save settings'}</button>
            <button type="button" onClick={testSendgrid} className="border border-slate-300 rounded px-3 py-1.5 text-sm">Send test email</button>
          </div>
          {sendgridMessage && <p className="text-sm text-slate-600">{sendgridMessage}</p>}
        </form>
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
          {integrations.map((integration, index) => (
            <div key={integration.id} className="flex items-center justify-between px-4 py-2.5 text-sm">
              <div className="min-w-0">
                <span className="mr-2 inline-flex min-w-7 justify-center rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs font-medium text-slate-500">
                  #{index + 1}
                </span>
                <Link to={`/integrations/${integration.integrationKey || integration.id}`} className="font-medium text-slate-800 hover:underline">
                  {integration.name}
                </Link>{' '}
                <span className="font-mono text-[11px] text-slate-500">({integration.integrationKey || integration.id})</span>
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <label className="sr-only" htmlFor={`assign-${integration.id}`}>Assign user</label>
                <select
                  id={`assign-${integration.id}`}
                  value={integration.assignedUserUid || ''}
                  onChange={(event) => handleReassignIntegration(integration.id, event.target.value)}
                  disabled={reassigningIntegrationId === integration.id}
                  className="min-w-40 rounded border border-slate-300 bg-white px-2 py-1.5 text-xs"
                >
                  <option value="">Unassigned (Admin only)</option>
                  {users.filter((item) => item.status === 'active').map((item) => (
                    <option key={item.userUid} value={item.userUid}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <span className="text-slate-400">Assigned to:</span>
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
