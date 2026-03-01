// app/lib/haptics/WakeLock.ts

type WakeLockSentinelLike = {
  release: () => Promise<void>;
  onrelease: null | (() => void);
};

export class WakeLockManager {
  private enabled = true;
  private sentinel: WakeLockSentinelLike | null = null;
  private reacquireTimer: number | null = null;
  private visibilityHandler: (() => void) | null = null;

  setEnabled(v: boolean) {
    this.enabled = v;
    if (!v) this.release();
  }

  isSupported() {
    if (typeof window === "undefined") return false;
    const nav = window.navigator as any;
    return !!nav?.wakeLock?.request;
  }

  attach() {
    if (typeof window === "undefined") return;
    if (this.visibilityHandler) return;

    this.visibilityHandler = () => {
      // When app becomes visible again, try to reacquire
      if (document.visibilityState === "visible") {
        this.request();
      } else {
        // release on hide to be safe
        this.release();
      }
    };

    document.addEventListener("visibilitychange", this.visibilityHandler);
  }

  detach() {
    if (typeof window === "undefined") return;

    if (this.visibilityHandler) {
      document.removeEventListener("visibilitychange", this.visibilityHandler);
      this.visibilityHandler = null;
    }

    this.clearReacquire();
    this.release();
  }

  async request() {
    if (!this.enabled) return;
    if (!this.isSupported()) return;
    if (typeof window === "undefined") return;
    if (document.visibilityState !== "visible") return;

    try {
      const nav = window.navigator as any;

      // Already held
      if (this.sentinel) return;

      const s = (await nav.wakeLock.request("screen")) as WakeLockSentinelLike;
      this.sentinel = s;

      // If released by OS/browser, clear and try again later
      this.sentinel.onrelease = () => {
        this.sentinel = null;
        this.scheduleReacquire();
      };
    } catch {
      // If request fails, try again later (non-blocking)
      this.sentinel = null;
      this.scheduleReacquire();
    }
  }

  async release() {
    try {
      if (this.sentinel) {
        const s = this.sentinel;
        this.sentinel = null;
        s.onrelease = null;
        await s.release();
      }
    } catch {
      // ignore
    }
  }

  private scheduleReacquire() {
    if (!this.enabled) return;
    if (typeof window === "undefined") return;
    if (document.visibilityState !== "visible") return;
    if (this.reacquireTimer) return;

    // Try again after a short delay
    this.reacquireTimer = window.setTimeout(() => {
      this.reacquireTimer = null;
      this.request();
    }, 1200);
  }

  private clearReacquire() {
    if (this.reacquireTimer) {
      window.clearTimeout(this.reacquireTimer);
      this.reacquireTimer = null;
    }
  }
}