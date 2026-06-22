import { useEffect, useState } from 'react';

function defaultInputFor(field) {
  if (field.isSecret) return '';
  if (field.type === 'boolean') return field.value === true;
  if (field.type === 'json') return field.value !== null && field.value !== undefined ? JSON.stringify(field.value, null, 2) : '';
  if (field.value === null || field.value === undefined) return '';
  return String(field.value);
}

export default function CredentialForm({ fields, onSave }) {
  const [inputs, setInputs] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');

  useEffect(() => {
    const next = {};
    for (const field of fields) next[field.key] = defaultInputFor(field);
    setInputs(next);
  }, [fields]);

  function setValue(key, value) {
    setInputs((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSavedMessage('');

    const values = {};
    for (const field of fields) {
      const raw = inputs[field.key];

      if (field.type === 'boolean') {
        values[field.key] = !!raw;
        continue;
      }

      // Secret fields and anything left blank: don't send it, so an
      // already-saved value is left untouched (CLAUDE.md 5.6 — the user
      // can overwrite a secret but never reads the existing value).
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

    setSaving(true);
    try {
      await onSave(values);
      setSavedMessage('Credentials saved.');
    } catch (err) {
      setError(err.message);
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
          <label className="block text-sm font-medium text-slate-700 mb-1">
            {field.label || field.key}
            {field.required && <span className="text-red-500"> *</span>}
            {field.isSecret && (
              <span className="ml-2 text-xs font-normal text-slate-400">
                {field.saved ? '•••••• saved — leave blank to keep' : 'not set'}
              </span>
            )}
          </label>

          {field.type === 'boolean' ? (
            <input
              type="checkbox"
              checked={!!inputs[field.key]}
              onChange={(e) => setValue(field.key, e.target.checked)}
              className="h-4 w-4"
            />
          ) : field.type === 'select' ? (
            <select
              value={inputs[field.key] ?? ''}
              onChange={(e) => setValue(field.key, e.target.value)}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
            >
              <option value="">— choose —</option>
              {(field.options || []).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : field.type === 'textarea' || field.type === 'json' ? (
            <textarea
              value={inputs[field.key] ?? ''}
              onChange={(e) => setValue(field.key, e.target.value)}
              placeholder={field.placeholder}
              rows={field.type === 'json' ? 4 : 3}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm font-mono"
            />
          ) : (
            <input
              type={field.isSecret ? 'password' : field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}
              value={inputs[field.key] ?? ''}
              onChange={(e) => setValue(field.key, e.target.value)}
              placeholder={field.isSecret ? '••••••••' : field.placeholder}
              className="w-full border border-slate-300 rounded px-3 py-2 text-sm"
            />
          )}

          {field.helper && <p className="text-xs text-slate-400 mt-1">{field.helper}</p>}
        </div>
      ))}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {savedMessage && <p className="text-sm text-green-600">{savedMessage}</p>}

      <button
        type="submit"
        disabled={saving}
        className="bg-slate-800 text-white rounded px-4 py-2 text-sm font-medium hover:bg-slate-700 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save credentials'}
      </button>
    </form>
  );
}
