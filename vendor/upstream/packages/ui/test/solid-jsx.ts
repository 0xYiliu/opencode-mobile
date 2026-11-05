import { plugin } from "bun"
import { createRequire } from "node:module"

// Bun transpiles TSX against the tsconfig `jsxImportSource`, but `solid-js/jsx-runtime` has no runtime
// exports because Solid's compiler normally replaces JSX. Tests run without that compiler, so compile
// JSX with the same real Solid Babel transform the production build uses (the pinned bun's Transpiler
// also ignores an automatic-runtime `tsconfig` override, so the previous Transpiler-based preload
// silently compiled JSX to a missing React classic runtime).
const require = createRequire(import.meta.resolve("vite-plugin-solid"))
const babel = require("@babel/core") as {
  transformSync: (source: string, options: object) => { code: string | null } | null
}

plugin({
  name: "solid-jsx-runtime",
  setup(build) {
    build.onLoad({ filter: /\.[jt]sx$/ }, async (args) => ({
      contents: babel.transformSync(await Bun.file(args.path).text(), {
        filename: args.path,
        presets: [require.resolve("babel-preset-solid"), require.resolve("@babel/preset-typescript")],
        configFile: false,
        babelrc: false,
      })!.code!,
      loader: "js",
    }))
  },
})
