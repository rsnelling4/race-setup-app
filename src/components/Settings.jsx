import { useState } from 'react';
import { getConfig, saveConfig, testConnection } from '../utils/githubStorage';
import { useSync } from '../utils/SyncContext';

export default function Settings() {
  const { syncStatus, syncError, lastSync, syncNow, isConfigured } = useSync();
  const cfg = getConfig();

  const [token, setToken]   = useState(cfg.token || '');
  const [owner, setOwner]   = useState(cfg.owner || '');
  const [repo,  setRepo]    = useState(cfg.repo  || '');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // null | { ok, msg }
  const [saved, setSaved]   = useState(false);

  async function handleTest() {
    if (!token || !owner || !repo) {
      setTestResult({ ok: false, msg: 'Fill in all three fields first.' });
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const info = await testConnection(token, owner, repo);
      setTestResult({ ok: true, msg: `Connected to ${info.name} (${info.private ? 'private' : 'public'})` });
    } catch (e) {
      setTestResult({ ok: false, msg: e.message });
    } finally {
      setTesting(false);
    }
  }

  function handleSave() {
    saveConfig({ token: token.trim(), owner: owner.trim(), repo: repo.trim() });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    // Trigger a pull with the new config
    syncNow();
  }

  function handleClear() {
    saveConfig({});
    setToken(''); setOwner(''); setRepo('');
    setTestResult(null);
  }

  const statusColor = {
    idle:          'var(--text-secondary)',
    syncing:       'var(--yellow)',
    ok:            'var(--green)',
    error:         '#f87171',
    unconfigured:  'var(--text-secondary)',
  }[syncStatus] || 'var(--text-secondary)';

  const statusLabel = {
    idle:          'Not synced yet',
    syncing:       'Syncing…',
    ok:            `Synced${lastSync ? ' · ' + lastSync.toLocaleTimeString() : ''}`,
    error:         `Sync error`,
    unconfigured:  'GitHub not configured',
  }[syncStatus] || '';

  return (
    <div className="settings-page">
      <div className="settings-card">
        <h2 className="settings-heading">GitHub Data Storage</h2>
        <p className="settings-desc">
          Your track day data, measurement logs, and geometry profiles are stored as JSON files
          in a GitHub repository you control. This keeps your data permanent and accessible from
          any device — phone at the track, home computer, anywhere.
        </p>

        {/* Sync status */}
        <div className="settings-status-bar">
          <span className="settings-status-dot" style={{ background: statusColor }} />
          <span className="settings-status-label" style={{ color: statusColor }}>{statusLabel}</span>
          {syncStatus === 'error' && <span className="settings-status-error">{syncError}</span>}
          {isConfigured() && (
            <button className="settings-sync-btn" onClick={syncNow} disabled={syncStatus === 'syncing'}>
              {syncStatus === 'syncing' ? 'Syncing…' : 'Sync Now'}
            </button>
          )}
        </div>

        {/* Setup instructions */}
        <div className="settings-instructions">
          <div className="settings-step">
            <span className="settings-step-num">1</span>
            <div>
              <strong>Create a private GitHub repo</strong> for your data — e.g.{' '}
              <code className="settings-code">race-setup-data</code>.
              You only need to do this once. Keep it private so your setup data stays yours.
            </div>
          </div>
          <div className="settings-step">
            <span className="settings-step-num">2</span>
            <div>
              <strong>Create a Personal Access Token (PAT)</strong> at{' '}
              <code className="settings-code">github.com → Settings → Developer settings → Personal access tokens → Fine-grained tokens</code>.
              <ul className="settings-list">
                <li>Repository access: <em>Only select repositories</em> → choose your data repo</li>
                <li>Permissions → Repository permissions → <em>Contents: Read and write</em></li>
                <li>Everything else can stay as No access</li>
              </ul>
              Copy the token — you only see it once.
            </div>
          </div>
          <div className="settings-step">
            <span className="settings-step-num">3</span>
            <div>
              <strong>Paste the token and repo details below</strong>, hit Test, then Save.
              The app will create the data files in your repo automatically on first save.
            </div>
          </div>
        </div>

        {/* Config form */}
        <div className="settings-form">
          <div className="settings-field">
            <label className="settings-label">GitHub Personal Access Token</label>
            <input className="settings-input" type="password"
              placeholder="github_pat_..."
              value={token} onChange={e => setToken(e.target.value)} />
            <span className="settings-field-note">Stored in your browser only — never sent to anyone except api.github.com</span>
          </div>
          <div className="settings-row">
            <div className="settings-field">
              <label className="settings-label">GitHub Username / Org</label>
              <input className="settings-input" type="text"
                placeholder="e.g. rsnelling4"
                value={owner} onChange={e => setOwner(e.target.value)} />
            </div>
            <div className="settings-field">
              <label className="settings-label">Repository Name</label>
              <input className="settings-input" type="text"
                placeholder="e.g. race-setup-data"
                value={repo} onChange={e => setRepo(e.target.value)} />
            </div>
          </div>

          {testResult && (
            <div className={`settings-test-result ${testResult.ok ? 'ok' : 'fail'}`}>
              {testResult.ok ? '✓ ' : '✗ '}{testResult.msg}
            </div>
          )}

          <div className="settings-actions">
            <button className="settings-test-btn" onClick={handleTest} disabled={testing}>
              {testing ? 'Testing…' : 'Test Connection'}
            </button>
            <button className="settings-save-btn" onClick={handleSave}>
              {saved ? 'Saved!' : 'Save & Sync'}
            </button>
            {isConfigured() && (
              <button className="settings-clear-btn" onClick={handleClear}>Clear Config</button>
            )}
          </div>
        </div>

        {/* Data files info */}
        {isConfigured() && (
          <div className="settings-files">
            <div className="settings-files-label">Data files in your repo</div>
            <div className="settings-files-list">
              {['data/events.json', 'data/sessions.json', 'data/geometry.json'].map(f => (
                <div key={f} className="settings-file-item">
                  <code className="settings-code">{f}</code>
                  <span className="settings-file-desc">
                    {{ 'data/events.json': 'Track day events & sessions', 'data/sessions.json': 'Measurement log sessions', 'data/geometry.json': 'Suspension geometry profiles' }[f]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
