"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  CheckCircle2,
  Cloud,
  Globe,
  Heart,
  KeyRound,
  LogOut,
  RefreshCw,
  Server,
  ShieldCheck,
  UploadCloud,
  X,
} from "lucide-react";
import {
  AUTH_REQUIRED_EVENT,
  checkStorageHealth,
  getAuthStatus,
  getCachedUser,
  getOfflineDraftCount,
  isUserAuthenticated,
  loadStorageConfig,
  loginAccount,
  loginWithGoogle,
  logoutAccount,
  normalizeServerUrl,
  registerAccount,
  saveCachedUser,
  saveSessionToken,
  saveStorageConfig,
  syncOfflineToServer,
} from "@/lib/storage-client";
import type {
  AuthStatusResponse,
  AuthUser,
  StorageConfig,
  StorageHealth,
} from "@/lib/types";

export function StorageSettingsModal({
  open,
  onClose,
  onConnected,
}: {
  open: boolean;
  onClose: () => void;
  onConnected?: () => void;
  initialTab?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const [config, setConfig] = useState<StorageConfig>(() => loadStorageConfig());
  const [health, setHealth] = useState<StorageHealth | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatusResponse | null>(null);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync offline drafts
  const [offlineCount, setOfflineCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  // Expandable sections
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [customServerUrl, setCustomServerUrl] = useState("");
  const [showDirectAuth, setShowDirectAuth] = useState(false);
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");

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

  const gsiClientIdRef = useRef<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const refreshConnectionAndAccount = useCallback(async (target: StorageConfig) => {
    setTesting(true);
    setError(null);
    try {
      const [h, a] = await Promise.all([
        checkStorageHealth(target).catch(() => null),
        getAuthStatus(target),
      ]);
      setHealth(h);
      setAuthStatus(a);
    } finally {
      setTesting(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const loaded = loadStorageConfig();
    setConfig(loaded);
    setCustomServerUrl(loaded.serverUrl);
    setSyncResult(null);
    setError(null);
    void refreshConnectionAndAccount(loaded);
    void getOfflineDraftCount().then(setOfflineCount);
  }, [open, refreshConnectionAndAccount]);

  // Load Google Identity Services script
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    if (!document.getElementById("google-gsi-client")) {
      const script = document.createElement("script");
      script.id = "google-gsi-client";
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      document.body.appendChild(script);
    }
  }, [open]);

  const handleGoogleCredentialResponse = useCallback(
    async (credential: string) => {
      setAuthBusy(true);
      setError(null);
      try {
        const targetCfg = loadStorageConfig();
        const res = await loginWithGoogle(credential, targetCfg);
        if (res.sessionToken) {
          saveSessionToken(res.sessionToken);
        }
        if (res.user) {
          saveCachedUser(res.user);
        }
        // Immediately sync any local drafts to cloud on sign-in
        try {
          await syncOfflineToServer(targetCfg);
        } catch {}
        await refreshConnectionAndAccount(targetCfg);
        onConnected?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Google authentication failed.");
      } finally {
        setAuthBusy(false);
      }
    },
    [onConnected, refreshConnectionAndAccount],
  );

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
            if (gsiClientIdRef.current !== clientId) {
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
              gsiClientIdRef.current = clientId;
            }

            const mount = document.getElementById("google-settings-gsi-mount");
            if (mount) {
              mount.innerHTML = "";
              google.accounts.id.renderButton(mount, {
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
    [handleGoogleCredentialResponse],
  );

  useEffect(() => {
    if (open && googleClientId.trim()) {
      const timer = setTimeout(() => {
        initGoogleGsi(googleClientId.trim());
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [open, googleClientId, initGoogleGsi]);

  async function handleSignOut() {
    setAuthBusy(true);
    try {
      await logoutAccount();
      saveCachedUser(null);
      saveSessionToken("");
      onClose();
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSyncOffline() {
    setSyncing(true);
    setSyncResult(null);
    setError(null);
    try {
      const result = await syncOfflineToServer(config);
      setSyncResult(
        `Synced ${result.addedMemories} memories and ${result.updatedBooks} volume updates to your cloud archive.`,
      );
      setOfflineCount(0);
      await refreshConnectionAndAccount(config);
      onConnected?.();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Sync failed. Check connection or sign in.",
      );
    } finally {
      setSyncing(false);
    }
  }

  async function handleSaveServerUrl() {
    setTesting(true);
    setError(null);
    const normalized = normalizeServerUrl(customServerUrl);
    const updatedCfg: StorageConfig = {
      ...config,
      serverUrl: normalized,
    };
    try {
      const h = await checkStorageHealth(updatedCfg);
      setHealth(h);
      saveStorageConfig(updatedCfg);
      setConfig(updatedCfg);
      setShowServerConfig(false);
      await refreshConnectionAndAccount(updatedCfg);
      onConnected?.();
    } catch (err) {
      setError(
        err instanceof Error
          ? `Could not connect to ${normalized}: ${err.message}`
          : "Could not connect to storage server.",
      );
    } finally {
      setTesting(false);
    }
  }

  async function handleDirectEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!emailInput.trim() || !passwordInput.trim()) return;
    setAuthBusy(true);
    setError(null);
    try {
      const username = emailInput.trim().toLowerCase().split("@")[0].replace(/[^a-z0-9_.-]/g, "") || "user";
      let res: { sessionToken?: string; user: AuthUser };
      try {
        res = await loginAccount({ username, password: passwordInput.trim() }, config);
      } catch {
        res = await registerAccount(
          {
            username,
            displayName: emailInput.trim(),
            password: passwordInput.trim(),
          },
          config,
        );
      }
      if (res.sessionToken) {
        saveSessionToken(res.sessionToken);
      }
      if (res.user) {
        saveCachedUser({ ...res.user, email: emailInput.trim().toLowerCase() });
      }
      try {
        await syncOfflineToServer(config);
      } catch {}
      await refreshConnectionAndAccount(config);
      setShowDirectAuth(false);
      onConnected?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setAuthBusy(false);
    }
  }

  if (!open || !mounted || typeof document === "undefined") return null;

  const currentUser = authStatus?.user ?? health?.user ?? getCachedUser() ?? null;
  const isCloudConnected = Boolean(health?.ok || config.serverUrl);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-black/60 p-4 sm:p-6 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Account and cloud storage"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="stationery-card relative my-auto w-full max-w-lg p-6 sm:p-8 shadow-2xl"
        data-testid="security-storage-modal"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close account dialog"
          className="absolute top-5 right-5 grid h-9 w-9 place-items-center rounded-full border border-[var(--hairline)] bg-[var(--paper)] hover:bg-[var(--paper-deep)] cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-6">
          <p className="eyebrow">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Google Identity &amp; Cloud Storage</span>
          </p>
          <h2
            className="m-0 text-3xl font-normal tracking-tight"
            style={{ fontFamily: "var(--serif)" }}
          >
            Account &amp; Storage
          </h2>
          <p className="mt-2 text-sm text-[var(--ink-soft)]">
            All your diary volumes, collaborative memories, and photos are autosaved directly to your secure cloud archive.
          </p>
        </div>

        {/* Account & Cloud Status Card */}
        <div className="border border-[var(--hairline)] bg-[var(--paper)] p-5 rounded-xl shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{
                    backgroundColor: currentUser || isUserAuthenticated() ? "#10b981" : "#f59e0b",
                  }}
                />
                <span className="text-xs font-semibold tracking-wider uppercase">
                  {currentUser
                    ? `${currentUser.displayName || currentUser.email} (Signed In)`
                    : isUserAuthenticated()
                      ? "Diary Owner (Authenticated)"
                      : "Cloud Storage · Sign In Required"}
                </span>
              </div>
              <p className="mt-1 text-xs text-[var(--ink-soft)] leading-relaxed">
                {currentUser
                  ? `Signed in as ${currentUser.email || currentUser.displayName}. All books, memories, and photos autosave directly to the cloud.`
                  : isUserAuthenticated()
                    ? "Authenticated on this device. All changes autosave to the cloud backend."
                    : "Sign in with Google to enable automatic cloud autosave and real-time collaboration with your partner."}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void refreshConnectionAndAccount(config)}
                disabled={testing}
                className="inline-flex items-center gap-1.5 border border-[var(--hairline)] bg-[var(--paper-light)] px-3 py-1.5 text-[11px] font-semibold tracking-wider uppercase cursor-pointer hover:border-[var(--ink)] rounded"
              >
                <RefreshCw className={`h-3 w-3 ${testing ? "animate-spin" : ""}`} />
                <span>{testing ? "Checking..." : "Refresh"}</span>
              </button>

              {currentUser || isUserAuthenticated() ? (
                <button
                  type="button"
                  onClick={() => void handleSignOut()}
                  disabled={authBusy}
                  data-testid="account-signout-btn"
                  className="inline-flex items-center gap-1.5 border border-[var(--hairline)] bg-[var(--paper-light)] px-3 py-1.5 text-[11px] font-semibold tracking-wider text-[var(--accent)] uppercase cursor-pointer hover:border-[var(--accent)] rounded"
                >
                  <LogOut className="h-3 w-3" />
                  <span>Sign Out</span>
                </button>
              ) : null}
            </div>
          </div>

          {/* Cloud Server status pill */}
          <div className="mt-3.5 pt-3 border-t border-[var(--hairline)] flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-[var(--ink-soft)]">
              <Cloud className="h-3.5 w-3.5 text-emerald-600" />
              <span>
                Backend:{" "}
                <code className="text-[11px] font-mono text-[var(--ink)]">
                  {config.serverUrl || "Default Cloud Archive"}
                </code>
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowServerConfig((v) => !v)}
              className="text-[11px] font-medium text-[var(--accent)] hover:underline cursor-pointer"
            >
              {showServerConfig ? "Hide Server URL" : "Edit Cloud URL"}
            </button>
          </div>

          {/* Expandable Server URL Editor */}
          {showServerConfig && (
            <div className="mt-3 rounded-lg border border-[var(--hairline)] bg-[var(--paper-light)] p-3 space-y-2">
              <label className="block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                Cloud Storage Server URL
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={customServerUrl}
                  onChange={(e) => setCustomServerUrl(e.target.value)}
                  placeholder="https://your-server.onrender.com or http://127.0.0.1:4321"
                  className="flex-1 rounded border border-[var(--hairline)] bg-[var(--paper)] px-3 py-1.5 text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={() => void handleSaveServerUrl()}
                  disabled={testing}
                  className="rounded bg-[var(--ink)] px-3 py-1.5 text-xs font-semibold text-[var(--paper-light)] uppercase cursor-pointer"
                >
                  {testing ? "Testing..." : "Save & Connect"}
                </button>
              </div>
              <p className="text-[10px] text-[var(--ink-soft)]">
                Point to your deployed storage server on Render, Railway, or VPS. Changes persist across sessions.
              </p>
            </div>
          )}

          {/* Local Drafts Auto-Sync Banner */}
          {offlineCount > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--hairline)] pt-3 bg-amber-500/10 p-3 rounded-lg">
              <div>
                <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                  {offlineCount} offline draft volume(s) / memories found locally
                </p>
                <p className="text-[11px] text-amber-800 dark:text-amber-300">
                  Sync them to the cloud so they are accessible on all devices.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void handleSyncOffline()}
                disabled={syncing}
                className="inline-flex items-center gap-2 rounded bg-[var(--ink)] px-3.5 py-1.5 text-[11px] font-semibold tracking-wider text-[var(--paper-light)] uppercase cursor-pointer hover:bg-[var(--walnut-deep)]"
              >
                <UploadCloud className="h-3.5 w-3.5" />
                <span>{syncing ? "Syncing..." : "Sync to Cloud Archive"}</span>
              </button>
            </div>
          )}

          {syncResult && (
            <div className="mt-2 text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>{syncResult}</span>
            </div>
          )}
        </div>

        {error ? (
          <p className="mt-3 text-xs font-medium text-[var(--accent)]" role="alert">
            {error}
          </p>
        ) : null}

        {/* Not Signed In: 1-Tap Google Sign-In */}
        {!currentUser && (
          <div className="mt-6 border border-[var(--hairline)] bg-[var(--paper-light)] p-5 text-center rounded-xl">
            <h3 className="m-0 font-serif text-lg text-[var(--ink)]">Sign In to Your Diary</h3>
            <p className="mx-auto mt-1 max-w-sm text-xs text-[var(--ink-soft)] leading-relaxed">
              Sign in with your Google account so your books and co-authored memories are automatically saved and synced to the cloud.
            </p>

            {/* Direct Google GSI Button Mount */}
            <div className="mt-4 flex flex-col items-center justify-center gap-3">
              <div id="google-settings-gsi-mount" className="min-h-[44px] flex justify-center w-full" />

              <button
                type="button"
                onClick={() => {
                  const google = (window as unknown as {
                    google?: { accounts?: { id?: { prompt: () => void } } };
                  })?.google;
                  if (google?.accounts?.id) {
                    google.accounts.id.prompt();
                  } else if (googleClientId.trim()) {
                    initGoogleGsi(googleClientId.trim());
                  } else {
                    setShowGoogleSetup(true);
                  }
                }}
                disabled={authBusy}
                className="inline-flex items-center justify-center gap-3 rounded-full border border-[var(--hairline)] bg-[var(--paper)] px-6 py-2.5 text-xs font-semibold tracking-wide text-[var(--ink)] shadow-xs hover:border-[var(--ink)] cursor-pointer transition-all"
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
                <span>{authBusy ? "Authenticating..." : "Continue with Google"}</span>
              </button>
            </div>

            {/* Google Client ID Config */}
            {showGoogleSetup && !googleClientId.trim() && (
              <div className="mt-4 w-full rounded-xl border border-[var(--hairline)] bg-[var(--paper)] p-3 text-xs text-left">
                <p className="m-0 font-semibold text-[var(--ink)]">Google OAuth Client ID:</p>
                <p className="mt-0.5 mb-2 text-[11px] text-[var(--ink-soft)]">
                  Enter your Google Client ID to enable instant 1-tap sign-in:
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
                      if (trimmed) {
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

            {/* Direct Email / Partner Sign-In Toggle */}
            <div className="mt-4 pt-3 border-t border-[var(--hairline)] text-center">
              <button
                type="button"
                onClick={() => setShowDirectAuth((v) => !v)}
                className="text-[11px] text-[var(--ink-soft)] hover:text-[var(--ink)] underline cursor-pointer"
              >
                {showDirectAuth ? "Hide Email Sign-In" : "Or Sign In with Email / Partner Access"}
              </button>

              {showDirectAuth && (
                <form onSubmit={handleDirectEmailLogin} className="mt-3 space-y-2 text-left">
                  <input
                    type="email"
                    required
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="partner@gmail.com"
                    className="w-full rounded border border-[var(--hairline)] bg-[var(--paper)] px-3 py-1.5 text-xs"
                  />
                  <input
                    type="password"
                    required
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="Account Password"
                    className="w-full rounded border border-[var(--hairline)] bg-[var(--paper)] px-3 py-1.5 text-xs"
                  />
                  <button
                    type="submit"
                    disabled={authBusy}
                    className="w-full rounded bg-[var(--ink)] py-1.5 text-xs font-semibold text-[var(--paper-light)] uppercase cursor-pointer"
                  >
                    {authBusy ? "Signing In..." : "Sign In with Email"}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Open Source & Sponsorship */}
        <div className="mt-6 border-t border-[var(--hairline)] pt-4 text-center">
          <div className="flex items-center justify-center gap-1.5 text-[11px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
            <Heart className="h-3.5 w-3.5 text-[#ea4aaa] fill-[#ea4aaa]" />
            <span>Support Open Source Development</span>
          </div>
          <p className="mx-auto mt-1 max-w-sm text-xs text-[var(--ink-soft)] leading-relaxed">
            MyDiary is free and open source. If you love this project, consider sponsoring M Kaushal Maran on GitHub Sponsors!
          </p>
          <div className="mt-3 flex flex-col items-center justify-center gap-2">
            <iframe
              src="https://github.com/sponsors/kaushalboii/button"
              title="Sponsor kaushalboii"
              height="32"
              width="114"
              style={{ border: 0, borderRadius: "6px" }}
            />
            <a
              href="https://github.com/sponsors/kaushalboii"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-[var(--accent)] no-underline hover:underline"
            >
              <span>Visit GitHub Sponsors Profile →</span>
            </a>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
