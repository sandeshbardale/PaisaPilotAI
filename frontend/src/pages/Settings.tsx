import { Loader2, Moon, Sun, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { authApi } from '../api';
import { useAuth } from '../AuthContext';
import { Card, ConfirmDialog } from '../components/UI';
import { useToast } from '../Toast';

export default function Settings() {
  const { user, logout, updateUser } = useAuth();
  const { toast } = useToast();

  // Profile
  const [name, setName] = useState(user?.name ?? '');
  const [savingProfile, setSavingProfile] = useState(false);

  // Password
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [savingPw, setSavingPw] = useState(false);
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({});

  // Delete
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { toast('Name cannot be empty', 'error'); return; }
    setSavingProfile(true);
    try {
      const updated = await authApi.updateProfile(name.trim());
      updateUser({ ...user!, ...updated });
      toast('Profile updated', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Update failed', 'error');
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!currentPw) errs.currentPw = 'Enter your current password';
    if (!newPw) errs.newPw = 'Enter a new password';
    else if (newPw.length < 8) errs.newPw = 'Must be at least 8 characters';
    if (newPw !== confirmPw) errs.confirmPw = 'Passwords do not match';
    setPwErrors(errs);
    if (Object.keys(errs).length) return;

    setSavingPw(true);
    try {
      await authApi.changePassword(currentPw, newPw);
      toast('Password changed successfully', 'success');
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Password change failed', 'error');
    } finally {
      setSavingPw(false);
    }
  }

  async function toggleTheme() {
    const newMode = !user?.dark_mode;
    try {
      await authApi.updateTheme(newMode);
      updateUser({ ...user!, dark_mode: newMode });
      document.documentElement.classList.toggle('dark', newMode);
      toast(`${newMode ? 'Dark' : 'Light'} mode enabled`, 'info');
    } catch {
      toast('Failed to update theme', 'error');
    }
  }

  async function deleteAccount() {
    try {
      await authApi.deleteAccount();
      toast('Account deleted. Goodbye!', 'info');
      logout();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Delete failed', 'error');
    }
  }

  return (
    <>
      <div className="top">
        <div>
          <p className="page-label">PREFERENCES</p>
          <h1>Settings</h1>
          <em>Manage your account and preferences.</em>
        </div>
      </div>

      <div className="settings-grid">
        {/* Profile */}
        <Card className="settings-card">
          <div className="settings-section-head">
            <h3>Profile</h3>
            <small>Update your name and see account info</small>
          </div>
          <form onSubmit={saveProfile} className="auth-form">
            <div className="field">
              <label>Full name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                disabled={savingProfile}
              />
            </div>
            <div className="field">
              <label>Email</label>
              <input value={user?.email ?? ''} disabled className="disabled-input" />
              <span className="field-hint">Email cannot be changed</span>
            </div>
            <div className="field">
              <label>Member since</label>
              <input
                value={user?.created_at ? new Date(user.created_at).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' }) : ''}
                disabled
                className="disabled-input"
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={savingProfile}>
              {savingProfile ? <><Loader2 size={14} className="spin" /> Saving…</> : 'Save profile'}
            </button>
          </form>
        </Card>

        {/* Password */}
        <Card className="settings-card">
          <div className="settings-section-head">
            <h3>Change password</h3>
            <small>Keep your account secure with a strong password</small>
          </div>
          <form onSubmit={changePassword} className="auth-form">
            <div className="field">
              <label>Current password</label>
              <input
                type="password"
                value={currentPw}
                onChange={(e) => { setCurrentPw(e.target.value); setPwErrors((x) => ({ ...x, currentPw: '' })); }}
                placeholder="••••••••"
                className={pwErrors.currentPw ? 'input-error' : ''}
                disabled={savingPw}
              />
              {pwErrors.currentPw && <span className="field-error">{pwErrors.currentPw}</span>}
            </div>
            <div className="field">
              <label>New password</label>
              <input
                type="password"
                value={newPw}
                onChange={(e) => { setNewPw(e.target.value); setPwErrors((x) => ({ ...x, newPw: '' })); }}
                placeholder="Min. 8 characters"
                className={pwErrors.newPw ? 'input-error' : ''}
                disabled={savingPw}
              />
              {pwErrors.newPw && <span className="field-error">{pwErrors.newPw}</span>}
            </div>
            <div className="field">
              <label>Confirm new password</label>
              <input
                type="password"
                value={confirmPw}
                onChange={(e) => { setConfirmPw(e.target.value); setPwErrors((x) => ({ ...x, confirmPw: '' })); }}
                placeholder="Repeat new password"
                className={pwErrors.confirmPw ? 'input-error' : ''}
                disabled={savingPw}
              />
              {pwErrors.confirmPw && <span className="field-error">{pwErrors.confirmPw}</span>}
            </div>
            <button type="submit" className="btn btn-primary" disabled={savingPw}>
              {savingPw ? <><Loader2 size={14} className="spin" /> Saving…</> : 'Change password'}
            </button>
          </form>
        </Card>

        {/* Appearance */}
        <Card className="settings-card">
          <div className="settings-section-head">
            <h3>Appearance</h3>
            <small>Customise how PaisaPilot looks</small>
          </div>
          <div className="theme-row">
            <div>
              <b>{user?.dark_mode ? 'Dark mode' : 'Light mode'}</b>
              <small>Switch between light and dark theme</small>
            </div>
            <button className={`theme-toggle${user?.dark_mode ? ' dark' : ''}`} onClick={toggleTheme} aria-label="Toggle theme">
              {user?.dark_mode ? <Moon size={18} /> : <Sun size={18} />}
            </button>
          </div>
        </Card>

        {/* Danger zone */}
        <Card className="settings-card danger-card">
          <div className="settings-section-head">
            <h3>Danger zone</h3>
            <small>These actions are permanent and cannot be undone</small>
          </div>
          <div className="danger-row">
            <div>
              <b>Sign out</b>
              <small>End your current session</small>
            </div>
            <button className="btn btn-ghost" onClick={logout}>Sign out</button>
          </div>
          <div className="danger-row">
            <div>
              <b>Delete account</b>
              <small>Permanently delete your account and all data</small>
            </div>
            <button className="btn btn-danger" onClick={() => setShowDeleteConfirm(true)}>
              <Trash2 size={14} /> Delete account
            </button>
          </div>
        </Card>
      </div>

      {showDeleteConfirm && (
        <ConfirmDialog
          message="Are you sure you want to delete your account? All your transactions, history, and data will be permanently erased. This cannot be undone."
          confirmLabel="Yes, delete my account"
          onConfirm={deleteAccount}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </>
  );
}
