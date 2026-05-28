import { useState, useCallback } from 'react';

const TOKEN_KEY = 'ha_dash_token';

export function useAuth() {
  const [token, setToken] = useState<string | null>(() => sessionStorage.getItem(TOKEN_KEY));
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const login = useCallback(async (password: string) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json() as { token?: string; error?: string };
      if (!res.ok) {
        setError(data.error ?? 'Login failed');
        return;
      }
      sessionStorage.setItem(TOKEN_KEY, data.token!);
      setToken(data.token!);
    } catch {
      setError('Could not reach server');
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }, []);

  return { token, error, loading, login, logout };
}
