// mobile(M-035): minimized entry for the interface zoom/motion alignment (issue #65).
// Upstream v2.2.1 also re-exports ./spring, ./loop, ./velocity, ./waapi and ./slider from
// this entry; those submodules belong to feature domains this closure does not vendor, so
// only the reduced-motion face ships here. Re-sync from upstream before adding more.
export * from "./reduced"
