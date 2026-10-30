import { describe, expect, test } from "bun:test"
import {
  MAX_BRIDGE_BYTES,
  StubFilesPort,
  activeFilesPort,
  base64ToBytes,
  bytesToBase64,
  createFilesClient,
  filesBridgeInjected,
  mimeFromFilename,
  sanitizeFilename,
  setActiveFilesPort,
  type FilesPort,
} from "../src/files/client"
import { FilesError } from "../src/files/errors"
import { FILES_HANDSHAKE, createWebMessageFilesTransport, type FilesBridgeTransport } from "../src/files/transport"

// Files port client + seam (issue #16, plan D2/D3/B2). The per-field stub semantics,
// the six-code taxonomy, the 32 MiB bound, the two-layer name sanitization (JS layer)
// and the data:-only share discipline are locked here. All payloads are synthetic.

const drain = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

type NativeReply = Record<string, unknown>

function createEngine(serve: (op: string, params: Record<string, unknown>) => NativeReply | "silence") {
  let subscriber: ((event: { data: unknown; ports?: unknown }) => void) | undefined
  const requests: { op: string; params: Record<string, unknown> }[] = []

  const transport = createWebMessageFilesTransport({
    subscribe(handler) {
      subscriber = handler
      return () => {
        subscriber = undefined
      }
    },
  })

  const nativePort = {
    postMessage(raw: string) {
      void (async () => {
        let parsed: unknown
        try {
          parsed = JSON.parse(raw)
        } catch {
          return
        }
        if (typeof parsed !== "object" || parsed === null) return
        const record = parsed as Record<string, unknown>
        if (record["op"] === "ack") return
        if (typeof record["id"] !== "string" || typeof record["op"] !== "string") return
        const params = (typeof record["params"] === "object" && record["params"] !== null ? record["params"] : {}) as Record<string, unknown>
        requests.push({ op: record["op"], params })
        const reply = serve(record["op"], params)
        if (reply === "silence") return
        nativePort.onmessage?.({ data: JSON.stringify({ id: record["id"], ...reply }) })
      })()
    },
    onmessage: null as ((event: { data: unknown }) => void) | null,
  }

  return {
    transport,
    client: createFilesClient(transport),
    requests,
    native: {
      connect: () => subscriber?.call(undefined, { data: FILES_HANDSHAKE, ports: [nativePort] }),
    },
  }
}

// ---------------------------------------------------------------------------
// Seam + fail-closed stub
// ---------------------------------------------------------------------------

describe("StubFilesPort + module-level seam (fail-closed defaults)", () => {
  test("stub clipboardImage answers null (equivalent to a missing platform field)", async () => {
    expect(await StubFilesPort.clipboardImage()).toBeNull()
  })

  test("stub saveFile answers false (single-listed: NOT equivalent to a missing field — intentional change, plan M1)", async () => {
    expect(await StubFilesPort.saveFile({ defaultPath: "session.json" }, "{}")).toBeFalse()
  })

  test("stub shareDataUrl answers false (equivalent: the M-021 branch falls back to the anchor)", async () => {
    expect(await StubFilesPort.shareDataUrl("data:text/plain;base64,SGk=", "hi.txt", "text/plain")).toBeFalse()
  })

  test("stub openExternal answers false (equivalent: the void Platform face ignores the pre-ack failure, issue #76)", async () => {
    expect(await StubFilesPort.openExternal("https://opencode.ai/desktop-feedback")).toBeFalse()
  })

  test("the seam defaults to the stub and registration swaps it in; undefined resets", async () => {
    expect(activeFilesPort()).toBe(StubFilesPort)
    expect(filesBridgeInjected()).toBeFalse()
    const custom: FilesPort = {
      clipboardImage: async () => null,
      saveFile: async () => true,
      shareDataUrl: async () => true,
      openExternal: async () => true,
    }
    setActiveFilesPort(custom)
    expect(activeFilesPort()).toBe(custom)
    expect(filesBridgeInjected()).toBeTrue()
    setActiveFilesPort(undefined)
    expect(activeFilesPort()).toBe(StubFilesPort)
    expect(filesBridgeInjected()).toBeFalse()
  })
})

