// mobile(M-036): minimal motion-tuning shim for the Sources experiment (issue #66).
//
// Upstream v2.2.1 powers the Sources experiment through the Knobs dev console
// (ui/src/motion-tuning.ts + motion-tuning-features/-fields, reachable only from the desktop
// component-lab routes). This closure vendors neither the console nor those routes, so this shim
// carries exactly the four faces the experiment consumes — toggle / choice / spring / subscribe —
// over the SAME storage format: the `opencode.motion.v2` localStorage record (toggles as 0|1,
// choices as the option index, springs as `<id>.duration` / `<id>.bounce`; non-default entries
// only, record removed when empty). A future re-sync of the real console reads the same values;
// until then the settings Experimental tab's Sources row is the only writer. Every knob stays
// false/at its shipped default unless flipped: nothing auto-enables, and the app's settings
// store is not involved. Re-sync from upstream before adding more faces.
import type { DurationOptions } from "./motion"

type Meta = {
  label: string
  group: string
  subsection?: string
  description?: string
  target?: string
  experiment?: boolean
  when?: () => boolean
}

// Bumped when the upstream record's shape changes, so stale values are dropped; same key as upstream.
const key = "opencode.motion.v2"

const listeners = new Set<() => void>()

const saved = load()

export const motionTuning = {
  toggle(id: string, meta: Meta & { value: boolean }) {
    return () => number(id, meta.value ? 1 : 0) === 1
  },
  choice<const T extends string>(id: string, meta: Meta & { value: NoInfer<T>; labels: Record<T, string> }) {
    const options = Object.keys(meta.labels) as [T, ...T[]]

    return () => options[number(id, options.indexOf(meta.value))] ?? meta.value
  },
  spring(id: string, meta: Meta & { presets: Record<string, DurationOptions>; shipped?: string }) {
    const initial = meta.presets[meta.shipped ?? "snappy"]

    return (): DurationOptions => ({
      duration: number(`${id}.duration`, initial.duration),
      bounce: number(`${id}.bounce`, initial.bounce),
    })
  },
  subscribe(listener: () => void) {
    listeners.add(listener)

    return () => {
      listeners.delete(listener)
    }
  },
}

/** The stored value of a toggle, for readers outside the experiment module (the settings row). */
export function storedToggle(id: string, initial: boolean) {
  return number(id, initial ? 1 : 0) === 1
}

/** Flips a toggle and persists it in the upstream record; the entry is dropped again at the default. */
export function setStoredToggle(id: string, value: boolean, initial: boolean) {
  if (value === initial) delete saved[id]
  else saved[id] = value ? 1 : 0

  write()
  notify()
}

function notify() {
  listeners.forEach((listener) => listener())
}

function number(id: string, fallback: number) {
  const value = Number(saved[id])

  return id in saved && Number.isFinite(value) ? value : fallback
}

function load(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "{}")
  } catch {
    return {}
  }
}

function write() {
  try {
    if (Object.keys(saved).length === 0) return localStorage.removeItem(key)
    localStorage.setItem(key, JSON.stringify(saved))
  } catch {}
}
