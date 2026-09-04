'use client';

import { useState } from 'react';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState({ text: '', type: '' });
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);
    setStatus({ text: '', type: '' });

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Login failed.');
      window.location.href = '/';
    } catch (err) {
      setStatus({ text: err.message, type: 'error' });
      setSubmitting(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>
          <a href="https://www.instagram.com/_luiprime/" target="_blank" rel="noopener noreferrer">
            _luiprime portfolio
          </a>
        </h1>
        <form onSubmit={handleSubmit}>
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              autoComplete="current-password"
              autoFocus
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" disabled={submitting}>Log in</button>
            <span className={`status${status.type ? ' ' + status.type : ''}`}>{status.text}</span>
          </div>
        </form>
      </div>
    </div>
  );
}
