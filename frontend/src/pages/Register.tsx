import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../AuthContext';
import { useToast } from '../Toast';

interface Props {
  onGoLogin: () => void;
}

export default function Register({ onGoLogin }: Props) {
  const { register } = useAuth();
  const { toast } = useToast();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showCf, setShowCf] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = 'Name is required';
    if (!email.trim()) e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Enter a valid email';
    if (!password) e.password = 'Password is required';
    else if (password.length < 8) e.password = 'At least 8 characters required';
    if (password !== confirm) e.confirm = 'Passwords do not match';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      await register(email, name, password);
      toast('Account created! Welcome to PaisaPilot.', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Registration failed', 'error');
    } finally {
      setLoading(false);
    }
  }

  const strength = password.length === 0 ? 0 : password.length < 8 ? 1 : password.length < 12 ? 2 : 3;
  const strengthLabel = ['', 'Weak', 'Good', 'Strong'][strength];
  const strengthColor = ['', '#e86359', '#f5a623', '#55a28b'][strength];

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <i className="brand-icon">₹</i>
          <span>PaisaPilot <b>AI</b></span>
        </div>
        <h1 className="auth-title">Create your account</h1>
        <p className="auth-sub">Start your financial journey</p>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="name">Full name</label>
            <input
              id="name"
              type="text"
              autoComplete="name"
              placeholder="Arjun Mehta"
              value={name}
              onChange={(e) => { setName(e.target.value); setErrors((x) => ({ ...x, name: undefined! })); }}
              className={errors.name ? 'input-error' : ''}
              disabled={loading}
            />
            {errors.name && <span className="field-error">{errors.name}</span>}
          </div>

          <div className="field">
            <label htmlFor="reg-email">Email</label>
            <input
              id="reg-email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setErrors((x) => ({ ...x, email: undefined! })); }}
              className={errors.email ? 'input-error' : ''}
              disabled={loading}
            />
            {errors.email && <span className="field-error">{errors.email}</span>}
          </div>

          <div className="field">
            <label htmlFor="reg-pw">Password</label>
            <div className="pw-wrap">
              <input
                id="reg-pw"
                type={showPw ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Min. 8 characters"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setErrors((x) => ({ ...x, password: undefined! })); }}
                className={errors.password ? 'input-error' : ''}
                disabled={loading}
              />
              <button type="button" className="pw-toggle" onClick={() => setShowPw((v) => !v)} tabIndex={-1}>
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {password && (
              <div className="pw-strength">
                <div className="pw-bar">
                  <div style={{ width: `${strength * 33.3}%`, background: strengthColor }} />
                </div>
                <span style={{ color: strengthColor }}>{strengthLabel}</span>
              </div>
            )}
            {errors.password && <span className="field-error">{errors.password}</span>}
          </div>

          <div className="field">
            <label htmlFor="reg-cf">Confirm password</label>
            <div className="pw-wrap">
              <input
                id="reg-cf"
                type={showCf ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="Repeat password"
                value={confirm}
                onChange={(e) => { setConfirm(e.target.value); setErrors((x) => ({ ...x, confirm: undefined! })); }}
                className={errors.confirm ? 'input-error' : ''}
                disabled={loading}
              />
              <button type="button" className="pw-toggle" onClick={() => setShowCf((v) => !v)} tabIndex={-1}>
                {showCf ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {errors.confirm && <span className="field-error">{errors.confirm}</span>}
          </div>

          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? <><Loader2 size={16} className="spin" /> Creating account…</> : 'Create account'}
          </button>
        </form>

        <p className="auth-switch">
          Already have an account?{' '}
          <button type="button" className="link-btn" onClick={onGoLogin}>
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}
