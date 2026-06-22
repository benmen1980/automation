import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client.js';
import Badge from '../components/Badge.jsx';
import CredentialForm from '../components/CredentialForm.jsx';
import ExecutionsTable from '../components/ExecutionsTable.jsx';
import LogsViewer from '../components/LogsViewer.jsx';

const EXECUTION_MODES = ['test', 'dry_run', 'mock_output', 'mock_input', 'live'];
const CONNECTORS = ['whatsapp', 'generic-rest', 'email'];

function WebhookSettingsPanel({ integration, onUpdated }) {
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const settings = integration.webhookSettings;

  async function rotateToken(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.integrations.webhookSettings(integration.id, { token });
      setToken('');
      onUpdated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-slate-500 mb-1">Webhook URL (host + this path)</p>
        <code className="text-sm bg-slate-100 px-2 py-1 rounded block overflow-x-auto">
          {settings?.webhookUrl || `/webhooks/.../${integration.slug}`}
        </code>
      </div>
      <p className="text-xs text-slate-500">
        Token: {settings?.secretTokenReference ? <Badge value="active">configured</Badge> : <Badge value="inactive">not set</Badge>}
      </p>
      <form onSubmit={rotateToken} className="flex gap-2">
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Set / rotate webhook token"
          className="flex-1 border border-slate-300 rounded px-3 py-1.5 text-sm"
        />
        <button
          type="submit"
          disabled={saving || !token}
          className="text-sm font-medium text-slate-700 border border-slate-300 rounded px-3 py-1.5 hover:bg-slate-100 disabled:opacity-50"
        >
          Save
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

function ScheduleSettingsPanel({ integration, onUpdated }) {
  const settings = integration.scheduleSettings;
  const [cronExpression, setCronExpression] = useState(settings?.cronExpression || '0 2 * * *');
  const [timezone, setTimezone] = useState(settings?.timezone || 'UTC');
  const [active, setActive] = useState(settings?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.integrations.scheduleSettings(integration.id, { cronExpression, timezone, active });
      onUpdated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Cron expression</label>
          <input
            value={cronExpression}
            onChange={(e) => setCronExpression(e.target.value)}
            className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm font-mono"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Timezone</label>
          <input
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full border border-slate-300 rounded px-3 py-1.5 text-sm"
          />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Active
      </label>
      <p className="text-xs text-slate-400">
        Last run: {settings?.lastRunAt ? new Date(settings.lastRunAt).toLocaleString() : '—'} · Next run:{' '}
        {settings?.nextRunAt ? new Date(settings.nextRunAt).toLocaleString() : '—'}
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={saving}
        className="text-sm font-medium text-slate-700 border border-slate-300 rounded px-3 py-1.5 hover:bg-slate-100 disabled:opacity-50"
      >
        Save schedule
      </button>
    </form>
  );
}

export default function IntegrationPage() {
  const { id } = useParams();
  const [integration, setIntegration] = useState(null);
  const [definition, setDefinition] = useState(null);
  const [credentialFields, setCredentialFields] = useState([]);
  const [executions, setExecutions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [payloadText, setPayloadText] = useState('{}');
  const [executionMode, setExecutionMode] = useState('test');
  const [running, setRunning] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const [connector, setConnector] = useState(CONNECTORS[0]);
  const [connectorResult, setConnectorResult] = useState(null);
  const [connectorTesting, setConnectorTesting] = useState(false);

  async function loadAll() {
    setLoading(true);
    setError('');
    try {
      const [{ integration: i }, { definition: d }, { credentials: c }, { executions: e }] = await Promise.all([
        api.integrations.get(id),
        api.integrations.definition(id),
        api.integrations.credentials.list(id),
        api.executions.listForIntegration(id),
      ]);
      setIntegration(i);
      setDefinition(d);
      setCredentialFields(c);
      setExecutions(e);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function handleSaveCredentials(values) {
    await api.integrations.credentials.save(id, values);
    const { credentials: c } = await api.integrations.credentials.list(id);
    setCredentialFields(c);
  }

  async function handleToggleField(field, value) {
    const { integration: updated } = await api.integrations.update(id, { [field]: value });
    setIntegration(updated);
  }

  function parsePayload() {
    try {
      return JSON.parse(payloadText || '{}');
    } catch {
      setError('Payload must be valid JSON.');
      return undefined;
    }
  }

  async function handleRunTest() {
    const payload = parsePayload();
    if (payload === undefined) return;
    setError('');
    setRunning(true);
    setTestResult(null);
    try {
      const { execution } = await api.test.test(id, { payload, executionMode });
      setTestResult(execution);
      const { executions: e } = await api.executions.listForIntegration(id);
      setExecutions(e);
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  async function handleDryRun() {
    const payload = parsePayload();
    if (payload === undefined) return;
    setError('');
    setRunning(true);
    setTestResult(null);
    try {
      const { execution } = await api.test.dryRun(id, { payload });
      setTestResult(execution);
      const { executions: e } = await api.executions.listForIntegration(id);
      setExecutions(e);
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  async function handleTestConnector() {
    setConnectorTesting(true);
    setConnectorResult(null);
    try {
      const { result } = await api.test.testConnector(id, connector);
      setConnectorResult(result);
    } catch (err) {
      setConnectorResult({ success: false, message: err.message });
    } finally {
      setConnectorTesting(false);
    }
  }

  if (loading) return <p className="text-slate-500">Loading…</p>;
  if (!integration) return <p className="text-red-600">{error || 'Integration not found.'}</p>;

  return (
    <div className="space-y-6">
      <div>
        <Link to="/" className="text-sm text-slate-500 hover:underline">
          ← My Integrations
        </Link>
        <div className="flex items-center justify-between mt-2">
          <div>
            <h1 className="text-xl font-semibold text-slate-800">{integration.name}</h1>
            <p className="text-sm text-slate-500">{integration.description}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge value={integration.type} />
            <Badge value={integration.status} />
          </div>
        </div>
        <div className="flex items-center gap-4 mt-3 text-sm">
          <label className="flex items-center gap-2 text-slate-600">
            <input
              type="checkbox"
              checked={integration.status === 'active'}
              onChange={(e) => handleToggleField('status', e.target.checked ? 'active' : 'inactive')}
            />
            Active
          </label>
          <label className="flex items-center gap-2 text-slate-600">
            <input
              type="checkbox"
              checked={integration.manualRunEnabled}
              onChange={(e) => handleToggleField('manualRunEnabled', e.target.checked)}
            />
            Manual run enabled
          </label>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <section className="bg-white border border-slate-200 rounded-lg p-4">
        <h2 className="font-medium text-slate-800 mb-3">{integration.type === 'webhook' ? 'Webhook settings' : 'Schedule settings'}</h2>
        {integration.type === 'webhook' ? (
          <WebhookSettingsPanel integration={integration} onUpdated={loadAll} />
        ) : (
          <ScheduleSettingsPanel integration={integration} onUpdated={loadAll} />
        )}
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-4">
        <h2 className="font-medium text-slate-800 mb-3">Credentials</h2>
        <CredentialForm fields={credentialFields} onSave={handleSaveCredentials} />
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-4">
        <h2 className="font-medium text-slate-800 mb-3">Run / test</h2>

        {definition?.testPayloads?.length > 0 && (
          <div className="mb-2">
            <label className="block text-xs text-slate-500 mb-1">Sample payload</label>
            <select
              onChange={(e) => {
                const item = definition.testPayloads[e.target.value];
                if (item) setPayloadText(JSON.stringify(item.payload, null, 2));
              }}
              className="border border-slate-300 rounded px-2 py-1 text-sm"
              defaultValue=""
            >
              <option value="" disabled>
                Choose a sample payload…
              </option>
              {definition.testPayloads.map((p, idx) => (
                <option key={idx} value={idx}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <label className="block text-xs text-slate-500 mb-1">Payload (JSON)</label>
        <textarea
          value={payloadText}
          onChange={(e) => setPayloadText(e.target.value)}
          rows={6}
          className="w-full border border-slate-300 rounded px-3 py-2 text-sm font-mono mb-3"
        />

        <div className="flex items-center gap-2 mb-3">
          <select value={executionMode} onChange={(e) => setExecutionMode(e.target.value)} className="border border-slate-300 rounded px-2 py-1.5 text-sm">
            {EXECUTION_MODES.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <button
            onClick={handleRunTest}
            disabled={running || !integration.manualRunEnabled}
            className="bg-slate-800 text-white rounded px-4 py-1.5 text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
          >
            {running ? 'Running…' : 'Run'}
          </button>
          <button
            onClick={handleDryRun}
            disabled={running || !integration.manualRunEnabled}
            className="text-sm font-medium text-slate-700 border border-slate-300 rounded px-4 py-1.5 hover:bg-slate-100 disabled:opacity-50"
          >
            Dry run
          </button>
        </div>

        {testResult && (
          <div className="border border-slate-200 rounded p-3 bg-slate-50 text-sm space-y-1">
            <div className="flex items-center gap-2">
              <Badge value={testResult.status} />
              <Link to={`/executions/${testResult.id}`} className="text-slate-600 hover:underline text-xs">
                View execution details →
              </Link>
            </div>
            {testResult.errorMessage && <p className="text-red-600">{testResult.errorMessage}</p>}
            {testResult.outputPayload && (
              <pre className="bg-white border border-slate-200 rounded p-2 overflow-x-auto text-xs">{testResult.outputPayload}</pre>
            )}
          </div>
        )}
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-4">
        <h2 className="font-medium text-slate-800 mb-3">Test credentials</h2>
        <div className="flex items-center gap-2 mb-3">
          <select value={connector} onChange={(e) => setConnector(e.target.value)} className="border border-slate-300 rounded px-2 py-1.5 text-sm">
            {CONNECTORS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <button
            onClick={handleTestConnector}
            disabled={connectorTesting}
            className="text-sm font-medium text-slate-700 border border-slate-300 rounded px-4 py-1.5 hover:bg-slate-100 disabled:opacity-50"
          >
            {connectorTesting ? 'Testing…' : 'Test connection'}
          </button>
        </div>
        {connectorResult && (
          <pre className="bg-slate-50 border border-slate-200 rounded p-2 text-xs overflow-x-auto">{JSON.stringify(connectorResult, null, 2)}</pre>
        )}
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-4">
        <h2 className="font-medium text-slate-800 mb-3">Recent executions</h2>
        <ExecutionsTable executions={executions} />
      </section>

      <section className="bg-white border border-slate-200 rounded-lg p-4">
        <h2 className="font-medium text-slate-800 mb-3">Logs</h2>
        <LogsViewer integrationId={id} />
      </section>
    </div>
  );
}
