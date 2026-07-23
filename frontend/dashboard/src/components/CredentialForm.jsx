import { useEffect, useState } from 'react';

const SAVED_SECRET_MASK = '•••••••• saved';

function defaultInputFor(field) {
  if (field.isSecret) return field.saved ? SAVED_SECRET_MASK : '';
  if (field.type === 'boolean') return field.value === true;
  if (field.type === 'json') return field.value !== null && field.value !== undefined ? JSON.stringify(field.value, null, 2) : '';
  if (field.value === null || field.value === undefined) return '';
  return String(field.value);
}

function unchangedInput(field, raw) {
  if (field.isSecret) return raw === SAVED_SECRET_MASK || raw === '' || raw === undefined;
  return raw === defaultInputFor(field);
}

function CredentialHelper({ field }) {
  if (!field.helper && !field.helperUrl) return null;

  return (
    <p className="text-xs text-slate-400 mt-1">
      {field.helper}
      {field.helper && field.helperUrl ? ' ' : ''}
      {field.helperUrl && (
        <a href={field.helperUrl} target="_blank" rel="noreferrer" className="font-medium text-[#306cb4] hover:underline">
          {field.helperUrlLabel || 'Create/manage token'}
        </a>
      )}
    </p>
  );
}

function SecretSavedBadge({ saved }) {
  return (
    <span className={`ml-2 rounded-full px-2.5 py-0.5 text-xs font-semibold ${saved ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-100'}`}>
      {saved ? '•••••••• saved' : 'not set'}
    </span>
  );
}

function SecretStateHint({ field, justSaved }) {
  if (!field.isSecret) return null;

  if (field.saved) {
    return (
      <div className="mt-2 rounded-md border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-800">
        <p className="font-semibold">{justSaved ? 'Saved to the database just now.' : 'Saved securely.'}</p>
        <p>The dots are a secure placeholder, not the actual value. Leave them unchanged to keep the saved secret, or replace them with a new value.</p>
      </div>
    );
  }

  return (
    <div className="mt-2 rounded-md border border-amber-100 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
      This secret is not saved yet. Enter a value and click Save credentials.
    </div>
  );
}

