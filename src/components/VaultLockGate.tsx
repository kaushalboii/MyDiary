"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  ShieldCheck,
  Trash2,
  UserPlus,
} from "lucide-react";
import {
  bootstrapOwnerAccount,
  checkStorageHealth,
  getAuthStatus,
  loadStorageConfig,
  loginAccount,
  registerAccount,
  saveStorageConfig,
} from "@/lib/storage-client";
import type { AuthStatusResponse } from "@/lib/types";
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
type ServerAuthTab = "signin" | "register" | "setup-key";

export function VaultLockGate({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<GateMode>("none");
  const [passphrase, setPassphrase] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmWipe, setConfirmWipe] = useState(false);

  // Server authentication state (never displays backend URLs)
  const [authStatus, setAuthStatus] = useState<AuthStatusResponse | null>(null);
  const [authTab, setAuthTab] = useState<ServerAuthTab>("signin");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [optionalVaultPass, setOptionalVaultPass] = useState("");
  const [customServerUrl, setCustomServerUrl] = useState("");
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [pendingNotice, setPendingNotice] = useState<string | null>(null);

  const checkSeqRef = useRef(0);

  const evaluateGate = useCallback(async (forceServerAuth = false, customMsg?: string) => {
    const seq = ++checkSeqRef.current;

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
  }, []);

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
      setPendingNotice(null);
      setPassword("");
      setTokenInput("");
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

  async function sealIfRequested(sessionToken: string, effectiveUrl: string, label: string) {
    if (optionalVaultPass.trim().length >= 6) {
      saveStorageConfig({
        serverUrl: effectiveUrl,
        token: "",
        label,
      });
      await enableVaultLock(
        optionalVaultPass.trim(),
        {
          serverUrl: effectiveUrl,
          token: sessionToken,
          label,
        },
        15,
      );
    } else if (customServerUrl.trim()) {
      saveStorageConfig({
        serverUrl: effectiveUrl,
        token: "",
        label,
      });
    }
  }

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

  async function handleOwnerBootstrap(e: FormEvent) {
    e.preventDefault();
    const targetCfg = resolveEffectiveConfig();
    if (!targetCfg.serverUrl) {
      setError("Open the Endpoint Override below and enter your private archive URL.");
      return;
    }
    if (optionalVaultPass.trim() && optionalVaultPass.trim().length < 6) {
      setError("Optional vault passphrase must be at least 6 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await bootstrapOwnerAccount(
        {
          username: username.trim(),
          displayName: displayName.trim() || username.trim(),
          password,
          setupToken: setupToken.trim() || undefined,
        },
        targetCfg,
      );
      await sealIfRequested(res.sessionToken, targetCfg.serverUrl, targetCfg.label);
      setPassword("");
      setSetupToken("");
      setOptionalVaultPass("");
      setAuthMessage(null);
      document.documentElement.dataset.vault = "open";
      setMode("none");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Owner setup failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAccountSignIn(e: FormEvent) {
    e.preventDefault();
    const targetCfg = resolveEffectiveConfig();
    if (!targetCfg.serverUrl) {
      setError("Open the Endpoint Override below and enter your private archive URL.");
      return;
    }
    if (optionalVaultPass.trim() && optionalVaultPass.trim().length < 6) {
      setError("Optional vault passphrase must be at least 6 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    setPendingNotice(null);
    try {
      const res = await loginAccount(
        { username: username.trim(), password },
        targetCfg,
      );
      await sealIfRequested(res.sessionToken, targetCfg.serverUrl, targetCfg.label);
      setPassword("");
      setOptionalVaultPass("");
      setAuthMessage(null);
      document.documentElement.dataset.vault = "open";
      setMode("none");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleAccountRegister(e: FormEvent) {
    e.preventDefault();
    const targetCfg = resolveEffectiveConfig();
    if (!targetCfg.serverUrl) {
      setError("Open the Endpoint Override below and enter your private archive URL.");
      return;
    }
    if (optionalVaultPass.trim() && optionalVaultPass.trim().length < 6) {
      setError("Optional vault passphrase must be at least 6 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    setPendingNotice(null);
    try {
      const res = await registerAccount(
        {
          username: username.trim(),
          displayName: displayName.trim() || username.trim(),
          password,
          inviteCode: inviteCode.trim() || undefined,
        },
        targetCfg,
      );
      if (res.pendingVerification || !res.sessionToken) {
        setPassword("");
        setInviteCode("");
        setPendingNotice(
          res.message ||
            "Your account request has been submitted. The archive owner must verify it before you can sign in.",
        );
        return;
      }
      await sealIfRequested(res.sessionToken, targetCfg.serverUrl, targetCfg.label);
      setPassword("");
      setInviteCode("");
      setOptionalVaultPass("");
      setAuthMessage(null);
      document.documentElement.dataset.vault = "open";
      setMode("none");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    } finally {
      setBusy(false);
    }
  }

  async function handleSetupKeySignIn(e: FormEvent) {
    e.preventDefault();
    const trimmedToken = tokenInput.trim();
    const targetCfg = resolveEffectiveConfig();
    if (!targetCfg.serverUrl) {
      setError("Open the Endpoint Override below and enter your private archive URL.");
      return;
    }
    if (!trimmedToken) {
      setError("Enter your setup access key.");
      return;
    }
    if (optionalVaultPass.trim() && optionalVaultPass.trim().length < 6) {
      setError("Optional vault passphrase must be at least 6 characters.");
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const health = await checkStorageHealth({
        serverUrl: targetCfg.serverUrl,
        token: trimmedToken,
        label: targetCfg.label,
      });
      if (!health.ok || (health.authRequired && !health.tokenAuthorized)) {
        setError("Archive server rejected this setup key.");
        return;
      }

      if (optionalVaultPass.trim().length >= 6) {
        saveStorageConfig({
          serverUrl: targetCfg.serverUrl,
          token: "",
          label: targetCfg.label,
        });
        await enableVaultLock(
          optionalVaultPass.trim(),
          {
            serverUrl: targetCfg.serverUrl,
            token: trimmedToken,
            label: targetCfg.label,
          },
          15,
        );
      } else {
        saveStorageConfig({
          serverUrl: targetCfg.serverUrl,
          token: trimmedToken,
          label: targetCfg.label,
        });
      }

      setTokenInput("");
      setOptionalVaultPass("");
      setAuthMessage(null);
      document.documentElement.dataset.vault = "open";
      setMode("none");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to verify key with archive server.",
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
    const needsOwnerSetup = Boolean(authStatus?.needsOwnerSetup);
    const inviteRequiredOnly = authStatus?.registrationMode === "invite-only";

    return (
      <main
        className="vault-gate-backdrop"
        data-testid="vault-gate"
        aria-label="Private Archive Sign In"
      >
        <section className="vault-gate-card">
          <div className="vault-gate-emblem" aria-hidden="true">
            <ShieldCheck size={22} />
          </div>
          <p className="diary-kicker">
            {needsOwnerSetup ? "FIRST-TIME OWNER SETUP" : "PRIVATE MEMORY ARCHIVE"}
          </p>
          <h1 className="diary-title vault-gate-title">
            {needsOwnerSetup ? "Claim Your Archive" : "Verify & Sign In"}
          </h1>
          <p className="diary-muted vault-gate-subtitle">
            {needsOwnerSetup
              ? "Create your owner credentials to lock this archive and isolate every member’s personal diary."
              : authMessage ||
                "Only verified members with an active account can read or write in their private volumes."}
          </p>

          {!needsOwnerSetup ? (
            <div className="mb-4 flex flex-wrap gap-1.5 rounded-full border border-[var(--hairline)] bg-[var(--paper)] p-1">
              <button
                type="button"
                onClick={() => {
                  setAuthTab("signin");
                  setError(null);
                  setPendingNotice(null);
                }}
                data-testid="auth-tab-signin"
                className={`flex-1 rounded-full px-3 py-1.5 text-[11px] font-semibold tracking-wider uppercase cursor-pointer transition-colors ${
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
                  setPendingNotice(null);
                }}
                data-testid="auth-tab-register"
                className={`flex-1 rounded-full px-3 py-1.5 text-[11px] font-semibold tracking-wider uppercase cursor-pointer transition-colors ${
                  authTab === "register"
                    ? "bg-[var(--ink)] text-[var(--paper-light)]"
                    : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
                }`}
              >
                Join / Verify
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthTab("setup-key");
                  setError(null);
                  setPendingNotice(null);
                }}
                data-testid="auth-tab-key"
                className={`rounded-full px-3 py-1.5 text-[11px] font-semibold tracking-wider uppercase cursor-pointer transition-colors ${
                  authTab === "setup-key"
                    ? "bg-[var(--ink)] text-[var(--paper-light)]"
                    : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
                }`}
                title="Use owner access key"
              >
                Key
              </button>
            </div>
          ) : null}

          {pendingNotice ? (
            <div className="space-y-4">
              <div className="rounded-xl border border-[#4e7c53]/35 bg-[#4e7c53]/10 p-4 text-xs leading-relaxed text-[var(--ink)]">
                <div className="mb-1.5 flex items-center gap-2 font-semibold uppercase tracking-wider text-[#3b6440]">
                  <CheckCircle2 size={15} />
                  <span>Verification Requested</span>
                </div>
                <p className="m-0">{pendingNotice}</p>
              </div>
              <button
                type="button"
                className="primary-btn vault-submit-btn"
                onClick={() => {
                  setPendingNotice(null);
                  setAuthTab("signin");
                }}
              >
                Back to Sign In
              </button>
            </div>
          ) : needsOwnerSetup ? (
            <form onSubmit={(e) => void handleOwnerBootstrap(e)} className="vault-gate-form">
              <label className="field-block">
                <span>Owner Username</span>
                <input
                  type="text"
                  autoComplete="username"
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. kaushal"
                  data-testid="auth-username-input"
                  required
                />
              </label>

              <label className="field-block">
                <span>Display Name</span>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Shown inside your archive header"
                />
              </label>

              <label className="field-block">
                <span>Password (Min 8 chars)</span>
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

              {authStatus?.needsSetupToken ? (
                <label className="field-block">
                  <span>Server Setup Key</span>
                  <input
                    type="password"
                    value={setupToken}
                    onChange={(e) => setSetupToken(e.target.value)}
                    placeholder="Initial server setup token"
                    data-testid="auth-token-input"
                    required
                  />
                </label>
              ) : null}

              <label className="field-block">
                <span>Seal With Browser Vault Passphrase (Optional)</span>
                <input
                  type="password"
                  value={optionalVaultPass}
                  onChange={(e) => setOptionalVaultPass(e.target.value)}
                  placeholder="Min 6 chars to encrypt session on this device"
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
                data-testid="auth-submit-btn"
              >
                <ShieldCheck size={15} />
                <span>{busy ? "Creating Owner..." : "Create Owner & Open Diary"}</span>
              </button>
            </form>
          ) : authTab === "signin" ? (
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

              <label className="field-block">
                <span>Seal With Browser Vault Passphrase (Optional)</span>
                <input
                  type="password"
                  value={optionalVaultPass}
                  onChange={(e) => setOptionalVaultPass(e.target.value)}
                  placeholder="Min 6 chars to auto-lock this browser"
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
                data-testid="auth-submit-btn"
              >
                <Lock size={15} />
                <span>{busy ? "Signing In..." : "Sign In & Open Diary"}</span>
              </button>
            </form>
          ) : authTab === "register" ? (
            <form onSubmit={(e) => void handleAccountRegister(e)} className="vault-gate-form">
              <label className="field-block">
                <span>Choose Username</span>
                <input
                  type="text"
                  autoComplete="username"
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="3–32 chars (letters, numbers, _, -)"
                  data-testid="auth-username-input"
                  required
                />
              </label>

              <label className="field-block">
                <span>Display Name</span>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                />
              </label>

              <label className="field-block">
                <span>
                  Invite Verification Code{" "}
                  {inviteRequiredOnly ? "(Required)" : "(Or leave blank for owner approval)"}
                </span>
                <input
                  type="text"
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                  placeholder="MYD-XXXX-XXXX"
                  data-testid="auth-invite-input"
                  required={inviteRequiredOnly}
                />
              </label>

              <label className="field-block">
                <span>Password (Min 8 chars)</span>
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

              {error ? (
                <div className="notice-banner error" role="alert" data-testid="vault-unlock-error">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={busy}
                className="primary-btn vault-submit-btn"
                data-testid="auth-submit-btn"
              >
                <UserPlus size={15} />
                <span>
                  {busy
                    ? "Verifying..."
                    : inviteCode.trim()
                      ? "Verify Code & Join"
                      : "Request Owner Verification"}
                </span>
              </button>
            </form>
          ) : (
            <form onSubmit={(e) => void handleSetupKeySignIn(e)} className="vault-gate-form">
              <label className="field-block">
                <span>Owner Setup Key</span>
                <div className="vault-input-wrap">
                  <input
                    type={showSecret ? "text" : "password"}
                    autoFocus
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="Paste private owner access key"
                    data-testid="auth-token-input"
                    required
                  />
                  <button
                    type="button"
                    className="vault-reveal-btn"
                    onClick={() => setShowSecret((v) => !v)}
                    aria-label={showSecret ? "Hide key" : "Show key"}
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
                  placeholder="Min 6 chars to encrypt key on this device"
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
                <KeyRound size={15} />
                <span>{busy ? "Verifying..." : "Verify Key & Open Diary"}</span>
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
        </section>
      </main>
    );
  }

  return <div className="vault-protected-shell">{children}</div>;
}
