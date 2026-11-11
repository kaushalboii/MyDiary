"use client";

import { useEffect, useState } from "react";
import { Check, Copy, HardDrive, RefreshCw, Server, Terminal, UploadCloud, X } from "lucide-react";
import {
  checkStorageHealth,
  getOfflineDraftCount,
  loadStorageConfig,
  saveStorageConfig,
  syncOfflineToServer,
} from "@/lib/storage-client";
import type { StorageConfig, StorageHealth } from "@/lib/types";

function formatBytes(bytes: number): string {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

const MINI_SERVER_COMMANDS = `# On user@instabox-kaushals-mini-server:~$
rm -rf MyDiary && git clone https://github.com/kaushalboii/MyDiary.git
cd MyDiary/storage-server
bash setup-mini-server.sh
# Then open Port 4321 in Instabox dashboard -> Ports tab and paste the https:// URL above.`;

export function StorageSettingsModal({
  open,
  onClose,
  onConnected,
}: {
  open: boolean;
  onClose: () => void;
  onConnected?: () => void;
}) {
  const [config, setConfig] = useState<StorageConfig>(() => loadStorageConfig());
  const [health, setHealth] = useState<StorageHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [offlineCount, setOfflineCount] = useState(0);
  const [copiedCmd, setCopiedCmd] = useState(false);

  useEffect(() => {
    if (!open) return;
    const loaded = loadStorageConfig();
    setConfig(loaded);
    setSyncResult(null);
    void runHealthCheck(loaded);
    void getOfflineDraftCount().then(setOfflineCount);
  }, [open]);

  async function runHealthCheck(target: StorageConfig) {
    setTesting(true);
    setError(null);
    try {
      const status = await checkStorageHealth(target);
      setHealth(status);
      if (status.authRequired && !status.tokenAuthorized) {
        setError("Server requires a valid DIARY_STORAGE_TOKEN.");
      }
    } catch (err) {
      setHealth(null);
      setError(
        err instanceof Error
          ? err.message
          : "Could not reach storage server at this URL.",
      );
    } finally {
      setTesting(false);
    }
  }

  async function handleSaveAndConnect(e: React.FormEvent) {
    e.preventDefault();
    saveStorageConfig(config);
    await runHealthCheck(config);
    onConnected?.();
  }

  async function handleSyncOffline() {
    setSyncing(true);
    setSyncResult(null);
    setError(null);
    try {
      saveStorageConfig(config);
      const result = await syncOfflineToServer(config);
      setSyncResult(
        `Synced ${result.addedMemories} memories and ${result.updatedBooks} volume updates to ${config.label}.`,
      );
      await runHealthCheck(config);
      onConnected?.();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Sync failed. Check server URL and token.",
      );
    } finally {
      setSyncing(false);
    }
  }

  async function copyCommands() {
    await navigator.clipboard.writeText(MINI_SERVER_COMMANDS);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 1800);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Storage server settings"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="stationery-card relative max-h-[90dvh] w-full max-w-2xl overflow-y-auto p-6 sm:p-8">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close storage settings"
          className="absolute top-5 right-5 grid h-9 w-9 place-items-center rounded-full border border-[var(--hairline)] bg-[var(--paper)] hover:bg-[var(--paper-deep)] cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-6">
          <p className="eyebrow">
            <Server className="h-3.5 w-3.5" />
            <span>Mini Server Storage</span>
          </p>
          <h2
            className="m-0 text-3xl font-normal tracking-tight"
            style={{ fontFamily: "var(--serif)" }}
          >
            Connect to kaushals-mini-server
          </h2>
          <p className="mt-2 text-sm text-[var(--ink-soft)]">
            Store your diary notes, paragraphs, and full-resolution photo albums on your Instabox server
            (<code className="text-xs font-semibold">user@instabox-kaushals-mini-server</code>).
          </p>
        </div>

        {/* Live status banner */}
        <div className="mb-6 border border-[var(--hairline)] bg-[var(--paper)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{
                  backgroundColor:
                    health && (!health.authRequired || health.tokenAuthorized)
                      ? "#4e7c53"
                      : "#a74735",
                }}
              />
              <span className="text-xs font-semibold tracking-wider uppercase">
                {health
                  ? `Connected · ${health.hostname} (${health.platform})`
                  : "Server Unreachable (Using Offline Browser Fallback)"}
              </span>
            </div>
            <button
              type="button"
              onClick={() => runHealthCheck(config)}
              disabled={testing}
              className="inline-flex items-center gap-1.5 border border-[var(--hairline)] bg-[var(--paper-light)] px-3 py-1.5 text-[11px] font-semibold tracking-wider uppercase cursor-pointer hover:border-[var(--ink)]"
            >
              <RefreshCw className={`h-3 w-3 ${testing ? "animate-spin" : ""}`} />
              <span>{testing ? "Checking..." : "Test Connection"}</span>
            </button>
          </div>

          {health && (
            <div className="mt-3 grid grid-cols-3 gap-3 border-t border-[var(--hairline)] pt-3 text-xs">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--ink-soft)]">
                  Memories Stored
                </div>
                <div className="mt-0.5 font-serif text-lg">
                  {health.stats.memoriesCount}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--ink-soft)]">
                  Album Photos
                </div>
                <div className="mt-0.5 font-serif text-lg">
                  {health.stats.photosCount}
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-wider text-[var(--ink-soft)]">
                  Media Disk Used
                </div>
                <div className="mt-0.5 font-serif text-lg">
                  {formatBytes(health.stats.uploadsBytes)}
                </div>
              </div>
            </div>
          )}

          {error && (
            <p className="mt-3 text-xs font-medium text-[var(--accent)]">
              {error}
            </p>
          )}
        </div>

        <form onSubmit={handleSaveAndConnect} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                Server Label
              </label>
              <input
                type="text"
                value={config.label}
                onChange={(e) => setConfig({ ...config, label: e.target.value })}
                placeholder="kaushals-mini-server"
                className="w-full border border-[var(--hairline)] bg-[var(--paper)] px-3.5 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                Access Token (optional)
              </label>
              <input
                type="password"
                value={config.token}
                onChange={(e) => setConfig({ ...config, token: e.target.value })}
                placeholder="DIARY_STORAGE_TOKEN if set"
                className="w-full border border-[var(--hairline)] bg-[var(--paper)] px-3.5 py-2.5 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
              Storage Server URL (Instabox Port URL or http://127.0.0.1:4321)
            </label>
            <input
              type="url"
              required
              value={config.serverUrl}
              onChange={(e) =>
                setConfig({ ...config, serverUrl: e.target.value })
              }
              placeholder="https://4321-....instabox.sh"
              className="w-full border border-[var(--hairline)] bg-[var(--paper)] px-3.5 py-2.5 text-sm"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="submit"
              className="inline-flex items-center gap-2 bg-[var(--ink)] px-5 py-2.5 text-xs font-semibold tracking-widest text-[var(--paper-light)] uppercase cursor-pointer hover:bg-[var(--walnut-deep)]"
            >
              <HardDrive className="h-3.5 w-3.5" />
              <span>Save & Connect</span>
            </button>

            {offlineCount > 0 && health && (
              <button
                type="button"
                onClick={handleSyncOffline}
                disabled={syncing}
                className="inline-flex items-center gap-2 border border-[var(--ink)] bg-[var(--paper-light)] px-4 py-2.5 text-xs font-semibold tracking-wider uppercase cursor-pointer hover:bg-[var(--paper-deep)]"
              >
                <UploadCloud className="h-3.5 w-3.5" />
                <span>
                  {syncing
                    ? "Syncing..."
                    : `Sync ${offlineCount} Offline Draft(s) → Server`}
                </span>
              </button>
            )}
          </div>

          {syncResult && (
            <p className="text-xs font-medium text-[#466f4b]">{syncResult}</p>
          )}
        </form>

        {/* Quick Setup Guide for user@instabox-kaushals-mini-server */}
        <div className="mt-7 border-t border-[var(--hairline)] pt-5">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[10px] font-semibold tracking-widest uppercase text-[var(--ink-soft)]">
              <Terminal className="h-3.5 w-3.5" />
              <span>Quick Start on kaushals-mini-server</span>
            </div>
            <button
              type="button"
              onClick={copyCommands}
              className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-wider uppercase text-[var(--accent)] cursor-pointer"
            >
              {copiedCmd ? (
                <>
                  <Check className="h-3 w-3" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" />
                  <span>Copy Commands</span>
                </>
              )}
            </button>
          </div>
          <pre className="overflow-x-auto border border-[var(--hairline)] bg-[#23201c] p-3.5 text-xs leading-relaxed text-[#eee8db]">
            <code>{MINI_SERVER_COMMANDS}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}
