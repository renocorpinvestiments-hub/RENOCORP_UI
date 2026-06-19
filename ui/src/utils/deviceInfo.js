/**
 * utils/deviceInfo.js — RENOCORP Capacitor / Platform Detection  v2.0
 * ======================================================================
 * Runtime detection of Capacitor, PWA, and platform type.
 * Used for conditional native API usage (share, push, etc.)
 *
 * Usage:
 *   if (isCapacitor()) { ... }
 *   const { platform } = await getDeviceInfo();
 */

/** True when running inside a Capacitor native wrapper (Android/iOS) */
export function isCapacitor() {
  return (
    typeof window !== "undefined" &&
    window.Capacitor != null &&
    window.Capacitor.isNativePlatform?.() === true
  );
}

/** True when running as an installed PWA (standalone display mode) */
export function isPwa() {
  return (
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true)
  );
}

/** "android" | "ios" | "web" */
export function getPlatform() {
  if (typeof window === "undefined") return "web";
  const cap = window.Capacitor;
  if (cap?.getPlatform) return cap.getPlatform(); // "android" | "ios" | "web"
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("android")) return "android";
  if (ua.includes("iphone") || ua.includes("ipad")) return "ios";
  return "web";
}

/**
 * Native share using Capacitor Share plugin if available,
 * falls back to Web Share API, then clipboard copy.
 */
export async function nativeShare({ title, text, url }) {
  if (isCapacitor()) {
    try {
      const { Share } = await import("@capacitor/share");
      await Share.share({ title, text, url });
      return true;
    } catch {
      // Fall through
    }
  }
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return true;
    } catch {
      // Dismissed or not supported
    }
  }
  // Final fallback: copy to clipboard
  try {
    await navigator.clipboard.writeText(url ?? text ?? "");
    return "copied";
  } catch {
    return false;
  }
}

/**
 * Returns Capacitor Device info if available.
 * Returns a minimal fallback object on web.
 */
export async function getDeviceInfo() {
  if (isCapacitor()) {
    try {
      const { Device } = await import("@capacitor/device");
      return await Device.getInfo();
    } catch {
      // Fall through
    }
  }
  return {
    platform: getPlatform(),
    operatingSystem: "web",
    model: navigator.userAgent.slice(0, 80),
    manufacturer: "browser",
    isVirtual: false,
  };
}

export default { isCapacitor, isPwa, getPlatform, nativeShare, getDeviceInfo };