// ---------------------------------------------------------------------------
// sanitizeFilename (B2 JS layer; six illegal shapes per plan)
// ---------------------------------------------------------------------------

describe("sanitizeFilename (B2 JS layer)", () => {
  test("legal names pass through unchanged", () => {
    expect(sanitizeFilename("session-export.json")).toBe("session-export.json")
    expect(sanitizeFilename("Screenshot 2026-10-26 at 10.00.00.png")).toBe("Screenshot 2026-10-26 at 10.00.00.png")
    expect(sanitizeFilename("notes[1](draft).txt")).toBe("notes[1](draft).txt")
    expect(sanitizeFilename("a".repeat(128))).toBe("a".repeat(128))
  })

  test("illegal shape 1: ../ traversal", () => {
    expect(() => sanitizeFilename("../")).toThrow(FilesError)
    expect(() => sanitizeFilename("../")).toThrow(/unsupported|dot segments|separators/)
  })

  test("illegal shape 2: contains /", () => {
    expect(() => sanitizeFilename("a/b.json")).toThrow(FilesError)
  })

  test("illegal shape 3: contains \\", () => {
    expect(() => sanitizeFilename("a\\b.json")).toThrow(FilesError)
  })

  test("illegal shape 4: absolute path", () => {
    expect(() => sanitizeFilename("/etc/passwd")).toThrow(FilesError)
    expect(() => sanitizeFilename("C:\\tmp\\x.bin")).toThrow(FilesError)
  })

  test("illegal shape 5: empty string", () => {
    expect(() => sanitizeFilename("")).toThrow(FilesError)
  })

  test("illegal shape 6: over 128 chars", () => {
    expect(() => sanitizeFilename("a".repeat(129))).toThrow(FilesError)
  })

  test("dot segments and leading dots are rejected without rewriting (no internal strip)", () => {
    expect(() => sanitizeFilename("..")).toThrow(FilesError)
    expect(() => sanitizeFilename(".hidden")).toThrow(FilesError)
    // the sanitizer never rewrites: output is either the identical input or a throw
    const name = "plan(v2).md"
    expect(sanitizeFilename(name)).toBe(name)
  })

  test("control characters are rejected", () => {
    expect(() => sanitizeFilename("a\u0000b")).toThrow(FilesError)
    expect(() => sanitizeFilename("a\nb")).toThrow(FilesError)
  })
})

// ---------------------------------------------------------------------------
// mimeFromFilename (plan L5)
// ---------------------------------------------------------------------------

describe("mimeFromFilename (save op SAF type)", () => {
  test("known extensions map; unknown or missing fall back to octet-stream", () => {
    expect(mimeFromFilename("export.json")).toBe("application/json")
    expect(mimeFromFilename("shot.PNG")).toBe("image/png")
    expect(mimeFromFilename("notes.txt")).toBe("text/plain")
    expect(mimeFromFilename("archive.ZIP")).toBe("application/zip")
    expect(mimeFromFilename("payload.weird")).toBe("application/octet-stream")
    expect(mimeFromFilename("noextension")).toBe("application/octet-stream")
  })
})

// ---------------------------------------------------------------------------
// base64 round-trip
// ---------------------------------------------------------------------------

describe("base64 helpers", () => {
  test("round-trips binary bytes (including 0x00 and 0xff lanes)", () => {
    const bytes = new Uint8Array(256)
    for (let i = 0; i < 256; i++) bytes[i] = i
    const encoded = bytesToBase64(bytes)
    expect(encoded).toBe(Buffer.from(bytes).toString("base64"))
    expect([...base64ToBytes(encoded)]).toEqual([...bytes])
  })

  test("malformed base64 throws the io code", () => {
    expect(() => base64ToBytes("!!!!")).toThrow(FilesError)
    try {
      base64ToBytes("A")
    } catch (error) {
      expect((error as FilesError).code).toBe("io")
    }
  })
})

