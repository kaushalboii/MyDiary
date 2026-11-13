"use client";

import { useEffect } from "react";
import { pingStorageKeepAlive } from "@/lib/storage-client";

// Ping every 4 minutes (well within free-tier 15-minute sleep thresholds)
const PING_INTERVAL_MS = 4 * 60 * 1000;

export function KeepAliveBeacon() {
  useEffect(() => {
    let lastPingAt = 0;

    function ping() {
      const now = Date.now();
      // Throttle to avoid duplicate rapid pings
      if (now - lastPingAt < 60 * 1000) return;
      lastPingAt = now;
      void pingStorageKeepAlive().catch(() => {
        // Keep-alive is best-effort and intentionally silent
      });
    }

    // Ping soon after initial load (2 seconds)
    const initialTimer = window.setTimeout(ping, 2_000);

    // Regular interval (every 4 minutes while browser tab is open)
    const timer = window.setInterval(ping, PING_INTERVAL_MS);

    function onVisibilityChange() {
      if (
        document.visibilityState === "visible" &&
        Date.now() - lastPingAt >= 3 * 60 * 1000
      ) {
        ping();
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  return null;
}
