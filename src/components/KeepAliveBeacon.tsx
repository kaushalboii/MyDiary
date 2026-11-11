"use client";

import { useEffect } from "react";
import { checkStorageHealth } from "@/lib/storage-client";

const PING_INTERVAL_MS = 18 * 60 * 1000;

export function KeepAliveBeacon() {
  useEffect(() => {
    let lastPingAt = 0;

    function ping() {
      const now = Date.now();
      if (now - lastPingAt < 60 * 1000) return;
      lastPingAt = now;
      void checkStorageHealth().catch(() => {
        // Keep-alive is best-effort and intentionally silent
      });
    }

    ping();

    const timer = window.setInterval(ping, PING_INTERVAL_MS);

    function onVisibilityChange() {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastPingAt >= 15 * 60 * 1000
      ) {
        ping();
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return null;
}

