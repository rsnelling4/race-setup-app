// GitHub Contents API storage layer.
// Each data store is a single JSON file in the configured repo.
// All reads/writes go through the GitHub REST API using a PAT stored in localStorage.

const CONFIG_KEY = 'race_github_config';

export function getConfig() {
  try { return JSON.parse(localStorage.getItem(CONFIG_KEY)) || {}; } catch { return {}; }
}

export function saveConfig(config) {
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

// ─── Low-level GitHub API helpers ─────────────────────────────────────────────

function headers(token) {
  return {
    'Authorization': `Bearer ${token}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

// Returns { content, sha } where content is the parsed JSON, or null if file doesn't exist.
export async function readFile(token, owner, repo, path) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const resp = await fetch(url, { headers: headers(token) });
  if (resp.status === 404) return { content: null, sha: null };
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.message || `GitHub read error ${resp.status}`);
  }
  const data = await resp.json();
  const decoded = JSON.parse(atob(data.content.replace(/\n/g, '')));
  return { content: decoded, sha: data.sha };
}

// Creates or updates a file. sha is required for updates, omit for create.
export async function writeFile(token, owner, repo, path, content, sha, message) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
  const body = {
    message: message || `update ${path}`,
    content: btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2)))),
    ...(sha ? { sha } : {}),
  };
  const resp = await fetch(url, { method: 'PUT', headers: headers(token), body: JSON.stringify(body) });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.message || `GitHub write error ${resp.status}`);
  }
  const data = await resp.json();
  return data.content.sha;
}

// Test connectivity — reads repo metadata, no file needed.
export async function testConnection(token, owner, repo) {
  const url = `https://api.github.com/repos/${owner}/${repo}`;
  const resp = await fetch(url, { headers: headers(token) });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err.message || `Cannot reach ${owner}/${repo} (${resp.status})`);
  }
  const data = await resp.json();
  return { name: data.full_name, private: data.private };
}

// ─── Store class ──────────────────────────────────────────────────────────────
// Each data collection (events, sessions, geometry) is one Store instance.
// It caches the current sha so updates don't need an extra read.

export class GitHubStore {
  constructor(filename) {
    this.filename = filename; // e.g. 'events.json'
    this._sha = null;
  }

  async read(token, owner, repo) {
    const { content, sha } = await readFile(token, owner, repo, `data/${this.filename}`);
    this._sha = sha;
    return content ?? [];
  }

  async write(token, owner, repo, data) {
    const newSha = await writeFile(
      token, owner, repo,
      `data/${this.filename}`,
      data,
      this._sha,
      `update ${this.filename} via race-setup-app`,
    );
    this._sha = newSha;
  }
}

// Singletons — one per data collection
export const eventsStore   = new GitHubStore('events.json');
export const sessionsStore = new GitHubStore('sessions.json');
export const geometryStore = new GitHubStore('geometry.json');
