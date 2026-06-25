import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import BrandMark from './BrandMark.jsx';
import packageJson from '../../package.json';

export default function Layout({ children }) {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="simplyct-app-shell min-h-screen">
      <header className="sticky top-0 z-20 border-b border-white/60 bg-white/90 backdrop-blur shadow-sm">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="rounded-md focus:outline-none focus:ring-2 focus:ring-[#028baa]/40">
            <BrandMark />
          </Link>
          <nav className="flex flex-wrap items-center justify-end gap-2 text-sm">
            <Link to="/" className="nav-pill">
              My Integrations
            </Link>
            {isAdmin && (
              <Link to="/admin" className="nav-pill">
                Admin
              </Link>
            )}
            <span className="hidden h-6 w-px bg-slate-200 sm:block" />
            <span className="max-w-[10rem] truncate text-slate-600">{user?.name}</span>
            <button onClick={handleLogout} className="nav-pill text-[#4d2f8f] hover:border-red-200 hover:text-red-600">
              Log out
            </button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-7">{children}</main>
      <footer className="mx-auto max-w-6xl px-4 pb-5 text-right text-xs text-slate-400">
        Version {packageJson.version}
      </footer>
    </div>
  );
}
