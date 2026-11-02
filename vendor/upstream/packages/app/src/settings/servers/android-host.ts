/** UI-only identity; native bridges must continue enforcing their own origin and capability gates. */
export function isAndroidMobileHost() {
  if (typeof window === "undefined" || window.location.origin !== "http://127.0.0.1:18090") return false
  const markers = document.head.querySelectorAll('meta[name="opencode-mobile-host"]')
  return markers.length === 1 && markers[0]?.getAttribute("content") === "android-v1"
}
