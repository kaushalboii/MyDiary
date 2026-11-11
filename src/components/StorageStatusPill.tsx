"use client";

import { useState } from "react";
import { HardDrive } from "lucide-react";
import type { StorageMode } from "@/lib/types";
import { loadStorageConfig } from "@/lib/storage-client";
import { StorageSettingsModal } from "./StorageSettingsModal";

export function StorageStatusPill({
  mode,
  hostname,
  onConfigUpdated,
}: {
  mode: StorageMode;
  hostname?: string;
  onConfigUpdated?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const config = loadStorageConfig();

  const label =
    mode === "server"
      ? hostname || config.label || "Mini Server"
      : "Offline Fallback";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="header-pill-btn"
        title="Configure kaushals-mini-server storage connection"
      >
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{
            backgroundColor: mode === "server" ? "#5b8a60" : "#b36b43",
          }}
        />
        <HardDrive className="h-3 w-3 opacity-75" />
        <span className="max-w-[140px] truncate">{label}</span>
      </button>

      <StorageSettingsModal
        open={open}
        onClose={() => setOpen(false)}
        onConnected={() => {
          onConfigUpdated?.();
        }}
      />
    </>
  );
}
