"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Eye, EyeOff, Lock, ShieldCheck, Trash2 } from "lucide-react";
import {
  checkStorageHealth,
  loadStorageConfig,
  saveStorageConfig,
} from "@/lib/storage-client";
import {
  AUTH_REQUIRED_EVENT,
  VAULT_STATE_EVENT,
  enableVaultLock,
  getVaultStatus,
  hasVaultEnvelope,
  isVaultUnlocked,
  lockVaultNow,
  touchVaultActivity,
  unlockVaultWithPassphrase,
  wipeLocalDiaryData,
} from "@/lib/vault-security";

type GateMode = "none" | "vault-locked" | "server-auth";

export function VaultLockGate({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<GateMode>("none");
  const [passphrase, setPassphrase] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);

  // Server 401 Sign-In state
  const [serverUrl, setServerUrl] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [optionalVaultPass, setOptionalVaultPass] = useState("");
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  useEffect(() => {
    function syncGate() {
      const locked = hasVaultEnvelope() && !isVaultUnlocked();
      if (locked) {
        document.documentElement.dataset.vault = "locked";
        setMode("vault-locked");
        return;
      }
      document.documentElement.dataset.vault = "open";
      setMode((prev) => (prev === "server-auth" ? "server-auth" : "none"));
    }

    syncGate();

    function onVaultChange() {
      setError(null);
      setPassphrase("");
      setConfirmWipe(false);
      syncGate();
    }

    function onAuthRequired(event: Event) {
      if (hasVaultEnvelope() && !isVaultUnlocked()) {
        syncGate();
        return;
      }
      const detail = (event as CustomEvent<{ message?: string; serverUrl?: string }>)?.detail;
      const cfg = loadStorageConfig();
      setServerUrl(detail?.serverUrl || cfg.serverUrl);
      setTokenInput("");
      setOptionalVaultPass("");
      setAuthMessage(
        detail?.message || "Your storage server requires a valid owner token.",
      );
      setError(null);
      document.documentElement.dataset.vault = "locked";
      setMode("server-auth");
    }

    let lastTouch = 0;
    function onUserActivity() {
      const now = Date.now();
      if (now - lastTouch < 12_000) return;
      lastTouch = now;
      touchVaultActivity();
    }

    const idleTimer = window.setInterval(() => {
      const status = getVaultStatus();
      if (status.enabled && !status.unlocked) {
        lockVaultNow();
      }
    }, 15_000);

    window.addEventListener(VAULT_STATE_EVENT, onVaultChange);
    window.addEventListener(AUTH_REQUIRED_EVENT, onAuthRequired);
    window.addEventListener("pointerdown", onUserActivity, { passive: true });
    window.addEventListener("keydown", onUserActivity);

    return () => {
      window.clearInterval(idleTimer);
      window.removeEventListener(VAULT_STATE_EVENT, onVaultChange);
      window.removeEventListener(AUTH_REQUIRED_EVENT, onAuthRequired);
      window.removeEventListener("pointerdown", onUserActivity);
      window.removeEventListener("keydown", onUserActivity);
    };
  }, []);

  async function handleVaultUnlock(e: FormEvent) {
    e.preventDefault();
    if (!passphrase.trim()) {
      setError("Enter your vault passphrase to unlock.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await unlockVaultWithPassphrase(passphrase);
      setPassphrase("");
      setMode("none");
      document.documentElement.dataset.vault = "open";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not unlock vault.");
    } finally {
      setBusy(false);
    }
  }

  async function handleServerSignIn(e: FormEvent) {
    e.preventDefault();
    const trimmedToken = tokenInput.trim();
    const trimmedUrl = serverUrl.trim();
    if (!trimmedUrl) {
      setError("Storage server URL is required.");
      return;
    }
    if (!trimmedToken) {
      setError("Enter your owner storage token.");
      return;
    }
    if (optionalVaultPass.trim() && optionalVaultPass.trim().length < 6) {
      setError("Optional vault passphrase must be at least 6 characters.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const current = loadStorageConfig();
      const health = await checkStorageHealth({
        serverUrl: trimmedUrl,
        token: trimmedToken,
        label: current.label,
      });
      if (!health.ok || (health.authRequired && !health.tokenAuthorized)) {
        setError("Server rejected this storage token. Double-check your secret token.");
        return;
      }

      if (optionalVaultPass.trim().length >= 6) {
        saveStorageConfig({
          serverUrl: trimmedUrl,
          token: "",
          label: current.label,
        });
        await enableVaultLock(
          optionalVaultPass.trim(),
          {
            serverUrl: trimmedUrl,
            token: trimmedToken,
            label: current.label,
          },
          15,
        );
      } else {
        saveStorageConfig({
          serverUrl: trimmedUrl,
          token: trimmedToken,
          label: current.label,
        });
      }

      setTokenInput("");
      setOptionalVaultPass("");
      setAuthMessage(null);
      document.documentElement.dataset.vault = "open";
      setMode("none");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to verify token with storage server.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleWipeBrowserData() {
    setBusy(true);
    setError(null);
    try {
      await wipeLocalDiaryData();
      setConfirmWipe(false);
      document.documentElement.dataset.vault = "open";
      setMode("none");
    } finally {
      setBusy(false);
    }
  }

  if (mode === "vault-locked") {
    return (
      <main
        className="vault-gate-backdrop"
        data-testid="vault-gate"
        aria-label="Owner Vault Locked"
      >
        <section className="vault-gate-card">
          <div className="vault-gate-emblem" aria-hidden="true">
            <Lock size={22} />
          </div>
          <p className="diary-kicker">PRIVATE DIARY ARCHIVE</p>
          <h1 className="diary-title vault-gate-title">Owner Vault Locked</h1>
          <p className="diary-muted vault-gate-subtitle">
            Your server credentials and cached diary state are sealed with AES-256-GCM encryption
            on this browser.
          </p>

          <form onSubmit={(e) => void handleVaultUnlock(e)} className="vault-gate-form">
            <label className="field-block">
              <span>Vault Passphrase</span>
              <div className="vault-input-wrap">
                <input
                  type={showSecret ? "text" : "password"}
                  autoComplete="current-password"
                  autoFocus
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                  placeholder="Enter your owner passphrase"
                  data-testid="vault-passphrase-input"
                />
                <button
                  type="button"
                  className="vault-reveal-btn"
                  onClick={() => setShowSecret((v) => !v)}
                  aria-label={showSecret ? "Hide passphrase" : "Show passphrase"}
                >
                  {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </label>

            {error ? (
              <div className="notice-banner error" role="alert" data-testid="vault-unlock-error">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="primary-btn vault-submit-btn"
              data-testid="vault-unlock-btn"
            >
              <Lock size={15} />
              <span>{busy ? "Decrypting..." : "Unlock Diary"}</span>
            </button>
          </form>

          <div className="vault-gate-footer">
            {!confirmWipe ? (
              <button
                type="button"
                className="text-link vault-wipe-trigger"
                onClick={() => setConfirmWipe(true)}
                data-testid="vault-wipe-toggle"
              >
                Forgot passphrase? Clear local browser lock
              </button>
            ) : (
              <div className="vault-wipe-confirm-box">
                <p>
                  Clears only this browser&apos;s locked token &amp; offline drafts. Data on your
                  private server stays intact.
                </p>
                <div className="modal-actions-row">
                  <button
                    type="button"
                    className="ghost-pill"
                    onClick={() => setConfirmWipe(false)}
                    disabled={busy}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="danger-btn"
                    onClick={() => void handleWipeBrowserData()}
                    disabled={busy}
                    data-testid="vault-wipe-confirm"
                  >
                    <Trash2 size={14} />
                    <span>Clear Browser Data</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    );
  }

  if (mode === "server-auth") {
    return (
      <main
        className="vault-gate-backdrop"
        data-testid="vault-gate"
        aria-label="Owner Access Required"
      >
        <section className="vault-gate-card">
          <div className="vault-gate-emblem" aria-hidden="true">
            <ShieldCheck size={22} />
          </div>
          <p className="diary-kicker">PROTECTED STORAGE</p>
          <h1 className="diary-title vault-gate-title">Owner Access Required</h1>
          <p className="diary-muted vault-gate-subtitle">
            {authMessage ||
              "This diary server blocks anonymous requests. Verify your owner token to read or write memories."}
          </p>

          <form onSubmit={(e) => void handleServerSignIn(e)} className="vault-gate-form">
            <label className="field-block">
              <span>Storage Server URL</span>
              <input
                type="url"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="https://your-private-server"
                required
              />
            </label>

            <label className="field-block">
              <span>Owner Storage Token</span>
              <div className="vault-input-wrap">
                <input
                  type={showSecret ? "text" : "password"}
                  autoFocus
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="Paste DIARY_STORAGE_TOKEN"
                  data-testid="auth-token-input"
                  required
                />
                <button
                  type="button"
                  className="vault-reveal-btn"
                  onClick={() => setShowSecret((v) => !v)}
                  aria-label={showSecret ? "Hide token" : "Show token"}
                >
                  {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </label>

            <label className="field-block">
              <span>Seal With Vault Passphrase (Optional)</span>
              <input
                type="password"
                value={optionalVaultPass}
                onChange={(e) => setOptionalVaultPass(e.target.value)}
                placeholder="Min 6 chars to encrypt token on this device"
                autoComplete="new-password"
              />
            </label>

            {error ? (
              <div className="notice-banner error" role="alert" data-testid="vault-unlock-error">
                {error}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="primary-btn vault-submit-btn"
              data-testid="auth-verify-btn"
            >
              <ShieldCheck size={15} />
              <span>{busy ? "Verifying..." : "Verify & Open Diary"}</span>
            </button>
          </form>
        </section>
      </main>
    );
  }

  return <div className="vault-protected-shell">{children}</div>;
}

