import { useEffect, useState } from 'react';

const labels = { verified: 'מאומתת', pending: 'ממתינה לאימות', unknown: 'לא ניתן לבדוק כרגע' };
const outcomes = { accepted: 'SES קיבל את בקשת השליחה', skipped: 'דולג', failed: 'השליחה נכשלה', unknown: 'תוצאת השליחה אינה ידועה' };

// Shared log controls; API requests and saved membership are integration-scoped.
export default function NotificationRecipients({ integrationId, api, canEdit = false }) {
  return <RecipientsForm key={integrationId} integrationId={integrationId} api={api} canEdit={canEdit} />;
}

function RecipientsForm({ integrationId, api, canEdit }) {
  const [value, setValue] = useState('');
  const [recipients, setRecipients] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [sendingEnabled, setSendingEnabled] = useState(false);
  const [managementEnabled, setManagementEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    setBusy(true); setResult(null); setError(''); setValue(''); setRecipients([]);
    api.list(integrationId).then((data) => {
      if (active) { setSendingEnabled(data.emailSendingEnabled === true); setManagementEnabled(data.recipientManagementEnabled === true); setRecipients(data.recipients); setValue(data.recipients.map((item) => item.email).join(', ')); }
    }).catch(() => { if (active) setError('לא ניתן לטעון את הנמענים כרגע.'); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [integrationId, api]);

  async function act(test) {
    setBusy(true); setError(''); setResult(null);
    try {
      const data = test ? await api.test(integrationId) : await api.save(integrationId, value);
      if (test) { setResult(data); setRecipients(data.results); }
      else { setRecipients(data.recipients); setValue(data.recipients.map((item) => item.email).join(', ')); }
    } catch (failure) {
      setError(failure.invalid?.length ? `${failure.message} ${failure.invalid.map((item) => item || '(כתובת ריקה)').join(', ')}` : failure.message || 'הפעולה נכשלה.');
    }
    finally { setBusy(false); }
  }

  return <section dir="rtl" aria-label="נמעני מייל" className="rounded-lg border bg-white p-4 space-y-3">
    {!busy && !sendingEnabled && <p role="status">שליחת מיילי ניסיון והתראות מושבתת בפריסה זו.</p>}
    {!busy && !managementEnabled && <p role="status">שינוי רשימת התפוצה מושבת בפריסה זו.</p>}
    <label className="block">כתובות מייל מופרדות בפסיק
      <input className="block w-full border rounded p-2" dir="ltr" value={value}
        disabled={!canEdit || busy || !managementEnabled} onChange={(event) => setValue(event.target.value)} />
    </label>
    <button type="button" disabled={!canEdit || busy || !managementEnabled} onClick={() => act(false)}>שמירה</button>{' '}
    <button type="button" disabled={!canEdit || busy || !sendingEnabled} onClick={() => act(true)}>שליחת מייל ניסיון</button>
    <p className="text-sm">מייל הניסיון משתמש ברשימה השמורה. קבלת הבקשה ב־SES אינה אישור מסירה.</p>
    <ul>{recipients.map((item) => <li key={item.email}
      className={item.status === 'verified' ? 'text-green-700' : item.status === 'pending' ? 'text-red-700' : 'text-slate-600'}>
      <bdi>{item.email}</bdi> — {labels[item.status]}
      {item.verificationRequest === 'accepted' && ' — נשלחה בקשת אימות'}
      {item.verificationRequest === 'cooldown' && ' — בקשת אימות נוספת מוגבלת זמנית'}
      {item.verificationRequest === 'failed' && ' — לא ניתן לשלוח בקשת אימות כרגע'}
      {item.verificationRequest === 'disabled' && ' — שליחת בקשות אימות מושבתת'}
    </li>)}</ul>
    {result && <div role="status">
      {result.noVerifiedRecipients && <p>אין נמענים מאומתים. לא בוצעה שליחה.</p>}
      {result.results.map((item) => <p key={item.email}><bdi>{item.email}</bdi> — {outcomes[item.outcome]}</p>)}
    </div>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
