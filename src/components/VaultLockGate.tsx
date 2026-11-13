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
  loginWithGoogle,
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

  // Google 1-Tap & OTP sign-in configuration (strictly from environment or user local storage)
  const [googleClientId, setGoogleClientId] = useState(() => {
    if (typeof window !== "undefined") {
      return (
        process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
        localStorage.getItem("mydiary:google_client_id") ||
        ""
      );
    }
    return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "";
  });
  const [showGoogleSetup, setShowGoogleSetup] = useState(false);

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

  // Load Google Identity Services script
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (document.getElementById("google-gsi-client")) return;
    const script = document.createElement("script");
    script.id = "google-gsi-client";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    document.body.appendChild(script);
  }, []);

  async function handleGoogleCredentialResponse(credential: string) {
    const targetCfg = resolveEffectiveConfig();
    if (!targetCfg.serverUrl) {
      setError("Archive server is unreachable. Check your storage connection.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await loginWithGoogle(credential, targetCfg);
      if (res.sessionToken) {
        saveSessionToken(res.sessionToken);
      }
      await setActiveUserEncryptionKey(res.user.username, res.googleSub);
      setAuthMessage(null);
      document.documentElement.dataset.vault = "open";
      setMode("none");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  const initGoogleGsi = useCallback(
    (clientId: string) => {
      if (typeof window === "undefined" || !clientId) return;
      let attempts = 0;
      const interval = setInterval(() => {
        attempts++;
        const google = (window as unknown as {
          google?: {
            accounts?: {
              id?: {
                initialize: (opts: Record<string, unknown>) => void;
                renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
                prompt: () => void;
              };
            };
          };
        })?.google;

        if (google?.accounts?.id) {
          clearInterval(interval);
          try {
            google.accounts.id.initialize({
              client_id: clientId,
              callback: (res: { credential?: string }) => {
                if (res.credential) {
                  void handleGoogleCredentialResponse(res.credential);
                }
              },
              auto_select: false,
              cancel_on_tap_outside: true,
            });

            const container = document.getElementById("google-gsi-btn-mount");
            if (container) {
              container.innerHTML = "";
              google.accounts.id.renderButton(container, {
                theme: "outline",
                size: "large",
                text: "continue_with",
                shape: "pill",
                width: 280,
                logo_alignment: "left",
              });
            }
          } catch (err) {
            console.warn("Google GSI render notice:", err);
          }
        } else if (attempts >= 25) {
          clearInterval(interval);
        }
      }, 150);
    },
    [],
  );

  useEffect(() => {
    if (mode === "server-auth" && googleClientId.trim()) {
      const timer = setTimeout(() => {
        initGoogleGsi(googleClientId.trim());
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [mode, googleClientId, initGoogleGsi]);

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

          {/* Google 1-Click Sign-In with 2FA / OTP */}
          <div className="mb-4 flex flex-col items-center w-full">
            {googleClientId.trim() ? (
              <div id="google-gsi-btn-mount" className="flex justify-center min-h-[44px] w-full" />
            ) : (
              <button
                type="button"
                onClick={() => setShowGoogleSetup((prev) => !prev)}
                className="flex w-full items-center justify-center gap-2.5 rounded-full border border-[var(--hairline)] bg-[var(--paper-light)] px-4 py-2.5 text-xs font-semibold tracking-wide text-[var(--ink)] shadow-sm hover:border-[var(--ink)] cursor-pointer transition-all"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  />
                </svg>
                <span>Continue with Google (Instant &amp; OTP 2FA)</span>
              </button>
            )}

            {showGoogleSetup && !googleClientId.trim() && (
              <div className="mt-3 w-full rounded-xl border border-[var(--hairline)] bg-[var(--paper-light)] p-3 text-xs text-left">
                <p className="m-0 font-semibold text-[var(--ink)]">
                  Google One-Tap &amp; OTP Sign-In Setup:
                </p>
                <p className="mt-1 mb-2 text-[11px] text-[var(--ink-soft)] leading-relaxed">
                  Enter your free Google OAuth Client ID (or add <code>GOOGLE_CLIENT_ID</code> to GitHub repository secrets):
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={googleClientId}
                    onChange={(e) => setGoogleClientId(e.target.value)}
                    placeholder="xxxx.apps.googleusercontent.com"
                    className="flex-1 rounded border border-[var(--hairline)] px-2.5 py-1 text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const trimmed = googleClientId.trim();
                      if (trimmed && typeof window !== "undefined") {
                        localStorage.setItem("mydiary:google_client_id", trimmed);
                        setShowGoogleSetup(false);
                        initGoogleGsi(trimmed);
                      }
                    }}
                    className="rounded bg-[var(--ink)] px-3 py-1 text-[11px] font-semibold text-[var(--paper-light)] uppercase cursor-pointer"
                  >
                    Save
                  </button>
                </div>
              </div>
            )}

            <div className="relative my-4 w-full text-center">
              <span className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-[var(--hairline)]" />
              </span>
              <span className="relative bg-[var(--paper)] px-3 text-[10px] font-semibold tracking-widest text-[var(--ink-soft)] uppercase">
                or continue with username
              </span>
            </div>
          </div>

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
