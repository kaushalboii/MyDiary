"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  Eye,
  EyeOff,
  Lock,
  ShieldCheck,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import {
  bootstrapOwnerAccount,
  getAuthStatus,
  loadStorageConfig,
  loginAccount,
  registerAccount,
  saveSessionToken,
} from "@/lib/storage-client";
import type { AuthStatusResponse } from "@/lib/types";
import {
  AUTH_REQUIRED_EVENT,
  VAULT_STATE_EVENT,
  getVaultStatus,
  hasVaultEnvelope,
  isVaultUnlocked,
  lockVaultNow,
  setActiveUserEncryptionKey,
  touchVaultActivity,
  unlockVaultWithPassphrase,
  wipeLocalDiaryData,
} from "@/lib/vault-security";

type GateMode = "none" | "vault-locked" | "server-auth";
type ServerAuthTab = "signin" | "register";

export function VaultLockGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mode, setMode] = useState<GateMode>(() =>
    typeof window !== "undefined" && hasVaultEnvelope() && !isVaultUnlocked()
      ? "vault-locked"
      : "none",
  );
  const [passphrase, setPassphrase] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);

  // Server authentication state (never displays backend URLs)
  const [authStatus, setAuthStatus] = useState<AuthStatusResponse | null>(null);
  const [authTab, setAuthTab] = useState<ServerAuthTab>("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [customServerUrl, setCustomServerUrl] = useState("");
  const [authMessage, setAuthMessage] = useState<string | null>(null);

  const checkSeqRef = useRef(0);

  const evaluateGate = useCallback(async (forceServerAuth = false, customMsg?: string) => {
    const seq = ++checkSeqRef.current;

    const isHome = !pathname || pathname === "/" || pathname.endsWith("/MyDiary") || pathname.endsWith("/MyDiary/");
    if (isHome && !forceServerAuth) {
      document.documentElement.dataset.vault = "open";
      setMode("none");
      return;
    }

    if (hasVaultEnvelope() && !isVaultUnlocked()) {
      document.documentElement.dataset.vault = "locked";
      setMode("vault-locked");
      return;
    }

    const cfg = loadStorageConfig();
    if (!cfg.serverUrl) {
      if (forceServerAuth) {
        document.documentElement.dataset.vault = "locked";
        setAuthMessage(customMsg || "Connect a private archive to sign in.");
        setMode("server-auth");
      } else {
        document.documentElement.dataset.vault = "open";
        setMode("none");
      }
      return;
    }

    const status = await getAuthStatus(cfg);
    if (seq !== checkSeqRef.current) return;

    if (status) {
      setAuthStatus(status);
      if ((status.accountRequired && !status.authenticated) || forceServerAuth) {
        if (customMsg) setAuthMessage(customMsg);
        document.documentElement.dataset.vault = "locked";
        setMode("server-auth");
        return;
      }
      document.documentElement.dataset.vault = "open";
      setMode("none");
      return;
    }

    if (forceServerAuth) {
      document.documentElement.dataset.vault = "locked";
      if (customMsg) setAuthMessage(customMsg);
      setMode("server-auth");
    } else {
      document.documentElement.dataset.vault = "open";
      setMode("none");
    }
  }, [pathname]);

  useEffect(() => {
    void evaluateGate();

    function onVaultOrConfigChange() {
      setError(null);
      setPassphrase("");
      setConfirmWipe(false);
      void evaluateGate();
    }

    function onAuthRequired(event: Event) {
      if (hasVaultEnvelope() && !isVaultUnlocked()) {
        document.documentElement.dataset.vault = "locked";
        setMode("vault-locked");
        return;
      }
      const detail = (event as CustomEvent<{ message?: string }>)?.detail;
      document.documentElement.dataset.vault = "locked";
      setError(null);
      setPassword("");
      setAuthMessage(
        detail?.message || "Please sign in with your diary account to continue.",
      );
      setMode("server-auth");
      void evaluateGate(true, detail?.message);
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

    window.addEventListener(VAULT_STATE_EVENT, onVaultOrConfigChange);
    window.addEventListener("mydiary:storage-config-changed", onVaultOrConfigChange);
    window.addEventListener(AUTH_REQUIRED_EVENT, onAuthRequired);
    window.addEventListener("pointerdown", onUserActivity, { passive: true });
    window.addEventListener("keydown", onUserActivity);

    return () => {
      window.clearInterval(idleTimer);
      window.removeEventListener(VAULT_STATE_EVENT, onVaultOrConfigChange);
      window.removeEventListener("mydiary:storage-config-changed", onVaultOrConfigChange);
      window.removeEventListener(AUTH_REQUIRED_EVENT, onAuthRequired);
      window.removeEventListener("pointerdown", onUserActivity);
      window.removeEventListener("keydown", onUserActivity);
    };
  }, [evaluateGate]);

  function resolveEffectiveConfig() {
    const current = loadStorageConfig();
    const override = customServerUrl.trim();
    return {
      ...current,
      serverUrl: override || current.serverUrl,
    };
  }

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
      await evaluateGate();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not unlock vault.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAccountSignIn(e: FormEvent) {
    e.preventDefault();
    const targetCfg = resolveEffectiveConfig();
    if (!targetCfg.serverUrl) {
      setError("Archive server is unreachable. Check your storage connection.");
      return;
    }
    const cleanUser = username.trim().toLowerCase();
    if (!cleanUser) {
      setError("Please enter your username.");
      return;
    }
    if (!password) {
      setError("Please enter your password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await loginAccount(
        { username: cleanUser, password },
        targetCfg,
      );
      if (res.sessionToken) {
        saveSessionToken(res.sessionToken);
      }
      await setActiveUserEncryptionKey(cleanUser, password);
      setPassword("");
      setAuthMessage(null);
      document.documentElement.dataset.vault = "open";
      setMode("none");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid username or password.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAccountRegister(e: FormEvent) {
    e.preventDefault();
    const targetCfg = resolveEffectiveConfig();
    if (!targetCfg.serverUrl) {
      setError("Archive server is unreachable. Check your storage connection.");
      return;
    }
    const cleanUser = username.trim().toLowerCase();
    if (!cleanUser) {
      setError("Please choose a username.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let sessionToken = "";
      if (authStatus?.needsOwnerSetup) {
        const res = await bootstrapOwnerAccount(
          {
            username: cleanUser,
            displayName: cleanUser,
            password,
          },
          targetCfg,
        );
        sessionToken = res.sessionToken;
      } else {
        const res = await registerAccount(
          {
            username: cleanUser,
            displayName: cleanUser,
            password,
          },
          targetCfg,
        );
        sessionToken = res.sessionToken || "";
      }

      if (sessionToken) {
        saveSessionToken(sessionToken);
      }
      await setActiveUserEncryptionKey(cleanUser, password);
      setPassword("");
      setAuthMessage(null);
      document.documentElement.dataset.vault = "open";
      setMode("none");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
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
      await evaluateGate();
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
            Your session credentials and cached diary state are sealed with AES-256-GCM encryption
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
                  placeholder="Enter your vault passphrase"
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
                  Clears only this browser&apos;s locked credentials &amp; offline drafts. Data on
                  your private archive stays intact.
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
    const isHome = !pathname || pathname === "/" || pathname.endsWith("/MyDiary") || pathname.endsWith("/MyDiary/");

    const modal = (
      <main
        className="vault-gate-backdrop"
        data-testid="vault-gate"
        aria-label="Private Archive Sign In"
      >
        <section className="vault-gate-card relative">
          <button
            type="button"
            onClick={() => {
              setMode("none");
              document.documentElement.dataset.vault = "open";
            }}
            className="absolute top-4 right-4 p-2 text-[var(--ink-soft)] hover:text-[var(--ink)] cursor-pointer"
            aria-label="Close"
          >
            <X size={18} />
          </button>
          <div className="vault-gate-emblem" aria-hidden="true">
            <ShieldCheck size={22} />
          </div>
          <p className="diary-kicker">PRIVATE MEMORY ARCHIVE</p>
          <h1 className="diary-title vault-gate-title">
            {authTab === "signin" ? "Sign In to Your Diary" : "Create Your Account"}
          </h1>
          <p className="diary-muted vault-gate-subtitle">
            {authTab === "signin"
              ? "Enter your credentials to unlock and read your private memory archive."
              : "Create an isolated account to store and encrypt your personal memories."}
          </p>

          <div className="mb-5 flex rounded-full border border-[var(--hairline)] bg-[var(--paper)] p-1">
            <button
              type="button"
              onClick={() => {
                setAuthTab("signin");
                setError(null);
              }}
              data-testid="auth-tab-signin"
              className={`flex-1 rounded-full px-4 py-2 text-xs font-semibold tracking-wider uppercase cursor-pointer transition-colors ${
                authTab === "signin"
                  ? "bg-[var(--ink)] text-[var(--paper-light)]"
                  : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthTab("register");
                setError(null);
              }}
              data-testid="auth-tab-register"
              className={`flex-1 rounded-full px-4 py-2 text-xs font-semibold tracking-wider uppercase cursor-pointer transition-colors ${
                authTab === "register"
                  ? "bg-[var(--ink)] text-[var(--paper-light)]"
                  : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
              }`}
            >
              Create Account
            </button>
          </div>

          {authTab === "signin" ? (
            <form onSubmit={(e) => void handleAccountSignIn(e)} className="vault-gate-form">
              <label className="field-block">
                <span>Username</span>
                <input
                  type="text"
                  autoComplete="username"
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  data-testid="auth-username-input"
                  required
                />
              </label>

              <label className="field-block">
                <span>Password</span>
                <div className="vault-input-wrap">
                  <input
                    type={showSecret ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    data-testid="auth-password-input"
                    required
                  />
                  <button
                    type="button"
                    className="vault-reveal-btn"
                    onClick={() => setShowSecret((v) => !v)}
                    aria-label={showSecret ? "Hide password" : "Show password"}
                  >
                    {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </label>

              {error && (
                <div className="notice-banner error" role="alert" data-testid="vault-unlock-error">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="primary-btn vault-submit-btn"
                data-testid="auth-submit-btn"
              >
                <Lock size={15} />
                <span>{busy ? "Signing In..." : "Sign In & Open Diary"}</span>
              </button>
            </form>
          ) : (
            <form onSubmit={(e) => void handleAccountRegister(e)} className="vault-gate-form">
              <label className="field-block">
                <span>Choose Username</span>
                <input
                  type="text"
                  autoComplete="username"
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="3–32 characters (e.g. kaushal)"
                  data-testid="auth-username-input"
                  required
                />
              </label>

              <label className="field-block">
                <span>Password (Min 8 characters)</span>
                <div className="vault-input-wrap">
                  <input
                    type={showSecret ? "text" : "password"}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Choose a strong password"
                    data-testid="auth-password-input"
                    required
                  />
                  <button
                    type="button"
                    className="vault-reveal-btn"
                    onClick={() => setShowSecret((v) => !v)}
                    aria-label={showSecret ? "Hide password" : "Show password"}
                  >
                    {showSecret ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </label>

              {error && (
                <div className="notice-banner error" role="alert" data-testid="vault-unlock-error">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="primary-btn vault-submit-btn"
                data-testid="auth-submit-btn"
              >
                <UserPlus size={15} />
                <span>{busy ? "Creating Account..." : "Create Account & Open Diary"}</span>
              </button>
            </form>
          )}

          <details className="vault-gate-footer">
            <summary className="vault-wipe-trigger cursor-pointer list-none text-[11px]">
              Switch or set private archive endpoint
            </summary>
            <div className="mt-3 space-y-2">
              <label className="field-block">
                <span>Archive Endpoint URL (masked for privacy)</span>
                <input
                  type="password"
                  value={customServerUrl}
                  onChange={(e) => setCustomServerUrl(e.target.value)}
                  placeholder="Leave blank to use default configured host"
                />
              </label>
            </div>
          </details>

          <button
            type="button"
            onClick={() => {
              setMode("none");
              document.documentElement.dataset.vault = "open";
            }}
            className="mt-4 block w-full text-center text-xs text-[var(--ink-soft)] hover:text-[var(--ink)] cursor-pointer uppercase tracking-wider"
          >
            ← Browse 3D Bookshelf as Guest
          </button>
        </section>
      </main>
    );

    return isHome ? (
      <>
        <div className="vault-protected-shell">{children}</div>
        {modal}
      </>
    ) : (
      modal
    );
  }

  return <div className="vault-protected-shell">{children}</div>;
}
