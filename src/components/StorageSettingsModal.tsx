"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Heart,
  LogOut,
  RefreshCw,
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
  loginWithGoogle,
  logoutAccount,
  saveCachedUser,
  saveSessionToken,
  syncOfflineToServer,
} from "@/lib/storage-client";
import type {
  AuthStatusResponse,
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
  const [gsiLoaded, setGsiLoaded] = useState(false);

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
    setSyncResult(null);
    setError(null);
    void refreshConnectionAndAccount(loaded);
    void getOfflineDraftCount().then(setOfflineCount);
  }, [open, refreshConnectionAndAccount]);

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
        const freshCfg = loadStorageConfig();
        setConfig(freshCfg);
        setAuthStatus({
          ok: true,
          authenticated: true,
          user: res.user,
          accountRequired: true,
          needsOwnerSetup: false,
          needsSetupToken: false,
          registrationMode: "invite-only",
        });
        try {
          await syncOfflineToServer(freshCfg);
        } catch {}
        await refreshConnectionAndAccount(freshCfg);
        onConnected?.();
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("mydiary:storage-config-changed"));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Google authentication failed.");
      } finally {
        setAuthBusy(false);
      }
    },
    [onConnected, refreshConnectionAndAccount],
  );

  // Load and initialize Google Identity Services
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

    const cid =
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ||
      (typeof window !== "undefined" ? localStorage.getItem("mydiary:google_client_id") || "" : "");

    if (!cid) return;

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
          if (gsiClientIdRef.current !== cid) {
            google.accounts.id.initialize({
              client_id: cid,
              callback: (res: { credential?: string }) => {
                if (res.credential) {
                  void handleGoogleCredentialResponse(res.credential);
                }
              },
              auto_select: false,
              cancel_on_tap_outside: true,
            });
            gsiClientIdRef.current = cid;
          }

          const mount = document.getElementById("google-signin-mount");
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
            setGsiLoaded(true);
          }
        } catch (err) {
          console.warn("GSI render notice:", err);
        }
      } else if (attempts >= 25) {
        clearInterval(interval);
      }
    }, 150);

    return () => clearInterval(interval);
  }, [open, handleGoogleCredentialResponse]);

  async function handleSignOut() {
    setAuthBusy(true);
    try {
      await logoutAccount();
      saveCachedUser(null);
      saveSessionToken("");
      const freshCfg = loadStorageConfig();
      setConfig(freshCfg);
      setAuthStatus(null);
      setHealth(null);
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
        `Synced ${result.addedMemories} memories and ${result.updatedBooks} volume updates to your archive.`,
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

  if (!open || !mounted || typeof document === "undefined") return null;

  const currentUser = authStatus?.user ?? health?.user ?? getCachedUser() ?? null;

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
            Your private memories are tied directly to your authenticated Google account with zero-knowledge encryption.
          </p>
        </div>

        {/* Account Status Card */}
        <div className="border border-[var(--hairline)] bg-[var(--paper)] p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{
                    backgroundColor: currentUser || isUserAuthenticated() ? "#4e7c53" : "#b87a3d",
                  }}
                />
                <span className="text-xs font-semibold tracking-wider uppercase">
                  {currentUser
                    ? `${currentUser.displayName || currentUser.email} (@${currentUser.username || "google"})`
                    : isUserAuthenticated()
                      ? "Diary Owner (Authenticated)"
                      : health
                        ? "Archive Connected · Sign In Required"
                        : "Archive Offline (Local Drafts)"}
                </span>
              </div>
              <p className="mt-1 text-xs text-[var(--ink-soft)]">
                {currentUser
                  ? "Signed in with Google. All your books and entries are safely synchronized."
                  : isUserAuthenticated()
                    ? "Signed in with Google. You can edit memories, books, and layouts seamlessly."
                    : "Sign in with Google to sync and read your private memory archive."}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void refreshConnectionAndAccount(config)}
                disabled={testing}
                className="inline-flex items-center gap-1.5 border border-[var(--hairline)] bg-[var(--paper-light)] px-3 py-1.5 text-[11px] font-semibold tracking-wider uppercase cursor-pointer hover:border-[var(--ink)]"
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
                  className="inline-flex items-center gap-1.5 border border-[var(--hairline)] bg-[var(--paper-light)] px-3 py-1.5 text-[11px] font-semibold tracking-wider text-[var(--accent)] uppercase cursor-pointer hover:border-[var(--accent)]"
                >
                  <LogOut className="h-3 w-3" />
                  <span>Sign Out</span>
                </button>
              ) : null}
            </div>
          </div>

          {offlineCount > 0 && health ? (
            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[var(--hairline)] pt-3">
              <button
                type="button"
                onClick={() => void handleSyncOffline()}
                disabled={syncing}
                className="inline-flex items-center gap-2 border border-[var(--ink)] bg-[var(--paper-light)] px-3.5 py-1.5 text-[11px] font-semibold tracking-wider uppercase cursor-pointer hover:bg-[var(--paper-deep)]"
              >
                <UploadCloud className="h-3.5 w-3.5" />
                <span>
                  {syncing ? "Syncing..." : `Sync ${offlineCount} Offline Draft(s)`}
                </span>
              </button>
              {syncResult ? (
                <span className="text-xs font-medium text-[#466f4b]">{syncResult}</span>
              ) : null}
            </div>
          ) : null}
        </div>

        {error ? (
          <p className="mt-3 text-xs font-medium text-[var(--accent)]" role="alert">
            {error}
          </p>
        ) : null}

        {/* Not Signed In: Clean 1-Tap Google Button */}
        {!currentUser && (
          <div className="mt-6 border border-[var(--hairline)] bg-[var(--paper-light)] p-5 text-center">
            <h3 className="m-0 font-serif text-lg">Sign In to Your Diary</h3>
            <p className="mx-auto mt-1 max-w-sm text-xs text-[var(--ink-soft)] leading-relaxed">
              Use your Google account to unlock your private memory volumes instantly with 2-step verification.
            </p>
            <div className="mt-4 flex justify-center">
              <div id="google-signin-mount" className="min-h-[44px] flex justify-center w-full" />
              {!gsiLoaded && (
                <button
                  type="button"
                  onClick={() => {
                    const google = (window as unknown as {
                      google?: { accounts?: { id?: { prompt: () => void } } };
                    })?.google;
                    if (google?.accounts?.id) {
                      google.accounts.id.prompt();
                    } else {
                      onClose();
                      window.dispatchEvent(
                        new CustomEvent(AUTH_REQUIRED_EVENT, {
                          detail: { message: "Sign in with Google to access your private diary." },
                        }),
                      );
                    }
                  }}
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
                  <span>Continue with Google</span>
                </button>
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
