import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api/client.js';
import ActivityPanel from '../components/ActivityPanel.jsx';
import Badge from '../components/Badge.jsx';
import CredentialForm from '../components/CredentialForm.jsx';
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

function CollapsibleCard({ title, description, children, defaultOpen = true, open, onToggle }) {
  const isControlled = typeof open === 'boolean' && typeof onToggle === 'function';
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = isControlled ? open : internalOpen;

  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <button
        type="button"
        onClick={() => {
          if (isControlled) onToggle(!isOpen);
          else setInternalOpen((value) => !value);
        }}
        className={`${isOpen ? 'mb-4 ' : ''}flex w-full items-start justify-between gap-3 text-left`}
        aria-expanded={isOpen}
      >
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          {description && <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>}
        </div>
        <span className="text-xs text-slate-500">{isOpen ? 'Close section ▲' : 'Open section ▼'}</span>
      </button>
      <div hidden={!isOpen}>{children}</div>
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

function WebhookSettingsPanel({ integration, definition, disabled = false }) {
  const [tokenInput, setTokenInput] = useState('');
  const [tokenVisible, setTokenVisible] = useState(false);
  const [tokenConfigured, setTokenConfigured] = useState(Boolean(integration.webhookSettings?.secretTokenReference));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const settings = integration.webhookSettings;
  const webhookUrl = settings?.webhookUrl || `/webhooks/.../${integration.slug}`;
  const isFullWebhookUrl = /^https?:\/\//i.test(webhookUrl);
  const samplePayload = definition?.testPayloads?.[0]?.payload;
  const sampleDescription = definition?.testPayloads?.[0]?.description;

  useEffect(() => {
    setTokenInput('');
    setTokenVisible(false);
    setTokenConfigured(Boolean(integration.webhookSettings?.secretTokenReference));
  }, [integration.id, integration.webhookSettings?.secretTokenReference]);

  async function rotateToken(e) {
    e.preventDefault();
    setError('');
    setSavedMessage('');
    const nextToken = tokenInput.trim();
    if (!nextToken) {
      setError('Paste the Priority BPM token generated by Priority before saving.');
      return;
    }
    setSaving(true);
    try {
      await api.integrations.webhookSettings(integration.id, { token: nextToken });
      setTokenInput('');
      setTokenVisible(false);
      setTokenConfigured(true);
      setSavedMessage('Priority BPM token saved securely. Incoming webhooks must send the same value in the Priority-BPM-Token header.');
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
          {' '}Priority must send the saved secret in the Priority-BPM-Token header.
        </FieldHint>
      </div>
      <form onSubmit={rotateToken} className="space-y-2">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <span>Priority BPM token</span>
          {tokenConfigured ? <Badge value="active">saved</Badge> : <Badge value="inactive">not set</Badge>}
        </div>
        <div className="flex rounded-md border border-slate-300 focus-within:ring-2 focus-within:ring-[#97dbf3]">
          <input
            type={tokenVisible ? 'text' : 'password'}
            value={tokenInput}
            onChange={(e) => setTokenInput(e.target.value)}
            placeholder={disabled ? 'Token changes disabled for viewer role' : tokenConfigured ? '•••••••• saved — enter a replacement only' : 'Paste token generated by Priority'}
            disabled={disabled}
            autoComplete="new-password"
            className="min-w-0 flex-1 rounded-l-md px-3 py-2 font-mono text-sm outline-none"
          />
          <button
            type="button"
            onClick={() => setTokenVisible((value) => !value)}
            disabled={disabled || !tokenInput}
            className="border-l border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            aria-label={tokenVisible ? 'Hide new Priority BPM token' : 'Show new Priority BPM token'}
          >
            {tokenVisible ? 'Hide' : 'Show'}
          </button>
          <button type="submit" disabled={saving || !tokenInput.trim() || disabled} className="rounded-r-md bg-[#306cb4] px-3 py-2 text-sm font-semibold text-white hover:bg-[#028baa] disabled:opacity-50">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
      <FieldHint>
        The saved token is never returned or displayed. Leave this field empty to keep it; enter a new value only to replace it. Rejected attempts are logged without token values, lengths, or fingerprints.
      </FieldHint>
      <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600">
        <p className="font-medium text-slate-700">Expected Priority request</p>
        <p className="mt-1">Header: <code>Priority-BPM-Token: &lt;saved Priority token&gt;</code></p>
        {samplePayload ? (
          <>
            <p className="mt-1">Body:</p>
            <pre className="mt-1 max-h-48 overflow-auto rounded border border-slate-200 bg-white p-2">{JSON.stringify(samplePayload, null, 2)}</pre>
            {sampleDescription && <p className="mt-1">{sampleDescription}</p>}
          </>
        ) : (
          <p className="mt-1">Use the payload format documented for this integration.</p>
        )}
      </div>
      {savedMessage && <p className="rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{savedMessage}</p>}
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

function ConnectorResult({ result }) {
  if (!result) return null;
  const ok = result.success === true;
  const resultType = result.configurationOnly ? 'Settings check' : 'Connection test';
  const nextSteps = [
    ...(result.nextStep ? [result.nextStep] : []),
    ...(Array.isArray(result.nextSteps) ? result.nextSteps : []),
  ].filter((step, index, all) => step && all.indexOf(step) === index);
  const detailRows = [
    result.provider && ['Provider', result.provider],
    result.step && ['Step', result.step],
    result.statusCode && ['Status', result.statusCode],
    result.errorCode && ['Error code', result.errorCode],
  ].filter(Boolean);

  return (
    <div className={`mt-3 rounded-md border p-3 text-sm ${ok ? 'border-emerald-100 bg-emerald-50 text-emerald-800' : 'border-red-100 bg-red-50 text-red-800'}`}>
      <p className="font-semibold">{`${resultType} ${ok ? 'passed' : 'failed'}`}</p>
      <p className="mt-1 leading-5">{result.message || (ok ? 'Connection successful.' : 'Connection failed.')}</p>
      {result.testedAt && <p className="mt-1 text-xs">Last checked: {new Date(result.testedAt).toLocaleString()}</p>}
      {detailRows.length > 0 && (
        <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-[7rem_minmax(0,1fr)]">
          {detailRows.flatMap(([label, value]) => [
            <dt key={`${label}-label`} className="font-semibold">{label}</dt>,
            <dd key={`${label}-value`} className="break-words">{String(value)}</dd>,
          ])}
        </dl>
      )}
      {nextSteps.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide">Next steps</p>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-xs leading-5">
            {nextSteps.map((step) => <li key={step}>{step}</li>)}
          </ul>
        </div>
      )}
      {result.providerError && (
        <pre className="mt-3 max-h-48 overflow-auto rounded-md border border-red-100 bg-white p-2 text-xs text-slate-700">{JSON.stringify(result.providerError, null, 2)}</pre>
      )}
    </div>
  );
}

function InlineEditableText({ value, onSave, disabled = false, display, displayClassName, inputClassName }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setDraft(value || '');
    setError('');
    setEditing(false);
  }, [value]);

  async function save() {
    setError('');
    const nextValue = draft.trim();
    if (!nextValue) {
      setError('Value is required.');
      return;
    }
    if (nextValue === value) {
      setDraft(value || '');
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(nextValue);
      setEditing(false);
    } catch (err) {
      setError(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setDraft(value || '');
    setError('');
    setEditing(false);
  }

  if (editing && !disabled) {
    return (
      <span className="inline-flex max-w-full flex-col gap-1 align-middle">
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={save}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save();
            if (e.key === 'Escape') cancel();
          }}
          disabled={saving}
          className={inputClassName}
        />
        {error && <span className="text-xs font-normal text-red-600">{error}</span>}
      </span>
    );
  }

  return (
    <span
      onDoubleClick={() => !disabled && setEditing(true)}
      className={displayClassName}
      title={disabled ? undefined : 'Double-click to edit'}
    >
      {display || value}
    </span>
  );
}

function EditableDescriptionBox({ value, onSave, disabled = false }) {
  const [draft, setDraft] = useState(value || '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const hasChanges = draft !== (value || '');

  useEffect(() => {
    setDraft(value || '');
    setMessage('');
    setError('');
  }, [value]);

  async function save() {
    setMessage('');
    setError('');
    if (!hasChanges) {
      setMessage('No changes to save.');
      return;
    }
    setSaving(true);
    try {
      await onSave(draft.trim());
      setMessage('Saved successfully.');
    } catch (err) {
      setError(`Save failed: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setDraft(value || '');
    setMessage('');
    setError('');
  }

  return (
    <div className="mt-2 max-w-3xl">
      <label className="sr-only">Integration notes</label>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        readOnly={disabled}
        rows={2}
        placeholder={disabled ? '' : 'Write notes that help users remember how to work with this integration.'}
        className="w-full resize-y rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm leading-6 text-slate-700 outline-none transition focus:border-amber-300 focus:bg-white focus:ring-2 focus:ring-amber-200 disabled:cursor-not-allowed disabled:bg-slate-50"
      />
      {!disabled && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saving || !hasChanges}
            className="rounded-md bg-[#306cb4] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#028baa] disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save notes'}
          </button>
          <button
            type="button"
            onClick={cancel}
            disabled={saving || !hasChanges}
            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          {message && <span className="text-xs text-emerald-700">{message}</span>}
          {error && <span className="text-xs text-red-600">{error}</span>}
        </div>
      )}
    </div>
  );
}

function splitCredentialFields(fields) {
  const buckets = { webhook: [], messaging: [], priority: [], other: [] };
  for (const field of fields || []) {
    const key = String(field.key || '').toUpperCase();
    if (key.startsWith('WHATSAPP_') || key.startsWith('ITC_')) {
      buckets.messaging.push(field);
    } else if (key.startsWith('PRIORITY_')) {
      buckets.priority.push(field);
    } else {
      buckets.other.push(field);
    }
  }
  return buckets;
}

function sectionConnectors(definition, token) {
  const all = definition?.credentialTests?.length ? definition.credentialTests : definition?.connectors || [];
  const lowered = String(token).toLowerCase();
  return all.filter((connector) => String(connector).toLowerCase().includes(lowered));
}

function connectorLabel(connector) {
  const labels = {
    priorityWebSdk: 'Priority Web SDK',
    itc: 'ITC',
    whatsappCloud: 'WhatsApp Cloud API',
  };
  return labels[connector] || String(connector || '').replace(/([a-z])([A-Z])/g, '$1 $2');
}

function ConnectorTestPanel({ title, description, buttonLabel = 'Test', activeConnector, onConnectorChange, onTest, disabled, result, testing, options }) {
  if (!options || options.length === 0) {
    return <p className="text-sm text-slate-500">No connector test is configured for this section.</p>;
  }

  return (
    <section className="mt-3 space-y-3">
      <h3 className="text-sm font-medium text-slate-700">{title}</h3>
      {description && <p className="text-xs leading-5 text-slate-500">{description}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={activeConnector || ''}
          onChange={(e) => onConnectorChange(e.target.value)}
          disabled={disabled}
          className="min-w-0 flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          {options.map((connector) => (
            <option key={connector} value={connector}>
              {connectorLabel(connector)}
            </option>
          ))}
        </select>
        <button
          onClick={() => onTest(activeConnector)}
          disabled={testing || !activeConnector || disabled}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {testing ? 'Checking...' : buttonLabel}
        </button>
      </div>
      <ConnectorResult result={result} />
    </section>
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
  const [itcPayloadText, setItcPayloadText] = useState('{}');
  const [itcExecutionMode, setItcExecutionMode] = useState('test');
  const [itcRunning, setItcRunning] = useState(false);
  const [itcTestResult, setItcTestResult] = useState(null);
  const [itcTestError, setItcTestError] = useState('');
  const [connectorTesting, setConnectorTesting] = useState(false);
  const [connectorResultMap, setConnectorResultMap] = useState({ webhook: null, messaging: null, priority: null });
  const [activeTestConnector, setActiveTestConnector] = useState({
    webhook: '',
    messaging: '',
    priority: '',
  });
  const [sectionOpenState, setSectionOpenState] = useState({
    webhook: true,
    messaging: true,
    priority: true,
    logs: true,
  });
  const [selectedActivityExecutionId, setSelectedActivityExecutionId] = useState('');
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
      const messagingOptions = connectorOptions.filter((item) => {
        const connectorName = String(item).toLowerCase();
        return connectorName.includes('whatsapp') || connectorName.includes('itc');
      });
      const priorityOptions = connectorOptions.filter((item) => String(item).toLowerCase().includes('priority'));
      const messagingConnector = messagingOptions[0] || '';
      const priorityConnector = priorityOptions[0] || '';
      const [messagingStatus, priorityStatus] = await Promise.all([
        messagingConnector ? api.test.connectorStatus(id, messagingConnector).catch(() => ({ result: null })) : Promise.resolve({ result: null }),
        priorityConnector ? api.test.connectorStatus(id, priorityConnector).catch(() => ({ result: null })) : Promise.resolve({ result: null }),
      ]);
      setIntegration(i);
      setDefinition(d);
      setExecutionMode(d?.testing?.defaultMode || modes[0] || 'test');
      setItcExecutionMode(d?.testing?.defaultMode || modes[0] || 'test');
      setActiveTestConnector({
        webhook: connectorOptions[0] || '',
        messaging: messagingOptions[0] || connectorOptions[0] || '',
        priority: priorityOptions[0] || connectorOptions[0] || '',
      });
      setConnectorResultMap({
        webhook: null,
        messaging: messagingStatus.result,
        priority: priorityStatus.result,
      });
      if (d?.testing?.allowManualPayload === false) {
        setPayloadText('{}');
        setItcPayloadText('{}');
      } else if (d?.testPayloads?.[0]?.payload) {
        const samplePayload = JSON.stringify(d.testPayloads[0].payload, null, 2);
        setPayloadText(samplePayload);
        setItcPayloadText(samplePayload);
      }
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

  async function refreshExecutions() {
    const { executions: e } = await api.executions.listForIntegration(id);
    setExecutions(e);
  }

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

  async function handleInlineUpdate(field, value) {
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
    if (
      executionMode === 'live' &&
      !window.confirm(usesItc ? 'Live run will generate a real Priority sales-order confirmation and send its URL in a real ITC message. Continue?' : 'Live run may call real external systems. Continue?')
    ) return;
    setError('');
    setRunning(true);
    setTestResult(null);
    try {
      const { execution } = await api.test.test(id, { payload, executionMode });
      setTestResult(execution);
      setSelectedActivityExecutionId(execution.id);
      await refreshExecutions();
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  }

  async function handleItcFlowTest() {
    setItcTestResult(null);
    let payload;
    try {
      payload = JSON.parse(itcPayloadText || '{}');
      if (!payload || Array.isArray(payload) || typeof payload !== 'object') {
        throw new Error('The JSON must contain an object.');
      }
    } catch (err) {
      setItcTestError(err.message === 'The JSON must contain an object.' ? err.message : 'Enter valid JSON before running the ITC test.');
      return;
    }

    const order = payload.ORDERS;
    const requiredOrderFields = ['ORDNAME', 'ZANA_CUSTDES', 'ZANA_PHONENUM'];
    const missingFields = requiredOrderFields.filter((field) => (
      !order || typeof order !== 'object' || Array.isArray(order) ||
      typeof order[field] !== 'string' || !order[field].trim()
    ));
    if (missingFields.length) {
      setItcTestError(`Add non-empty text values for: ${missingFields.map((field) => `ORDERS.${field}`).join(', ')}.`);
      return;
    }
    payload = {
      ORDERS: {
        ORDNAME: order.ORDNAME,
        ZANA_CUSTDES: order.ZANA_CUSTDES,
        ZANA_PHONENUM: order.ZANA_PHONENUM,
      },
    };

    if (
      itcExecutionMode === 'live' &&
      !window.confirm('This live test will generate a real Priority sales-order confirmation and send a real ITC message to the phone number in the JSON. Continue?')
    ) return;

    setError('');
    setItcTestError('');
    setItcRunning(true);
    setItcTestResult(null);
    try {
      const { execution } = await api.test.test(id, { payload, executionMode: itcExecutionMode });
      setItcTestResult(execution);
      setSelectedActivityExecutionId(execution.id);
      await refreshExecutions();
    } catch (err) {
      setItcTestError(`ITC flow test failed: ${err.message}`);
    } finally {
      setItcRunning(false);
    }
  }

  async function handleTestConnector(connectorName) {
    if (!connectorName) return;
    setConnectorTesting(true);
    try {
      const { result } = await api.test.testConnector(id, connectorName);
      return result;
    } catch (err) {
      return { success: false, message: err.message };
    } finally {
      setConnectorTesting(false);
    }
  }

  async function handleSectionConnectorTest(sectionKey, connectorName) {
    const result = await handleTestConnector(connectorName);
    setConnectorResultMap((previous) => ({
      ...previous,
      [sectionKey]: result,
    }));
  }

  const testing = definition?.testing || {};
  const allowedModes = testing.modes || FALLBACK_EXECUTION_MODES.filter((mode) => {
    if (mode === 'dry_run') return testing.allowDryRun !== false;
    if (mode === 'mock_output') return testing.allowMockOutput !== false;
    return true;
  });
  const allowManualPayload = testing.allowManualPayload !== false;
  const modeDescription = getModeDescription(definition, executionMode);
  const webhookOptions = sectionConnectors(definition, 'webhook');
  const messagingOptions = [
    ...sectionConnectors(definition, 'whatsapp'),
    ...sectionConnectors(definition, 'itc'),
  ].filter((connector, index, all) => all.indexOf(connector) === index);
  const priorityOptions = sectionConnectors(definition, 'priority');
  const credentialBuckets = useMemo(() => splitCredentialFields(credentialFields), [credentialFields]);
  const usesItc = credentialBuckets.messaging.some((field) => String(field.key || '').toUpperCase().startsWith('ITC_'));
  const messagingSectionTitle = definition?.uiux?.credentialSectionTitle || (usesItc ? 'ITC settings' : 'WhatsApp settings');
  const messagingSectionDescription = usesItc
    ? 'ITC template endpoint, sending channel, and securely masked bearer token. Variable 3 is generated from Priority and is not a static setting.'
    : 'WhatsApp credentials and connector test.';
  const showMessagingSection = credentialBuckets.messaging.length > 0 || messagingOptions.length > 0;
  const showPrioritySection = credentialBuckets.priority.length > 0 || priorityOptions.length > 0;
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
              <InlineEditableText
                value={integration.name}
                disabled={!canManage}
                onSave={(value) => handleInlineUpdate('name', value)}
                display={<h1 className="text-2xl font-semibold text-[#0b5869]">{integration.name}</h1>}
                displayClassName="max-w-full cursor-text rounded-md"
                inputClassName="w-full max-w-xl rounded-md border border-[#97dbf3] px-2 py-1 text-2xl font-semibold text-[#0b5869] outline-none ring-2 ring-[#97dbf3]/30"
              />
              <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-600" title={integration.integrationKey || integration.id}>
                #{integration.integrationKey || integration.id}
              </span>
              <InlineEditableText
                value={integration.version || '1.0.0'}
                disabled={!canManage}
                onSave={(value) => handleInlineUpdate('version', value)}
                display={`v${integration.version || '1.0.0'}`}
                displayClassName="cursor-text rounded bg-[#e9faff] px-2 py-0.5 font-mono text-xs text-[#0b5869]"
                inputClassName="w-24 rounded border border-[#97dbf3] px-2 py-0.5 font-mono text-xs text-[#0b5869] outline-none ring-2 ring-[#97dbf3]/30"
              />
              <Badge value={integration.type} />
              <Badge value={integration.status} />
            </div>
            <EditableDescriptionBox
              value={integration.description}
              disabled={!canManage}
              onSave={(value) => handleInlineUpdate('description', value)}
            />
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
      </div>

      {error && <p className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="space-y-3 text-right">
        <button
          type="button"
          onClick={() => setSectionOpenState({ webhook: true, messaging: true, priority: true, logs: true })}
          className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Open all
        </button>
        <button
          type="button"
          onClick={() => setSectionOpenState({ webhook: false, messaging: false, priority: false, logs: false })}
          className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          Close all
        </button>
      </div>

      <div className="space-y-6">
        <CollapsibleCard
          title="Webhook settings"
          description="Webhook configuration, webhook credentials, and workflow test."
          open={sectionOpenState.webhook}
          onToggle={(value) => setSectionOpenState((state) => ({ ...state, webhook: value }))}
        >
          {!canManage && <ReadOnlyNotice />}
          {integration.type === 'webhook' ? (
            <WebhookSettingsPanel integration={integration} definition={definition} disabled={!canManage} />
          ) : (
            <ScheduleSettingsPanel integration={integration} onUpdated={loadAll} disabled={!canManage} />
          )}

          <section className="mt-4 space-y-4">
            {credentialBuckets.other.length > 0 && (
              <>
                <h3 className="text-sm font-medium text-slate-700">Additional credentials</h3>
                <CredentialForm
                  fields={credentialBuckets.other}
                  onSave={handleSaveCredentials}
                  disabled={!canManage}
                />
              </>
            )}

            <h3 className="text-sm font-medium text-slate-700">Webhook test</h3>
            {!canManage && <ReadOnlyNotice>Your role can view previous runs and logs, but cannot start new tests or live runs.</ReadOnlyNotice>}
            {allowManualPayload && definition?.testPayloads?.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-slate-600">Sample payload</label>
                <select
                  onChange={(e) => {
                    const item = definition.testPayloads[e.target.value];
                    if (item) setPayloadText(JSON.stringify(item.payload, null, 2));
                  }}
                  className="mt-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
                  defaultValue="0"
                  disabled={!canManage}
                >
                  {definition.testPayloads.map((p, idx) => <option key={idx} value={idx}>{p.name}</option>)}
                </select>
              </div>
            )}
            {allowManualPayload ? (
              <div>
                <label className="block text-xs font-medium text-slate-600">Payload (JSON)</label>
                <textarea value={payloadText} onChange={(e) => setPayloadText(e.target.value)} rows={8} readOnly={!canManage} className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm" />
              </div>
            ) : (
              <div className="rounded-lg border border-[#97dbf3]/60 bg-[#e9faff] p-3 text-sm text-[#0b5869]">
                <p className="font-medium">No request body is needed.</p>
                <p className="mt-1 text-xs">This integration uses a bodyless source request. Local testing uses embedded sample data.</p>
                {definition?.sampleData && <pre className="mt-3 max-h-72 overflow-auto rounded-md border border-[#97dbf3]/60 bg-white p-3 text-xs text-slate-700">{JSON.stringify(definition.sampleData, null, 2)}</pre>}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <select value={executionMode} onChange={(e) => setExecutionMode(e.target.value)} disabled={!canManage} className="rounded-md border border-slate-300 px-3 py-2 text-sm">
                {allowedModes.map((m) => <option key={m} value={m}>{executionModeLabel(definition, m)}</option>)}
              </select>
              <button
                onClick={handleRunTest}
                disabled={running || !integration.manualRunEnabled || !canManage}
                className="rounded-md bg-[#306cb4] px-4 py-2 text-sm font-semibold text-white hover:bg-[#028baa] disabled:opacity-50"
              >
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
                {testResult.outputPayload && <pre className="max-h-64 overflow-auto rounded-md border border-slate-300 bg-white p-2 text-xs">{testResult.outputPayload}</pre>}
              </div>
            )}
          </section>
        </CollapsibleCard>

        {showMessagingSection && (
          <CollapsibleCard
            title={messagingSectionTitle}
            description={messagingSectionDescription}
            open={sectionOpenState.messaging}
            onToggle={(value) => setSectionOpenState((state) => ({ ...state, messaging: value }))}
          >
            <CredentialForm fields={credentialBuckets.messaging} onSave={handleSaveCredentials} disabled={!canManage} />
            <ConnectorTestPanel
              title={usesItc ? 'Check ITC settings' : 'WhatsApp test'}
              description={usesItc ? 'Validates the saved ITC endpoint, token presence, and channel format. It does not contact ITC or send a message.' : undefined}
              buttonLabel={usesItc ? 'Check settings' : 'Test'}
              activeConnector={activeTestConnector.messaging}
              onConnectorChange={(value) => setActiveTestConnector((valueMap) => ({ ...valueMap, messaging: value }))}
              onTest={(connector) => handleSectionConnectorTest('messaging', connector)}
              disabled={!canManage}
              result={connectorResultMap.messaging}
              testing={connectorTesting}
              options={messagingOptions}
            />
            {usesItc && allowManualPayload && (
              <section className="mt-5 space-y-3 rounded-lg border border-[#97dbf3]/70 bg-[#f5fcff] p-4">
                <div>
                  <h3 className="text-sm font-semibold text-[#0b5869]">Test ITC message flow</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    Paste the source order JSON to map. Safe modes do not contact Priority or ITC. Live mode generates the Priority document and sends a real ITC message to the phone number in the JSON.
                  </p>
                </div>
                {!canManage && <ReadOnlyNotice>Your role can view settings, but cannot start an ITC flow test.</ReadOnlyNotice>}
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label htmlFor="itc-test-json" className="block text-xs font-medium text-slate-700">JSON to send</label>
                    {definition?.testPayloads?.[0]?.payload && canManage && (
                      <button
                        type="button"
                        onClick={() => {
                          setItcPayloadText(JSON.stringify(definition.testPayloads[0].payload, null, 2));
                          setItcTestError('');
                          setItcTestResult(null);
                        }}
                        className="text-xs font-medium text-[#306cb4] hover:underline"
                      >
                        Restore sample JSON
                      </button>
                    )}
                  </div>
                  <textarea
                    id="itc-test-json"
                    value={itcPayloadText}
                    onChange={(event) => {
                      setItcPayloadText(event.target.value);
                      if (itcTestError) setItcTestError('');
                      setItcTestResult(null);
                    }}
                    rows={10}
                    readOnly={!canManage}
                    spellCheck={false}
                    className="mt-1 w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm outline-none focus:border-[#028baa] focus:ring-2 focus:ring-[#97dbf3]/40"
                  />
                  <p className="mt-1 text-xs text-slate-500">Expected fields for this automation: ORDERS.ORDNAME, ORDERS.ZANA_CUSTDES, and ORDERS.ZANA_PHONENUM.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label htmlFor="itc-test-mode" className="sr-only">ITC test mode</label>
                  <select
                    id="itc-test-mode"
                    value={itcExecutionMode}
                    onChange={(event) => {
                      setItcExecutionMode(event.target.value);
                      setItcTestError('');
                      setItcTestResult(null);
                    }}
                    disabled={!canManage}
                    className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm"
                  >
                    {allowedModes.map((mode) => <option key={mode} value={mode}>{executionModeLabel(definition, mode)}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={handleItcFlowTest}
                    disabled={itcRunning || !integration.manualRunEnabled || !canManage}
                    className={`rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 ${itcExecutionMode === 'live' ? 'bg-red-600 hover:bg-red-700' : 'bg-[#306cb4] hover:bg-[#028baa]'}`}
                  >
                    {itcRunning ? 'Running...' : itcExecutionMode === 'live' ? 'Send live ITC test' : 'Run ITC test'}
                  </button>
                </div>
                {canManage && !integration.manualRunEnabled && (
                  <p className="text-xs font-medium text-amber-700">Enable Manual run at the top of this page to use the ITC flow test.</p>
                )}
                <p className={`rounded-md border px-3 py-2 text-xs leading-5 ${itcExecutionMode === 'live' ? 'border-red-200 bg-red-50 text-red-700' : 'border-slate-200 bg-white text-slate-600'}`}>
                  <strong>{executionModeLabel(definition, itcExecutionMode)}</strong>: {getModeDescription(definition, itcExecutionMode)}
                </p>
                {itcTestError && <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{itcTestError}</p>}
                {itcTestResult && (
                  <div role="status" aria-live="polite" className="rounded-md border border-slate-200 bg-white p-3 text-sm">
                    <div className="mb-2 flex items-center gap-2">
                      <Badge value={itcTestResult.status} />
                      <Link to={`/executions/${itcTestResult.id}`} className="text-xs text-[#306cb4] hover:underline">View execution details</Link>
                    </div>
                    {itcTestResult.errorMessage && <p className="text-red-600">{itcTestResult.errorMessage}</p>}
                    {itcTestResult.outputPayload && <pre className="max-h-64 overflow-auto rounded-md border border-slate-300 bg-slate-50 p-2 text-xs">{itcTestResult.outputPayload}</pre>}
                  </div>
                )}
              </section>
            )}
          </CollapsibleCard>
        )}

        {showPrioritySection && (
          <CollapsibleCard
            title="Priority settings"
            description="Priority credentials and connector test."
            open={sectionOpenState.priority}
            onToggle={(value) => setSectionOpenState((state) => ({ ...state, priority: value }))}
          >
            <CredentialForm fields={credentialBuckets.priority} onSave={handleSaveCredentials} disabled={!canManage} />
            <ConnectorTestPanel
              title={priorityOptions.includes('priorityWebSdk') ? 'Test Priority Web SDK login' : 'Priority test'}
              description={priorityOptions.includes('priorityWebSdk') ? 'Logs in with the saved Priority Web SDK credentials without running WWWSHOWORDER or generating a document.' : undefined}
              buttonLabel={priorityOptions.includes('priorityWebSdk') ? 'Test login' : 'Test'}
              activeConnector={activeTestConnector.priority}
              onConnectorChange={(value) => setActiveTestConnector((valueMap) => ({ ...valueMap, priority: value }))}
              onTest={(connector) => handleSectionConnectorTest('priority', connector)}
              disabled={!canManage}
              result={connectorResultMap.priority}
              testing={connectorTesting}
              options={priorityOptions}
            />
          </CollapsibleCard>
        )}

        <CollapsibleCard
          title="Activity & logs"
          description="Executions and webhook attempts in one timeline. Select a row to see the cause and complete log."
          open={sectionOpenState.logs}
          onToggle={(value) => setSectionOpenState((state) => ({ ...state, logs: value }))}
        >
          <ActivityPanel integrationId={id} executions={executions} onRefresh={refreshExecutions} selectedExecutionId={selectedActivityExecutionId} />
        </CollapsibleCard>
      </div>
    </div>
  );
}
