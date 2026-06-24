import { useState } from 'react';
import { Radio, LogIn } from 'lucide-react';

interface LoginProps {
  onLogin: (token: string) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const resp = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await resp.json();
      if (data.status === 'ok' && data.token) {
        onLogin(data.token);
      } else {
        setError(data.message || 'Login failed');
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-noc-bg flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Radio className="w-10 h-10 text-noc-accent mx-auto mb-3" />
          <h1 className="text-xl font-semibold text-noc-accent">xCloud-CNMS</h1>
          <p className="text-sm text-noc-muted mt-1">Sign in to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-noc-surface border border-noc-border rounded-lg p-6 space-y-4">
          {error && (
            <div className="bg-noc-error-10 border border-noc-error-30 rounded-lg p-3 text-sm text-noc-error">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="login-username" className="block text-xs text-noc-muted mb-1.5">Username</label>
            <input
              id="login-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 bg-noc-bg border border-noc-border rounded-lg text-sm text-noc-text focus:outline-none focus:border-noc-accent"
              autoFocus
              autoComplete="username"
            />
          </div>

          <div>
            <label htmlFor="login-password" className="block text-xs text-noc-muted mb-1.5">Password</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              className="w-full px-3 py-2 bg-noc-bg border border-noc-border rounded-lg text-sm text-noc-text focus:outline-none focus:border-noc-accent"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-noc-accent-20 text-noc-accent rounded-lg text-sm font-medium hover:bg-noc-accent-30 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <LogIn className="w-4 h-4" />
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
