"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Menu, ShieldCheck, X } from "lucide-react";
import { StorageSettingsModal } from "./StorageSettingsModal";

export function ExpandableDock({
  ariaLabel = "Diary navigation menu",
  label = "Menu",
  children,
  showSecurity = true,
  onStorageConnected,
  securityOpen: controlledSecurityOpen,
  onSecurityOpenChange,
}: {
  ariaLabel?: string;
  label?: string;
  children: ReactNode;
  showSecurity?: boolean;
  onStorageConnected?: () => void;
  securityOpen?: boolean;
  onSecurityOpenChange?: (next: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [internalSecurityOpen, setInternalSecurityOpen] = useState(false);
  const dockRef = useRef<HTMLDivElement>(null);

  const securityModalOpen =
    controlledSecurityOpen !== undefined ? controlledSecurityOpen : internalSecurityOpen;

  const setSecurityModalOpen = useCallback(
    (next: boolean) => {
      if (onSecurityOpenChange) {
        onSecurityOpenChange(next);
      } else {
        setInternalSecurityOpen(next);
      }
    },
    [onSecurityOpenChange],
  );

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (dockRef.current && !dockRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function handleTrayClick(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest("select, input, textarea, label")) return;
    if (target.closest("a, button")) {
      setOpen(false);
    }
  }

  return (
    <>
      <div
        ref={dockRef}
        className={`top-dock-shell ${open ? "top-dock-shell--open" : ""}`}
      >
        <nav className={`top-dock ${open ? "top-dock--open" : ""}`} aria-label={ariaLabel}>
          <button
            type="button"
            className={`top-dock__toggle ${open ? "top-dock__toggle--open" : ""}`}
            data-testid="dock-toggle"
            aria-expanded={open}
            aria-haspopup="menu"
            aria-label={open ? `Close ${label.toLowerCase()}` : `Open ${label.toLowerCase()}`}
            onClick={() => setOpen((prev) => !prev)}
          >
            {open ? (
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <Menu className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span>{open ? "Close" : label}</span>
          </button>

          {open ? (
            <div
              className="top-dock__tray"
              data-testid="dock-tray"
              onClick={handleTrayClick}
            >
              <span className="top-dock__divider top-dock__divider--desktop" aria-hidden="true" />
              {children}

              {showSecurity ? (
                <>
                  <span className="top-dock__divider" aria-hidden="true" />
                  <button
                    type="button"
                    className="top-dock__btn"
                    data-testid="dock-account"
                    onClick={() => setSecurityModalOpen(true)}
                    aria-label="Account and Storage"
                    title="Account & Storage"
                  >
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Account</span>
                  </button>
                </>
              ) : null}
            </div>
          ) : null}
        </nav>
      </div>

      {showSecurity ? (
        <StorageSettingsModal
          open={securityModalOpen}
          onClose={() => setSecurityModalOpen(false)}
          onConnected={onStorageConnected}
        />
      ) : null}
    </>
  );
}

