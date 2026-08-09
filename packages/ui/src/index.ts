// This barrel is consumed by Metro straight from source: `apps/mobile` imports
// `@amragrir/ui`, and the package `main` points at this `.ts` file. Two rules
// follow, and both are load-bearing — breaking either fails the mobile bundle
// while every test, typecheck and web build stays green:
//
//  1. No `.js` extension on the re-export. Metro resolves a bare `./tokens` to
//     `tokens.ts`, but a `./tokens.js` specifier makes it look for a file that
//     does not exist on disk ("Unable to resolve module ./tokens.js"). The TS
//     compiler and Vitest both tolerate the extension; Metro does not.
//
//  2. `css.ts` is NOT re-exported here. It is the web/build-only CSS generator:
//     its compiled form is imported directly by scripts/build-css.mjs (from
//     dist) and by the drift test (from src), so nothing needs it through this
//     barrel. Re-exporting it would drag CSS-generation code into the mobile
//     bundle — and worse, css.ts imports `./tokens.js` (with the extension,
//     because Node runs it from dist), which Metro cannot resolve either.
export * from './tokens';
// Framework-agnostic on purpose: `encodeQr` returns SVG path data in module
// units and draws nothing itself, so the same function serves an `<svg>` in the
// panel, one in Next, and a react-native-svg `<Path>` in the app. It lives here
// rather than in `@amragrir/shared` because that package is enums and business
// constants with no runtime dependencies, and the API — which imports it at
// boot — has no use for a QR encoder.
export * from './qr';
