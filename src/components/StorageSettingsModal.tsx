"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  LogOut,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Ticket,
  Trash2,
  Unlock,
  UploadCloud,
  UserCheck,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import {
  bootstrapOwnerAccount,
  checkStorageHealth,
  createMemberInvite,
  fetchAdminMembers,
  getAuthStatus,
  getOfflineDraftCount,
  loadStorageConfig,
  loginAccount,
  logoutAccount,
  registerAccount,
  removeMemberAccount,
  revokeMemberInvite,
  saveSessionToken,
  saveStorageConfig,
  setMemberStatus,
  syncOfflineToServer,
} from "@/lib/storage-client";
import type {
  AuthStatusResponse,
  CreatedInvite,
  InviteSummary,
  MemberSummary,
  StorageConfig,
  StorageHealth,
} from "@/lib/types";
import {
  disableVaultLock,
  enableVaultLock,
  getVaultStatus,
  lockVaultNow,
  unlockVaultWithPassphrase,
  wipeLocalDiaryData,
} from "@/lib/vault-security";

function isLoopbackServerUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    const host = parsed.hostname.toLowerCase();
    return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]";
  } catch {
    return false;
  }
}

type ModalTab = "vault" | "account";

export function StorageSettingsModal({
  open,
  onClose,
  onConnected,
  initialTab = "account",
}: {
  open: boolean;
  onClose: () => void;
  onConnected?: () => void;
  initialTab?: ModalTab;
}) {
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<ModalTab>(initialTab);
  const [config, setConfig] = useState<StorageConfig>(() => loadStorageConfig());
  const [health, setHealth] = useState<StorageHealth | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatusResponse | null>(null);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync offline drafts
  const [offlineCount, setOfflineCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);

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

  // Account & Members state
  const [authBusy, setAuthBusy] = useState(false);
  const [authFormMode, setAuthFormMode] = useState<"signin" | "register">("signin");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCodeInput, setInviteCodeInput] = useState("");
  const [setupTokenInput, setSetupTokenInput] = useState("");
  const [accountNotice, setAccountNotice] = useState<string | null>(null);
  const [accountError, setAccountError] = useState<string | null>(null);

  // Owner management state
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [invites, setInvites] = useState<InviteSummary[]>([]);
  const [inviteLabel, setInviteLabel] = useState("");
  const [freshInvite, setFreshInvite] = useState<CreatedInvite | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [adminLoading, setAdminLoading] = useState(false);

  // Masked endpoint override (never displays default/configured endpoint URL)
  const [overrideUrl, setOverrideUrl] = useState("");
  const [overrideLabel, setOverrideLabel] = useState("");
  const [overrideToken, setOverrideToken] = useState("");
  const [revealUrl, setRevealUrl] = useState(false);
  const [resealPassphrase, setResealPassphrase] = useState("");

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

  async function refreshConnectionAndAccount(target: StorageConfig) {
    setTesting(true);
    setError(null);
    try {
      const [h, a] = await Promise.all([
        checkStorageHealth(target).catch(() => null),
        getAuthStatus(target),
      ]);
      setHealth(h);
      setAuthStatus(a);

      if (a?.authenticated && a.user?.role === "owner") {
        setAdminLoading(true);
        try {
          const adminRes = await fetchAdminMembers(target);
          setMembers(adminRes.members);
          setInvites(adminRes.invites);
        } catch {
          setMembers([]);
          setInvites([]);
        } finally {
          setAdminLoading(false);
        }
      } else {
        setMembers([]);
        setInvites([]);
      }
    } finally {
      setTesting(false);
    }
  }

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
    setAccountError(null);
    setAccountNotice(null);
    setFreshInvite(null);
    setOverrideUrl("");
    setOverrideLabel(loaded.label || "Private Archive");
    setOverrideToken("");
    setConfirmWipe(false);
    setSyncResult(null);
    void refreshConnectionAndAccount(loaded);
    void getOfflineDraftCount().then(setOfflineCount);
  }, [open, initialTab]);

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
          "Owner Vault Lock enabled. Credentials are now AES-256-GCM sealed on this browser.",
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

  async function handleOwnerBootstrap(e: React.FormEvent) {
    e.preventDefault();
    setAuthBusy(true);
    setAccountError(null);
    setAccountNotice(null);
    try {
      await bootstrapOwnerAccount({
        username: username.trim(),
        displayName: displayName.trim() || username.trim(),
        password,
        setupToken: setupTokenInput.trim() || undefined,
      });
      setPassword("");
      setSetupTokenInput("");
      setAccountNotice("Owner account created. Your archive data is now isolated under your account.");
      const updated = loadStorageConfig();
      setConfig(updated);
      await refreshConnectionAndAccount(updated);
      onConnected?.();
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : "Owner setup failed.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignInOrRegister(e: React.FormEvent) {
    e.preventDefault();
    setAuthBusy(true);
    setAccountError(null);
    setAccountNotice(null);
    try {
      if (authFormMode === "signin") {
        await loginAccount({ username: username.trim(), password });
        setPassword("");
        setAccountNotice("Signed in to your private diary.");
      } else {
        const res = await registerAccount({
          username: username.trim(),
          displayName: displayName.trim() || username.trim(),
          password,
          inviteCode: inviteCodeInput.trim() || undefined,
        });
        setPassword("");
        setInviteCodeInput("");
        if (res.pendingVerification) {
          setAccountNotice(
            res.message || "Access request submitted. Waiting for archive owner verification.",
          );
          return;
        }
        setAccountNotice("Account verified and activated.");
      }
      const updated = loadStorageConfig();
      setConfig(updated);
      await refreshConnectionAndAccount(updated);
      onConnected?.();
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignOut() {
    setAuthBusy(true);
    try {
      onClose();
      await logoutAccount();
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleGenerateInvite(e: React.FormEvent) {
    e.preventDefault();
    setAccountError(null);
    setAdminLoading(true);
    try {
      const created = await createMemberInvite({
        label: inviteLabel.trim() || "Member Invite",
        expiresDays: 7,
      });
      setFreshInvite(created);
      setInviteLabel("");
      const adminRes = await fetchAdminMembers();
      setMembers(adminRes.members);
      setInvites(adminRes.invites);
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : "Could not generate invite.");
    } finally {
      setAdminLoading(false);
    }
  }

  async function handleRevokeInvite(inviteId: string) {
    setAdminLoading(true);
    try {
      await revokeMemberInvite(inviteId);
      const adminRes = await fetchAdminMembers();
      setMembers(adminRes.members);
      setInvites(adminRes.invites);
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : "Could not revoke invite.");
    } finally {
      setAdminLoading(false);
    }
  }

  async function handleToggleMemberStatus(member: MemberSummary, nextStatus: "active" | "suspended") {
    setAdminLoading(true);
    setAccountError(null);
    try {
      await setMemberStatus(member.id, nextStatus);
      const adminRes = await fetchAdminMembers();
      setMembers(adminRes.members);
      setInvites(adminRes.invites);
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : "Could not update member status.");
    } finally {
      setAdminLoading(false);
    }
  }

  async function handleRemoveMember(member: MemberSummary) {
    setAdminLoading(true);
    setAccountError(null);
    try {
      await removeMemberAccount(member.id);
      const adminRes = await fetchAdminMembers();
      setMembers(adminRes.members);
      setInvites(adminRes.invites);
    } catch (err) {
      setAccountError(err instanceof Error ? err.message : "Could not remove member.");
    } finally {
      setAdminLoading(false);
    }
  }

  async function handleSaveEndpointOverride(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const nextConfig: StorageConfig = {
      serverUrl: overrideUrl.trim() || config.serverUrl,
      token: overrideToken.trim() || config.token,
      label: overrideLabel.trim() || "Private Archive",
    };

    if (vaultEnabled) {
      if (!resealPassphrase.trim()) {
        setError("Enter your Owner Vault passphrase to update sealed connection settings.");
        return;
      }
      try {
        await unlockVaultWithPassphrase(resealPassphrase);
        await enableVaultLock(resealPassphrase, nextConfig, autoLockMinutes);
        setResealPassphrase("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Incorrect vault passphrase.");
        return;
      }
    } else if (nextConfig.token) {
      saveSessionToken(nextConfig.token);
    }

    saveStorageConfig({
      serverUrl: nextConfig.serverUrl,
      token: "",
      label: nextConfig.label,
    });
    setConfig(nextConfig);
    setOverrideUrl("");
    setOverrideToken("");
    await refreshConnectionAndAccount(nextConfig);
    onConnected?.();
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

  async function copyInviteCode(code: string) {
    await navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 1800);
  }

  if (!open || !mounted || typeof document === "undefined") return null;

  const tokenConfigured = Boolean(config.token.trim());
  const serverProtected = Boolean(health?.authRequired);
  const loopbackServer = isLoopbackServerUrl(config.serverUrl);
  const currentUser = authStatus?.user ?? health?.user ?? null;
  const isOwner = currentUser?.role === "owner";

  const modalContent = (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-6 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Account, verification and vault security settings"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="stationery-card relative my-auto max-h-[calc(100dvh-2rem)] sm:max-h-[calc(100dvh-3rem)] w-full max-w-2xl overflow-y-auto p-6 sm:p-8"
        data-testid="security-storage-modal"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close security and account settings"
          className="absolute top-5 right-5 grid h-9 w-9 place-items-center rounded-full border border-[var(--hairline)] bg-[var(--paper)] hover:bg-[var(--paper-deep)] cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-5">
          <p className="eyebrow">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Privacy, Accounts &amp; Encryption</span>
          </p>
          <h2
            className="m-0 text-3xl font-normal tracking-tight"
            style={{ fontFamily: "var(--serif)" }}
          >
            Security &amp; Member Access
          </h2>
          <p className="mt-2 text-sm text-[var(--ink-soft)]">
            Protect this browser with an AES-256-GCM passphrase lock and manage isolated accounts,
            invite verification codes, and member approvals.
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
            onClick={() => setTab("account")}
            data-testid="tab-account-members"
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold tracking-wider uppercase cursor-pointer transition-colors ${
              tab === "account"
                ? "bg-[var(--ink)] text-[var(--paper-light)]"
                : "text-[var(--ink-soft)] hover:text-[var(--ink)]"
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            <span>Account &amp; Members</span>
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
                  {health && serverProtected && health.tokenAuthorized ? (
                    <ShieldCheck className="h-3.5 w-3.5 text-[#4e7c53]" />
                  ) : health && !serverProtected && !loopbackServer ? (
                    <ShieldAlert className="h-3.5 w-3.5 text-[#b87a3d]" />
                  ) : (
                    <KeyRound className="h-3.5 w-3.5 text-[var(--ink-soft)]" />
                  )}
                  <span>
                    Archive Auth:{" "}
                    <strong>
                      {health
                        ? serverProtected
                          ? health.tokenAuthorized
                            ? currentUser
                              ? `@${currentUser.username}`
                              : "Verified"
                            : "Sign In Required"
                          : loopbackServer
                            ? "Local Open"
                            : "Unprotected"
                        : testing
                          ? "Checking"
                          : "Offline"}
                    </strong>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <KeyRound className="h-3.5 w-3.5 text-[var(--ink-soft)]" />
                  <span>
                    Session Active: <strong>{tokenConfigured ? "Yes" : "None"}</strong>
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
                  <span>Removes only local browser tokens and drafts; your remote archive stays intact.</span>
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
          <div className="space-y-6">
            {/* Connection & Account Status Card */}
            <div className="border border-[var(--hairline)] bg-[var(--paper)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
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
                      {currentUser
                        ? `${currentUser.displayName} (@${currentUser.username}) · ${currentUser.role}`
                        : health
                          ? "Archive Protected · Sign In Required"
                          : "Archive Unreachable (Offline Drafts)"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--ink-soft)]">
                    {currentUser
                      ? "Your volumes, entries, and uploaded media are strictly isolated under your account."
                      : "Sign in or create an account to view and save your private diary volumes."}
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

                  {currentUser ? (
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

              {offlineCount > 0 && health && (!health.authRequired || health.tokenAuthorized) ? (
                <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-[var(--hairline)] pt-3">
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

            {accountError ? (
              <p className="text-xs font-medium text-[var(--accent)]" role="alert">
                {accountError}
              </p>
            ) : null}
            {accountNotice ? (
              <p className="text-xs font-medium text-[#466f4b]">{accountNotice}</p>
            ) : null}

            {/* Owner Account Creation / Sign In when not signed in cleanly */}
            {!currentUser && health ? (
              authStatus?.needsOwnerSetup ? (
                <form onSubmit={handleOwnerBootstrap} className="space-y-4 border border-[var(--hairline)] bg-[var(--paper-light)] p-4">
                  <h3 className="m-0 font-serif text-lg">Claim Owner Account</h3>
                  <p className="m-0 text-xs text-[var(--ink-soft)]">
                    Set up your owner login to enable strict per-user diary isolation and member verification.
                  </p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Owner username (min 3 chars)"
                      required
                      className="w-full border border-[var(--hairline)] bg-[var(--paper)] px-3 py-2 text-sm"
                    />
                    <input
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Display name"
                      className="w-full border border-[var(--hairline)] bg-[var(--paper)] px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password (min 8 chars)"
                      required
                      className="w-full border border-[var(--hairline)] bg-[var(--paper)] px-3 py-2 text-sm"
                    />
                    {authStatus.needsSetupToken ? (
                      <input
                        type="password"
                        value={setupTokenInput}
                        onChange={(e) => setSetupTokenInput(e.target.value)}
                        placeholder="Server setup key"
                        required
                        className="w-full border border-[var(--hairline)] bg-[var(--paper)] px-3 py-2 text-sm"
                      />
                    ) : null}
                  </div>
                  <button
                    type="submit"
                    disabled={authBusy}
                    className="inline-flex items-center gap-2 bg-[var(--ink)] px-4 py-2 text-xs font-semibold tracking-wider text-[var(--paper-light)] uppercase cursor-pointer"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" />
                    <span>{authBusy ? "Creating..." : "Activate Owner Security"}</span>
                  </button>
                </form>
              ) : (
                <form onSubmit={handleSignInOrRegister} className="space-y-4 border border-[var(--hairline)] bg-[var(--paper-light)] p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="m-0 font-serif text-lg">
                      {authFormMode === "signin" ? "Sign In to Account" : "Create Account"}
                    </h3>
                    <button
                      type="button"
                      onClick={() =>
                        setAuthFormMode((m) => (m === "signin" ? "register" : "signin"))
                      }
                      className="text-xs font-semibold uppercase tracking-wider text-[var(--accent)] cursor-pointer"
                    >
                      {authFormMode === "signin" ? "Need an account? Create one" : "Already have an account? Sign In"}
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Username"
                      required
                      className="w-full border border-[var(--hairline)] bg-[var(--paper)] px-3 py-2 text-sm"
                    />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Password"
                      required
                      className="w-full border border-[var(--hairline)] bg-[var(--paper)] px-3 py-2 text-sm"
                    />
                  </div>
                  {authFormMode === "register" ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="Display name (optional)"
                        className="w-full border border-[var(--hairline)] bg-[var(--paper)] px-3 py-2 text-sm"
                      />
                    </div>
                  ) : null}
                  <button
                    type="submit"
                    disabled={authBusy}
                    className="inline-flex items-center gap-2 bg-[var(--ink)] px-4 py-2 text-xs font-semibold tracking-wider text-[var(--paper-light)] uppercase cursor-pointer"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    <span>{authBusy ? "Submitting..." : authFormMode === "signin" ? "Sign In" : "Create Account"}</span>
                  </button>
                </form>
              )
            ) : null}

            {/* Owner-Only Invite Generation & Member Verification Console */}
            {isOwner ? (
              <div className="space-y-5">
                <div className="border border-[var(--hairline)] bg-[var(--paper-light)] p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Ticket className="h-4 w-4 text-[var(--accent)]" />
                    <h3 className="m-0 font-serif text-lg">One-Time Invite Codes</h3>
                  </div>
                  <p className="mb-3 text-xs text-[var(--ink-soft)]">
                    Share a single-use verification code so a trusted member gets their own completely
                    isolated diary space.
                  </p>

                  <form onSubmit={handleGenerateInvite} className="flex flex-wrap gap-2">
                    <input
                      type="text"
                      value={inviteLabel}
                      onChange={(e) => setInviteLabel(e.target.value)}
                      placeholder="Label (e.g. Sister's Diary)"
                      className="min-w-[180px] flex-1 border border-[var(--hairline)] bg-[var(--paper)] px-3 py-2 text-sm"
                    />
                    <button
                      type="submit"
                      disabled={adminLoading}
                      data-testid="generate-invite-btn"
                      className="inline-flex items-center gap-1.5 bg-[var(--ink)] px-4 py-2 text-xs font-semibold tracking-wider text-[var(--paper-light)] uppercase cursor-pointer"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      <span>Generate Code</span>
                    </button>
                  </form>

                  {freshInvite ? (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border border-[#4e7c53]/40 bg-[#4e7c53]/10 p-3 text-xs">
                      <div>
                        <span className="block text-[10px] font-semibold uppercase tracking-wider text-[#3b6440]">
                          New One-Time Verification Code ({freshInvite.label})
                        </span>
                        <code className="mt-0.5 block font-mono text-sm font-bold tracking-wider text-[var(--ink)]">
                          {freshInvite.code}
                        </code>
                      </div>
                      <button
                        type="button"
                        onClick={() => void copyInviteCode(freshInvite.code)}
                        className="inline-flex items-center gap-1 border border-[var(--hairline)] bg-[var(--paper-light)] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider cursor-pointer"
                      >
                        {copiedCode ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        <span>{copiedCode ? "Copied" : "Copy Code"}</span>
                      </button>
                    </div>
                  ) : null}

                  {invites.length > 0 ? (
                    <div className="mt-3 space-y-1.5">
                      {invites.map((inv) => (
                        <div
                          key={inv.id}
                          className="flex items-center justify-between border border-[var(--hairline)] bg-[var(--paper)] px-3 py-2 text-xs"
                        >
                          <span>
                            <strong>{inv.label}</strong> · expires{" "}
                            {new Date(inv.expiresAt).toLocaleDateString()}
                          </span>
                          <button
                            type="button"
                            onClick={() => void handleRevokeInvite(inv.id)}
                            className="text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)] cursor-pointer"
                          >
                            Revoke
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="border border-[var(--hairline)] bg-[var(--paper-light)] p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Users className="h-4 w-4 text-[var(--accent)]" />
                    <h3 className="m-0 font-serif text-lg">Members &amp; Verification Queue</h3>
                  </div>

                  {members.length === 0 ? (
                    <p className="m-0 text-xs text-[var(--ink-soft)]">No members registered yet.</p>
                  ) : (
                    <div className="space-y-2">
                      {members.map((m) => (
                        <div
                          key={m.id}
                          className="flex flex-wrap items-center justify-between gap-2 border border-[var(--hairline)] bg-[var(--paper)] px-3.5 py-2.5 text-xs"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <strong>{m.displayName}</strong>
                              <span className="text-[var(--ink-soft)]">@{m.username}</span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                                  m.status === "active"
                                    ? "bg-[#4e7c53]/15 text-[#3b6440]"
                                    : m.status === "pending"
                                      ? "bg-[#b87a3d]/15 text-[#8a5721]"
                                      : "bg-[#9e3d3a]/15 text-[#9e3d3a]"
                                }`}
                              >
                                {m.role === "owner" ? "Owner" : m.status}
                              </span>
                            </div>
                            <div className="mt-0.5 text-[11px] text-[var(--ink-soft)]">
                              {m.booksCount} isolated volumes · {m.memoriesCount} entries
                            </div>
                          </div>

                          {m.role !== "owner" ? (
                            <div className="flex items-center gap-2">
                              {m.status !== "active" ? (
                                <button
                                  type="button"
                                  disabled={adminLoading}
                                  onClick={() => void handleToggleMemberStatus(m, "active")}
                                  data-testid="approve-member-btn"
                                  className="inline-flex items-center gap-1 bg-[#4e7c53] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white cursor-pointer"
                                >
                                  <UserCheck className="h-3 w-3" />
                                  <span>{m.status === "pending" ? "Verify & Approve" : "Activate"}</span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={adminLoading}
                                  onClick={() => void handleToggleMemberStatus(m, "suspended")}
                                  className="border border-[var(--hairline)] bg-[var(--paper-light)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider cursor-pointer"
                                >
                                  Suspend
                                </button>
                              )}
                              <button
                                type="button"
                                disabled={adminLoading}
                                onClick={() => void handleRemoveMember(m)}
                                className="inline-flex items-center gap-1 border border-[var(--hairline)] px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--accent)] cursor-pointer"
                                title="Delete member and their isolated diary"
                              >
                                <CheckCircle2 className="hidden" />
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {/* Hidden / Masked Custom Endpoint Override (never reveals default host URL) */}
            <details className="border-t border-[var(--hairline)] pt-4">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wider text-[var(--ink-soft)] hover:text-[var(--ink)]">
                Archive Endpoint Override (Optional)
              </summary>
              <form onSubmit={handleSaveEndpointOverride} className="mt-3 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                      Archive Name
                    </label>
                    <input
                      type="text"
                      value={overrideLabel}
                      onChange={(e) => setOverrideLabel(e.target.value)}
                      placeholder="Private Archive"
                      className="w-full border border-[var(--hairline)] bg-[var(--paper)] px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                      Custom Endpoint (masked)
                    </label>
                    <div className="vault-input-wrap">
                      <input
                        type={revealUrl ? "text" : "password"}
                        value={overrideUrl}
                        onChange={(e) => setOverrideUrl(e.target.value)}
                        placeholder="Leave blank to keep current host"
                        className="w-full border border-[var(--hairline)] bg-[var(--paper)] px-3 py-2 text-sm"
                      />
                      <button
                        type="button"
                        className="vault-reveal-btn"
                        onClick={() => setRevealUrl((v) => !v)}
                        aria-label={revealUrl ? "Hide URL" : "Show URL"}
                      >
                        {revealUrl ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                    Setup Key (Optional)
                  </label>
                  <input
                    type="password"
                    value={overrideToken}
                    onChange={(e) => setOverrideToken(e.target.value)}
                    placeholder="Leave blank to keep active session"
                    className="w-full border border-[var(--hairline)] bg-[var(--paper)] px-3 py-2 text-sm"
                  />
                </div>

                {vaultEnabled ? (
                  <div>
                    <label className="mb-1 block text-[10px] font-semibold tracking-wider uppercase text-[var(--ink-soft)]">
                      Vault Passphrase (required to re-seal override)
                    </label>
                    <input
                      type="password"
                      value={resealPassphrase}
                      onChange={(e) => setResealPassphrase(e.target.value)}
                      placeholder="Enter current vault passphrase"
                      className="w-full border border-[var(--hairline)] bg-[var(--paper)] px-3 py-2 text-sm"
                    />
                  </div>
                ) : null}

                {error ? (
                  <p className="text-xs font-medium text-[var(--accent)]" role="alert">
                    {error}
                  </p>
                ) : null}

                <button
                  type="submit"
                  className="inline-flex items-center gap-2 bg-[var(--ink)] px-4 py-2 text-xs font-semibold tracking-wider text-[var(--paper-light)] uppercase cursor-pointer"
                >
                  <span>Apply Override &amp; Test</span>
                </button>
              </form>
            </details>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
