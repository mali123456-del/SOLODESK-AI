# SOLODESK AI — Phase 0 Dependency Audit

**Audit Date:** 2026-11-15  
**Environment:** Node `v22.23.2`, npm `10.9.8`, Vite `8.3.8`, TypeScript `7.0.2`

---

## 1. Currently Installed Dependencies (`/app/applet`)

### Runtime `dependencies`
| Package | `package.json` Range | Installed (`node_modules`) | Used by SOLODESK? | Audit Recommendation |
| :--- | :--- | :--- | :--- | :--- |
| `@google/genai` | `^2.7.0` | `2.32.0` | **Yes (Phase 9, optional)** | **Keep** (`>= 2.29.1` supports `gemini-4-hydrogen`). |
| `xrblocks` | `~0.24.0` | `0.24.0` | **No** (starter demo only) | **Remove after approval** |
| `three` | `~0.186.0` | `0.186.1` | **No** (starter demo only) | **Remove after approval** |
| `@dimforge/rapier3d-simd-compat` | `^0.19.3` | `0.19.3` | **No** (3D physics) | **Remove after approval** |
| `@mediapipe/tasks-audio` | `^0.10.35` | `0.10.35` | **No** (ML audio) | **Remove after approval** |
| `@mediapipe/tasks-vision` | `^0.10.34` | `0.10.35` | **No** (ML vision) | **Remove after approval** |
| `@pmndrs/uikit` | `^1.0.64` | `1.0.78` | **No** (3D UIKit) | **Remove after approval** |
| `@preact/signals-core` | `^1.14.0` | `1.14.5` | **No** (XR UIKit dep) | **Remove after approval** |
| `@sparkjsdev/spark` | `^2.1.0` | `2.4.0` | **No** (2.7 MB Gaussian splats) | **Remove after approval** |
| `lit` | `^3.3.1` | `3.3.3` | **No** (XR UI dep) | **Remove after approval** |
| `openai` | `^6.7.0` | `6.49.0` | **No** (SOLODESK uses Gemini Hydrogen only) | **Remove after approval** |
| `three-mesh-bvh` | `^0.9.10` | `0.9.18` | **No** (3D raycasting) | **Remove after approval** |
| `three-pathfinding` | `^1.3.0` | `1.3.0` | **No** (3D navmesh) | **Remove after approval** |
| `troika-three-text` | `^0.52.4` | `0.52.5` | **No** (3D text) | **Remove after approval** |
| `tslib` | `^2.8.1` | `2.9.1` | **No** (direct dep unneeded) | **Remove after approval** |

### `devDependencies`
| Package | `package.json` Range | Installed (`node_modules`) | Audit Recommendation |
| :--- | :--- | :--- | :--- |
| `vite` | `^8.3.0` | `8.3.8` | **Preserve** |
| `typescript` | `^7.0.2` | `7.0.2` | **Preserve** (do not downgrade) |
| `@types/node` | `^25.0.8` | `25.9.9` | **Preserve** (compatible with Vitest `>=24.0.0`) |
| `@types/three` | `^0.186.0` | `0.186.0` | **Remove with `three` after approval** |
| `@types/webxr` | `^0.5.24` | `0.5.24` | **Remove with `xrblocks` after approval** |
| `@types/dom-speech-recognition` | `^0.0.7` | `0.0.7` | **Remove after approval** (unless voice features added) |
| `troika-types` | `^0.0.6` | `0.0.6` | **Remove with `troika-three-text` after approval** |

---

## 2. Target SOLODESK Dependencies & Registry Compatibility (Verified via `npm view`)

| Package | Latest Registry Version | Peer Dependency Check Against Installed Stack | Target Phase |
| :--- | :--- | :--- | :--- |
| `react` | `19.3.1` | Core UI runtime | Phase 1 |
| `react-dom` | `19.3.1` | Matches `react@19.3.1` | Phase 1 |
| `@types/react` | `19.3.0` | Dev types for React 19 | Phase 1 |
| `@types/react-dom` | `19.3.0` | Dev types for React DOM 19 | Phase 1 |
| `@vitejs/plugin-react` | `6.3.0` | `vite: '^8.0.0'` (compatible with `8.3.8`) | Phase 1 |
| `tailwindcss` | `4.3.5` | Tailwind CSS v4 | Phase 1 |
| `@tailwindcss/vite` | `4.3.5` | `vite: '^5.2.0 \|\| ^6 \|\| ^7 \|\| ^8'` (compatible) | Phase 1 |
| `lucide-react` | `1.73.0` | Lightweight tree-shakeable icons | Phase 1 |
| `vitest` | `5.1.0` | `vite: '^6.4.0 \|\| ^7.0.0 \|\| ^8.0.0'`, `@types/node: '>=24.0.0'` (compatible) | Phase 1 |
| `@testing-library/react` | `16.3.3` | `react: '^18.0.0 \|\| ^19.0.0'` (compatible) | Phase 1 |
| `@testing-library/jest-dom` | `7.0.1` | Test DOM assertions | Phase 1 |
| `jsdom` | `31.0.1` | Vitest DOM environment | Phase 1 |
| `dexie` | `4.4.7` | IndexedDB wrapper | Phase 2 |
| `zod` | `4.6.7` | Runtime & schema validation | Phase 2 |
| `big.js` | `7.0.1` | Decimal-safe financial math (~6 KB) | Phase 2 |
| `@types/big.js` | `7.0.0` | Types for `big.js` | Phase 2 |
| `fake-indexeddb` | `6.2.8` | IndexedDB test shim for Vitest | Phase 2 |
| `jspdf` | `4.2.1` | Lazy-loaded PDF export | Phase 5 |
| `recharts` | `3.10.1` | `react: '^16.8.0 \|\| ... \|\| ^19.0.0'` (compatible; lazy-loaded) | Phase 7 |
| `vite-plugin-pwa` | `2.0.0` | `vite: '^3.1.0 \|\| ... \|\| ^8.0.0'` (compatible with Vite 8) | Phase 10 |

---

## 3. Notes on Bundle & Low-Spec Hardware Impact

- Currently, `vite build` on the starter XR template emits >5 MB of 3D/WASM assets (`spark.module` 2,695 kB, `three.webgpu` 677 kB, `draco_decoder` 719 kB, `basis_transcoder.wasm` 527 kB).
- Removing unused XR/3D packages (once approved) and lazy-loading `jspdf` and `recharts` keeps installation light and production bundles fast on low-spec hardware (Intel Core i5-4200U, 8 GB RAM).
