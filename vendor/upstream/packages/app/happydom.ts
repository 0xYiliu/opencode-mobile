import { GlobalRegistrator } from "@happy-dom/global-registrator"

// Happy DOM replaces the platform fetch with its own, which supports neither `blob:` nor `data:` URLs.
// The draft media cache hands out object and data URLs and the draft pin reads their bytes back
// through the platform fetch, so keep a registry of object URLs and decode data bodies here, letting
// the production paths run unmocked under the test DOM.
GlobalRegistrator.register()

const objectURLs = new Map<string, Blob>()
const originalCreateObjectURL = URL.createObjectURL.bind(URL)
const originalRevokeObjectURL = URL.revokeObjectURL.bind(URL)

URL.createObjectURL = (object: Blob) => {
  const url = originalCreateObjectURL(object)
  objectURLs.set(url, object)
  return url
}

URL.revokeObjectURL = (url: string) => {
  objectURLs.delete(url)
  return originalRevokeObjectURL(url)
}

const happyFetch = globalThis.fetch.bind(globalThis)

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url

  if (url.startsWith("blob:")) {
    const blob = objectURLs.get(url)
    if (!blob) return new Response(null, { status: 404 })
    return new Response(blob, { headers: { "content-type": blob.type || "application/octet-stream" } })
  }

  // Node's fetch reads data: URLs; Happy DOM's does not, and cross-realm Blobs fail its FileReader,
  // so decode the body here into this realm's Blob.
  if (url.startsWith("data:")) {
    const comma = url.indexOf(",")
    const [mime, encoding] = url.slice(5, comma).split(";")
    const body = url.slice(comma + 1)
    const bytes = encoding === "base64" ? Buffer.from(body, "base64") : Buffer.from(decodeURIComponent(body), "utf8")

    return new Response(new Blob([bytes], { type: mime || "application/octet-stream" }), {
      headers: { "content-type": mime || "application/octet-stream" },
    })
  }

  return happyFetch(input as RequestInfo | URL, init)
}) as typeof globalThis.fetch

const originalGetContext = HTMLCanvasElement.prototype.getContext


// The drawer drag/snap logic reads Web Animations off the drawer content; happy-dom has no
// `getAnimations`, so report an empty set the same way a browser with no running animations does.
if (typeof Element.prototype.getAnimations !== "function") {
  Element.prototype.getAnimations = () => [] as Animation[]
}

// happy-dom's ResizeObserver fires its callback synchronously on observe(), which runs editor
// overflow measurements before their element refs exist. A browser fires the first callback after
// layout, so defer the callback the same way.
class DeferredResizeObserver implements ResizeObserver {
  constructor(private callback: ResizeObserverCallback) {}
  observe(target: Element) {
    setTimeout(() => this.callback([], this), 0)
  }
  unobserve() {}
  disconnect() {}
}
if (typeof globalThis.ResizeObserver === "undefined" || true) {
  globalThis.ResizeObserver = DeferredResizeObserver as unknown as typeof ResizeObserver
}

// @ts-expect-error - we're overriding with a simplified mock
HTMLCanvasElement.prototype.getContext = function (contextType: string, _options?: unknown) {
  if (contextType === "2d") {
    return {
      canvas: this,
      fillStyle: "#000000",
      strokeStyle: "#000000",
      font: "12px monospace",
      textAlign: "start",
      textBaseline: "alphabetic",
      globalAlpha: 1,
      globalCompositeOperation: "source-over",
      imageSmoothingEnabled: true,
      lineWidth: 1,
      lineCap: "butt",
      lineJoin: "miter",
      miterLimit: 10,
      shadowBlur: 0,
      shadowColor: "rgba(0, 0, 0, 0)",
      shadowOffsetX: 0,
      shadowOffsetY: 0,
      fillRect: () => {},
      strokeRect: () => {},
      clearRect: () => {},
      fillText: () => {},
      strokeText: () => {},
      measureText: (text: string) => ({ width: text.length * 8 }),
      drawImage: () => {},
      save: () => {},
      restore: () => {},
      scale: () => {},
      rotate: () => {},
      translate: () => {},
      transform: () => {},
      setTransform: () => {},
      resetTransform: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
      createRadialGradient: () => ({ addColorStop: () => {} }),
      createPattern: () => null,
      beginPath: () => {},
      closePath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      bezierCurveTo: () => {},
      quadraticCurveTo: () => {},
      arc: () => {},
      arcTo: () => {},
      ellipse: () => {},
      rect: () => {},
      fill: () => {},
      stroke: () => {},
      clip: () => {},
      isPointInPath: () => false,
      isPointInStroke: () => false,
      getTransform: () => ({}),
      getImageData: () => ({
        data: new Uint8ClampedArray(0),
        width: 0,
        height: 0,
      }),
      putImageData: () => {},
      createImageData: () => ({
        data: new Uint8ClampedArray(0),
        width: 0,
        height: 0,
      }),
    } as unknown as CanvasRenderingContext2D
  }

  return originalGetContext.call(this, contextType as "2d", _options)
}
