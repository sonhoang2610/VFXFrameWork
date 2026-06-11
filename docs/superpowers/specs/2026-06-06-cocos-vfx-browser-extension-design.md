# Cocos Creator VFX Browser Extension — Design Spec

**Date:** 2026-06-06  
**Status:** Approved  
**Scope:** Full VFX browser + import extension for Cocos Creator 3.8.8, mirroring Unity VFXBrowserWindow functionality

---

## 1. Overview

Build a Cocos Creator editor extension that connects to the IKame VFX server, browses the VFX catalog, and imports VFX packages by downloading particle.json + assets, then reconstructing a Cocos ParticleSystem3D node hierarchy.

**Key constraints:**

- Cocos Creator 3.8.8, project-level extension
- Full module mapping (22 Unity PS modules → Cocos PS3D, skip + warning log for unsupported)
- UI layout mirrors Unity VFXBrowser: sidebar category tree + text list + toolbar
- Text-only list (no GIF thumbnails in v1)
- Import review panel before committing

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Cocos Creator Editor                                         │
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ ikame-vfx-browser extension                             │ │
│  │                                                         │ │
│  │  ┌──────────┐   ┌──────────────┐   ┌────────────┐      │ │
│  │  │ Browser  │──▶│ Import       │──▶│ Importer   │      │ │
│  │  │ Panel    │   │ Review Panel │   │ Service    │      │ │
│  │  └────┬─────┘   └──────────────┘   └─────┬──────┘      │ │
│  │       │                                   │             │ │
│  │       ▼                                   ▼             │ │
│  │  ┌──────────┐                      ┌────────────┐       │ │
│  │  │ API      │◀─────────────────────│ Module     │       │ │
│  │  │ Service  │  download assets     │ Mappers    │       │ │
│  │  └────┬─────┘                      │ (1 per     │       │ │
│  │       │                            │  module)   │       │ │
│  │       ▼                            └─────┬──────┘       │ │
│  │  ┌──────────┐                            │              │ │
│  │  │ IKame    │                            ▼              │ │
│  │  │ VFX      │                      ┌────────────┐       │ │
│  │  │ Server   │                      │ Asset DB   │       │ │
│  │  │ :4649    │                      │ (textures, │       │ │
│  │  └──────────┘                      │  meshes,   │       │ │
│  │                                    │  materials)│       │ │
│  │                                    └────────────┘       │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Data flow:**

1. Browser Panel → API Service → `GET /api/vfx/catalog` → populate list + category tree
2. User clicks Import → API Service → `GET /api/vfx/{id}/particle-json` → parse JSON
3. Open Import Review Panel → user selects assets → confirm
4. Importer Service → download assets via API → write to project → build hierarchy via Module Mappers
5. Save as prefab → log result + warnings

---

## 3. File Structure

```
VFXBrowser/extensions/ikame-vfx-browser/
  package.json              — Extension manifest
  tsconfig.json             — TypeScript config

  src/
    main.ts                 — Extension lifecycle: load(), unload(), openPanel()

    panels/
      browser/
        index.ts            — Browser panel (sidebar + list + toolbar)
        style.ts            — CSS for browser panel
      import-review/
        index.ts            — Import review panel (asset list + confirm)
        style.ts            — CSS for review panel

    services/
      api.ts                — HTTP client to IKame VFX server
      importer.ts           — Orchestrator: download → create assets → build hierarchy

    mappers/
      index.ts              — MapperRegistry: module name → mapper function
      types.ts              — Shared types (MapperContext, etc.)
      main.ts               — mainModule mapping
      emission.ts           — emission mapping
      shape.ts              — shape mapping
      velocity-over-lifetime.ts
      limit-velocity.ts
      inherit-velocity.ts   — Skip + warn (no Cocos equivalent)
      force-over-lifetime.ts
      color-over-lifetime.ts
      size-over-lifetime.ts
      size-by-speed.ts      — Skip + warn
      rotation-over-lifetime.ts
      rotation-by-speed.ts  — Skip + warn
      noise.ts              — Skip + warn
      collision.ts          — Skip + warn
      sub-emitters.ts       — Skip + warn
      texture-sheet.ts      — TSA mapping
      trails.ts             — Trail mapping
      renderer.ts           — Renderer mapping

    utils/
      json-helpers.ts       — Safe JSON access (getString, getFloat, getVector3, etc.)
      curve-converter.ts    — Unity MinMaxCurve → Cocos CurveRange
      gradient-converter.ts — Unity MinMaxGradient → Cocos GradientRange

  dist/                     — Compiled JS output
  i18n/
    en.ts                   — English strings
```

