"use client";

import { useEffect, useState } from "react";
import {
  Check,
  Copy,
  HardDrive,
  KeyRound,
  Lock,
  RefreshCw,
  Server,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Trash2,
  Unlock,
  UploadCloud,
  X,
} from "lucide-react";
import {
  checkStorageHealth,
  getDefaultStorageConfig,
  getOfflineDraftCount,
  loadStorageConfig,
  saveStorageConfig,
  syncOfflineToServer,
} from "@/lib/storage-client";
import type { StorageConfig, StorageHealth } from "@/lib/types";
import {
  disableVaultLock,
  enableVaultLock,
  getVaultStatus,
  lockVaultNow,
  unlockVaultWithPassphrase,
  wipeLocalDiaryData,
} from "@/lib/vault-security";

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

const SERVER_SETUP_SNIPPET = `# On your private host (binds 0.0.0.0 with automatic fail-closed secret token):
cd MyDiary/storage-server && bash setup-mini-server.sh`;

type ModalTab = "vault" | "server";

export function StorageSettingsModal({
  open,
  onClose,
  onConnected,
  initialTab = "vault",
}: {
  open: boolean;
  onClose: () => void;
  onConnected?: () => void;
  initialTab?: ModalTab;
}) {
  const [tab, setTab] = useState<ModalTab>(initialTab);
  const [config, setConfig] = useState<StorageConfig>(() => loadStorageConfig());
  const [health, setHealth] = useState<StorageHealth | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [offlineCount, setOfflineCount] = useState(0);
  const [copiedCmd, setCopiedCmd] = useState(false);

  // Vault state
  const [vaultEnabled, setVaultEnabled] = useState(false);
  const [autoLockMinutes, setAutoLockMinutes] = useState(15);
  const [newPassphrase, setNewPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [currentPassphrase, setCurrentPassphrase] = useState("");
  const [vaultNotice, setVaultNotice] = useState<string | null>(null);
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [vaultBusy, setVaultBusy] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [resealPassphrase, setResealPassphrase] = useState("");

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    const loaded = loadStorageConfig();
    const status = getVaultStatus();
    setConfig(loaded);
    setVaultEnabled(status.enabled);
    setAutoLockMinutes(status.autoLockMinutes);
    setNewPassphrase("");
    setConfirmPassphrase("");
    setCurrentPassphrase("");
    setResealPassphrase("");
    setVaultNotice(null);
    setVaultError(null);
    setConfirmWipe(false);
    setSyncResult(null);
    void runHealthCheck(loaded);
    void getOfflineDraftCount().then(setOfflineCount);
  }, [open, initialTab]);

  async function runHealthCheck(target: StorageConfig) {
    setTesting(true);
    setError(null);
    try {
      const status = await checkStorageHealth(target);
      setHealth(status);
      if (status.authRequired && !status.tokenAuthorized) {
        setError("Server requires a valid owner token in the Access Token field.");
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

  async function handleEnableOrUpdateVault(e: React.FormEvent) {
    e.preventDefault();
    setVaultError(null);
    setVaultNotice(null);

    if (!vaultEnabled) {
      if (newPassphrase.trim().length < 6) {
        setVaultError("Passphrase must be at least 6 characters.");
        return;
      }
      if (newPassphrase !== confirmPassphrase) {
        setVaultError("Passphrases do not match.");
        return;
      }
      setVaultBusy(true);
      try {
        await enableVaultLock(
          newPassphrase,
          {
            token: config.token,
            serverUrl: config.serverUrl,
            label: config.label,
          },
          autoLockMinutes,
        );
        setVaultEnabled(true);
        setNewPassphrase("");
        setConfirmPassphrase("");
        setVaultNotice(
          "Owner Vault Lock enabled. Token is now AES-256-GCM sealed and cleared from plain browser storage.",
        );
      } catch (err) {
        setVaultError(err instanceof Error ? err.message : "Failed to enable Vault Lock.");
      } finally {
        setVaultBusy(false);
      }
      return;
    }

    if (!currentPassphrase.trim()) {
      setVaultError("Enter your current vault passphrase to update settings.");
      return;
    }
    if (newPassphrase.trim() && newPassphrase.trim().length < 6) {
      setVaultError("New passphrase must be at least 6 characters.");
      return;
    }
    if (newPassphrase.trim() && newPassphrase !== confirmPassphrase) {
      setVaultError("New passphrases do not match.");
      return;
    }

    setVaultBusy(true);
    try {
      const existing = await unlockVaultWithPassphrase(currentPassphrase);
      const effectivePass = newPassphrase.trim() || currentPassphrase;
      await enableVaultLock(
        effectivePass,
        {
          token: config.token || existing.token,
          serverUrl: config.serverUrl || existing.serverUrl,
          label: config.label || existing.label,
        },
        autoLockMinutes,
      );
      setCurrentPassphrase("");
      setNewPassphrase("");
      setConfirmPassphrase("");
      setVaultNotice("Vault Lock credentials and timeout updated.");
    } catch (err) {
      setVaultError(err instanceof Error ? err.message : "Could not update Vault Lock.");
    } finally {
      setVaultBusy(false);
    }
  }

  async function handleDisableVault() {
    setVaultError(null);
    setVaultNotice(null);
    if (!currentPassphrase.trim()) {
      setVaultError("Enter your current passphrase to disable Vault Lock.");
      return;
    }
    setVaultBusy(true);
    try {
      const secrets = await disableVaultLock(currentPassphrase);
      setVaultEnabled(false);
      setCurrentPassphrase("");
      setNewPassphrase("");
      setConfirmPassphrase("");
      setConfig({
        serverUrl: secrets.serverUrl || config.serverUrl,
        token: secrets.token || "",
        label: secrets.label || config.label,
      });
      setVaultNotice("Owner Vault Lock disabled for this browser.");
    } catch (err) {
      setVaultError(err instanceof Error ? err.message : "Incorrect passphrase.");
    } finally {
      setVaultBusy(false);
    }
  }

  async function handleSaveAndConnect(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (vaultEnabled) {
      if (!resealPassphrase.trim()) {
        setError("Enter your Owner Vault passphrase below to re-seal server credentials.");
        return;
      }
      try {
        await unlockVaultWithPassphrase(resealPassphrase);
        await enableVaultLock(resealPassphrase, config, autoLockMinutes);
        setResealPassphrase("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Incorrect vault passphrase.");
        return;
      }
    }
    saveStorageConfig(config);
    await runHealthCheck(config);
    onConnected?.();
  }

  async function handleSyncOffline() {
    setSyncing(true);
    setSyncResult(null);
    setError(null);
    try {
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
    await navigator.clipboard.writeText(SERVER_SETUP_SNIPPET);
    setCopiedCmd(true);
    setTimeout(() => setCopiedCmd(false), 1800);
  }

  if (!open) return null;

  const tokenConfigured = Boolean(config.token.trim());
  const serverProtected = Boolean(health?.authRequired);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Owner security and storage settings"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="stationery-card relative max-h-[90dvh] w-full max-w-2xl overflow-y-auto p-6 sm:p-8"
        data-testid="security-storage-modal"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close security and storage settings"
          className="absolute top-5 right-5 grid h-9 w-9 place-items-center rounded-full border border-[var(--hairline)] bg-[var(--paper)] hover:bg-[var(--paper-deep)] cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-5">
          <p className="eyebrow">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Owner Privacy &amp; Storage</span>
          </p>
          <h2
            className="m-0 text-3xl font-normal tracking-tight"
            style={{ fontFamily: "var(--serif)" }}
          >
            Security &amp; Private Storage
          </h2>
          <p className="mt-2 text-sm text-[var(--ink-soft)]">
            Seal your diary credentials on this browser with a personal passphrase and verify your
            token-protected archive server.
          </p>
        </div>

        {/* Clean Two-Tab Switcher */}
        <div className="mb-6 inline-flex rounded-full border border-[var(--hairline)] bg-[var(--paper)] p-1">
          <button
            type="button"
            onClick={() => setTab("vault")}
            data-testid="tab-owner-vault"
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold tracking-wider uppercase cursor-pointer transition-colors ${
              tab === "vault"
                ? "bg-[var(--ink)] text-[var(--paper-light)]"
                : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
            }`}
          >
            <Lock className="h-3.5 w-3.5" />
            <span>Owner Vault Lock</span>
          </button>
          <button
            type="button"
            onClick={() => setTab("server")}
            data-testid="tab-private-server"
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold tracking-wider uppercase cursor-pointer transition-colors ${
              tab === "server"
                ? "bg-[var(--ink)] text-[var(--paper-light)]"
                : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
            }`}
          >
            <Server className="h-3.5 w-3.5" />
            <span>Private Storage Server</span>
          </button>
        </div>

        {tab === "vault" ? (
          <div className="space-y-5">
            {/* Security Posture Strip */}
            <div className="border border-[var(--hairline)] bg-[var(--paper)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{
                      backgroundColor: vaultEnabled ? "#4e7c53" : "#b87a3d",
                    }}
                  />
                  <span className="text-xs font-semibold tracking-wider uppercase">
                    {vaultEnabled
                      ? "Vault Sealed · AES-256-GCM + Volatile Session"
                      : "Vault Unsealed · Set Passphrase Below"}
                  </span>
                </div>
                {vaultEnabled ? (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      lockVaultNow();
                    }}
                    data-testid="vault-lock-now-btn"
                    className="inline-flex items-center gap-1.5 bg-[var(--ink)] px-3.5 py-1.5 text-[11px] font-semibold tracking-wider text-[var(--paper-light)] uppercase cursor-pointer hover:bg-[var(--walnut-deep)]"
                  >
                    <Lock className="h-3 w-3" />
                    <span>Lock Vault Now</span>
                  </button>
                ) : null}
              </div>

              <div className="mt-3 grid gap-2 border-t border-[var(--hairline)] pt-3 text-xs sm:grid-cols-3">
                <div className="flex items-center gap-2">
                  {vaultEnabled ? (
                    <ShieldCheck className="h-3.5 w-3.5 text-[#4e7c53]" />
                  ) : (
                    <ShieldAlert className="h-3.5 w-3.5 text-[#b87a3d]" />
                  )}
                  <span>
                    Browser Lock: <strong>{vaultEnabled ? "Active" : "Off"}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {serverProtected && health?.tokenAuthorized ? (
                    <ShieldCheck className="h-3.5 w-3.5 text-[#4e7c53]" />
                  ) : (
                    <KeyRound className="h-3.5 w-3.5 text-[var(--ink-soft)]" />
                  )}
                  <span>
                    Server Auth:{" "}
                    <strong>
                      {health
                        ? serverProtected
                          ? health.tokenAuthorized
                            ? "Verified"
                            : "Token Required"
                          : "Loopback Open"
                        : "Checking"}
                    </strong>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <KeyRound className="h-3.5 w-3.5 text-[var(--ink-soft)]" />
                  <span>
                    Token Loaded: <strong>{tokenConfigured ? "Yes" : "None"}</strong>
                  </span>
                </div>
              </div>
            </div>

            <form onSubmit={handleEnableOrUpdateVault} className="space-y-4">
              {vaultEnabled ? (
                <div>
                  <label className="mb-1.5 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                    Current Vault Passphrase
                  </label>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={currentPassphrase}
                    onChange={(e) => setCurrentPassphrase(e.target.value)}
                    placeholder="Enter current passphrase to update or disable"
                    data-testid="vault-current-passphrase"
                    className="w-full border border-[var(--hairline)] bg-[var(--paper)] px-3.5 py-2.5 text-sm"
                  />
                </div>
              ) : null}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                    {vaultEnabled ? "New Passphrase (optional)" : "Create Vault Passphrase"}
                  </label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={newPassphrase}
                    onChange={(e) => setNewPassphrase(e.target.value)}
                    placeholder="Min 6 characters"
                    data-testid="vault-new-passphrase"
                    className="w-full border border-[var(--hairline)] bg-[var(--paper)] px-3.5 py-2.5 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                    Confirm Passphrase
                  </label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassphrase}
                    onChange={(e) => setConfirmPassphrase(e.target.value)}
                    placeholder="Re-enter passphrase"
                    data-testid="vault-confirm-passphrase"
                    className="w-full border border-[var(--hairline)] bg-[var(--paper)] px-3.5 py-2.5 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                  Auto-Lock After Inactivity
                </label>
                <select
                  value={autoLockMinutes}
                  onChange={(e) => setAutoLockMinutes(Number(e.target.value))}
                  aria-label="Auto-lock idle timeout"
                  className="w-full border border-[var(--hairline)] bg-[var(--paper)] px-3.5 py-2.5 text-sm sm:w-56"
                >
                  <option value={5}>5 minutes</option>
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={60}>60 minutes</option>
                </select>
              </div>

              {vaultError ? (
                <p className="text-xs font-medium text-[var(--accent)]" role="alert">
                  {vaultError}
                </p>
              ) : null}
              {vaultNotice ? (
                <p className="text-xs font-medium text-[#466f4b]">{vaultNotice}</p>
              ) : null}

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={vaultBusy}
                  data-testid="vault-enable-btn"
                  className="inline-flex items-center gap-2 bg-[var(--ink)] px-5 py-2.5 text-xs font-semibold tracking-widest text-[var(--paper-light)] uppercase cursor-pointer hover:bg-[var(--walnut-deep)]"
                >
                  <Lock className="h-3.5 w-3.5" />
                  <span>
                    {vaultBusy
                      ? "Encrypting..."
                      : vaultEnabled
                        ? "Update Vault Lock"
                        : "Enable Vault Lock"}
                  </span>
                </button>

                {vaultEnabled ? (
                  <button
                    type="button"
                    disabled={vaultBusy}
                    onClick={() => void handleDisableVault()}
                    data-testid="vault-disable-btn"
                    className="inline-flex items-center gap-2 border border-[var(--hairline)] bg-[var(--paper-light)] px-4 py-2.5 text-xs font-semibold tracking-wider uppercase cursor-pointer hover:border-[var(--ink)]"
                  >
                    <Unlock className="h-3.5 w-3.5" />
                    <span>Disable Vault Lock</span>
                  </button>
                ) : null}
              </div>
            </form>

            {/* Emergency browser cleanup */}
            <div className="border-t border-[var(--hairline)] pt-4">
              {!confirmWipe ? (
                <button
                  type="button"
                  onClick={() => setConfirmWipe(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--ink-soft)] hover:text-[var(--accent)] cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Wipe local browser cache, offline drafts &amp; credentials</span>
                </button>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 border border-[var(--hairline)] bg-[var(--paper)] p-3 text-xs">
                  <span>Removes only local browser tokens and drafts; your private server stays intact.</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmWipe(false)}
                      className="border border-[var(--hairline)] px-3 py-1 uppercase tracking-wider cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await wipeLocalDiaryData();
                        setVaultEnabled(false);
                        setConfirmWipe(false);
                        setVaultNotice("Cleared all local browser tokens, caches, and offline drafts.");
                      }}
                      className="bg-[#9e3d3a] px-3 py-1 font-semibold text-white uppercase tracking-wider cursor-pointer"
                    >
                      Confirm Wipe
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div>
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
                      ? health.authRequired && !health.tokenAuthorized
                        ? "Server Reachable · Token Required"
                        : `Connected · ${health.hostname || "Private Server"}${health.platform ? ` (${health.platform})` : ""}`
                      : "Server Unreachable (Offline Fallback)"}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void runHealthCheck(config)}
                  disabled={testing}
                  className="inline-flex items-center gap-1.5 border border-[var(--hairline)] bg-[var(--paper-light)] px-3 py-1.5 text-[11px] font-semibold tracking-wider uppercase cursor-pointer hover:border-[var(--ink)]"
                >
                  <RefreshCw className={`h-3 w-3 ${testing ? "animate-spin" : ""}`} />
                  <span>{testing ? "Checking..." : "Test Connection"}</span>
                </button>
              </div>

              {health?.stats ? (
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
              ) : null}

              {error ? (
                <p className="mt-3 text-xs font-medium text-[var(--accent)]" role="alert">
                  {error}
                </p>
              ) : null}
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
                    Owner Access Token
                  </label>
                  <input
                    type="password"
                    value={config.token}
                    onChange={(e) => setConfig({ ...config, token: e.target.value })}
                    placeholder="DIARY_STORAGE_TOKEN"
                    className="w-full border border-[var(--hairline)] bg-[var(--paper)] px-3.5 py-2.5 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                  Storage Server URL
                </label>
                <input
                  type="url"
                  required
                  value={config.serverUrl}
                  onChange={(e) => setConfig({ ...config, serverUrl: e.target.value })}
                  placeholder="https://your-private-server or http://127.0.0.1:4321"
                  className="w-full border border-[var(--hairline)] bg-[var(--paper)] px-3.5 py-2.5 text-sm"
                />
              </div>

              {vaultEnabled ? (
                <div>
                  <label className="mb-1.5 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                    Current Vault Passphrase (required to re-seal token)
                  </label>
                  <input
                    type="password"
                    value={resealPassphrase}
                    onChange={(e) => setResealPassphrase(e.target.value)}
                    placeholder="Enter vault passphrase to save & seal credentials"
                    className="w-full border border-[var(--hairline)] bg-[var(--paper)] px-3.5 py-2.5 text-sm"
                  />
                </div>
              ) : null}

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="submit"
                  className="inline-flex items-center gap-2 bg-[var(--ink)] px-5 py-2.5 text-xs font-semibold tracking-widest text-[var(--paper-light)] uppercase cursor-pointer hover:bg-[var(--walnut-deep)]"
                >
                  <HardDrive className="h-3.5 w-3.5" />
                  <span>Save &amp; Connect</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const defaults = getDefaultStorageConfig();
                    setConfig((prev) => ({
                      ...defaults,
                      token: prev.token || defaults.token,
                    }));
                    saveStorageConfig({
                      ...defaults,
                      token: config.token || defaults.token,
                    });
                    void runHealthCheck({
                      ...defaults,
                      token: config.token || defaults.token,
                    });
                    onConnected?.();
                  }}
                  className="inline-flex items-center gap-2 border border-[var(--hairline)] bg-[var(--paper-light)] px-4 py-2.5 text-xs font-semibold tracking-wider uppercase cursor-pointer hover:border-[var(--ink)]"
                >
                  <span>Use Default URL</span>
                </button>

                {offlineCount > 0 && health && (!health.authRequired || health.tokenAuthorized) ? (
                  <button
                    type="button"
                    onClick={() => void handleSyncOffline()}
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
                ) : null}
              </div>

              {syncResult ? (
                <p className="text-xs font-medium text-[#466f4b]">{syncResult}</p>
              ) : null}
            </form>

            <div className="mt-7 border-t border-[var(--hairline)] pt-5">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2 text-[10px] font-semibold tracking-widest uppercase text-[var(--ink-soft)]">
                  <Terminal className="h-3.5 w-3.5" />
                  <span>Private Server Setup</span>
                </div>
                <button
                  type="button"
                  onClick={() => void copyCommands()}
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
                      <span>Copy Command</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="overflow-x-auto border border-[var(--hairline)] bg-[#23201c] p-3.5 text-xs leading-relaxed text-[#eee8db]">
                <code>{SERVER_SETUP_SNIPPET}</code>
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
