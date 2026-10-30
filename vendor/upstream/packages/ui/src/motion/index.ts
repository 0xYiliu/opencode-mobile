// mobile(M-035): minimized entry for the interface zoom/motion alignment (issue #65).
// Upstream v2.2.1 also re-exports ./velocity, ./waapi and ./slider from this entry; those
// submodules belong to feature domains this closure does not vendor, so only the
// reduced-motion face ships in M-035. Re-sync from upstream before adding more.
// mobile(M-036): issue #66 appends the Sources experiment's two submodules below (spring for
// the chip/panel springs, loop for the frame scheduler); the ./reduced line stays M-035's.
export * from "./reduced"
export * from "./spring"
export * from "./loop"
