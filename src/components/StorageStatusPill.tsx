"use client";

import { useState } from "react";
import { HardDrive } from "lucide-react";
import type { StorageMode } from "@/lib/types";
import { StorageSettingsModal } from "./StorageSettingsModal";

export function StorageStatusPill({
  mode,
  onConfigUpdated,
}: {
  mode: StorageMode;
  hostname?: string;
  onConfigUpdated?: () => void;
}) {
  const [open, setOpen] = useState(false);

  const label = mode === "server" ? "Private Archive" : "Offline Archive";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="header-pill-btn"
        title="Manage account, members & archive security"
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