// ---------------------------------------------------------------------------
// clipboardImage (never throws; File construction)
// ---------------------------------------------------------------------------

describe("createFilesClient.clipboardImage", () => {
  test("constructs a File with name+mime+bytes from the bridge answer", async () => {
    const bytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3])
    const engine = createEngine(() => ({
      ok: true,
      result: { name: "clipboard.png", mime: "image/png", data: Buffer.from(bytes).toString("base64") },
    }))
    engine.native.connect()
    await drain()
    const file = await engine.client.clipboardImage()
    expect(file).toBeInstanceOf(File)
    expect(file!.name).toBe("clipboard.png")
    expect(file!.type).toBe("image/png")
    expect([...new Uint8Array(await file!.arrayBuffer())]).toEqual([...bytes])
  })

  test("a null result answers null (no image in the clipboard)", async () => {
    const engine = createEngine(() => ({ ok: true, result: null }))
    engine.native.connect()
    await drain()
    expect(await engine.client.clipboardImage()).toBeNull()
    expect(engine.requests.length).toBe(1)
  })

  test("explicit unsupported wire codes degrade to null at the Platform seam (never throw)", async () => {
    const engine = createEngine(() => ({ ok: false, code: "unsupported", message: "" }))
    engine.native.connect()
    await drain()
    expect(await engine.client.clipboardImage()).toBeNull()
  })

  test("unavailable bridge / malformed answers / oversized payload all degrade to null", async () => {
    const disconnected = createEngine(() => ({ ok: true, result: null }))
    expect(await disconnected.client.clipboardImage()).toBeNull() // handshake not captured

    const malformed = createEngine(() => ({ ok: true, result: { name: "x.png", mime: 42, data: "AAAA" } }))
    malformed.native.connect()
    await drain()
    expect(await malformed.client.clipboardImage()).toBeNull()

    const oversized = createEngine(() => ({
      ok: true,
      result: { name: "huge.bin", mime: "application/octet-stream", data: "A".repeat(Math.ceil((MAX_BRIDGE_BYTES * 4) / 3) + 8) },
    }))
    oversized.native.connect()
    await drain()
    expect(await oversized.client.clipboardImage()).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// saveFile (Platform contract: true / false / throw)
// ---------------------------------------------------------------------------

describe("createFilesClient.saveFile", () => {
  test("the bridge request carries the sanitized name, derived mime and base64 content", async () => {
    const engine = createEngine(() => ({ ok: true, result: { saved: true } }))
    engine.native.connect()
    await drain()
    const saved = await engine.client.saveFile({ defaultPath: "session-export.json" }, '{"id":1}')
    expect(saved).toBeTrue()
    expect(engine.requests.length).toBe(1)
    const { op, params } = engine.requests[0]!
    expect(op).toBe("save")
    expect(params["name"]).toBe("session-export.json")
    expect(params["mime"]).toBe("application/json")
    expect(params["data"]).toBe(Buffer.from('{"id":1}', "utf8").toString("base64"))
  })

  test("B1 sentinel: the save payload crosses intact and non-empty — a {saved:true} answer always corresponds to the exact bytes sent", async () => {
    const engine = createEngine(() => ({ ok: true, result: { saved: true } }))
    engine.native.connect()
    await drain()
    const content = '{"session":"export","stages":["a","b"],"size":1234}'
    const saved = await engine.client.saveFile({ defaultPath: "session.json" }, content)
    expect(saved).toBeTrue()
    const { params } = engine.requests[0]!
    const data = params["data"] as string
    expect(data.length).toBeGreaterThan(0) // never a zero-byte payload
    expect(new TextDecoder().decode(base64ToBytes(data))).toBe(content) // the exact bytes the client sent
  })

  test("saved:false resolves false (the upstream false = user cancel contract)", async () => {
    const engine = createEngine(() => ({ ok: true, result: { saved: false } }))
    engine.native.connect()
    await drain()
    expect(await engine.client.saveFile({}, "x")).toBeFalse()
  })

  test("native error codes throw FilesError with the wire code (upstream catch -> failed toast)", async () => {
    for (const code of ["io", "busy", "too-large", "unavailable"]) {
      const engine = createEngine(() => ({ ok: false, code, message: "" }))
      engine.native.connect()
      await drain()
      try {
        await engine.client.saveFile({ defaultPath: "a.txt" }, "x")
        expect.unreachable()
      } catch (error) {
        expect(error).toBeInstanceOf(FilesError)
        expect((error as FilesError).code).toBe(code)
      }
    }
  })

  test("illegal final segments are refused client-side with unsupported BEFORE anything crosses", async () => {
    const engine = createEngine(() => ({ ok: true, result: { saved: true } }))
    engine.native.connect()
    await drain()
    // saveFile takes defaultPath's final segment as the caller-side basename (plan Nit①);
    // segment-collapsible shapes like "a/b.json" legitimately become "b.json". What is
    // refused is a FINAL segment that is still illegal (dot segment, leading dot, control
    // chars, over-length) — the six-shape negative suite proper lives on sanitizeFilename.
    for (const bad of ["..", "some/path/..", ".hidden", "a\nb", "a".repeat(129)]) {
      let caught: unknown
      try {
        await engine.client.saveFile({ defaultPath: bad }, "x")
      } catch (error) {
        caught = error
      }
      expect(caught).toBeInstanceOf(FilesError)
      expect((caught as FilesError).code).toBe("unsupported")
    }
    expect(engine.requests.length).toBe(0) // nothing crossed the bridge
  })

  test("content over the 32 MiB bound is refused with too-large before encoding crosses", async () => {
    const engine = createEngine(() => ({ ok: true, result: { saved: true } }))
    engine.native.connect()
    await drain()
    const huge = "a".repeat(MAX_BRIDGE_BYTES + 1)
    try {
      await engine.client.saveFile({ defaultPath: "huge.txt" }, huge)
      expect.unreachable()
    } catch (error) {
      expect((error as FilesError).code).toBe("too-large")
    }
    expect(engine.requests.length).toBe(0)
  })

  test("title is used when defaultPath is absent; bare segment extraction drops directories", async () => {
    const engine = createEngine(() => ({ ok: true, result: { saved: true } }))
    engine.native.connect()
    await drain()
    await engine.client.saveFile({ title: "fallback-name.md" }, "x")
    expect(engine.requests[0]!.params["name"]).toBe("fallback-name.md")
    await engine.client.saveFile({ defaultPath: "/tmp/somewhere/export.md" }, "x")
    expect(engine.requests[1]!.params["name"]).toBe("export.md")
  })
})

// ---------------------------------------------------------------------------
// shareDataUrl (data:-only; L6 semantics: true / false / throw)
// ---------------------------------------------------------------------------

describe("createFilesClient.shareDataUrl", () => {
  test("a data: URL crosses as {name, mime, data} with the encoded payload", async () => {
    const engine = createEngine(() => ({ ok: true, result: { shared: true } }))
    engine.native.connect()
    await drain()
    const payload = Buffer.from("attachment-bytes", "utf8").toString("base64")
    const shared = await engine.client.shareDataUrl(`data:image/png;base64,${payload}`, "shot.png", "image/png")
    expect(shared).toBeTrue()
    const { op, params } = engine.requests[0]!
    expect(op).toBe("share")
    expect(params["name"]).toBe("shot.png")
    expect(params["mime"]).toBe("image/png")
    expect(params["data"]).toBe(payload)
  })

  test("non-data: URLs are rejected with unsupported (M-021 only feeds the data: branch)", async () => {
    const engine = createEngine(() => ({ ok: true, result: { shared: true } }))
    engine.native.connect()
    await drain()
    try {
      await engine.client.shareDataUrl("file:///srv/remote/path.bin", "x.bin", "application/octet-stream")
      expect.unreachable()
    } catch (error) {
      expect((error as FilesError).code).toBe("unsupported")
    }
    expect(engine.requests.length).toBe(0)
  })

  test("shared:false resolves false (native declined — the M-021 caller falls back to the anchor)", async () => {
    const engine = createEngine(() => ({ ok: true, result: { shared: false } }))
    engine.native.connect()
    await drain()
    expect(await engine.client.shareDataUrl("data:text/plain;base64,SGk=", "hi.txt", "text/plain")).toBeFalse()
  })

  test("illegal names and oversized payloads are refused with explicit codes", async () => {
    const engine = createEngine(() => ({ ok: true, result: { shared: true } }))
    engine.native.connect()
    await drain()
    try {
      await engine.client.shareDataUrl("data:text/plain;base64,SGk=", "../evil.txt", "text/plain")
      expect.unreachable()
    } catch (error) {
      expect((error as FilesError).code).toBe("unsupported")
    }
    const huge = "A".repeat(Math.ceil((MAX_BRIDGE_BYTES * 4) / 3) + 100)
    try {
      await engine.client.shareDataUrl(`data:text/plain;base64,${huge}`, "huge.txt", "text/plain")
      expect.unreachable()
    } catch (error) {
      expect((error as FilesError).code).toBe("too-large")
    }
    expect(engine.requests.length).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// openExternal (issue #76, N08) — never-throw void-face mapping matrix
// ---------------------------------------------------------------------------

describe("createFilesClient.openExternal", () => {
  test("the bridge answer {opened:true} resolves true and travels as the openExternal op", async () => {
    const engine = createEngine(() => ({ ok: true, result: { opened: true } }))
    engine.native.connect()
    await drain()
    expect(await engine.client.openExternal("https://opencode.ai/console")).toBeTrue()
    const { op, params } = engine.requests[0]!
    expect(op).toBe("openExternal")
    expect(params["url"]).toBe("https://opencode.ai/console")
  })

  test("the native policy refusal {opened:false} resolves false (the native side owns the Toast)", async () => {
    const engine = createEngine(() => ({ ok: true, result: { opened: false } }))
    engine.native.connect()
    await drain()
    expect(await engine.client.openExternal("mailto:user@example.com")).toBeFalse()
  })

  test("a hard wire error {ok:false} resolves false (never throws past the void seam)", async () => {
    const engine = createEngine(() => ({ ok: false, code: "unsupported", message: "" }))
    engine.native.connect()
    await drain()
    expect(await engine.client.openExternal("https://opencode.ai/console")).toBeFalse()
  })

  test("a malformed answer shape resolves false (non-boolean / non-object / missing result)", async () => {
    for (const reply of [
      { ok: true, result: { opened: "yes" } }, // non-boolean
      { ok: true, result: null }, // no result object
      { ok: true, result: {} }, // missing field
    ]) {
      const engine = createEngine(() => reply as unknown as NativeReply)
      engine.native.connect()
      await drain()
      expect(await engine.client.openExternal("https://opencode.ai/console")).toBeFalse()
    }
  })

  test("an un-acked bridge (transport unavailable) answers false with zero bytes on the wire", async () => {
    const engine = createEngine(() => ({ ok: true, result: { opened: true } }))
    // No engine.native.connect(): the handshake never fired.
    expect(await engine.client.openExternal("https://opencode.ai/console")).toBeFalse()
    expect(engine.requests.length).toBe(0)
  })

  test("never throws: a throwing fake transport still resolves false", async () => {
    const throwing: FilesBridgeTransport = {
      status: () => "available",
      onReady: () => () => {},
      request: () => Promise.reject(new FilesError("unavailable", "simulated channel death")),
      dispose: () => {},
    }
    const client = createFilesClient(throwing)
    expect(await client.openExternal("https://opencode.ai/console")).toBeFalse()
  })
})

// FilesPort type usage guard (compile-time shape check).
const _portShape: FilesPort | undefined = undefined
void _portShape