export default function CredentialForm({ fields, onSave, disabled = false }) {
  const [inputs, setInputs] = useState({});
  const [visibleSecrets, setVisibleSecrets] = useState({});
  const [lastSavedKeys, setLastSavedKeys] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');

  useEffect(() => {
    const next = {};
    for (const field of fields) next[field.key] = defaultInputFor(field);
    setInputs(next);
    setVisibleSecrets({});
  }, [fields]);

  function setValue(key, value) {
    setInputs((prev) => ({ ...prev, [key]: value }));
  }

  function toggleSecret(key) {
    setVisibleSecrets((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSavedMessage('');
    setLastSavedKeys([]);

    const values = {};
    for (const field of fields) {
      const raw = inputs[field.key];

      if (unchangedInput(field, raw)) continue;

      if (field.type === 'boolean') {
        values[field.key] = !!raw;
        continue;
      }

      // Blank fields are not sent, so saved values stay untouched.
      if (raw === '' || raw === undefined) continue;

      if (field.type === 'number') {
        values[field.key] = Number(raw);
      } else if (field.type === 'json') {
        try {
          values[field.key] = JSON.parse(raw);
        } catch {
          setError(`${field.label || field.key}: must be valid JSON.`);
          return;
        }
      } else {
        values[field.key] = raw;
      }
    }

    if (Object.keys(values).length === 0) {
      setSavedMessage('No changes to save. Existing saved values and integration defaults remain unchanged.');
      return;
    }

    setSaving(true);
    try {
      const saved = await onSave(values);
      setLastSavedKeys(Array.isArray(saved) ? saved : Object.keys(values));
      setSavedMessage('Credentials saved to the database. Visible integration parameters above now show the saved values.');
    } catch (err) {
      setError(`Save failed: ${err.message || 'Unknown error.'}`);
    } finally {
      setSaving(false);
    }
  }

  if (fields.length === 0) {
    return <p className="text-sm text-slate-500">This integration declares no credential fields.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {fields.map((field) => (
        <div key={field.key}>
          <label htmlFor={`credential-${field.key}`} className="block text-sm font-medium text-slate-700 mb-1">
            {field.label || field.key}
            {field.required && <span className="text-red-500"> *</span>}
            {field.isSecret && <SecretSavedBadge saved={field.saved} />}
          </label>

          {field.type === 'boolean' ? (
            <input
              id={`credential-${field.key}`}
              name={field.key}
              data-testid={`credential-${field.key}`}
              type="checkbox"
              checked={!!inputs[field.key]}
              onChange={(e) => setValue(field.key, e.target.checked)}
              disabled={disabled}
              className="h-4 w-4"
            />
          ) : field.type === 'select' ? (
            <select
              id={`credential-${field.key}`}
              name={field.key}
              data-testid={`credential-${field.key}`}
              value={inputs[field.key] ?? ''}
              onChange={(e) => setValue(field.key, e.target.value)}
              disabled={disabled}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
            >
              <option value="">-- choose --</option>
              {(field.options || []).map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          ) : field.type === 'textarea' || field.type === 'json' ? (
            <textarea
              id={`credential-${field.key}`}
              name={field.key}
              data-testid={`credential-${field.key}`}
              value={inputs[field.key] ?? ''}
              onChange={(e) => setValue(field.key, e.target.value)}
              placeholder={field.placeholder}
              disabled={disabled}
              rows={field.type === 'json' ? 4 : 3}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm font-mono"
            />
          ) : field.isSecret ? (
            <div className="flex rounded border border-slate-300 focus-within:ring-2 focus-within:ring-[#97dbf3]">
              <input
                id={`credential-${field.key}`}
                name={field.key}
                data-testid={`credential-${field.key}`}
                type={visibleSecrets[field.key] ? 'text' : 'password'}
                value={inputs[field.key] ?? ''}
                onFocus={() => {
                  if (inputs[field.key] === SAVED_SECRET_MASK) setValue(field.key, '');
                }}
                onBlur={() => {
                  if (field.saved && !inputs[field.key]) setValue(field.key, SAVED_SECRET_MASK);
                }}
                onChange={(e) => setValue(field.key, e.target.value)}
                placeholder={field.saved ? 'Saved secret placeholder' : 'Enter secret value'}
                disabled={disabled}
                className="min-w-0 flex-1 rounded-l px-3 py-2 text-sm outline-none"
              />
              <button
                type="button"
                onClick={() => toggleSecret(field.key)}
                disabled={disabled}
                className="shrink-0 border-l border-slate-300 px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
                aria-label={visibleSecrets[field.key] ? `Hide ${field.label || field.key}` : `Show ${field.label || field.key}`}
                title={visibleSecrets[field.key] ? 'Hide password' : 'Show password'}
              >
                {visibleSecrets[field.key] ? 'Hide' : 'Show'}
              </button>
            </div>
          ) : (
            <input
              id={`credential-${field.key}`}
              name={field.key}
              data-testid={`credential-${field.key}`}
              type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'email' ? 'email' : 'text'}
              value={inputs[field.key] ?? ''}
              onChange={(e) => setValue(field.key, e.target.value)}
              placeholder={field.placeholder}
              disabled={disabled}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
            />
          )}

          <CredentialHelper field={field} />
          <SecretStateHint field={field} justSaved={lastSavedKeys.includes(field.key)} />
        </div>
      ))}

      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {savedMessage && <p className="text-sm text-green-600">{savedMessage}</p>}

      <button type="submit" disabled={saving || disabled} className="bg-slate-800 text-white rounded px-4 py-2 text-sm font-medium hover:bg-slate-700 disabled:opacity-50">
        {saving ? 'Saving...' : 'Save credentials'}
      </button>
    </form>
  );
}
