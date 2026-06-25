import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import BrandMark from '../components/BrandMark.jsx';

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-stage min-h-screen px-4 py-8">
      <div className="login-shell w-full max-w-5xl overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-2xl shadow-[#0b5869]/10">
        <section className="brand-panel">
          <BrandMark />
          <div className="brand-panel-copy">
            <p className="text-sm font-semibold uppercase tracking-[0.22em] text-[#97dbf3]">Creative Technology</p>
            <h1 className="mt-4 text-4xl font-semibold leading-tight text-white sm:text-5xl">Automation that feels connected.</h1>
            <p className="mt-4 max-w-md text-base leading-7 text-cyan-50/90">
              Manage integrations, webhooks, and Priority workflows inside a SimplyCT-branded control center.
            </p>
          </div>
          <div className="brand-ribbon">Priority | Webhooks | Operations</div>
        </section>

        <section className="login-card-area">
          <div className="mb-6">
            <p className="text-sm font-semibold text-[#028baa]">Welcome back</p>
            <h2 className="mt-1 text-2xl font-semibold text-slate-900">Sign in to your dashboard</h2>
            <p className="mt-2 text-sm text-slate-500">Use your local development account to continue.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="brand-input"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="brand-input"
                placeholder="********"
              />
            </div>

            {error && <p className="rounded-md border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

            <button type="submit" disabled={submitting} className="brand-primary-button w-full">
              {submitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          <p className="mt-5 rounded-lg bg-[#e9faff] px-3 py-2 text-xs text-[#0b5869]">
            Local dev seed: admin@example.com / Admin123! | user1@example.com / User123!
          </p>
        </section>
      </div>
    </div>
  );
}