### Extension manifest (package.json)

```json
{
  "package_version": 2,
  "version": "1.0.0",
  "name": "ikame-vfx-browser",
  "description": "Browse and import VFX from IKame VFX Hub server",
  "main": "./dist/main.js",
  "editor": ">=3.8.0",
  "panels": {
    "browser": {
      "title": "IKame VFX Browser",
      "type": "dockable",
      "main": "dist/panels/browser",
      "size": { "min-width": 800, "min-height": 500 }
    },
    "import-review": {
      "title": "Import Review",
      "type": "simple",
      "main": "dist/panels/import-review",
      "size": { "min-width": 600, "min-height": 400 }
    }
  },
  "contributions": {
    "menu": [
      {
        "path": "Extensions/IKame VFX Browser",
        "message": "open-browser"
      }
    ],
    "messages": {
      "open-browser": {
        "methods": ["openBrowser"]
      },
      "open-import-review": {
        "methods": ["openImportReview"]
      }
    }
  }
}
```

### TypeScript config (tsconfig.json)

```json
{
  "compilerOptions": {
    "target": "ES2015",
    "module": "commonjs",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*.ts"]
}
```

---

## 4. Browser Panel UI

```
┌─────────────────────────────────────────────────────────────┐
│ ⚙ Server: [http://localhost:4649    ] [🔄 Refresh]          │
├───────────────┬─────────────────────────────────────────────┤
│ Categories    │ 🔍 [Search...                             ] │
│               │─────────────────────────────────────────────│
│ ▸ All (47)    │  Name              Category      Action     │
│               │─────────────────────────────────────────────│
│ ▸ Casual      │  BloodExplosion     RPG/Hit      [Import]   │
│   ▸ Loop      │  FireBall           RPG/Proj     [Import]   │
│   ▸ OneShot   │  HealAura           RPG/Buff     [Import]   │
│               │  SmokePuff          Casual/Loop  [Import]   │
│ ▸ RPG         │  SparkHit           Casual/One   [Import]   │
│   ▸ Hit       │                                             │
│   ▸ Projectile│                                             │
│   ▸ Buff      │                                             │
│               │                                             │
├───────────────┴─────────────────────────────────────────────┤
│ Status: 47 effects loaded                                   │
└─────────────────────────────────────────────────────────────┘
```

### Behaviour

- **Server URL**: Text input, persisted via `Editor.Profile.getConfig()` (project scope), default `http://localhost:4649`
- **Refresh**: Calls `GET /api/vfx/catalog`, populates list + rebuilds category tree
- **Category sidebar** (160px wide):
  - Parse category `/` separator into tree nodes (e.g. `RPG/Hit` → RPG parent, Hit child)
  - Click to filter the list. "All" shows everything
  - Show count per category
  - Expand/collapse parent categories
- **Search**: Case-insensitive text filter on VFX name, filters as user types
- **VFX list** (right area):
  - Columns: Name (200px), Category (150px), Import button
  - Scrollable list
  - Click "Import" → triggers import flow
- **Status bar**: Shows "Loading...", "47 effects loaded", "Error: connection refused", import progress

### Panel ↔ Main communication

Browser panel uses `Editor.Message.send('ikame-vfx-browser', 'open-import-review', data)` to pass import data to main.ts, which opens the Import Review panel and forwards data via `Editor.Panel.open('ikame-vfx-browser.import-review', data)`.

---

## 5. Import Review Panel

```
┌─────────────────────────────────────────────────────────────┐
│ Import: BloodExplosion                                       │
│ Target: assets/_IKameVFX/Imported/                           │
├─────────────────────────────────────────────────────────────┤
│ 12 assets total — 8 new, 4 already in project — 8 selected  │
│                                                              │
│ [Select All] [Select None] [Select New Only]                 │
├─────────────────────────────────────────────────────────────┤
│ ☑ │ NEW    │ texture  │ particle_fire.png    │              │
│ ☑ │ NEW    │ texture  │ smoke_atlas.png      │              │
│ ☐ │ EXISTS │ texture  │ spark_01.png         │ db://assets/ │
│ ☑ │ NEW    │ material │ Fire_ADD             │              │
│ ☐ │ EXISTS │ material │ IKAME_Particle_AB    │ db://assets/ │
│ ☑ │ NEW    │ mesh     │ SM_Disk1             │              │
│ ...                                                          │
├─────────────────────────────────────────────────────────────┤
│                              [Cancel]  [Import (8)]          │
└─────────────────────────────────────────────────────────────┘
```

