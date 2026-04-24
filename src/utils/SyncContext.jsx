// SyncContext — shared GitHub sync state for all data stores.
//
// Usage:
//   const { events, setEvents, sessions, setSessions, geometry, setGeometry,
//           syncStatus, syncNow, isConfigured } = useSync();
//
// Auto-syncs from GitHub on mount and whenever the browser tab regains focus.
// Each setter immediately updates localStorage (instant local persistence) and
// queues a debounced GitHub write (500ms after last change).

import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import {
  getConfig,
  eventsStore, sessionsStore, geometryStore,
} from './githubStorage';

const SyncContext = createContext(null);

// localStorage keys (kept as local cache + offline fallback)
const LS_EVENTS   = 'race_track_day_events';
const LS_SESSIONS = 'race_session_logs';
const LS_GEO      = 'race_geometry_logs';

function lsRead(key)       { try { return JSON.parse(localStorage.getItem(key)) ?? []; } catch { return []; } }
function lsWrite(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

// ─── Provider ──────────────────────────────────────────────────────────────────
export function SyncProvider({ children }) {
  const [events,   setEventsRaw]   = useState(() => lsRead(LS_EVENTS));
  const [sessions, setSessionsRaw] = useState(() => lsRead(LS_SESSIONS));
  const [geometry, setGeometryRaw] = useState(() => lsRead(LS_GEO));

  // 'idle' | 'syncing' | 'ok' | 'error' | 'unconfigured'
  const [syncStatus, setSyncStatus] = useState('idle');
  const [syncError,  setSyncError]  = useState('');
  const [lastSync,   setLastSync]   = useState(null);

  const writeTimers = useRef({});
  const isSyncing   = useRef(false);

  function isConfigured() {
    const { token, owner, repo } = getConfig();
    return !!(token && owner && repo);
  }

  // ─── Pull from GitHub (overwrites local) ────────────────────────────────────
  const pullAll = useCallback(async () => {
    if (!isConfigured() || isSyncing.current) return;
    const { token, owner, repo } = getConfig();
    isSyncing.current = true;
    setSyncStatus('syncing');
    setSyncError('');
    try {
      const [ev, sess, geo] = await Promise.all([
        eventsStore.read(token, owner, repo),
        sessionsStore.read(token, owner, repo),
        geometryStore.read(token, owner, repo),
      ]);
      setEventsRaw(ev);
      setSessionsRaw(sess);
      setGeometryRaw(geo);
      lsWrite(LS_EVENTS, ev);
      lsWrite(LS_SESSIONS, sess);
      lsWrite(LS_GEO, geo);
      setSyncStatus('ok');
      setLastSync(new Date());
    } catch (e) {
      setSyncStatus('error');
      setSyncError(e.message);
    } finally {
      isSyncing.current = false;
    }
  }, []);

  // ─── Push one store to GitHub (debounced) ────────────────────────────────────
  function schedulePush(store, key, data) {
    clearTimeout(writeTimers.current[key]);
    writeTimers.current[key] = setTimeout(async () => {
      if (!isConfigured()) return;
      const { token, owner, repo } = getConfig();
      setSyncStatus('syncing');
      try {
        await store.write(token, owner, repo, data);
        setSyncStatus('ok');
        setLastSync(new Date());
      } catch (e) {
        setSyncStatus('error');
        setSyncError(e.message);
      }
    }, 600);
  }

  // ─── Wrapped setters — update local state + localStorage + queue GitHub push ─
  const setEvents = useCallback((val) => {
    const next = typeof val === 'function' ? val(lsRead(LS_EVENTS)) : val;
    setEventsRaw(next);
    lsWrite(LS_EVENTS, next);
    schedulePush(eventsStore, 'events', next);
  }, []);

  const setSessions = useCallback((val) => {
    const next = typeof val === 'function' ? val(lsRead(LS_SESSIONS)) : val;
    setSessionsRaw(next);
    lsWrite(LS_SESSIONS, next);
    schedulePush(sessionsStore, 'sessions', next);
  }, []);

  const setGeometry = useCallback((val) => {
    const next = typeof val === 'function' ? val(lsRead(LS_GEO)) : val;
    setGeometryRaw(next);
    lsWrite(LS_GEO, next);
    schedulePush(geometryStore, 'geometry', next);
  }, []);

  // ─── Auto-sync: on mount and on tab focus ────────────────────────────────────
  useEffect(() => {
    if (isConfigured()) {
      pullAll();
    } else {
      setSyncStatus('unconfigured');
    }

    function onFocus() {
      if (isConfigured()) pullAll();
    }
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const syncNow = useCallback(() => {
    if (isConfigured()) pullAll();
  }, [pullAll]);

  return (
    <SyncContext.Provider value={{
      events, setEvents,
      sessions, setSessions,
      geometry, setGeometry,
      syncStatus, syncError, lastSync,
      syncNow, isConfigured,
    }}>
      {children}
    </SyncContext.Provider>
  );
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used inside SyncProvider');
  return ctx;
}
