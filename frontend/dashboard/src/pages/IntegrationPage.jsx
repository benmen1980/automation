import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client.js';
import Badge from '../components/Badge.jsx';
import CredentialForm from '../components/CredentialForm.jsx';
import ExecutionsTable from '../components/ExecutionsTable.jsx';
import LogsViewer from '../components/LogsViewer.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const FALLBACK_EXECUTION_MODES = ['dummy', 'test', 'dry_run', 'mock_output', 'mock_input', 'live'];
const DEFAULT_TIMEZONE = 'Asia/Jerusalem';
const EXECUTION_MODE_LABELS = {
  dummy: 'Dummy data only',
  test: 'Safe test',
  dry_run: 'Preview only',
  mock_output: 'Mock provider response',
  mock_input: 'Mock input',
  replay: 'Replay previous run',
  email_test: 'Send test email',
  live: 'Live run',
};
const CONNECTOR_LABELS = {
  email: 'Email account',
  genericRest: 'Inventory API',
  gmail: 'Gmail',
  priority: 'Priority ERP',
  ses: 'AWS SES email',
  shopify: 'Shopify',
  whatsapp: 'WhatsApp',
  whatsappCloud: 'WhatsApp Cloud API',
};

function Card({ title, description, children, aside }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {description && <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

function FieldHint({ children }) {
  return <p className="mt-1 text-xs leading-5 text-slate-500">{children}</p>;
}

function ReadOnlyNotice({ children = 'Your role can inspect this integration, but cannot change settings, credentials, or run tests.' }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm leading-5 text-slate-600">
      {children}
    </div>
  );
}

function parseCron(cronExpression) {
  if (cronExpression === '* * * * *') return { preset: 'everyMinute', interval: 1, minute: 0, hour: 9, custom: cronExpression };
  const everyMatch = cronExpression?.match(/^\*\/(\d+) \* \* \* \*$/);
  if (everyMatch) return { preset: 'everyMinutes', interval: Number(everyMatch[1]), minute: 0, hour: 9, custom: cronExpression };
  const hourlyMatch = cronExpression?.match(/^(\d+) \* \* \* \*$/);
  if (hourlyMatch) return { preset: 'hourly', interval: 10, minute: Number(hourlyMatch[1]), hour: 9, custom: cronExpression };
  const dailyMatch = cronExpression?.match(/^(\d+) (\d+) \* \* \*$/);
  if (dailyMatch) return { preset: 'daily', interval: 10, minute: Number(dailyMatch[1]), hour: Number(dailyMatch[2]), custom: cronExpression };
  return { preset: 'custom', interval: 10, minute: 0, hour: 9, custom: cronExpression || '*/10 * * * *' };
}

function buildCron(schedule) {
  if (schedule.preset === 'everyMinute') return '* * * * *';
  if (schedule.preset === 'everyMinutes') return `*/${Math.max(1, Number(schedule.interval) || 10)} * * * *`;
  if (schedule.preset === 'hourly') return `${Math.min(59, Math.max(0, Number(schedule.minute) || 0))} * * * *`;
  if (schedule.preset === 'daily') return `${Math.min(59, Math.max(0, Number(schedule.minute) || 0))} ${Math.min(23, Math.max(0, Number(schedule.hour) || 0))} * * *`;
  return schedule.custom || '*/10 * * * *';
}

function formatTime(hour, minute) {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

function schedulePreview(schedule) {
  if (schedule.preset === 'everyMinute') return 'Runs every minute.';
  if (schedule.preset === 'everyMinutes') return `Runs every ${Math.max(1, Number(schedule.interval) || 10)} minutes.`;
  if (schedule.preset === 'hourly') return `Runs every hour at minute ${Math.min(59, Math.max(0, Number(schedule.minute) || 0))}.`;
  if (schedule.preset === 'daily') return `Runs every day at ${formatTime(Number(schedule.hour) || 0, Number(schedule.minute) || 0)}.`;
  return `Uses custom cron: ${schedule.custom || 'not set'}.`;
}

function WebhookSettingsPanel({ integration, onUpdated, disabled = false }) {
  const [token, setToken] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const settings = integration.webhookSettings;
  const webhookUrl = settings?.webhookUrl || `/webhooks/.../${integration.slug}`;
  const isFullWebhookUrl = /^https?:\/\//i.test(webhookUrl);

  async function rotateToken(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await api.integrations.webhookSettings(integration.id, { token });
      setToken('');
      setCopied(false);
      onUpdated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function copyWebhookUrl() {
    setError('');
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
    } catch {
      setError('Could not copy the webhook URL. Select the URL and copy it manually.');
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-slate-600">Webhook URL</label>
        <div className="mt-1 flex gap-2">
          <code className="block min-w-0 flex-1 overflow-x-auto rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            {webhookUrl}
          </code>
          <button type="button" onClick={copyWebhookUrl} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <FieldHint>
          {isFullWebhookUrl ? 'Use this full URL as the POST destination.' : 'Use this path with the app host as the POST destination.'}
          {' '}In Postman, put the saved token in the Authorization tab as a Bearer Token.
        </FieldHint>
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <span>Token</span>
        {settings?.secretTokenReference ? <Badge value="active">•••••••• saved</Badge> : <Badge value="inactive">not set</Badge>}
      </div>
      <form onSubmit={rotateToken} className="flex gap-2">
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={disabled ? 'Token changes disabled for viewer role' : 'New webhook token'}
          disabled={disabled}
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <button type="submit" disabled={saving || !token || disabled} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          Save
        </button>
      </form>
      <FieldHint>After saving, the token is hidden. If you lose it, create a new token here and update the sender.</FieldHint>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

function ScheduleSettingsPanel({ integration, onUpdated, disabled = false }) {
  const settings = integration.scheduleSettings;
  const [schedule, setSchedule] = useState(() => parseCron(settings?.cronExpression || '*/10 * * * *'));
  const [timezone, setTimezone] = useState(settings?.timezone || DEFAULT_TIMEZONE);
  const [active, setActive] = useState(settings?.active ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const cronExpression = useMemo(() => buildCron(schedule), [schedule]);

  function patchSchedule(patch) {
    setSchedule((prev) => ({ ...prev, ...patch }));
  }

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
    <form onSubmit={save} className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-slate-600">How often should it run?</label>
        <select value={schedule.preset} onChange={(e) => patchSchedule({ preset: e.target.value })} disabled={disabled} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm">
          <option value="everyMinute">Every minute</option>
          <option value="everyMinutes">Every X minutes</option>
          <option value="hourly">Every hour</option>
          <option value="daily">Every day at a time</option>
          <option value="custom">Custom cron</option>
        </select>
      </div>

      {schedule.preset === 'everyMinutes' && (
        <div>
          <label className="block text-xs font-medium text-slate-600">Minutes between runs</label>
          <input type="number" min="1" max="1440" value={schedule.interval} onChange={(e) => patchSchedule({ interval: e.target.value })} disabled={disabled} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          <FieldHint>Example: 10 means it runs every 10 minutes.</FieldHint>
        </div>
      )}

      {schedule.preset === 'hourly' && (
        <div>
          <label className="block text-xs font-medium text-slate-600">Minute within each hour</label>
          <input type="number" min="0" max="59" value={schedule.minute} onChange={(e) => patchSchedule({ minute: e.target.value })} disabled={disabled} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
      )}

      {schedule.preset === 'daily' && (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600">Hour</label>
            <input type="number" min="0" max="23" value={schedule.hour} onChange={(e) => patchSchedule({ hour: e.target.value })} disabled={disabled} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Minute</label>
            <input type="number" min="0" max="59" value={schedule.minute} onChange={(e) => patchSchedule({ minute: e.target.value })} disabled={disabled} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
          </div>
        </div>
      )}

      {schedule.preset === 'custom' && (
        <div>
          <label className="block text-xs font-medium text-slate-600">Cron expression</label>
          <input value={schedule.custom} onChange={(e) => patchSchedule({ custom: e.target.value })} disabled={disabled} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm" />
          <FieldHint>Use this only when the preset options are not specific enough.</FieldHint>
        </div>
      )}

      <div>
        <label className="block text-xs font-medium text-slate-600">Timezone</label>
        <input value={timezone} onChange={(e) => setTimezone(e.target.value)} disabled={disabled} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
      </div>

      <div className="rounded-md border border-[#97dbf3]/60 bg-[#e9faff] px-3 py-2 text-sm text-[#0b5869]">
        <p className="font-medium">{schedulePreview(schedule)}</p>
        <p className="mt-1 text-xs">Saved as cron: <code>{cronExpression}</code></p>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} disabled={disabled} />
        Schedule is active
      </label>

      <p className="text-xs text-slate-400">
        Last run: {settings?.lastRunAt ? new Date(settings.lastRunAt).toLocaleString() : '-'} | Next run: {settings?.nextRunAt ? new Date(settings.nextRunAt).toLocaleString() : '-'}
      </p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={saving || disabled} className="rounded-md bg-[#306cb4] px-4 py-2 text-sm font-semibold text-white hover:bg-[#028baa] disabled:opacity-50">
        {saving ? 'Saving...' : 'Save schedule'}
      </button>
    </form>
  );
}

function getModeDescription(definition, executionMode) {
  return definition?.testing?.modeDescriptions?.[executionMode] || {
    dummy: 'Uses embedded dummy data and avoids real external systems.',
    test: 'Runs a local test using this integration test configuration.',
    dry_run: 'Simulates the run and reports what would happen without live side effects.',
    mock_output: 'Uses mock connector outputs instead of real external calls.',
    mock_input: 'Uses mock input behavior where the integration supports it.',
    live: 'Uses saved live credentials and may call real external systems.',
  }[executionMode];
}

function executionModeLabel(definition, mode) {
  return definition?.testing?.modeLabels?.[mode] || EXECUTION_MODE_LABELS[mode] || mode.replace(/_/g, ' ');
}

function connectorLabel(definition, connector) {
  return definition?.credentialTestLabels?.[connector] || CONNECTOR_LABELS[connector] || connector.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function Stat({ label, value }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-slate-800">{value || '-'}</p>
    </div>
  );
}

function ConnectorResult({ result }) {
  if (!result) return null;
  const ok = result.success === true;
  const detailRows = [
    result.provider && ['Provider', result.provider],
    result.step && ['Step', result.step],
    result.statusCode && ['Status', result.statusCode],
    result.errorCode && ['Error code', result.errorCode],
  ].filter(Boolean);

  return (
    <div className={`mt-3 rounded-md border p-3 text-sm ${ok ? 'border-emerald-100 bg-emerald-50 text-emerald-800' : 'border-red-100 bg-red-50 text-red-800'}`}>
      <p className="font-semibold">{ok ? 'Connection test passed' : 'Connection test failed'}</p>
      <p className="mt-1 leading-5">{result.message || (ok ? 'Connection successful.' : 'Connection failed.')}</p>
      {detailRows.length > 0 && (
        <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-[7rem_minmax(0,1fr)]">
          {detailRows.flatMap(([label, value]) => [
            <dt key={`${label}-label`} className="font-semibold">{label}</dt>,
            <dd key={`${label}-value`} className="break-words">{String(value)}</dd>,
          ])}
        </dl>
      )}
      {Array.isArray(result.nextSteps) && result.nextSteps.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide">Next steps</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-xs leading-5">
            {result.nextSteps.map((step) => <li key={step}>{step}</li>)}
          </ul>
        </div>
      )}
      {result.providerError && (
        <pre className="mt-3 max-h-48 overflow-auto rounded-md border border-red-100 bg-white p-2 text-xs text-slate-700">{JSON.stringify(result.providerError, null, 2)}</pre>
      )}
    </div>
  );
}

export default function IntegrationPage() {
  const { id } = useParams();
  const { user } = useAuth();
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
  const [connector, setConnector] = useState('');
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
      const modes = d?.testing?.modes || FALLBACK_EXECUTION_MODES;
      const connectorOptions = d?.credentialTests?.length ? d.credentialTests : d?.connectors || [];
      setIntegration(i);
      setDefinition(d);
      setExecutionMode(d?.testing?.defaultMode || modes[0] || 'test');
      setConnector(connectorOptions[0] || '');
      if (d?.testing?.allowManualPayload === false) setPayloadText('{}');
      else if (d?.testPayloads?.[0]?.payload) setPayloadText(JSON.stringify(d.testPayloads[0].payload, null, 2));
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
    const { saved } = await api.integrations.credentials.save(id, values);
    const { credentials: c } = await api.integrations.credentials.list(id);
    setCredentialFields(c);
    return saved;
  }

  async function handleToggleField(field, value) {
    const { integration: updated } = await api.integrations.update(id, { [field]: value });
    setIntegration(updated);
  }

  function parsePayload() {
    if (definition?.testing?.allowManualPayload === false) return {};
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

  async function handleTestConnector(connectorName) {
    if (!connectorName) return;
    setConnectorTesting(true);
    setConnectorResult(null);
    try {
      const { result } = await api.test.testConnector(id, connectorName);
      setConnectorResult(result);
    } catch (err) {
      setConnectorResult({ success: false, message: err.message });
    } finally {
      setConnectorTesting(false);
    }
  }

  const testing = definition?.testing || {};
  const allowedModes = testing.modes || FALLBACK_EXECUTION_MODES.filter((mode) => {
    if (mode === 'dry_run') return testing.allowDryRun !== false;
    if (mode === 'mock_output') return testing.allowMockOutput !== false;
    return true;
  });
  const allowManualPayload = testing.allowManualPayload !== false;
  const modeDescription = getModeDescription(definition, executionMode);
  const connectorOptions = definition?.credentialTests?.length ? definition.credentialTests : definition?.connectors || [];
  const activeConnector = connectorOptions.includes(connector) ? connector : connectorOptions[0];
  const lastExecution = executions[0];
  const canManage = user?.role !== 'viewer';

  if (loading) return <p className="text-slate-500">Loading...</p>;
  if (!integration) return <p className="text-red-600">{error || 'Integration not found.'}</p>;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <Link to="/" className="text-sm text-slate-500 hover:underline">Back to My Integrations</Link>
        <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-[#0b5869]">{integration.name}</h1>
              <Badge value={integration.type} />
              <Badge value={integration.status} />
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{integration.description}</p>
          </div>
          {canManage ? (
            <div className="flex flex-wrap gap-3 text-sm">
              <label className="flex items-center gap-2 text-slate-600">
                <input type="checkbox" checked={integration.status === 'active'} onChange={(e) => handleToggleField('status', e.target.checked ? 'active' : 'inactive')} />
                Active
              </label>
              <label className="flex items-center gap-2 text-slate-600">
                <input type="checkbox" checked={integration.manualRunEnabled} onChange={(e) => handleToggleField('manualRunEnabled', e.target.checked)} />
                Manual run
              </label>
            </div>
          ) : (
            <Badge value="viewer" />
          )}
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Last status" value={lastExecution?.status} />
          <Stat label="Last trigger" value={lastExecution?.triggerType} />
          <Stat label="Last run" value={lastExecution?.startedAt ? new Date(lastExecution.startedAt).toLocaleString() : '-'} />
          <Stat label="Schedule" value={integration.scheduleSettings?.cronExpression || 'Not scheduled'} />
        </div>
      </div>

      {error && <p className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <div className="space-y-6">
          <Card title={integration.type === 'webhook' ? 'Webhook settings' : 'Schedule settings'} description={integration.type === 'webhook' ? 'Configure how outside apps trigger this integration.' : 'Choose a human-readable schedule. The app saves cron internally.'}>
            {!canManage && <ReadOnlyNotice />}
            {integration.type === 'webhook' ? <WebhookSettingsPanel integration={integration} onUpdated={loadAll} disabled={!canManage} /> : <ScheduleSettingsPanel integration={integration} onUpdated={loadAll} disabled={!canManage} />}
          </Card>

          <Card title="Credentials" description="Only fields declared by this integration are shown. Secrets stay masked after saving.">
            {!canManage && <ReadOnlyNotice />}
            <CredentialForm fields={credentialFields} onSave={handleSaveCredentials} disabled={!canManage} />
          </Card>

          <Card title="Run and test" description="Use the allowed modes for this integration. Test mode should be safe by default.">
            {!canManage && <ReadOnlyNotice>Your role can view previous runs and logs, but cannot start new tests or live runs.</ReadOnlyNotice>}
            {allowManualPayload && definition?.testPayloads?.length > 0 && (
              <div className="mb-3">
                <label className="block text-xs font-medium text-slate-600">Sample payload</label>
                <select onChange={(e) => {
                  const item = definition.testPayloads[e.target.value];
                  if (item) setPayloadText(JSON.stringify(item.payload, null, 2));
                }} className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm" defaultValue="0" disabled={!canManage}>
                  {definition.testPayloads.map((p, idx) => <option key={idx} value={idx}>{p.name}</option>)}
                </select>
              </div>
            )}

            {allowManualPayload ? (
              <div className="mb-3">
                <label className="block text-xs font-medium text-slate-600">Payload (JSON)</label>
                <textarea value={payloadText} onChange={(e) => setPayloadText(e.target.value)} rows={8} readOnly={!canManage} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm" />
              </div>
            ) : (
              <div className="mb-3 rounded-lg border border-[#97dbf3]/60 bg-[#e9faff] p-3 text-sm text-[#0b5869]">
                <p className="font-medium">No request body is needed.</p>
                <p className="mt-1 text-xs">This integration uses a bodyless source request. Local testing uses embedded sample data.</p>
                {definition?.sampleData && <pre className="mt-3 max-h-72 overflow-auto rounded-md border border-[#97dbf3]/60 bg-white p-3 text-xs text-slate-700">{JSON.stringify(definition.sampleData, null, 2)}</pre>}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <select value={executionMode} onChange={(e) => setExecutionMode(e.target.value)} disabled={!canManage} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
                {allowedModes.map((m) => <option key={m} value={m}>{executionModeLabel(definition, m)}</option>)}
              </select>
              <button onClick={handleRunTest} disabled={running || !integration.manualRunEnabled || !canManage} className="rounded-md bg-[#306cb4] px-4 py-2 text-sm font-semibold text-white hover:bg-[#028baa] disabled:opacity-50">
                {running ? 'Running...' : `Run ${executionModeLabel(definition, executionMode)}`}
              </button>
            </div>

            {modeDescription && <p className={`mt-3 rounded-md border px-3 py-2 text-xs leading-5 ${executionMode === 'live' ? 'border-red-200 bg-red-50 text-red-700' : 'border-slate-200 bg-slate-50 text-slate-600'}`}><strong>{executionModeLabel(definition, executionMode)}</strong>: {modeDescription}</p>}

            {testResult && (
              <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm">
                <div className="mb-2 flex items-center gap-2">
                  <Badge value={testResult.status} />
                  <Link to={`/executions/${testResult.id}`} className="text-xs text-[#306cb4] hover:underline">View execution details</Link>
                </div>
                {testResult.errorMessage && <p className="text-red-600">{testResult.errorMessage}</p>}
                {testResult.outputPayload && <pre className="max-h-64 overflow-auto rounded-md border border-slate-200 bg-white p-2 text-xs">{testResult.outputPayload}</pre>}
              </div>
            )}
          </Card>
        </div>

        <aside className="space-y-6">
          {connectorOptions.length > 0 && (
            <Card title="Credential test" description="Choose which external account to verify. The test checks saved credentials without showing secret values.">
              {!canManage && <ReadOnlyNotice>Your role can inspect available credential tests, but cannot run them.</ReadOnlyNotice>}
              <div className="flex items-center gap-2">
                <select value={activeConnector || ''} onChange={(e) => setConnector(e.target.value)} disabled={!canManage} className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm">
                  {connectorOptions.map((c) => <option key={c} value={c}>{connectorLabel(definition, c)}</option>)}
                </select>
                <button onClick={() => handleTestConnector(activeConnector)} disabled={connectorTesting || !activeConnector || !canManage} className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                  {connectorTesting ? 'Testing...' : 'Test'}
                </button>
              </div>
              {activeConnector && (
                <FieldHint>
                  Testing {connectorLabel(definition, activeConnector)} uses the saved credentials for this integration and keeps secrets hidden.
                </FieldHint>
              )}
              <ConnectorResult result={connectorResult} />
            </Card>
          )}

          <Card title="Recent executions" description="Latest runs and their status.">
            <ExecutionsTable executions={executions} />
          </Card>

          <Card title="Logs" description="Recent log events for this integration.">
            <LogsViewer integrationId={id} />
          </Card>
        </aside>
      </div>
    </div>
  );
}