### Asset status detection

- Each asset has a Unity GUID from particle.json
- Scan `assets/` folder for existing files by name + type match
- `EXISTS` → default unchecked (don't overwrite)
- `NEW` → default checked

### Data passed from Browser → Import Review

```typescript
interface ImportReviewData {
  prefabName: string;
  importFolder: string;          // default "assets/_IKameVFX/Imported"
  particleJson: Record<string, any>;
  entries: ImportEntry[];
}

interface ImportEntry {
  guid: string;
  name: string;
  type: 'texture' | 'material' | 'mesh' | 'shader';
  status: 'new' | 'exists';
  existingPath?: string;         // db:// path if exists
  selected: boolean;             // user toggle
}
```

### On confirm

Import Review sends selected entries + particleJson back to main.ts via message, which invokes `Importer.execute()`.

---

## 6. Import Flow (Importer Service)

### Step-by-step

```
User clicks "Import (N)" on Import Review Panel
  │
  ▼
1. Download selected assets from server:
   - Textures:  GET /api/assets/{guid}      → binary (PNG/JPG)
   - Materials: GET /api/assets/{guid}/meta  → JSON metadata
   - Meshes:    GET /api/assets/{guid}       → JSON (vertices/triangles/uvs/normals)
  │
  ▼
2. Write asset files to project:
   - Textures → {importFolder}/{prefabName}/textures/{name}.png
   - Meshes   → {importFolder}/{prefabName}/meshes/{name}.mesh  (or .json → create mesh asset)
   - Materials → {importFolder}/{prefabName}/materials/{name}.mtl
   - All writes via Editor.Message.send('asset-db', 'create-asset', ...)
   - Wait for asset-db refresh between writes
  │
  ▼
3. Build node hierarchy from particle.json:
   Walk "root" node tree recursively:
     For each node:
       a. Create Node via scene API
       b. Add ParticleSystem component
       c. For each enabled module in JSON:
          - Look up mapper in MapperRegistry
          - Call mapper(json, context)
          - Mapper sets PS3D properties, or logs warning if unsupported
       d. Set material reference (builtin AB/ADD or custom)
       e. Set texture references
       f. Recurse into children
  │
  ▼
4. Save root node as prefab:
   - Editor.Message.send('scene', 'create-prefab', ...)
   - Save to {importFolder}/{prefabName}/{prefabName}.prefab
  │
  ▼
5. Log results:
   - Success summary (nodes created, assets imported)
   - Warning list (skipped modules, fallback shapes, unmapped properties)
```

### Built-in material mapping

| Unity Material | Cocos Equivalent |
|---|---|
| `IKAME_Particle_AB` | New material using `builtin-particle` effect, blend mode = Alpha Blend |
| `IKAME_Particle_ADD` | New material using `builtin-particle` effect, blend mode = Additive |
| Custom material | New material, map shader → closest `builtin-particle` variant, set properties (floats, colors, textures with tiling/offset) |

### Error handling

- Network errors → status bar message + log, don't crash
- Missing asset on server → skip that asset, warn, continue import
- Asset write failure → log error, continue with remaining assets
- Unknown module in JSON → skip + warn (forward-compatible)

---

## 7. Module Mapping — Unity PS → Cocos PS3D

### Supported Modules

| Unity Module | Cocos PS3D Module | Mapping Notes |
|---|---|---|
| **Main** | `ParticleSystem` root | duration, looping, startDelay, startLifetime, startSpeed, startSize, startColor, gravityModifier, simulationSpace, playOnAwake, maxParticles |
| **Emission** | Emission properties | rateOverTime, bursts (time, count, cycles, interval) |
| **Shape** | `ShapeModule` | Box/Sphere/Cone/Circle → direct. Donut/Edge/etc. → fallback + warn |
| **Velocity over Lifetime** | `VelocityOvertimeModule` | x, y, z curves + space. Orbital → skip + warn |
| **Limit Velocity** | `LimitVelocityOvertimeModule` | speed, dampen, separateAxes |
| **Force over Lifetime** | `ForceOvertimeModule` | x, y, z curves + space |
| **Color over Lifetime** | `ColorOvertimeModule` | MinMaxGradient → GradientRange |
| **Size over Lifetime** | `SizeOvertimeModule` | size curve, separateAxes (x, y, z) |
| **Rotation over Lifetime** | `RotationOvertimeModule` | angularVelocity curve, separateAxes |
| **Texture Sheet Animation** | `TextureAnimationModule` | Grid: numTilesX/Y, frameOverTime. Sprites: map sprite frames |
| **Trails** | `TrailModule` | ratio, lifetime, widthOverTrail, colorOverTrail |
| **Renderer** | `ParticleSystemRenderer` | renderMode (Billboard/Mesh/Stretched), mesh ref, sorting |

### Skipped Modules (warning log only)

| Unity Module | Reason |
|---|---|
| **Noise** | No Cocos PS3D equivalent |
| **Collision** | Cocos collision model too different for reliable mapping |
| **Sub Emitters** | No Cocos equivalent system |
| **Inherit Velocity** | No Cocos equivalent |
| **Size by Speed** | No dedicated Cocos module |
| **Rotation by Speed** | No dedicated Cocos module |

### Mapper interface

```typescript
type ModuleMapper = (json: Record<string, any>, ctx: MapperContext) => void;

interface MapperContext {
  node: any;                      // Cocos scene node being built
  ps: any;                        // Cocos ParticleSystem3D component
  json: Record<string, any>;      // Full particle JSON for this node
  textures: Map<string, string>;  // Unity GUID → db:// asset path
  meshes: Map<string, string>;    // Unity GUID → db:// asset path
  materials: Map<string, string>; // Unity GUID → db:// asset path
  warnings: string[];             // Collected warnings
  importFolder: string;           // Target folder path
}
```

### MapperRegistry

```typescript
// mappers/index.ts
const registry: Record<string, ModuleMapper> = {
  mainModule: mapMain,
  emissionModule: mapEmission,
  shapeModule: mapShape,
  velocityOverLifetime: mapVelocityOverLifetime,
  limitVelocityOverLifetime: mapLimitVelocity,
  inheritVelocity: mapInheritVelocity,      // skip + warn
  forceOverLifetime: mapForceOverLifetime,
  colorOverLifetime: mapColorOverLifetime,
  sizeOverLifetime: mapSizeOverLifetime,
  sizeBySpeed: mapSizeBySpeed,              // skip + warn
  rotationOverLifetime: mapRotationOverLifetime,
  rotationBySpeed: mapRotationBySpeed,      // skip + warn
  noise: mapNoise,                          // skip + warn
  collision: mapCollision,                  // skip + warn
  subEmitters: mapSubEmitters,              // skip + warn
  textureSheetAnimation: mapTextureSheet,
  trails: mapTrails,
  renderer: mapRenderer,
};

export function mapModule(moduleName: string, json: any, ctx: MapperContext): void {
  const mapper = registry[moduleName];
  if (!mapper) {
    ctx.warnings.push(`Unknown module "${moduleName}" — skipped`);
    return;
  }
  mapper(json, ctx);
}
```

---

## 8. Curve & Gradient Conversion

### MinMaxCurve → CurveRange

| Unity Mode | Cocos CurveRange Mode | Conversion |
|---|---|---|
| `constant` | `Constant` | Direct value copy |
| `curve` | `Curve` | Keyframes `[[time, value], ...]` → Cocos `AnimationCurve` (linear interpolation, no tangent data from Unity export) |
| `randomBetweenTwoConstants` | `TwoConstants` | min/max direct copy |
| `randomBetweenTwoCurves` | `TwoCurves` | Two keyframe arrays → two `AnimationCurve` instances |

### MinMaxGradient → GradientRange

| Unity Mode | Cocos GradientRange Mode | Conversion |
|---|---|---|
| `color` | `Color` | `[r,g,b,a]` → `Color(r,g,b,a)` |
| `gradient` | `Gradient` | colorKeys + alphaKeys → Cocos `Gradient` with `ColorKey[]` and `AlphaKey[]` |
| `randomBetweenTwoColors` | `TwoColors` | min/max color arrays → two `Color` |
| `randomBetweenTwoGradients` | `TwoGradients` | min/max gradients → two `Gradient` |

---

## 9. API Service

### Endpoints used

| Method | Endpoint | Purpose | Response |
|---|---|---|---|
| `GET` | `/api/vfx/catalog` | Fetch full catalog | `{ version, categories[], items[] }` |
| `GET` | `/api/vfx/{id}/particle-json` | Download particle JSON | JSON object |
| `GET` | `/api/assets/{guid}` | Download asset binary (texture/mesh) | Binary or JSON |
| `GET` | `/api/assets/{guid}/meta` | Download asset metadata (material) | JSON |

### HTTP client (api.ts)

```typescript
// Uses Node.js built-in http/https modules (available in Cocos extension runtime)
// No external dependencies needed

export class VFXApiClient {
  constructor(private serverUrl: string) {}

  async fetchCatalog(): Promise<CatalogResponse>;
  async downloadParticleJson(vfxId: string): Promise<Record<string, any>>;
  async downloadAssetBinary(guid: string): Promise<Buffer>;
  async downloadAssetMeta(guid: string): Promise<Record<string, any>>;
}

interface CatalogResponse {
  version: number;
  categories: string[];
  items: CatalogItem[];
}

interface CatalogItem {
  id: string;
  name: string;
  category: string;
  fileSize: number;
  particleCount: number;
  uploadedAt: string;
}
```

---

## 10. Warning Log Format

All warnings are collected during import and logged at the end as a single summary:

```
[IKame VFX] Import "BloodExplosion" completed:
  ✓ 3 nodes created
  ✓ 5 textures imported
  ✓ 2 materials created
  ✓ 1 mesh imported
  ⚠ Skipped modules:
    - Node "SubSparks": Noise (not supported in Cocos Creator)
    - Node "SubSparks": Sub Emitters (not supported in Cocos Creator)
    - Node "Core": Collision (not supported in Cocos Creator)
    - Node "Core": VelocityOverLifetime.orbital (orbital velocity not supported)
  ⚠ Fallbacks:
    - Node "Trail": Shape type "Donut" → fallback to Circle
```

Warnings also appear in the Cocos Creator console via `Editor.log()` / `Editor.warn()`.

---

## 11. Persistence & Settings

| Setting | Storage | Default |
|---|---|---|
| Server URL | `Editor.Profile` (project scope) | `http://localhost:4649` |
| Import folder | `Editor.Profile` (project scope) | `assets/_IKameVFX/Imported` |

No global/user-level settings needed for v1.

---

## 12. Built-in Shaders

Two Cocos `.effect` files ported from Unity's `IKAME/Particles/Blend_CenterGlow` and `Add_CenterGlow` shaders:

| Unity Shader | Cocos Effect File | Blend Mode |
|---|---|---|
| `IKAME/Particles/Blend_CenterGlow` | `assets/effects/IKAME_Particle_AB.effect` | `SrcAlpha, OneMinusSrcAlpha` |
| `IKAME/Particles/Add_CenterGlow` | `assets/effects/IKAME_Particle_ADD.effect` | `One, One` |

**Ported features (core set):**
- MainTex sampling with UV panning
- Noise texture with separate UV panning
- Mask texture for center glow (toggle)
- Vertex color multiplication
- Emission multiplier
- Tint color
- AB: alpha = mainTex.a × noise.a × color.a × vtx.a × opacity
- ADD: pre-multiplied alpha into RGB (additive)

**Not ported:**
- Flow distortion texture
- Dissolve / Alpha Glow
- Soft Particles (depth-based fade)
- Custom UV Offset from TEXCOORD2

Default materials (`assets/materials/IKAME_Particle_AB.mtl`, `IKAME_Particle_ADD.mtl`) reference these effects.

During import, the importer:
1. Checks `blendMode` from particle.json (`"AB"` or `"ADD"`)
2. Clones the corresponding built-in material
3. Sets `mainTexture` from the imported texture
4. Assigns cloned material to `ParticleSystemRenderer.sharedMaterial`

Custom materials (non-IKAME) are **not supported** — they fall back to the AB/ADD built-in based on blend mode detection, with a warning.

---

## 13. Out of Scope (v1)

- GIF/WebM thumbnail preview in browser panel
- Drag & drop local ZIP import
- URL import field
- WebGL live preview in Cocos editor
- Unreal/Godot export
- Asset updating / re-import (first import only)
- Custom shader porting (custom materials use AB/ADD fallback)
- Sub-emitter reconstruction
- Noise simulation via curves
- Flow distortion in shader
- Soft Particles
