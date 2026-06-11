# Cocos Creator VFX Browser Extension â€” Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Cocos Creator 3.8.8 editor extension that browses the IKame VFX server catalog and imports VFX packages by reconstructing Cocos ParticleSystem3D hierarchies from particle.json.

**Architecture:** Project-level extension at `VFXBrowser/extensions/ikame-vfx-browser/` with two panels (Browser + Import Review), an HTTP API client, a module mapper registry (1 file per Unity PS module), and curve/gradient converters. Network I/O in main process, panels in renderer process communicating via `Editor.Message`.

**Tech Stack:** TypeScript, Cocos Creator 3.8.8 Extension API, Node.js http module, CommonJS modules

---

## File Structure

```
VFXBrowser/
  assets/
    effects/
      IKAME_Particle_AB.effect   â€” Alpha Blend particle shader (ported from Unity)
      IKAME_Particle_ADD.effect  â€” Additive particle shader (ported from Unity)
    materials/
      IKAME_Particle_AB.mtl      â€” Default AB material using the AB effect
      IKAME_Particle_ADD.mtl     â€” Default ADD material using the ADD effect
  extensions/ikame-vfx-browser/
    package.json              â€” Extension manifest (panels, menu, messages, profile)
    tsconfig.json             â€” TS config (target ES2015, module commonjs)
    src/
      main.ts                 â€” load/unload, message handlers, orchestration
      panels/
        browser/
          index.ts            â€” Browser panel UI (sidebar + list + toolbar)
          style.ts            â€” CSS for browser panel
        import-review/
          index.ts            â€” Import review panel UI (asset list + confirm)
          style.ts            â€” CSS for import review panel
      services/
        api.ts                â€” VFXApiClient: HTTP calls to IKame server
        importer.ts           â€” Import orchestrator: download â†’ write â†’ build
    mappers/
      types.ts              â€” MapperContext, ModuleMapper type, ImportEntry
      index.ts              â€” MapperRegistry: name â†’ mapper function
      main.ts               â€” mainModule mapper
      emission.ts           â€” emissionModule mapper
      shape.ts              â€” shapeModule mapper
      velocity-over-lifetime.ts â€” velocityOverLifetimeModule mapper
      limit-velocity.ts     â€” limitVelocityOverLifetimeModule mapper
      force-over-lifetime.ts â€” forceOverLifetimeModule mapper
      color-over-lifetime.ts â€” colorOverLifetimeModule mapper
      size-over-lifetime.ts â€” sizeOverLifetimeModule mapper
      rotation-over-lifetime.ts â€” rotationOverLifetimeModule mapper
      texture-sheet.ts      â€” textureSheetAnimationModule mapper
      trails.ts             â€” trailModule mapper
      renderer.ts           â€” rendererModule mapper
      skip-warn.ts          â€” Generic skip+warn mapper (noise, collision, etc.)
    utils/
      json-helpers.ts       â€” Safe JSON accessors (getString, getFloat, etc.)
      curve-converter.ts    â€” Unity MinMaxCurve â†’ Cocos CurveRange
      gradient-converter.ts â€” Unity MinMaxGradient â†’ Cocos GradientRange
  dist/                     â€” Compiled output (gitignored contents)
```

---

### Task 1: Extension Scaffold â€” package.json, tsconfig, main.ts

**Files:**
- Create: `VFXBrowser/extensions/ikame-vfx-browser/package.json`
- Create: `VFXBrowser/extensions/ikame-vfx-browser/tsconfig.json`
- Create: `VFXBrowser/extensions/ikame-vfx-browser/src/main.ts`

- [ ] **Step 1: Create package.json**

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
      "size": { "min-width": 800, "min-height": 500, "width": 1024, "height": 600 }
    },
    "import-review": {
      "title": "Import Review",
      "type": "simple",
      "main": "dist/panels/import-review",
      "size": { "min-width": 600, "min-height": 400, "width": 700, "height": 500 }
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
      },
      "start-import": {
        "methods": ["startImport"]
      }
    },
    "profile": {
      "project": {
        "serverUrl": {
          "default": "http://localhost:4649",
          "label": "Server URL"
        },
        "importFolder": {
          "default": "assets/_IKameVFX/Imported",
          "label": "Import Folder"
        }
      }
    }
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2015",
    "module": "commonjs",
    "strict": true,
    "esModuleInterop": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": false,
    "sourceMap": true,
    "resolveJsonModule": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create src/main.ts**

```typescript
'use strict';

let _importReviewData: any = null;

export const methods: Record<string, (...args: any[]) => any> = {
    openBrowser() {
        Editor.Panel.open('ikame-vfx-browser.browser');
    },

    openImportReview(data: any) {
        _importReviewData = data;
        Editor.Panel.open('ikame-vfx-browser.import-review');
    },

    getImportReviewData() {
        return _importReviewData;
    },

    async startImport(data: any) {
        const { VFXImporter } = require('./services/importer');
        const importer = new VFXImporter();
        try {
            const result = await importer.execute(data);
            Editor.Message.send('ikame-vfx-browser', 'import-complete', result);
            return result;
        } catch (err: any) {
            const errorMsg = `Import failed: ${err.message}`;
            console.error(errorMsg);
            return { success: false, error: errorMsg };
        }
    },
};

export function load() {
    console.log('[IKame VFX Browser] Extension loaded');
}

export function unload() {
    console.log('[IKame VFX Browser] Extension unloaded');
    _importReviewData = null;
}
```

- [ ] **Step 4: Create dist directory and .gitignore**

Create `VFXBrowser/extensions/ikame-vfx-browser/dist/.gitkeep` (empty file) and add a `.gitignore` in the extension root:

```
dist/*.js
dist/*.js.map
node_modules/
```

- [ ] **Step 5: Compile and verify extension loads**

```bash
cd VFXBrowser/extensions/ikame-vfx-browser
npx tsc --noEmit
```

Expected: Errors about missing imports (services/importer, panel files). These will be resolved in subsequent tasks. The scaffold compiles without syntax errors.

- [ ] **Step 6: Commit**

```bash
git add VFXBrowser/extensions/ikame-vfx-browser/
git commit -m "feat(cocos): scaffold ikame-vfx-browser extension with manifest and main.ts"
```

---

### Task 2: IKAME Particle Shaders â€” Cocos Effect Files + Built-in Materials

**Files:**
- Create: `VFXBrowser/assets/effects/IKAME_Particle_AB.effect`
- Create: `VFXBrowser/assets/effects/IKAME_Particle_ADD.effect`
- Create: `VFXBrowser/assets/materials/IKAME_Particle_AB.mtl`
- Create: `VFXBrowser/assets/materials/IKAME_Particle_ADD.mtl`

These are the two core particle shaders ported from Unity. They are Cocos Creator `.effect` files (GLSL) stored in the project's `assets/` folder, available to the importer.

**Unity shader features ported (core set):**
- MainTex sampling with UV panning (`_SpeedMainTexUVNoiseZW.xy`)
- Noise texture sampling with separate UV panning (`_SpeedMainTexUVNoiseZW.zw`)
- Mask texture for center glow (toggle `_Usecenterglow`)
- Vertex color multiplication
- Emission multiplier
- Tint color (`_Color`)
- AB: `Blend SrcAlpha OneMinusSrcAlpha`, alpha = mainTex.a Ã— noise.a Ã— color.a Ã— vtx.a Ã— opacity
- ADD: `Blend One One`, pre-multiplied alpha into RGB

**Not ported (out of scope):**
- Flow distortion texture
- Dissolve / Alpha Glow (`_UseAGlow`, `_DissovleSmooth`)
- Soft Particles (depth-based fade)
- Custom UV Offset from TEXCOORD2

- [ ] **Step 1: Create IKAME_Particle_AB.effect**

```yaml
// VFXBrowser/assets/effects/IKAME_Particle_AB.effect
CCEffect %{
  techniques:
  - name: default
    passes:
    - vert: particle-vs:vert
      frag: particle-fs:frag
      blendState:
        targets:
        - blend: true
          blendSrc: src_alpha
          blendDst: one_minus_src_alpha
          blendSrcAlpha: src_alpha
          blendDstAlpha: one_minus_src_alpha
      rasterizerState:
        cullMode: none
      depthStencilState:
        depthTest: true
        depthWrite: false
      properties:
        mainTexture:    { value: white }
        noiseTexture:   { value: white }
        maskTexture:    { value: white }
        mainColor:      { value: [1, 1, 1, 1], editor: { type: color } }
        emission:       { value: 1.0 }
        opacity:        { value: 1.0 }
        useCenterGlow:  { value: 0.0 }
        speedMainTexUV: { value: [0, 0, 0, 0] }
        mainTiling:     { value: [1, 1] }
        mainOffset:     { value: [0, 0] }
}%

CCProgram particle-vs %{
  precision highp float;
  #include <cc-global>

  in vec3 a_position;
  in vec4 a_color;
  in vec2 a_texCoord;

  out vec4 v_color;
  out vec2 v_uv;
  out vec2 v_uvNoise;

  uniform Constants {
    vec4 mainColor;
    vec4 speedMainTexUV;
    vec2 mainTiling;
    vec2 mainOffset;
    float emission;
    float opacity;
    float useCenterGlow;
  };

  vec4 vert() {
    vec4 pos = cc_matViewProj * cc_matWorld * vec4(a_position, 1.0);
    v_color = a_color;
    v_uv = a_texCoord * mainTiling + mainOffset + speedMainTexUV.xy * cc_time.x;
    v_uvNoise = a_texCoord + speedMainTexUV.zw * cc_time.x;
    return pos;
  }
}%

CCProgram particle-fs %{
  precision highp float;

  in vec4 v_color;
  in vec2 v_uv;
  in vec2 v_uvNoise;

  uniform sampler2D mainTexture;
  uniform sampler2D noiseTexture;
  uniform sampler2D maskTexture;

  uniform Constants {
    vec4 mainColor;
    vec4 speedMainTexUV;
    vec2 mainTiling;
    vec2 mainOffset;
    float emission;
    float opacity;
    float useCenterGlow;
  };

  vec4 frag() {
    vec4 mainTex = texture(mainTexture, v_uv);
    vec4 noiseTex = texture(noiseTexture, v_uvNoise);
    vec4 maskTex = texture(maskTexture, v_uv);

    vec3 color = mainTex.rgb * noiseTex.rgb * mainColor.rgb * v_color.rgb;

    // Center glow: multiply by mask
    if (useCenterGlow > 0.5) {
      color *= clamp(maskTex.rgb, vec3(0.0), vec3(1.0));
    }

    color *= emission;

    float alpha = mainTex.a * noiseTex.a * mainColor.a * v_color.a * opacity;

    return vec4(color, alpha);
  }
}%
```

- [ ] **Step 2: Create IKAME_Particle_ADD.effect**

```yaml
// VFXBrowser/assets/effects/IKAME_Particle_ADD.effect
CCEffect %{
  techniques:
  - name: default
    passes:
    - vert: particle-vs:vert
      frag: particle-fs:frag
      blendState:
        targets:
        - blend: true
          blendSrc: one
          blendDst: one
          blendSrcAlpha: one
          blendDstAlpha: one
      rasterizerState:
        cullMode: none
      depthStencilState:
        depthTest: true
        depthWrite: false
      properties:
        mainTexture:    { value: white }
        noiseTexture:   { value: white }
        maskTexture:    { value: white }
        mainColor:      { value: [1, 1, 1, 1], editor: { type: color } }
        emission:       { value: 1.0 }
        useCenterGlow:  { value: 0.0 }
        speedMainTexUV: { value: [0, 0, 0, 0] }
        mainTiling:     { value: [1, 1] }
        mainOffset:     { value: [0, 0] }
}%

CCProgram particle-vs %{
  precision highp float;
  #include <cc-global>

  in vec3 a_position;
  in vec4 a_color;
  in vec2 a_texCoord;

  out vec4 v_color;
  out vec2 v_uv;
  out vec2 v_uvNoise;

  uniform Constants {
    vec4 mainColor;
    vec4 speedMainTexUV;
    vec2 mainTiling;
    vec2 mainOffset;
    float emission;
    float useCenterGlow;
  };

  vec4 vert() {
    vec4 pos = cc_matViewProj * cc_matWorld * vec4(a_position, 1.0);
    v_color = a_color;
    v_uv = a_texCoord * mainTiling + mainOffset + speedMainTexUV.xy * cc_time.x;
    v_uvNoise = a_texCoord + speedMainTexUV.zw * cc_time.x;
    return pos;
  }
}%

CCProgram particle-fs %{
  precision highp float;

  in vec4 v_color;
  in vec2 v_uv;
  in vec2 v_uvNoise;

  uniform sampler2D mainTexture;
  uniform sampler2D noiseTexture;
  uniform sampler2D maskTexture;

  uniform Constants {
    vec4 mainColor;
    vec4 speedMainTexUV;
    vec2 mainTiling;
    vec2 mainOffset;
    float emission;
    float useCenterGlow;
  };

  vec4 frag() {
    vec4 mainTex = texture(mainTexture, v_uv);
    vec4 noiseTex = texture(noiseTexture, v_uvNoise);
    vec4 maskTex = texture(maskTexture, v_uv);

    // Additive: pre-multiply alpha into color
    vec3 color = mainTex.rgb * noiseTex.rgb * mainColor.rgb * v_color.rgb;
    float alpha = mainTex.a * noiseTex.a * mainColor.a * v_color.a;

    color *= alpha;

    // Center glow: multiply by mask
    if (useCenterGlow > 0.5) {
      color *= clamp(maskTex.rgb, vec3(0.0), vec3(1.0));
    }

    color *= emission;

    return vec4(color, 1.0);
  }
}%
```

- [ ] **Step 3: Create default material files**

Materials in Cocos Creator are JSON files referencing an effect. Create them manually â€” Cocos will generate `.meta` files when the editor opens.

`VFXBrowser/assets/materials/IKAME_Particle_AB.mtl`:
```json
{
  "__type__": "cc.Material",
  "_name": "IKAME_Particle_AB",
  "_effectAsset": null,
  "_techIdx": 0,
  "_defines": [{}],
  "_states": [{}],
  "_props": [{}]
}
```

`VFXBrowser/assets/materials/IKAME_Particle_ADD.mtl`:
```json
{
  "__type__": "cc.Material",
  "_name": "IKAME_Particle_ADD",
  "_effectAsset": null,
  "_techIdx": 0,
  "_defines": [{}],
  "_states": [{}],
  "_props": [{}]
}
```

> **Note:** The `_effectAsset` UUID will be auto-resolved by Cocos Creator when the project opens. After first open, set the effect reference in the editor Inspector: IKAME_Particle_AB.mtl â†’ IKAME_Particle_AB.effect, IKAME_Particle_ADD.mtl â†’ IKAME_Particle_ADD.effect. Then re-commit the `.mtl` files with resolved UUIDs.

- [ ] **Step 4: Open project in Cocos Creator to generate .meta files**

Open `VFXBrowser` project in Cocos Creator 3.8.8. The editor will:
1. Generate `.meta` files for all new assets
2. Compile the `.effect` files â€” check the console for shader compile errors
3. Fix any GLSL syntax errors if reported

- [ ] **Step 5: Wire materials in Inspector**

1. Select `IKAME_Particle_AB.mtl` in the Assets panel
2. Set Effect to `IKAME_Particle_AB`
3. Select `IKAME_Particle_ADD.mtl` in the Assets panel
4. Set Effect to `IKAME_Particle_ADD`
5. Save both materials

- [ ] **Step 6: Commit**

```bash
git add VFXBrowser/assets/effects/ VFXBrowser/assets/materials/
git commit -m "feat(cocos): add IKAME_Particle_AB/ADD effect shaders ported from Unity"
```

---

### Task 3: Shared Types & JSON Helpers (was Task 2)

**Files:**
- Create: `VFXBrowser/extensions/ikame-vfx-browser/src/mappers/types.ts`
- Create: `VFXBrowser/extensions/ikame-vfx-browser/src/utils/json-helpers.ts`

- [ ] **Step 1: Create mappers/types.ts**

```typescript
'use strict';

/** A single entry in the import review list */
export interface ImportEntry {
    guid: string;
    name: string;
    type: 'texture' | 'material' | 'mesh' | 'shader';
    status: 'new' | 'exists';
    existingPath?: string;
    selected: boolean;
    data?: Buffer;
    metadata?: Record<string, any>;
}

/** Data passed from Browser panel â†’ Import Review panel */
export interface ImportReviewData {
    prefabName: string;
    vfxId: string;
    importFolder: string;
    particleJson: Record<string, any>;
    entries: ImportEntry[];
}

/** Data passed from Import Review â†’ Importer after user confirms */
export interface ImportExecuteData {
    prefabName: string;
    vfxId: string;
    importFolder: string;
    particleJson: Record<string, any>;
    entries: ImportEntry[];
    serverUrl: string;
}

/** Context passed to each module mapper */
export interface MapperContext {
    nodeName: string;
    textures: Map<string, string>;   // Unity GUID â†’ db:// asset path
    meshes: Map<string, string>;     // Unity GUID â†’ db:// asset path
    materials: Map<string, string>;  // Unity GUID â†’ db:// asset path
    importFolder: string;
    warnings: string[];
}

/** Signature for a module mapper function */
export type ModuleMapper = (
    moduleJson: Record<string, any>,
    ctx: MapperContext
) => Record<string, any>;

/** Catalog item from server */
export interface CatalogItem {
    id: string;
    name: string;
    category: string;
    fileSize: number;
    particleCount: number;
    uploadedAt: string;
}

/** Catalog response from server */
export interface CatalogResponse {
    version: number;
    categories: string[];
    items: CatalogItem[];
}

/** Import result summary */
export interface ImportResult {
    success: boolean;
    prefabName: string;
    nodesCreated: number;
    texturesImported: number;
    materialsCreated: number;
    meshesImported: number;
    warnings: string[];
    error?: string;
}
```

- [ ] **Step 2: Create utils/json-helpers.ts**

```typescript
'use strict';

/** Safely get a string value from a JSON object */
export function getString(obj: Record<string, any>, key: string, fallback: string = ''): string {
    const val = obj[key];
    return typeof val === 'string' ? val : fallback;
}

/** Safely get a number value from a JSON object */
export function getFloat(obj: Record<string, any>, key: string, fallback: number = 0): number {
    const val = obj[key];
    return typeof val === 'number' ? val : fallback;
}

/** Safely get an integer value from a JSON object */
export function getInt(obj: Record<string, any>, key: string, fallback: number = 0): number {
    const val = obj[key];
    return typeof val === 'number' ? Math.round(val) : fallback;
}

/** Safely get a boolean value from a JSON object */
export function getBool(obj: Record<string, any>, key: string, fallback: boolean = false): boolean {
    const val = obj[key];
    return typeof val === 'boolean' ? val : fallback;
}

/** Safely get a nested object from a JSON object */
export function getObj(obj: Record<string, any>, key: string): Record<string, any> | null {
    const val = obj[key];
    return val && typeof val === 'object' && !Array.isArray(val) ? val : null;
}

/** Safely get an array from a JSON object */
export function getArr(obj: Record<string, any>, key: string): any[] {
    const val = obj[key];
    return Array.isArray(val) ? val : [];
}

/** Get a Vec3 from a JSON array [x,y,z] */
export function getVec3(obj: Record<string, any>, key: string): { x: number; y: number; z: number } {
    const arr = obj[key];
    if (Array.isArray(arr) && arr.length >= 3) {
        return { x: arr[0] || 0, y: arr[1] || 0, z: arr[2] || 0 };
    }
    return { x: 0, y: 0, z: 0 };
}

/** Get a Quaternion from a JSON array [x,y,z,w] */
export function getQuat(obj: Record<string, any>, key: string): { x: number; y: number; z: number; w: number } {
    const arr = obj[key];
    if (Array.isArray(arr) && arr.length >= 4) {
        return { x: arr[0] || 0, y: arr[1] || 0, z: arr[2] || 0, w: arr[3] || 1 };
    }
    return { x: 0, y: 0, z: 0, w: 1 };
}

/** Get a Color from a JSON array [r,g,b,a] (0-1 range) */
export function getColor(obj: Record<string, any>, key: string): { r: number; g: number; b: number; a: number } {
    const arr = obj[key];
    if (Array.isArray(arr) && arr.length >= 4) {
        return { r: arr[0] || 0, g: arr[1] || 0, b: arr[2] || 0, a: arr[3] || 1 };
    }
    return { r: 1, g: 1, b: 1, a: 1 };
}

/** Check if a module JSON has enabled: true */
export function isModuleEnabled(obj: Record<string, any>): boolean {
    return getBool(obj, 'enabled', false);
}
```

- [ ] **Step 3: Compile check**

```bash
cd VFXBrowser/extensions/ikame-vfx-browser
npx tsc --noEmit src/mappers/types.ts src/utils/json-helpers.ts
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add VFXBrowser/extensions/ikame-vfx-browser/src/mappers/types.ts
git add VFXBrowser/extensions/ikame-vfx-browser/src/utils/json-helpers.ts
git commit -m "feat(cocos): add shared types and JSON helper utilities"
```

---

### Task 4: Curve & Gradient Converters

**Files:**
- Create: `VFXBrowser/extensions/ikame-vfx-browser/src/utils/curve-converter.ts`
- Create: `VFXBrowser/extensions/ikame-vfx-browser/src/utils/gradient-converter.ts`

- [ ] **Step 1: Create utils/curve-converter.ts**

This converts Unity's MinMaxCurve JSON into a plain object describing Cocos CurveRange properties. The actual Cocos `cc.CurveRange` instantiation happens in the scene script (which has access to `cc.*`), so here we output serializable data.

```typescript
'use strict';

import { getString, getFloat, getArr } from './json-helpers';

/**
 * Curve mode constants matching Cocos Creator's CurveRange.mode values.
 * See: cc.CurveRange in Cocos Creator engine source.
 */
export const CurveMode = {
    Constant: 0,
    Curve: 1,
    TwoConstants: 2,
    TwoCurves: 3,
} as const;

/**
 * Converts a Unity MinMaxCurve JSON object into a serializable
 * Cocos CurveRange descriptor.
 *
 * Input format (from ParticleJsonExporter.cs):
 *   constant:                    { mode: "constant", value: N }
 *   curve:                       { mode: "curve", curve: [[t,v],...], multiplier: N }
 *   randomBetweenTwoConstants:   { mode: "randomBetweenTwoConstants", min: N, max: N }
 *   randomBetweenTwoCurves:      { mode: "randomBetweenTwoCurves", curveMin: [[t,v],...], curveMax: [[t,v],...], multiplier: N }
 */
export function convertCurve(json: Record<string, any>): Record<string, any> {
    if (!json || typeof json !== 'object') {
        return { mode: CurveMode.Constant, constant: 0 };
    }

    const mode = getString(json, 'mode', 'constant');

    switch (mode) {
        case 'constant':
            return {
                mode: CurveMode.Constant,
                constant: getFloat(json, 'value', 0),
            };

        case 'curve': {
            const keyframes = convertKeyframes(getArr(json, 'curve'));
            const multiplier = getFloat(json, 'multiplier', 1);
            return {
                mode: CurveMode.Curve,
                spline: { keyframes },
                multiplier,
            };
        }

        case 'randomBetweenTwoConstants':
            return {
                mode: CurveMode.TwoConstants,
                constantMin: getFloat(json, 'min', 0),
                constantMax: getFloat(json, 'max', 0),
            };

        case 'randomBetweenTwoCurves': {
            const keyframesMin = convertKeyframes(getArr(json, 'curveMin'));
            const keyframesMax = convertKeyframes(getArr(json, 'curveMax'));
            const multiplier = getFloat(json, 'multiplier', 1);
            return {
                mode: CurveMode.TwoCurves,
                splineMin: { keyframes: keyframesMin },
                splineMax: { keyframes: keyframesMax },
                multiplier,
            };
        }

        default:
            return { mode: CurveMode.Constant, constant: 0 };
    }
}

/**
 * Converts Unity keyframe array [[time, value], ...] into
 * Cocos-compatible keyframe objects { time, value, inTangent, outTangent }.
 * Unity export has no tangent data, so we use 0 (linear-ish).
 */
function convertKeyframes(arr: any[]): Array<{ time: number; value: number; inTangent: number; outTangent: number }> {
    if (!Array.isArray(arr) || arr.length === 0) {
        return [{ time: 0, value: 0, inTangent: 0, outTangent: 0 }];
    }
    return arr.map((kf: any) => {
        const time = Array.isArray(kf) ? (kf[0] || 0) : 0;
        const value = Array.isArray(kf) ? (kf[1] || 0) : 0;
        return { time, value, inTangent: 0, outTangent: 0 };
    });
}

/**
 * Shortcut: extract a constant float from a MinMaxCurve JSON.
 * If the curve is not constant mode, returns the value/constantMax/first keyframe value.
 */
export function curveToConstant(json: Record<string, any>): number {
    if (!json || typeof json !== 'object') return 0;
    const mode = getString(json, 'mode', 'constant');
    switch (mode) {
        case 'constant':
            return getFloat(json, 'value', 0);
        case 'randomBetweenTwoConstants':
            return getFloat(json, 'max', 0);
        case 'curve': {
            const curve = getArr(json, 'curve');
            if (curve.length > 0 && Array.isArray(curve[0])) {
                return (curve[0][1] || 0) * getFloat(json, 'multiplier', 1);
            }
            return 0;
        }
        default:
            return 0;
    }
}
```

- [ ] **Step 2: Create utils/gradient-converter.ts**

```typescript
'use strict';

import { getString, getArr, getColor } from './json-helpers';

/**
 * Gradient mode constants matching Cocos Creator's GradientRange.mode values.
 */
export const GradientMode = {
    Color: 0,
    Gradient: 1,
    TwoColors: 2,
    TwoGradients: 3,
    RandomColor: 4,
} as const;

/**
 * Converts a Unity MinMaxGradient JSON object into a serializable
 * Cocos GradientRange descriptor.
 *
 * Input format (from ParticleJsonExporter.cs):
 *   color:                       { mode: "color", value: [r,g,b,a] }
 *   gradient:                    { mode: "gradient", gradient: { colorKeys: [[t,[r,g,b,a]],...], alphaKeys: [[t,a],...] } }
 *   randomBetweenTwoColors:      { mode: "randomBetweenTwoColors", min: [r,g,b,a], max: [r,g,b,a] }
 *   randomBetweenTwoGradients:   { mode: "randomBetweenTwoGradients", gradientMin: {...}, gradientMax: {...} }
 *   randomColor:                 { mode: "randomColor", gradient: {...} }
 */
export function convertGradient(json: Record<string, any>): Record<string, any> {
    if (!json || typeof json !== 'object') {
        return { mode: GradientMode.Color, color: { r: 255, g: 255, b: 255, a: 255 } };
    }

    const mode = getString(json, 'mode', 'color');

    switch (mode) {
        case 'color':
            return {
                mode: GradientMode.Color,
                color: toCocos255(getColor(json, 'value')),
            };

        case 'gradient':
            return {
                mode: GradientMode.Gradient,
                gradient: convertGradientObj(json['gradient']),
            };

        case 'randomBetweenTwoColors':
            return {
                mode: GradientMode.TwoColors,
                colorMin: toCocos255(getColor(json, 'min')),
                colorMax: toCocos255(getColor(json, 'max')),
            };

        case 'randomBetweenTwoGradients':
            return {
                mode: GradientMode.TwoGradients,
                gradientMin: convertGradientObj(json['gradientMin']),
                gradientMax: convertGradientObj(json['gradientMax']),
            };

        case 'randomColor':
            return {
                mode: GradientMode.RandomColor,
                gradient: convertGradientObj(json['gradient']),
            };

        default:
            return { mode: GradientMode.Color, color: { r: 255, g: 255, b: 255, a: 255 } };
    }
}

/**
 * Converts a Unity Gradient JSON into Cocos-compatible gradient descriptor.
 * Unity format: { colorKeys: [[time, [r,g,b,a]], ...], alphaKeys: [[time, alpha], ...] }
 * Cocos format: { colorKeys: [{ time, color: {r,g,b,a} }], alphaKeys: [{ time, alpha }] }
 */
function convertGradientObj(gradJson: any): Record<string, any> {
    if (!gradJson || typeof gradJson !== 'object') {
        return {
            colorKeys: [{ time: 0, color: { r: 255, g: 255, b: 255, a: 255 } }],
            alphaKeys: [{ time: 0, alpha: 255 }],
        };
    }

    const colorKeysRaw = getArr(gradJson, 'colorKeys');
    const alphaKeysRaw = getArr(gradJson, 'alphaKeys');

    const colorKeys = colorKeysRaw.map((ck: any) => {
        if (!Array.isArray(ck) || ck.length < 2) {
            return { time: 0, color: { r: 255, g: 255, b: 255, a: 255 } };
        }
        const time = ck[0] || 0;
        const c = Array.isArray(ck[1]) ? ck[1] : [1, 1, 1, 1];
        return {
            time,
            color: {
                r: Math.round((c[0] || 0) * 255),
                g: Math.round((c[1] || 0) * 255),
                b: Math.round((c[2] || 0) * 255),
                a: Math.round((c[3] || 1) * 255),
            },
        };
    });

    const alphaKeys = alphaKeysRaw.map((ak: any) => {
        if (!Array.isArray(ak) || ak.length < 2) {
            return { time: 0, alpha: 255 };
        }
        return {
            time: ak[0] || 0,
            alpha: Math.round((ak[1] || 1) * 255),
        };
    });

    return {
        colorKeys: colorKeys.length > 0 ? colorKeys : [{ time: 0, color: { r: 255, g: 255, b: 255, a: 255 } }],
        alphaKeys: alphaKeys.length > 0 ? alphaKeys : [{ time: 0, alpha: 255 }],
    };
}

/**
 * Converts a Unity color (0-1 range) to Cocos color (0-255 range).
 */
function toCocos255(c: { r: number; g: number; b: number; a: number }): { r: number; g: number; b: number; a: number } {
    return {
        r: Math.round(c.r * 255),
        g: Math.round(c.g * 255),
        b: Math.round(c.b * 255),
        a: Math.round(c.a * 255),
    };
}

/**
 * Shortcut: extract a constant color from a MinMaxGradient JSON.
 */
export function gradientToConstantColor(json: Record<string, any>): { r: number; g: number; b: number; a: number } {
    if (!json || typeof json !== 'object') return { r: 255, g: 255, b: 255, a: 255 };
    const mode = getString(json, 'mode', 'color');
    if (mode === 'color') {
        return toCocos255(getColor(json, 'value'));
    }
    return { r: 255, g: 255, b: 255, a: 255 };
}
```

- [ ] **Step 3: Commit**

```bash
git add VFXBrowser/extensions/ikame-vfx-browser/src/utils/
git commit -m "feat(cocos): add curve and gradient converters for Unityâ†’Cocos mapping"
```

---

### Task 5: API Service

**Files:**
- Create: `VFXBrowser/extensions/ikame-vfx-browser/src/services/api.ts`

- [ ] **Step 1: Create services/api.ts**

```typescript
'use strict';

import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';
import { CatalogResponse } from '../mappers/types';

export class VFXApiClient {
    private serverUrl: string;

    constructor(serverUrl: string) {
        // Remove trailing slash
        this.serverUrl = serverUrl.replace(/\/+$/, '');
    }

    /** Fetch the full VFX catalog */
    async fetchCatalog(): Promise<CatalogResponse> {
        const data = await this.getJson(`${this.serverUrl}/api/vfx/catalog`);
        return data as CatalogResponse;
    }

    /** Download particle.json for a VFX item */
    async downloadParticleJson(vfxId: string): Promise<Record<string, any>> {
        const data = await this.getJson(`${this.serverUrl}/api/vfx/${encodeURIComponent(vfxId)}/particle-json`);
        return data as Record<string, any>;
    }

    /** Download asset binary (texture or mesh) */
    async downloadAssetBinary(guid: string): Promise<Buffer> {
        return this.getBuffer(`${this.serverUrl}/api/assets/${encodeURIComponent(guid)}`);
    }

    /** Download asset metadata JSON (for materials) */
    async downloadAssetMeta(guid: string): Promise<Record<string, any>> {
        const data = await this.getJson(`${this.serverUrl}/api/assets/${encodeURIComponent(guid)}/meta`);
        return data as Record<string, any>;
    }

    /** Check if an asset exists on the server */
    async assetExists(guid: string): Promise<boolean> {
        return new Promise((resolve) => {
            const url = new URL(`${this.serverUrl}/api/assets/${encodeURIComponent(guid)}`);
            const mod = url.protocol === 'https:' ? https : http;
            const req = mod.request(url, { method: 'HEAD' }, (res) => {
                resolve(res.statusCode === 200);
            });
            req.on('error', () => resolve(false));
            req.end();
        });
    }

    /** GET request returning parsed JSON */
    private getJson(urlStr: string): Promise<any> {
        return new Promise((resolve, reject) => {
            const url = new URL(urlStr);
            const mod = url.protocol === 'https:' ? https : http;
            const req = mod.get(url, (res) => {
                if (res.statusCode && res.statusCode >= 400) {
                    reject(new Error(`HTTP ${res.statusCode} from ${urlStr}`));
                    res.resume();
                    return;
                }
                const chunks: Buffer[] = [];
                res.on('data', (chunk: Buffer) => chunks.push(chunk));
                res.on('end', () => {
                    try {
                        const body = Buffer.concat(chunks).toString('utf-8');
                        resolve(JSON.parse(body));
                    } catch (err: any) {
                        reject(new Error(`JSON parse error from ${urlStr}: ${err.message}`));
                    }
                });
            });
            req.on('error', (err) => reject(new Error(`Network error: ${err.message}`)));
        });
    }

    /** GET request returning raw Buffer */
    private getBuffer(urlStr: string): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            const url = new URL(urlStr);
            const mod = url.protocol === 'https:' ? https : http;
            const req = mod.get(url, (res) => {
                if (res.statusCode && res.statusCode >= 400) {
                    reject(new Error(`HTTP ${res.statusCode} from ${urlStr}`));
                    res.resume();
                    return;
                }
                const chunks: Buffer[] = [];
                res.on('data', (chunk: Buffer) => chunks.push(chunk));
                res.on('end', () => resolve(Buffer.concat(chunks)));
            });
            req.on('error', (err) => reject(new Error(`Network error: ${err.message}`)));
        });
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add VFXBrowser/extensions/ikame-vfx-browser/src/services/api.ts
git commit -m "feat(cocos): add VFXApiClient HTTP service for server communication"
```

---

### Task 6: Module Mappers â€” Skip/Warn + Supported Modules

**Files:**
- Create: `VFXBrowser/extensions/ikame-vfx-browser/src/mappers/skip-warn.ts`
- Create: `VFXBrowser/extensions/ikame-vfx-browser/src/mappers/main.ts`
- Create: `VFXBrowser/extensions/ikame-vfx-browser/src/mappers/emission.ts`
- Create: `VFXBrowser/extensions/ikame-vfx-browser/src/mappers/shape.ts`
- Create: `VFXBrowser/extensions/ikame-vfx-browser/src/mappers/velocity-over-lifetime.ts`
- Create: `VFXBrowser/extensions/ikame-vfx-browser/src/mappers/limit-velocity.ts`
- Create: `VFXBrowser/extensions/ikame-vfx-browser/src/mappers/force-over-lifetime.ts`
- Create: `VFXBrowser/extensions/ikame-vfx-browser/src/mappers/color-over-lifetime.ts`
- Create: `VFXBrowser/extensions/ikame-vfx-browser/src/mappers/size-over-lifetime.ts`
- Create: `VFXBrowser/extensions/ikame-vfx-browser/src/mappers/rotation-over-lifetime.ts`
- Create: `VFXBrowser/extensions/ikame-vfx-browser/src/mappers/texture-sheet.ts`
- Create: `VFXBrowser/extensions/ikame-vfx-browser/src/mappers/trails.ts`
- Create: `VFXBrowser/extensions/ikame-vfx-browser/src/mappers/renderer.ts`
- Create: `VFXBrowser/extensions/ikame-vfx-browser/src/mappers/index.ts`

This is a large task. The mapper files are small and repetitive â€” each reads a module JSON section and returns a property descriptor object. The actual `cc.*` API calls happen in the scene script (Task 7), not here.

- [ ] **Step 1: Create mappers/skip-warn.ts**

```typescript
'use strict';

import { MapperContext } from './types';

/** Creates a mapper that skips the module and logs a warning */
export function createSkipMapper(moduleName: string, reason: string) {
    return function skipMapper(_moduleJson: Record<string, any>, ctx: MapperContext): Record<string, any> {
        ctx.warnings.push(`Node "${ctx.nodeName}": ${moduleName} (${reason})`);
        return { _skipped: true, moduleName, reason };
    };
}
```

- [ ] **Step 2: Create mappers/main.ts**

```typescript
'use strict';

import { MapperContext } from './types';
import { getFloat, getBool, getString, getInt } from '../utils/json-helpers';
import { convertCurve, curveToConstant } from '../utils/curve-converter';
import { gradientToConstantColor } from '../utils/gradient-converter';

/**
 * Maps Unity mainModule â†’ Cocos ParticleSystem3D root properties.
 *
 * Unity JSON keys (from ParticleJsonExporter):
 *   duration, looping, startDelay, startLifetime, startSpeed,
 *   startSize, startSize3D, startSizeX/Y/Z,
 *   startRotation, startRotation3D, startRotationX/Y/Z,
 *   startColor, gravityModifier, simulationSpace, scalingMode,
 *   playOnAwake, maxParticles
 */
export function mapMain(json: Record<string, any>, ctx: MapperContext): Record<string, any> {
    const result: Record<string, any> = {
        duration: getFloat(json, 'duration', 5),
        loop: getBool(json, 'looping', true),
        playOnAwake: getBool(json, 'playOnAwake', true),
        capacity: getInt(json, 'maxParticles', 1000),
        startDelay: convertCurve(json['startDelay']),
        startLifetime: convertCurve(json['startLifetime']),
        startSpeed: convertCurve(json['startSpeed']),
        startSize: convertCurve(json['startSize']),
        startColor: gradientToConstantColor(json['startColor']),
        gravityModifier: convertCurve(json['gravityModifier']),
        simulationSpace: mapSimulationSpace(getString(json, 'simulationSpace', 'local')),
        scaleSpace: mapScaleMode(getString(json, 'scalingMode', 'Local')),
    };

    // 3D start size
    if (getBool(json, 'startSize3D', false)) {
        result.startSizeX = convertCurve(json['startSizeX']);
        result.startSizeY = convertCurve(json['startSizeY']);
        result.startSizeZ = convertCurve(json['startSizeZ']);
    }

    // 3D start rotation
    if (getBool(json, 'startRotation3D', false)) {
        result.startRotationX = convertCurve(json['startRotationX']);
        result.startRotationY = convertCurve(json['startRotationY']);
        result.startRotationZ = convertCurve(json['startRotationZ']);
    } else {
        // Unity uses radians, Cocos uses degrees
        result.startRotationZ = convertCurve(json['startRotation']);
    }

    return result;
}

function mapSimulationSpace(space: string): number {
    switch (space) {
        case 'world': return 1;  // cc.ParticleSystem.Space.World
        case 'local': return 0;  // cc.ParticleSystem.Space.Local
        default: return 0;
    }
}

function mapScaleMode(mode: string): number {
    switch (mode) {
        case 'Local': return 0;
        case 'Hierarchy': return 1;
        case 'Shape': return 2;
        default: return 0;
    }
}
```

- [ ] **Step 3: Create mappers/emission.ts**

```typescript
'use strict';

import { MapperContext } from './types';
import { getFloat, getArr } from '../utils/json-helpers';
import { convertCurve } from '../utils/curve-converter';

/**
 * Maps Unity emissionModule â†’ Cocos emission properties.
 *
 * Unity JSON keys: enabled, rateOverTime, rateOverDistance, bursts[]
 * Burst: { time, count (MinMaxCurve), cycles, interval, probability }
 */
export function mapEmission(json: Record<string, any>, ctx: MapperContext): Record<string, any> {
    const bursts = getArr(json, 'bursts').map((b: any) => ({
        time: getFloat(b, 'time', 0),
        repeatCount: Math.max(0, (b.cycles || 1) - 1),
        repeatInterval: getFloat(b, 'interval', 0.01),
        count: convertCurve(b['count']),
    }));

    return {
        rateOverTime: convertCurve(json['rateOverTime']),
        rateOverDistance: convertCurve(json['rateOverDistance']),
        bursts,
    };
}
```

- [ ] **Step 4: Create mappers/shape.ts**

```typescript
'use strict';

import { MapperContext } from './types';
import { getString, getFloat, getBool } from '../utils/json-helpers';
import { getVec3 } from '../utils/json-helpers';

/**
 * Maps Unity shapeModule â†’ Cocos ShapeModule.
 *
 * Unity shape types: Sphere, Hemisphere, Cone, Box, Circle, Edge,
 *   Donut, Mesh, MeshRenderer, SkinnedMeshRenderer, Rectangle, Sprite
 *
 * Cocos shape types: Box(0), Circle(1), Cone(2), Sphere(3), Hemisphere(4)
 */
export function mapShape(json: Record<string, any>, ctx: MapperContext): Record<string, any> {
    const unityShape = getString(json, 'shapeType', 'Cone');
    const { cocosType, fallbackWarning } = mapShapeType(unityShape);

    if (fallbackWarning) {
        ctx.warnings.push(`Node "${ctx.nodeName}": Shape type "${unityShape}" â†’ fallback to ${fallbackWarning}`);
    }

    const result: Record<string, any> = {
        shapeType: cocosType,
        radius: getFloat(json, 'radius', 1),
        radiusThickness: getFloat(json, 'radiusThickness', 1),
        angle: getFloat(json, 'angle', 25),
        arc: getFloat(json, 'arc', 360),
        arcMode: mapArcMode(getString(json, 'arcMode', 'Random')),
        position: getVec3(json, 'position'),
        rotation: getVec3(json, 'rotation'),
        scale: getVec3(json, 'scale'),
        alignToDirection: getBool(json, 'alignToDirection', false),
    };

    return result;
}

function mapShapeType(unityType: string): { cocosType: number; fallbackWarning?: string } {
    switch (unityType) {
        case 'Box':             return { cocosType: 0 };
        case 'Circle':          return { cocosType: 1 };
        case 'Cone':            return { cocosType: 2 };
        case 'Sphere':          return { cocosType: 3 };
        case 'Hemisphere':      return { cocosType: 4 };
        case 'Donut':           return { cocosType: 1, fallbackWarning: 'Circle' };
        case 'Edge':            return { cocosType: 0, fallbackWarning: 'Box' };
        case 'Rectangle':       return { cocosType: 0, fallbackWarning: 'Box' };
        case 'Mesh':            return { cocosType: 0, fallbackWarning: 'Box' };
        case 'MeshRenderer':    return { cocosType: 0, fallbackWarning: 'Box' };
        case 'SkinnedMeshRenderer': return { cocosType: 0, fallbackWarning: 'Box' };
        case 'Sprite':          return { cocosType: 0, fallbackWarning: 'Box' };
        default:                return { cocosType: 2, fallbackWarning: 'Cone' };
    }
}

function mapArcMode(mode: string): number {
    switch (mode) {
        case 'Random':        return 0;
        case 'Loop':          return 1;
        case 'PingPong':      return 2;
        case 'BurstSpread':   return 3;
        default:              return 0;
    }
}
```

- [ ] **Step 5: Create mappers/velocity-over-lifetime.ts**

```typescript
'use strict';

import { MapperContext } from './types';
import { getString } from '../utils/json-helpers';
import { convertCurve, curveToConstant } from '../utils/curve-converter';

/**
 * Maps Unity velocityOverLifetimeModule â†’ Cocos VelocityOvertimeModule.
 * Orbital velocity has no Cocos equivalent â€” skip + warn.
 */
export function mapVelocityOverLifetime(json: Record<string, any>, ctx: MapperContext): Record<string, any> {
    // Check for orbital velocity usage
    const orbX = curveToConstant(json['orbitalX']);
    const orbY = curveToConstant(json['orbitalY']);
    const orbZ = curveToConstant(json['orbitalZ']);
    if (orbX !== 0 || orbY !== 0 || orbZ !== 0) {
        ctx.warnings.push(`Node "${ctx.nodeName}": VelocityOverLifetime.orbital (not supported in Cocos Creator)`);
    }

    return {
        x: convertCurve(json['x']),
        y: convertCurve(json['y']),
        z: convertCurve(json['z']),
        space: getString(json, 'space', 'local') === 'world' ? 1 : 0,
    };
}
```

- [ ] **Step 6: Create mappers/limit-velocity.ts**

```typescript
'use strict';

import { MapperContext } from './types';
import { getFloat, getBool } from '../utils/json-helpers';
import { convertCurve } from '../utils/curve-converter';

/**
 * Maps Unity limitVelocityOverLifetimeModule â†’ Cocos LimitVelocityOvertimeModule.
 */
export function mapLimitVelocity(json: Record<string, any>, ctx: MapperContext): Record<string, any> {
    const result: Record<string, any> = {
        speed: convertCurve(json['speed']),
        dampen: getFloat(json, 'dampen', 0),
        separateAxes: getBool(json, 'separateAxes', false),
    };

    if (result.separateAxes) {
        result.speedX = convertCurve(json['speedX']);
        result.speedY = convertCurve(json['speedY']);
        result.speedZ = convertCurve(json['speedZ']);
    }

    return result;
}
```

- [ ] **Step 7: Create mappers/force-over-lifetime.ts**

```typescript
'use strict';

import { MapperContext } from './types';
import { getString } from '../utils/json-helpers';
import { convertCurve } from '../utils/curve-converter';

/**
 * Maps Unity forceOverLifetimeModule â†’ Cocos ForceOvertimeModule.
 */
export function mapForceOverLifetime(json: Record<string, any>, ctx: MapperContext): Record<string, any> {
    return {
        x: convertCurve(json['x']),
        y: convertCurve(json['y']),
        z: convertCurve(json['z']),
        space: getString(json, 'space', 'local') === 'world' ? 1 : 0,
    };
}
```

- [ ] **Step 8: Create mappers/color-over-lifetime.ts**

```typescript
'use strict';

import { MapperContext } from './types';
import { convertGradient } from '../utils/gradient-converter';

/**
 * Maps Unity colorOverLifetimeModule â†’ Cocos ColorOvertimeModule.
 */
export function mapColorOverLifetime(json: Record<string, any>, ctx: MapperContext): Record<string, any> {
    return {
        color: convertGradient(json['color']),
    };
}
```

- [ ] **Step 9: Create mappers/size-over-lifetime.ts**

```typescript
'use strict';

import { MapperContext } from './types';
import { getBool } from '../utils/json-helpers';
import { convertCurve } from '../utils/curve-converter';

/**
 * Maps Unity sizeOverLifetimeModule â†’ Cocos SizeOvertimeModule.
 */
export function mapSizeOverLifetime(json: Record<string, any>, ctx: MapperContext): Record<string, any> {
    const result: Record<string, any> = {
        separateAxes: getBool(json, 'separateAxes', false),
        size: convertCurve(json['size']),
    };

    if (result.separateAxes) {
        result.x = convertCurve(json['x']);
        result.y = convertCurve(json['y']);
        result.z = convertCurve(json['z']);
    }

    return result;
}
```

- [ ] **Step 10: Create mappers/rotation-over-lifetime.ts**

```typescript
'use strict';

import { MapperContext } from './types';
import { getBool } from '../utils/json-helpers';
import { convertCurve } from '../utils/curve-converter';

/**
 * Maps Unity rotationOverLifetimeModule â†’ Cocos RotationOvertimeModule.
 * Unity uses radians, Cocos uses degrees â€” conversion happens in scene script.
 */
export function mapRotationOverLifetime(json: Record<string, any>, ctx: MapperContext): Record<string, any> {
    const result: Record<string, any> = {
        separateAxes: getBool(json, 'separateAxes', false),
        z: convertCurve(json['angularVelocity']),
    };

    if (result.separateAxes) {
        result.x = convertCurve(json['x']);
        result.y = convertCurve(json['y']);
        result.z = convertCurve(json['z']);
    }

    return result;
}
```

- [ ] **Step 11: Create mappers/texture-sheet.ts**

```typescript
'use strict';

import { MapperContext } from './types';
import { getString, getInt, getFloat } from '../utils/json-helpers';
import { convertCurve } from '../utils/curve-converter';

/**
 * Maps Unity textureSheetAnimationModule â†’ Cocos TextureAnimationModule.
 */
export function mapTextureSheet(json: Record<string, any>, ctx: MapperContext): Record<string, any> {
    const mode = getString(json, 'mode', 'grid');

    const result: Record<string, any> = {
        mode: mode === 'grid' ? 0 : 1,
        frameOverTime: convertCurve(json['frameOverTime']),
        cycleCount: getInt(json, 'cycleCount', 1),
        startFrame: convertCurve(json['startFrame']),
    };

    if (mode === 'grid') {
        result.numTilesX = getInt(json, 'numTilesX', 1);
        result.numTilesY = getInt(json, 'numTilesY', 1);
    } else {
        // Sprites mode: store sprite names for later mapping
        result.spriteNames = json['sprites'] || [];
    }

    return result;
}
```

- [ ] **Step 12: Create mappers/trails.ts**

```typescript
'use strict';

import { MapperContext } from './types';
import { getFloat, getBool } from '../utils/json-helpers';
import { convertCurve } from '../utils/curve-converter';
import { convertGradient } from '../utils/gradient-converter';

/**
 * Maps Unity trailModule â†’ Cocos TrailModule.
 */
export function mapTrails(json: Record<string, any>, ctx: MapperContext): Record<string, any> {
    return {
        ratio: convertCurve(json['ratio']),
        lifetime: convertCurve(json['lifetime']),
        minVertexDistance: getFloat(json, 'minVertexDistance', 0.2),
        worldSpace: getBool(json, 'worldSpace', false),
        dieWithParticles: getBool(json, 'dieWithParticles', true),
        widthRatio: convertCurve(json['widthOverTrail']),
        colorOverTrail: convertGradient(json['colorOverTrail']),
        colorOverLifetime: convertGradient(json['colorOverLifetime']),
    };
}
```

- [ ] **Step 13: Create mappers/renderer.ts**

```typescript
'use strict';

import { MapperContext } from './types';
import { getString, getFloat, getInt } from '../utils/json-helpers';

/**
 * Maps Unity rendererModule â†’ Cocos ParticleSystemRenderer properties.
 *
 * Unity renderMode values: Billboard, Stretch, HorizontalBillboard,
 *   VerticalBillboard, Mesh, None
 * Cocos renderMode values: Billboard(0), StretchedBillboard(1),
 *   HorizontalBillboard(2), VerticalBillboard(3), Mesh(4)
 */
export function mapRenderer(json: Record<string, any>, ctx: MapperContext): Record<string, any> {
    const renderMode = mapRenderMode(getString(json, 'renderMode', 'Billboard'));
    const meshId = getString(json, 'meshId', '');

    const result: Record<string, any> = {
        renderMode: renderMode.cocosMode,
        velocityScale: getFloat(json, 'velocityScale', 0),
        lengthScale: getFloat(json, 'lengthScale', 2),
        sortingFudge: getFloat(json, 'sortingFudge', 0),
    };

    if (renderMode.cocosMode === 4 && meshId) {
        // Mesh render mode â€” look up mesh in context
        const meshPath = ctx.meshes.get(meshId);
        if (meshPath) {
            result.meshUuid = meshId;
            result.meshPath = meshPath;
        } else {
            ctx.warnings.push(`Node "${ctx.nodeName}": Renderer mesh "${getString(json, 'meshName', '')}" not found in imported assets`);
        }
    }

    if (renderMode.warning) {
        ctx.warnings.push(`Node "${ctx.nodeName}": RenderMode "${getString(json, 'renderMode', '')}" â†’ ${renderMode.warning}`);
    }

    return result;
}

function mapRenderMode(mode: string): { cocosMode: number; warning?: string } {
    switch (mode) {
        case 'Billboard':            return { cocosMode: 0 };
        case 'Stretch':              return { cocosMode: 1 };
        case 'HorizontalBillboard':  return { cocosMode: 2 };
        case 'VerticalBillboard':    return { cocosMode: 3 };
        case 'Mesh':                 return { cocosMode: 4 };
        case 'None':                 return { cocosMode: 0, warning: 'fallback to Billboard' };
        default:                     return { cocosMode: 0, warning: `fallback to Billboard (unknown: ${mode})` };
    }
}
```

- [ ] **Step 14: Create mappers/index.ts â€” the registry**

```typescript
'use strict';

import { ModuleMapper, MapperContext } from './types';
import { mapMain } from './main';
import { mapEmission } from './emission';
import { mapShape } from './shape';
import { mapVelocityOverLifetime } from './velocity-over-lifetime';
import { mapLimitVelocity } from './limit-velocity';
import { mapForceOverLifetime } from './force-over-lifetime';
import { mapColorOverLifetime } from './color-over-lifetime';
import { mapSizeOverLifetime } from './size-over-lifetime';
import { mapRotationOverLifetime } from './rotation-over-lifetime';
import { mapTextureSheet } from './texture-sheet';
import { mapTrails } from './trails';
import { mapRenderer } from './renderer';
import { createSkipMapper } from './skip-warn';
import { isModuleEnabled } from '../utils/json-helpers';

const registry: Record<string, ModuleMapper> = {
    mainModule: mapMain,
    emissionModule: mapEmission,
    shapeModule: mapShape,
    velocityOverLifetimeModule: mapVelocityOverLifetime,
    limitVelocityOverLifetimeModule: mapLimitVelocity,
    inheritVelocityModule: createSkipMapper('Inherit Velocity', 'not supported in Cocos Creator'),
    forceOverLifetimeModule: mapForceOverLifetime,
    colorOverLifetimeModule: mapColorOverLifetime,
    sizeOverLifetimeModule: mapSizeOverLifetime,
    sizeBySpeedModule: createSkipMapper('Size by Speed', 'not supported in Cocos Creator'),
    rotationOverLifetimeModule: mapRotationOverLifetime,
    rotationBySpeedModule: createSkipMapper('Rotation by Speed', 'not supported in Cocos Creator'),
    noiseModule: createSkipMapper('Noise', 'not supported in Cocos Creator'),
    collisionModule: createSkipMapper('Collision', 'not supported in Cocos Creator'),
    subEmittersModule: createSkipMapper('Sub Emitters', 'not supported in Cocos Creator'),
    textureSheetAnimationModule: mapTextureSheet,
    trailModule: mapTrails,
    rendererModule: mapRenderer,
};

/** The list of all module keys the JSON exporter produces, in order */
export const ALL_MODULE_KEYS = Object.keys(registry);

/**
 * Map all enabled modules from a particleSystem JSON node.
 * Returns a map of moduleName â†’ mapped properties.
 */
export function mapAllModules(
    psJson: Record<string, any>,
    ctx: MapperContext
): Record<string, Record<string, any>> {
    const result: Record<string, Record<string, any>> = {};

    for (const [key, mapper] of Object.entries(registry)) {
        const moduleJson = psJson[key];
        if (!moduleJson) continue;

        // mainModule is always mapped (no enabled flag)
        if (key !== 'mainModule' && !isModuleEnabled(moduleJson)) continue;

        result[key] = mapper(moduleJson, ctx);
    }

    return result;
}

/**
 * Map a single module by name.
 */
export function mapModule(
    moduleName: string,
    moduleJson: Record<string, any>,
    ctx: MapperContext
): Record<string, any> | null {
    const mapper = registry[moduleName];
    if (!mapper) {
        ctx.warnings.push(`Unknown module "${moduleName}" â€” skipped`);
        return null;
    }
    return mapper(moduleJson, ctx);
}
```

- [ ] **Step 15: Compile check all mappers**

```bash
cd VFXBrowser/extensions/ikame-vfx-browser
npx tsc --noEmit
```

Expected: Passes (or only errors from missing panel/importer files, not mapper files).

- [ ] **Step 16: Commit**

```bash
git add VFXBrowser/extensions/ikame-vfx-browser/src/mappers/
git commit -m "feat(cocos): add all module mappers with registry (12 supported, 6 skip+warn)"
```

---

### Task 7: Importer Service

**Files:**
- Create: `VFXBrowser/extensions/ikame-vfx-browser/src/services/importer.ts`

- [ ] **Step 1: Create services/importer.ts**

This orchestrator downloads assets, writes them to the project via `asset-db` messages, then builds the node hierarchy by calling a scene script (created in Task 7).

```typescript
'use strict';

import * as path from 'path';
import { VFXApiClient } from './api';
import { ImportExecuteData, ImportEntry, ImportResult, MapperContext } from '../mappers/types';
import { mapAllModules } from '../mappers/index';
import { getString, getObj, getArr } from '../utils/json-helpers';

export class VFXImporter {
    /**
     * Execute the full import flow:
     * 1. Download selected assets from server
     * 2. Write assets to project via asset-db
     * 3. Build node hierarchy via scene script
     * 4. Create prefab
     */
    async execute(data: ImportExecuteData): Promise<ImportResult> {
        const { prefabName, importFolder, particleJson, entries, serverUrl } = data;
        const api = new VFXApiClient(serverUrl);
        const warnings: string[] = [];

        let texturesImported = 0;
        let materialsCreated = 0;
        let meshesImported = 0;

        // Asset path maps: Unity GUID â†’ db:// URL in Cocos project
        const texturePaths = new Map<string, string>();
        const meshPaths = new Map<string, string>();
        const materialPaths = new Map<string, string>();

        const selectedEntries = entries.filter(e => e.selected);
        const prefabDir = `db://${importFolder}/${prefabName}`;

        // --- Step 1: Download & write assets ---
        for (const entry of selectedEntries) {
            try {
                if (entry.status === 'exists' && entry.existingPath) {
                    // Asset already in project â€” just record the path
                    this.recordPath(entry, texturePaths, meshPaths, materialPaths, entry.existingPath);
                    continue;
                }

                switch (entry.type) {
                    case 'texture': {
                        const buffer = await api.downloadAssetBinary(entry.guid);
                        const ext = this.guessTextureExt(entry.name);
                        const assetUrl = `${prefabDir}/textures/${entry.name}${ext}`;
                        await this.writeAssetBinary(assetUrl, buffer);
                        texturePaths.set(entry.guid, assetUrl);
                        texturesImported++;
                        break;
                    }
                    case 'mesh': {
                        const meshData = await api.downloadAssetBinary(entry.guid);
                        const assetUrl = `${prefabDir}/meshes/${entry.name}.json`;
                        await this.writeAssetText(assetUrl, meshData.toString('utf-8'));
                        meshPaths.set(entry.guid, assetUrl);
                        meshesImported++;
                        break;
                    }
                    case 'material': {
                        const meta = await api.downloadAssetMeta(entry.guid);
                        // Store material metadata for scene script to create material assets
                        materialPaths.set(entry.guid, JSON.stringify(meta));
                        materialsCreated++;
                        break;
                    }
                    default:
                        warnings.push(`Unknown asset type "${entry.type}" for "${entry.name}" â€” skipped`);
                }
            } catch (err: any) {
                warnings.push(`Failed to import ${entry.type} "${entry.name}": ${err.message}`);
            }
        }

        // Also record existing assets that weren't selected but are already in project
        for (const entry of entries) {
            if (!entry.selected && entry.status === 'exists' && entry.existingPath) {
                this.recordPath(entry, texturePaths, meshPaths, materialPaths, entry.existingPath);
            }
        }

        // --- Step 2: Map particle.json to Cocos node descriptors ---
        const rootNode = getObj(particleJson, 'root');
        if (!rootNode) {
            return {
                success: false,
                prefabName,
                nodesCreated: 0,
                texturesImported,
                materialsCreated,
                meshesImported,
                warnings,
                error: 'No "root" node in particle.json',
            };
        }

        const nodeDescriptors = this.buildNodeDescriptors(rootNode, {
            textures: texturePaths,
            meshes: meshPaths,
            materials: materialPaths,
            importFolder,
            warnings,
            nodeName: '',
        });

        // --- Step 3: Build hierarchy via scene script ---
        let nodesCreated = 0;
        try {
            const result: any = await Editor.Message.request(
                'scene',
                'execute-scene-script',
                {
                    name: 'ikame-vfx-browser',
                    method: 'buildVFXHierarchy',
                    args: [nodeDescriptors, prefabDir],
                }
            );
            nodesCreated = result?.nodesCreated || 0;
            if (result?.warnings) {
                warnings.push(...result.warnings);
            }
        } catch (err: any) {
            return {
                success: false,
                prefabName,
                nodesCreated: 0,
                texturesImported,
                materialsCreated,
                meshesImported,
                warnings,
                error: `Scene script error: ${err.message}`,
            };
        }

        // --- Step 4: Log summary ---
        this.logSummary(prefabName, nodesCreated, texturesImported, materialsCreated, meshesImported, warnings);

        return {
            success: true,
            prefabName,
            nodesCreated,
            texturesImported,
            materialsCreated,
            meshesImported,
            warnings,
        };
    }

    /**
     * Recursively build a tree of node descriptors from particle.json.
     * Each descriptor contains mapped module properties (serializable data only).
     */
    private buildNodeDescriptors(
        nodeJson: Record<string, any>,
        parentCtx: Omit<MapperContext, 'nodeName'> & { nodeName: string }
    ): Record<string, any> {
        const name = getString(nodeJson, 'name', 'VFXNode');
        const transform = getObj(nodeJson, 'transform') || {};
        const psJson = getObj(nodeJson, 'particleSystem');

        const ctx: MapperContext = {
            nodeName: name,
            textures: parentCtx.textures,
            meshes: parentCtx.meshes,
            materials: parentCtx.materials,
            importFolder: parentCtx.importFolder,
            warnings: parentCtx.warnings,
        };

        let modules: Record<string, any> = {};
        let blendMode = 'AB';
        let materialType = 'AB';
        let materialId = '';
        let mainTexture = '';

        if (psJson) {
            modules = mapAllModules(psJson, ctx);
            blendMode = getString(psJson, 'blendMode', 'AB');
            materialType = getString(psJson, 'materialType', 'AB');
            materialId = getString(psJson, 'materialId', '');
            mainTexture = getString(psJson, 'mainTexture', '');
        }

        // Recurse children
        const childrenJson = getArr(nodeJson, 'children');
        const children = childrenJson.map((child: any) =>
            this.buildNodeDescriptors(child, parentCtx)
        );

        return {
            name,
            transform: {
                localPosition: transform['localPosition'] || [0, 0, 0],
                localRotation: transform['localRotation'] || [0, 0, 0, 1],
                localScale: transform['localScale'] || [1, 1, 1],
            },
            hasParticleSystem: !!psJson,
            modules,
            blendMode,
            materialType,
            materialId,
            mainTexture,
            mainTexturePath: mainTexture ? (parentCtx.textures.get(mainTexture) || '') : '',
            children,
        };
    }

    private recordPath(
        entry: ImportEntry,
        textures: Map<string, string>,
        meshes: Map<string, string>,
        materials: Map<string, string>,
        assetPath: string
    ): void {
        switch (entry.type) {
            case 'texture': textures.set(entry.guid, assetPath); break;
            case 'mesh': meshes.set(entry.guid, assetPath); break;
            case 'material': materials.set(entry.guid, assetPath); break;
        }
    }

    private guessTextureExt(name: string): string {
        const lower = name.toLowerCase();
        if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return '';
        return '.png';
    }

    private async writeAssetBinary(dbUrl: string, buffer: Buffer): Promise<void> {
        // Ensure parent directories exist by creating the asset
        // asset-db auto-creates directories
        const base64 = buffer.toString('base64');
        await Editor.Message.request('asset-db', 'create-asset', dbUrl, base64, { overwrite: false });
    }

    private async writeAssetText(dbUrl: string, content: string): Promise<void> {
        await Editor.Message.request('asset-db', 'create-asset', dbUrl, content, { overwrite: false });
    }

    private logSummary(
        prefabName: string,
        nodesCreated: number,
        texturesImported: number,
        materialsCreated: number,
        meshesImported: number,
        warnings: string[]
    ): void {
        const lines: string[] = [];
        lines.push(`[IKame VFX] Import "${prefabName}" completed:`);
        lines.push(`  âœ“ ${nodesCreated} nodes created`);
        lines.push(`  âœ“ ${texturesImported} textures imported`);
        lines.push(`  âœ“ ${materialsCreated} materials created`);
        lines.push(`  âœ“ ${meshesImported} meshes imported`);

        const skipped = warnings.filter(w => !w.includes('fallback'));
        const fallbacks = warnings.filter(w => w.includes('fallback'));

        if (skipped.length > 0) {
            lines.push(`  âš  Skipped modules:`);
            skipped.forEach(w => lines.push(`    - ${w}`));
        }
        if (fallbacks.length > 0) {
            lines.push(`  âš  Fallbacks:`);
            fallbacks.forEach(w => lines.push(`    - ${w}`));
        }

        const msg = lines.join('\n');
        console.log(msg);
        if (warnings.length > 0) {
            Editor.Message.send('console', 'warn', msg);
        } else {
            Editor.Message.send('console', 'log', msg);
        }
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add VFXBrowser/extensions/ikame-vfx-browser/src/services/importer.ts
git commit -m "feat(cocos): add VFXImporter service for download/write/build orchestration"
```

---

### Task 8: Browser Panel

**Files:**
- Create: `VFXBrowser/extensions/ikame-vfx-browser/src/panels/browser/style.ts`
- Create: `VFXBrowser/extensions/ikame-vfx-browser/src/panels/browser/index.ts`

- [ ] **Step 1: Create panels/browser/style.ts**

```typescript
'use strict';

export const browserStyle = `
:host {
    display: flex;
    flex-direction: column;
    height: 100%;
    font-family: sans-serif;
    font-size: 12px;
    color: #ccc;
}

/* Toolbar */
.toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: #2a2a2a;
    border-bottom: 1px solid #444;
}
.toolbar label { white-space: nowrap; font-weight: bold; }
.toolbar input[type="text"] {
    flex: 1;
    background: #1a1a1a;
    border: 1px solid #555;
    color: #eee;
    padding: 4px 8px;
    border-radius: 3px;
}
.toolbar button {
    padding: 4px 12px;
    background: #3a3a3a;
    border: 1px solid #555;
    color: #eee;
    border-radius: 3px;
    cursor: pointer;
}
.toolbar button:hover { background: #4a4a4a; }

/* Main body */
.body {
    display: flex;
    flex: 1;
    overflow: hidden;
}

/* Sidebar */
.sidebar {
    width: 160px;
    min-width: 120px;
    background: #252525;
    border-right: 1px solid #444;
    overflow-y: auto;
    padding: 4px 0;
}
.sidebar .cat-item {
    padding: 4px 10px;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.sidebar .cat-item:hover { background: #333; }
.sidebar .cat-item.active { background: #0066cc; color: white; }
.sidebar .cat-item.parent { font-weight: bold; }
.sidebar .cat-item.child { padding-left: 24px; }

/* Content area */
.content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

/* Search bar */
.search-bar {
    padding: 6px 10px;
    background: #2a2a2a;
    border-bottom: 1px solid #444;
}
.search-bar input {
    width: 100%;
    background: #1a1a1a;
    border: 1px solid #555;
    color: #eee;
    padding: 4px 8px;
    border-radius: 3px;
    box-sizing: border-box;
}

/* VFX list */
.vfx-list {
    flex: 1;
    overflow-y: auto;
    padding: 0;
}
.vfx-list-header {
    display: flex;
    padding: 6px 10px;
    background: #2a2a2a;
    border-bottom: 1px solid #555;
    font-weight: bold;
    font-size: 11px;
    color: #999;
}
.vfx-row {
    display: flex;
    padding: 6px 10px;
    border-bottom: 1px solid #333;
    align-items: center;
}
.vfx-row:hover { background: #2d2d2d; }
.col-name { width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.col-category { width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #888; }
.col-action { margin-left: auto; }
.col-action button {
    padding: 3px 10px;
    background: #0066cc;
    border: none;
    color: white;
    border-radius: 3px;
    cursor: pointer;
    font-size: 11px;
}
.col-action button:hover { background: #0077ee; }
.col-action button:disabled { background: #555; cursor: not-allowed; }

/* Status bar */
.status-bar {
    padding: 4px 10px;
    background: #2a2a2a;
    border-top: 1px solid #444;
    font-size: 11px;
    color: #888;
}
`;
```

- [ ] **Step 2: Create panels/browser/index.ts**

```typescript
'use strict';

import { browserStyle } from './style';

interface CatalogItem {
    id: string;
    name: string;
    category: string;
    fileSize: number;
    particleCount: number;
    uploadedAt: string;
}

interface CategoryNode {
    name: string;
    fullPath: string;
    count: number;
    children: CategoryNode[];
    expanded: boolean;
}

module.exports = Editor.Panel.define({
    template: `
        <div class="toolbar">
            <label>Server:</label>
            <input type="text" id="serverUrl" value="http://localhost:4649" />
            <button id="btnRefresh">ðŸ”„ Refresh</button>
        </div>
        <div class="body">
            <div class="sidebar" id="sidebar"></div>
            <div class="content">
                <div class="search-bar">
                    <input type="text" id="searchInput" placeholder="ðŸ” Search..." />
                </div>
                <div class="vfx-list-header">
                    <span class="col-name">Name</span>
                    <span class="col-category">Category</span>
                    <span class="col-action">Action</span>
                </div>
                <div class="vfx-list" id="vfxList"></div>
            </div>
        </div>
        <div class="status-bar" id="statusBar">Ready â€” click Refresh to load catalog</div>
    `,

    style: browserStyle,

    $: {
        serverUrl: '#serverUrl',
        btnRefresh: '#btnRefresh',
        sidebar: '#sidebar',
        searchInput: '#searchInput',
        vfxList: '#vfxList',
        statusBar: '#statusBar',
    },

    // Instance state
    _items: [] as CatalogItem[],
    _categoryTree: [] as CategoryNode[],
    _selectedCategory: 'All',
    _searchQuery: '',
    _importing: new Set<string>(),

    ready() {
        const self = this as any;

        // Load saved server URL
        Editor.Profile.getProject('ikame-vfx-browser', 'serverUrl').then((url: string) => {
            if (url) self.$.serverUrl.value = url;
        });

        // Refresh button
        self.$.btnRefresh.addEventListener('click', () => {
            self._fetchCatalog();
        });

        // Search input
        self.$.searchInput.addEventListener('input', (e: Event) => {
            self._searchQuery = (e.target as HTMLInputElement).value;
            self._renderList();
        });
    },

    close() {
        // Save server URL on close
        const self = this as any;
        Editor.Profile.setProject('ikame-vfx-browser', 'serverUrl', self.$.serverUrl.value);
    },

    methods: {
        importComplete(result: any) {
            const self = this as any;
            if (result?.vfxId) {
                self._importing.delete(result.vfxId);
            }
            self._renderList();
            if (result?.success) {
                self.$.statusBar.textContent = `âœ“ Imported "${result.prefabName}" (${result.nodesCreated} nodes)`;
            } else {
                self.$.statusBar.textContent = `âœ— Import failed: ${result?.error || 'unknown error'}`;
            }
        },

        async _fetchCatalog() {
            const self = this as any;
            const serverUrl = self.$.serverUrl.value.replace(/\/+$/, '');
            self.$.statusBar.textContent = 'Loading...';

            // Save server URL
            Editor.Profile.setProject('ikame-vfx-browser', 'serverUrl', serverUrl);

            try {
                const http = require('http');
                const url = require('url');
                const parsed = new (url.URL)(serverUrl + '/api/vfx/catalog');

                const data: string = await new Promise((resolve, reject) => {
                    const req = http.get(parsed, (res: any) => {
                        if (res.statusCode >= 400) {
                            reject(new Error(`HTTP ${res.statusCode}`));
                            res.resume();
                            return;
                        }
                        const chunks: Buffer[] = [];
                        res.on('data', (c: Buffer) => chunks.push(c));
                        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
                    });
                    req.on('error', reject);
                });

                const catalog = JSON.parse(data);
                self._items = catalog.items || [];
                self._buildCategoryTree();
                self._renderSidebar();
                self._renderList();
                self.$.statusBar.textContent = `${self._items.length} effects loaded`;
            } catch (err: any) {
                self.$.statusBar.textContent = `Error: ${err.message}`;
                self._items = [];
                self._renderSidebar();
                self._renderList();
            }
        },

        _buildCategoryTree() {
            const self = this as any;
            const catMap = new Map<string, number>();

            for (const item of self._items) {
                const cat = item.category || 'Uncategorized';
                catMap.set(cat, (catMap.get(cat) || 0) + 1);
                // Also count parents
                const parts = cat.split('/');
                for (let i = 1; i < parts.length; i++) {
                    const parent = parts.slice(0, i).join('/');
                    if (!catMap.has(parent)) catMap.set(parent, 0);
                }
            }

            // Build tree
            const roots: CategoryNode[] = [];
            const nodeMap = new Map<string, CategoryNode>();

            const sortedKeys = Array.from(catMap.keys()).sort();
            for (const fullPath of sortedKeys) {
                const parts = fullPath.split('/');
                const name = parts[parts.length - 1];
                const node: CategoryNode = { name, fullPath, count: catMap.get(fullPath) || 0, children: [], expanded: true };
                nodeMap.set(fullPath, node);

                if (parts.length === 1) {
                    roots.push(node);
                } else {
                    const parentPath = parts.slice(0, -1).join('/');
                    const parent = nodeMap.get(parentPath);
                    if (parent) {
                        parent.children.push(node);
                        // Parent count is sum of leaf items under it
                        parent.count = self._items.filter(
                            (i: CatalogItem) => i.category === parentPath || i.category.startsWith(parentPath + '/')
                        ).length;
                    } else {
                        roots.push(node);
                    }
                }
            }

            self._categoryTree = roots;
        },

        _renderSidebar() {
            const self = this as any;
            const sb = self.$.sidebar;
            sb.innerHTML = '';

            // "All" item
            const allDiv = document.createElement('div');
            allDiv.className = 'cat-item' + (self._selectedCategory === 'All' ? ' active' : '');
            allDiv.textContent = `All (${self._items.length})`;
            allDiv.addEventListener('click', () => {
                self._selectedCategory = 'All';
                self._renderSidebar();
                self._renderList();
            });
            sb.appendChild(allDiv);

            // Render tree
            function renderNode(node: CategoryNode, depth: number) {
                const div = document.createElement('div');
                div.className = 'cat-item' + (depth > 0 ? ' child' : ' parent');
                if (self._selectedCategory === node.fullPath) div.className += ' active';
                div.style.paddingLeft = (10 + depth * 14) + 'px';

                const arrow = node.children.length > 0 ? (node.expanded ? 'â–¾ ' : 'â–¸ ') : '  ';
                div.textContent = `${arrow}${node.name} (${node.count})`;

                div.addEventListener('click', () => {
                    if (node.children.length > 0 && self._selectedCategory === node.fullPath) {
                        node.expanded = !node.expanded;
                    }
                    self._selectedCategory = node.fullPath;
                    self._renderSidebar();
                    self._renderList();
                });

                sb.appendChild(div);

                if (node.expanded) {
                    for (const child of node.children) {
                        renderNode(child, depth + 1);
                    }
                }
            }

            for (const root of self._categoryTree) {
                renderNode(root, 0);
            }
        },

        _renderList() {
            const self = this as any;
            const list = self.$.vfxList;
            list.innerHTML = '';

            const filtered = self._items.filter((item: CatalogItem) => {
                // Category filter
                if (self._selectedCategory !== 'All') {
                    if (item.category !== self._selectedCategory &&
                        !item.category.startsWith(self._selectedCategory + '/')) {
                        return false;
                    }
                }
                // Search filter
                if (self._searchQuery) {
                    return item.name.toLowerCase().includes(self._searchQuery.toLowerCase());
                }
                return true;
            });

            for (const item of filtered) {
                const row = document.createElement('div');
                row.className = 'vfx-row';

                const nameSpan = document.createElement('span');
                nameSpan.className = 'col-name';
                nameSpan.textContent = item.name;

                const catSpan = document.createElement('span');
                catSpan.className = 'col-category';
                catSpan.textContent = item.category;

                const actionSpan = document.createElement('span');
                actionSpan.className = 'col-action';

                const btn = document.createElement('button');
                const isImporting = self._importing.has(item.id);
                btn.textContent = isImporting ? 'Importing...' : 'Import';
                btn.disabled = isImporting;
                btn.addEventListener('click', () => {
                    self._startImport(item);
                });

                actionSpan.appendChild(btn);
                row.appendChild(nameSpan);
                row.appendChild(catSpan);
                row.appendChild(actionSpan);
                list.appendChild(row);
            }
        },

        async _startImport(item: CatalogItem) {
            const self = this as any;
            const serverUrl = self.$.serverUrl.value.replace(/\/+$/, '');
            self._importing.add(item.id);
            self._renderList();
            self.$.statusBar.textContent = `Downloading "${item.name}"...`;

            try {
                // Download particle.json
                const { VFXApiClient } = require('../../services/api');
                const api = new VFXApiClient(serverUrl);
                const particleJson = await api.downloadParticleJson(item.id);

                // Collect asset entries from particle.json
                const entries = self._collectAssetEntries(particleJson);

                // Get import folder from profile
                const importFolder = await Editor.Profile.getProject('ikame-vfx-browser', 'importFolder')
                    || 'assets/_IKameVFX/Imported';

                // Open import review panel with data
                Editor.Message.send('ikame-vfx-browser', 'open-import-review', {
                    prefabName: item.name,
                    vfxId: item.id,
                    importFolder,
                    particleJson,
                    entries,
                    serverUrl,
                });
            } catch (err: any) {
                self.$.statusBar.textContent = `Error: ${err.message}`;
                self._importing.delete(item.id);
                self._renderList();
            }
        },

        _collectAssetEntries(particleJson: Record<string, any>): any[] {
            const entries: any[] = [];
            const seenGuids = new Set<string>();

            // Collect textures from the textures dictionary
            const textures = particleJson['textures'] || {};
            for (const [guid, texInfo] of Object.entries(textures)) {
                if (seenGuids.has(guid)) continue;
                seenGuids.add(guid);
                const info = texInfo as any;
                entries.push({
                    guid,
                    name: info.name || info.fileName || guid,
                    type: 'texture',
                    status: 'new',
                    selected: true,
                });
            }

            // Walk node tree for materials and meshes
            const walkNode = (node: any) => {
                const ps = node?.particleSystem;
                if (ps) {
                    // Custom material
                    const materialId = ps.materialId;
                    if (materialId && ps.materialType === 'custom' && !seenGuids.has(materialId)) {
                        seenGuids.add(materialId);
                        entries.push({
                            guid: materialId,
                            name: `Material_${materialId.substring(0, 8)}`,
                            type: 'material',
                            status: 'new',
                            selected: true,
                        });
                    }

                    // Mesh from renderer
                    const renderer = ps.rendererModule;
                    if (renderer?.meshId && !seenGuids.has(renderer.meshId)) {
                        seenGuids.add(renderer.meshId);
                        entries.push({
                            guid: renderer.meshId,
                            name: renderer.meshName || `Mesh_${renderer.meshId.substring(0, 8)}`,
                            type: 'mesh',
                            status: 'new',
                            selected: true,
                        });
                    }
                }

                // Recurse children
                const children = node?.children || [];
                for (const child of children) {
                    walkNode(child);
                }
            };
            walkNode(particleJson.root);

            return entries;
        },
    },
});
```

- [ ] **Step 3: Commit**

```bash
git add VFXBrowser/extensions/ikame-vfx-browser/src/panels/browser/
git commit -m "feat(cocos): add VFX Browser panel with category sidebar, search, and list"
```

---

### Task 9: Import Review Panel

**Files:**
- Create: `VFXBrowser/extensions/ikame-vfx-browser/src/panels/import-review/style.ts`
- Create: `VFXBrowser/extensions/ikame-vfx-browser/src/panels/import-review/index.ts`

- [ ] **Step 1: Create panels/import-review/style.ts**

```typescript
'use strict';

export const importReviewStyle = `
:host {
    display: flex;
    flex-direction: column;
    height: 100%;
    font-family: sans-serif;
    font-size: 12px;
    color: #ccc;
}

.header {
    padding: 10px;
    background: #2a2a2a;
    border-bottom: 1px solid #444;
}
.header h2 { margin: 0 0 4px 0; font-size: 14px; }
.header .target { color: #888; font-size: 11px; }

.summary {
    padding: 6px 10px;
    background: #2d2d2d;
    border-bottom: 1px solid #444;
    font-size: 11px;
}

.bulk-actions {
    display: flex;
    gap: 6px;
    padding: 6px 10px;
    background: #2a2a2a;
    border-bottom: 1px solid #444;
}
.bulk-actions button {
    padding: 3px 8px;
    background: #3a3a3a;
    border: 1px solid #555;
    color: #eee;
    border-radius: 3px;
    cursor: pointer;
    font-size: 11px;
}
.bulk-actions button:hover { background: #4a4a4a; }

.entry-list {
    flex: 1;
    overflow-y: auto;
}
.entry-row {
    display: flex;
    align-items: center;
    padding: 4px 10px;
    border-bottom: 1px solid #333;
    gap: 8px;
}
.entry-row:hover { background: #2d2d2d; }
.entry-row input[type="checkbox"] { margin: 0; cursor: pointer; }
.badge {
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: bold;
    min-width: 45px;
    text-align: center;
}
.badge.new { background: #2e7d32; color: white; }
.badge.exists { background: #f57f17; color: white; }
.type-label { color: #888; min-width: 60px; }
.entry-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.entry-path { color: #666; font-size: 11px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; }

.footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 10px;
    background: #2a2a2a;
    border-top: 1px solid #444;
}
.footer button {
    padding: 6px 16px;
    border: 1px solid #555;
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
}
.btn-cancel { background: #3a3a3a; color: #eee; }
.btn-cancel:hover { background: #4a4a4a; }
.btn-import { background: #0066cc; color: white; border-color: #0066cc; }
.btn-import:hover { background: #0077ee; }
.btn-import:disabled { background: #555; border-color: #555; cursor: not-allowed; }
`;
```

- [ ] **Step 2: Create panels/import-review/index.ts**

```typescript
'use strict';

import { importReviewStyle } from './style';

interface ReviewEntry {
    guid: string;
    name: string;
    type: string;
    status: string;
    existingPath?: string;
    selected: boolean;
}

module.exports = Editor.Panel.define({
    template: `
        <div class="header">
            <h2 id="title">Import: VFX</h2>
            <div class="target" id="target">Target: assets/_IKameVFX/Imported/</div>
        </div>
        <div class="summary" id="summary"></div>
        <div class="bulk-actions">
            <button id="btnAll">Select All</button>
            <button id="btnNone">Select None</button>
            <button id="btnNewOnly">Select New Only</button>
        </div>
        <div class="entry-list" id="entryList"></div>
        <div class="footer">
            <button class="btn-cancel" id="btnCancel">Cancel</button>
            <button class="btn-import" id="btnImport">Import (0)</button>
        </div>
    `,

    style: importReviewStyle,

    $: {
        title: '#title',
        target: '#target',
        summary: '#summary',
        btnAll: '#btnAll',
        btnNone: '#btnNone',
        btnNewOnly: '#btnNewOnly',
        entryList: '#entryList',
        btnCancel: '#btnCancel',
        btnImport: '#btnImport',
    },

    _data: null as any,
    _entries: [] as ReviewEntry[],

    async ready() {
        const self = this as any;

        // Fetch data from main.ts
        self._data = await Editor.Message.request('ikame-vfx-browser', 'getImportReviewData');
        if (!self._data) {
            self.$.title.textContent = 'Error: No import data';
            return;
        }

        self._entries = self._data.entries || [];
        self.$.title.textContent = `Import: ${self._data.prefabName}`;
        self.$.target.textContent = `Target: ${self._data.importFolder}/`;

        // Bulk action buttons
        self.$.btnAll.addEventListener('click', () => {
            self._entries.forEach((e: ReviewEntry) => e.selected = true);
            self._render();
        });
        self.$.btnNone.addEventListener('click', () => {
            self._entries.forEach((e: ReviewEntry) => e.selected = false);
            self._render();
        });
        self.$.btnNewOnly.addEventListener('click', () => {
            self._entries.forEach((e: ReviewEntry) => e.selected = e.status === 'new');
            self._render();
        });

        // Cancel
        self.$.btnCancel.addEventListener('click', () => {
            Editor.Panel.close('ikame-vfx-browser.import-review');
        });

        // Import
        self.$.btnImport.addEventListener('click', () => {
            self._executeImport();
        });

        self._render();
    },

    methods: {
        _render() {
            const self = this as any;
            const list = self.$.entryList;
            list.innerHTML = '';

            for (let i = 0; i < self._entries.length; i++) {
                const entry = self._entries[i];
                const row = document.createElement('div');
                row.className = 'entry-row';

                // Checkbox
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = entry.selected;
                cb.addEventListener('change', () => {
                    entry.selected = cb.checked;
                    self._updateSummary();
                });

                // Status badge
                const badge = document.createElement('span');
                badge.className = `badge ${entry.status}`;
                badge.textContent = entry.status.toUpperCase();

                // Type
                const typeLbl = document.createElement('span');
                typeLbl.className = 'type-label';
                typeLbl.textContent = entry.type;

                // Name
                const nameLbl = document.createElement('span');
                nameLbl.className = 'entry-name';
                nameLbl.textContent = entry.name;

                // Existing path
                const pathLbl = document.createElement('span');
                pathLbl.className = 'entry-path';
                pathLbl.textContent = entry.existingPath || '';

                row.appendChild(cb);
                row.appendChild(badge);
                row.appendChild(typeLbl);
                row.appendChild(nameLbl);
                row.appendChild(pathLbl);
                list.appendChild(row);
            }

            self._updateSummary();
        },

        _updateSummary() {
            const self = this as any;
            const total = self._entries.length;
            const newCount = self._entries.filter((e: ReviewEntry) => e.status === 'new').length;
            const existsCount = total - newCount;
            const selectedCount = self._entries.filter((e: ReviewEntry) => e.selected).length;

            self.$.summary.textContent = `${total} assets total â€” ${newCount} new, ${existsCount} already in project â€” ${selectedCount} selected`;
            self.$.btnImport.textContent = `Import (${selectedCount})`;
            self.$.btnImport.disabled = selectedCount === 0;
        },

        async _executeImport() {
            const self = this as any;
            const selectedCount = self._entries.filter((e: ReviewEntry) => e.selected).length;
            if (selectedCount === 0) return;

            self.$.btnImport.disabled = true;
            self.$.btnImport.textContent = 'Importing...';
            self.$.btnCancel.disabled = true;

            const importData = {
                prefabName: self._data.prefabName,
                vfxId: self._data.vfxId,
                importFolder: self._data.importFolder,
                particleJson: self._data.particleJson,
                entries: self._entries,
                serverUrl: self._data.serverUrl,
            };

            try {
                const result = await Editor.Message.request('ikame-vfx-browser', 'start-import', importData);
                // Notify browser panel
                Editor.Message.send('ikame-vfx-browser', 'import-complete', result);
                Editor.Panel.close('ikame-vfx-browser.import-review');
            } catch (err: any) {
                self.$.btnImport.textContent = `Error: ${err.message}`;
                self.$.btnImport.disabled = false;
                self.$.btnCancel.disabled = false;
            }
        },
    },
});
```

- [ ] **Step 3: Commit**

```bash
git add VFXBrowser/extensions/ikame-vfx-browser/src/panels/import-review/
git commit -m "feat(cocos): add Import Review panel with asset list and confirm flow"
```

---

### Task 10: Scene Script (Build VFX Hierarchy)

**Files:**
- Create: `VFXBrowser/extensions/ikame-vfx-browser/src/scene.ts`
- Modify: `VFXBrowser/extensions/ikame-vfx-browser/package.json` â€” add scene script contribution

- [ ] **Step 1: Create src/scene.ts**

This runs inside the Cocos scene runtime with access to `cc.*` APIs. It receives serializable node descriptors from the importer and creates actual Cocos nodes with ParticleSystem components.

```typescript
'use strict';

import { join } from 'path';
// Ensure we can require cc modules
module.paths.push(join(Editor.App.path, 'node_modules'));

export function load() {
    console.log('[IKame VFX Browser] Scene script loaded');
}

export function unload() {
    console.log('[IKame VFX Browser] Scene script unloaded');
}

export const methods = {
    /**
     * Build a VFX node hierarchy in the current scene from node descriptors.
     * Returns { nodesCreated, warnings, rootUuid }
     */
    buildVFXHierarchy(descriptors: any, prefabDir: string): any {
        const cc = require('cc');
        const { director, Node, Vec3, Quat, Color, ParticleSystem } = cc;

        const scene = director.getScene();
        if (!scene) {
            return { nodesCreated: 0, warnings: ['No active scene'], rootUuid: null };
        }

        let nodesCreated = 0;
        const warnings: string[] = [];

        function buildNode(desc: any, parent: any): any {
            const node = new Node(desc.name);
            parent.addChild(node);

            // Set transform
            if (desc.transform) {
                const pos = desc.transform.localPosition;
                if (Array.isArray(pos) && pos.length >= 3) {
                    node.setPosition(new Vec3(pos[0], pos[1], pos[2]));
                }
                const rot = desc.transform.localRotation;
                if (Array.isArray(rot) && rot.length >= 4) {
                    node.setRotation(new Quat(rot[0], rot[1], rot[2], rot[3]));
                }
                const scl = desc.transform.localScale;
                if (Array.isArray(scl) && scl.length >= 3) {
                    node.setScale(new Vec3(scl[0], scl[1], scl[2]));
                }
            }

            // Add ParticleSystem if present
            if (desc.hasParticleSystem) {
                try {
                    const ps = node.addComponent(ParticleSystem);
                    applyModules(ps, desc.modules, desc, warnings);
                    nodesCreated++;
                } catch (err: any) {
                    warnings.push(`Failed to create ParticleSystem on "${desc.name}": ${err.message}`);
                }
            }

            // Recurse children
            if (desc.children && Array.isArray(desc.children)) {
                for (const childDesc of desc.children) {
                    buildNode(childDesc, node);
                }
            }

            return node;
        }

        const rootNode = buildNode(descriptors, scene);

        return { nodesCreated, warnings, rootUuid: rootNode._id || rootNode.uuid };
    },
};

/**
 * Apply mapped module properties to a Cocos ParticleSystem component.
 */
function applyModules(ps: any, modules: Record<string, any>, desc: any, warnings: string[]): void {
    const cc = require('cc');

    // Main module
    if (modules.mainModule) {
        const m = modules.mainModule;
        ps.duration = m.duration ?? 5;
        ps.loop = m.loop ?? true;
        ps.playOnAwake = m.playOnAwake ?? true;
        ps.capacity = m.capacity ?? 1000;
        ps.simulationSpace = m.simulationSpace ?? 0;
        ps.scaleSpace = m.scaleSpace ?? 0;
        applyCurve(ps, 'startLifetime', m.startLifetime);
        applyCurve(ps, 'startSpeed', m.startSpeed);
        applyCurve(ps, 'startSize', m.startSize);
        applyCurve(ps, 'startDelay', m.startDelay);
        applyCurve(ps, 'gravityModifier', m.gravityModifier);
        if (m.startColor) {
            ps.startColor.mode = 0; // Color mode
            ps.startColor.color = new cc.Color(m.startColor.r, m.startColor.g, m.startColor.b, m.startColor.a);
        }
    }

    // Emission
    if (modules.emissionModule) {
        const em = modules.emissionModule;
        ps.emissionModule.enable = true;
        applyCurve(ps.emissionModule, 'rateOverTime', em.rateOverTime);
        applyCurve(ps.emissionModule, 'rateOverDistance', em.rateOverDistance);
        if (em.bursts && em.bursts.length > 0) {
            ps.emissionModule.bursts = em.bursts.map((b: any) => ({
                time: b.time,
                repeatCount: b.repeatCount,
                repeatInterval: b.repeatInterval,
                count: b.count?.constant ?? 30,
            }));
        }
    }

    // Shape
    if (modules.shapeModule) {
        const sh = modules.shapeModule;
        ps.shapeModule.enable = true;
        ps.shapeModule.shapeType = sh.shapeType ?? 2;
        ps.shapeModule.radius = sh.radius ?? 1;
        ps.shapeModule.radiusThickness = sh.radiusThickness ?? 1;
        ps.shapeModule.angle = sh.angle ?? 25;
        ps.shapeModule.arc = sh.arc ?? 360;
        ps.shapeModule.arcMode = sh.arcMode ?? 0;
    }

    // Velocity over Lifetime
    if (modules.velocityOverLifetimeModule) {
        const v = modules.velocityOverLifetimeModule;
        ps.velocityOvertimeModule.enable = true;
        ps.velocityOvertimeModule.space = v.space ?? 0;
        applyCurve(ps.velocityOvertimeModule, 'x', v.x);
        applyCurve(ps.velocityOvertimeModule, 'y', v.y);
        applyCurve(ps.velocityOvertimeModule, 'z', v.z);
    }

    // Force over Lifetime
    if (modules.forceOverLifetimeModule) {
        const f = modules.forceOverLifetimeModule;
        ps.forceOvertimeModule.enable = true;
        ps.forceOvertimeModule.space = f.space ?? 0;
        applyCurve(ps.forceOvertimeModule, 'x', f.x);
        applyCurve(ps.forceOvertimeModule, 'y', f.y);
        applyCurve(ps.forceOvertimeModule, 'z', f.z);
    }

    // Color over Lifetime
    if (modules.colorOverLifetimeModule) {
        ps.colorOvertimeModule.enable = true;
        applyGradient(ps.colorOvertimeModule, 'color', modules.colorOverLifetimeModule.color);
    }

    // Size over Lifetime
    if (modules.sizeOverLifetimeModule) {
        const s = modules.sizeOverLifetimeModule;
        ps.sizeOvertimeModule.enable = true;
        ps.sizeOvertimeModule.separateAxes = s.separateAxes ?? false;
        applyCurve(ps.sizeOvertimeModule, 'size', s.size);
        if (s.separateAxes) {
            applyCurve(ps.sizeOvertimeModule, 'x', s.x);
            applyCurve(ps.sizeOvertimeModule, 'y', s.y);
            applyCurve(ps.sizeOvertimeModule, 'z', s.z);
        }
    }

    // Rotation over Lifetime
    if (modules.rotationOverLifetimeModule) {
        const r = modules.rotationOverLifetimeModule;
        ps.rotationOvertimeModule.enable = true;
        ps.rotationOvertimeModule.separateAxes = r.separateAxes ?? false;
        applyCurve(ps.rotationOvertimeModule, 'z', r.z);
        if (r.separateAxes) {
            applyCurve(ps.rotationOvertimeModule, 'x', r.x);
            applyCurve(ps.rotationOvertimeModule, 'y', r.y);
        }
    }

    // Limit Velocity
    if (modules.limitVelocityOverLifetimeModule) {
        const lv = modules.limitVelocityOverLifetimeModule;
        ps.limitVelocityOvertimeModule.enable = true;
        ps.limitVelocityOvertimeModule.dampen = lv.dampen ?? 0;
        ps.limitVelocityOvertimeModule.separateAxes = lv.separateAxes ?? false;
        applyCurve(ps.limitVelocityOvertimeModule, 'speed', lv.speed);
    }

    // Texture Sheet Animation
    if (modules.textureSheetAnimationModule) {
        const tsa = modules.textureSheetAnimationModule;
        ps.textureAnimationModule.enable = true;
        ps.textureAnimationModule.mode = tsa.mode ?? 0;
        if (tsa.mode === 0) {
            ps.textureAnimationModule.numTilesX = tsa.numTilesX ?? 1;
            ps.textureAnimationModule.numTilesY = tsa.numTilesY ?? 1;
        }
        ps.textureAnimationModule.cycleCount = tsa.cycleCount ?? 1;
        applyCurve(ps.textureAnimationModule, 'frameOverTime', tsa.frameOverTime);
    }

    // Trails
    if (modules.trailModule) {
        const tr = modules.trailModule;
        ps.trailModule.enable = true;
        ps.trailModule.minParticleDistance = tr.minVertexDistance ?? 0.2;
        ps.trailModule.space = tr.worldSpace ? 1 : 0;
        ps.trailModule.existWithParticles = tr.dieWithParticles ?? true;
        applyCurve(ps.trailModule, 'widthRatio', tr.widthRatio);
    }

    // Renderer
    if (modules.rendererModule) {
        const rn = modules.rendererModule;
        ps.renderer.renderMode = rn.renderMode ?? 0;
        if (rn.renderMode === 1) {
            ps.renderer.velocityScale = rn.velocityScale ?? 0;
            ps.renderer.lengthScale = rn.lengthScale ?? 2;
        }
    }

    // Set material — use built-in IKAME_Particle_AB or ADD
    try {
        const effectName = desc.blendMode === 'ADD' ? 'IKAME_Particle_ADD' : 'IKAME_Particle_AB';
        const matPath = `db://assets/materials/${effectName}.mtl`;
        const matUuid = cc.assetManager.utils?.getUuidFromURL?.(matPath);
        if (matUuid) {
            cc.assetManager.loadAny(matUuid, (err: any, mat: any) => {
                if (!err && mat) {
                    // Clone material so each PS gets its own instance for unique texture
                    const cloned = new cc.Material();
                    cloned.copy(mat);
                    // Set mainTexture if provided
                    if (desc.mainTexturePath) {
                        const texUuid = cc.assetManager.utils?.getUuidFromURL?.(desc.mainTexturePath);
                        if (texUuid) {
                            cc.assetManager.loadAny(texUuid, (texErr: any, tex: any) => {
                                if (!texErr && tex) {
                                    cloned.setProperty('mainTexture', tex);
                                }
                            });
                        }
                    }
                    ps.renderer.sharedMaterial = cloned;
                }
            });
        }
    } catch (err: any) {
        warnings.push(`Node “${desc.name}”: Material assignment failed: ${err.message}`);
    }
}

/**
 * Apply a curve descriptor to a Cocos module property.
 * Handles constant, curve, twoConstants, twoCurves modes.
 */
function applyCurve(target: any, propName: string, curveDesc: any): void {
    if (!curveDesc || !target) return;

    const prop = target[propName];
    if (!prop) return;

    try {
        switch (curveDesc.mode) {
            case 0: // Constant
                prop.mode = 0;
                prop.constant = curveDesc.constant ?? 0;
                break;
            case 1: // Curve
                prop.mode = 1;
                prop.multiplier = curveDesc.multiplier ?? 1;
                // Keyframe application would need cc.RealCurve
                break;
            case 2: // TwoConstants
                prop.mode = 2;
                prop.constantMin = curveDesc.constantMin ?? 0;
                prop.constantMax = curveDesc.constantMax ?? 0;
                break;
            case 3: // TwoCurves
                prop.mode = 3;
                prop.multiplier = curveDesc.multiplier ?? 1;
                break;
        }
    } catch (err) {
        // Some properties may not support all modes â€” silently skip
    }
}

/**
 * Apply a gradient descriptor to a Cocos module property.
 */
function applyGradient(target: any, propName: string, gradDesc: any): void {
    if (!gradDesc || !target) return;

    const prop = target[propName];
    if (!prop) return;

    const cc = require('cc');

    try {
        switch (gradDesc.mode) {
            case 0: // Color
                prop.mode = 0;
                if (gradDesc.color) {
                    prop.color = new cc.Color(gradDesc.color.r, gradDesc.color.g, gradDesc.color.b, gradDesc.color.a);
                }
                break;
            case 1: // Gradient
                prop.mode = 1;
                // Apply gradient keys
                if (gradDesc.gradient) {
                    applyGradientKeys(prop, gradDesc.gradient, cc);
                }
                break;
            case 2: // TwoColors
                prop.mode = 2;
                if (gradDesc.colorMin) {
                    prop.colorMin = new cc.Color(gradDesc.colorMin.r, gradDesc.colorMin.g, gradDesc.colorMin.b, gradDesc.colorMin.a);
                }
                if (gradDesc.colorMax) {
                    prop.colorMax = new cc.Color(gradDesc.colorMax.r, gradDesc.colorMax.g, gradDesc.colorMax.b, gradDesc.colorMax.a);
                }
                break;
            case 3: // TwoGradients
                prop.mode = 3;
                break;
        }
    } catch (err) {
        // Silently skip unsupported gradient modes
    }
}

function applyGradientKeys(prop: any, gradObj: any, cc: any): void {
    if (!gradObj) return;

    try {
        const gradient = prop.gradient || new cc.Gradient();
        if (gradObj.colorKeys && Array.isArray(gradObj.colorKeys)) {
            const keys = gradObj.colorKeys.map((ck: any) => ({
                time: ck.time,
                color: new cc.Color(ck.color.r, ck.color.g, ck.color.b, ck.color.a),
            }));
            gradient.colorKeys = keys;
        }
        if (gradObj.alphaKeys && Array.isArray(gradObj.alphaKeys)) {
            const keys = gradObj.alphaKeys.map((ak: any) => ({
                time: ak.time,
                alpha: ak.alpha,
            }));
            gradient.alphaKeys = keys;
        }
        prop.gradient = gradient;
    } catch (err) {
        // Skip
    }
}
```

- [ ] **Step 2: Update package.json to register scene script**

Add to `contributions` in package.json:

```json
"scene": {
    "script": "./dist/scene.js"
}
```

The full contributions block becomes:

```json
"contributions": {
    "menu": [
      { "path": "Extensions/IKame VFX Browser", "message": "open-browser" }
    ],
    "messages": {
      "open-browser": { "methods": ["openBrowser"] },
      "open-import-review": { "methods": ["openImportReview"] },
      "start-import": { "methods": ["startImport"] },
      "import-complete": { "methods": [] }
    },
    "profile": {
      "project": {
        "serverUrl": { "default": "http://localhost:4649", "label": "Server URL" },
        "importFolder": { "default": "assets/_IKameVFX/Imported", "label": "Import Folder" }
      }
    },
    "scene": {
      "script": "./dist/scene.js"
    }
}
```

- [ ] **Step 3: Commit**

```bash
git add VFXBrowser/extensions/ikame-vfx-browser/src/scene.ts
git add VFXBrowser/extensions/ikame-vfx-browser/package.json
git commit -m "feat(cocos): add scene script for building VFX node hierarchy with ParticleSystem3D"
```

---

### Task 11: Build, Wire, and Smoke Test

**Files:**
- Modify: `VFXBrowser/extensions/ikame-vfx-browser/src/main.ts` â€” add import-complete message handler
- Create: `VFXBrowser/extensions/ikame-vfx-browser/.gitignore`

- [ ] **Step 1: Create extension .gitignore**

```
dist/*.js
dist/*.js.map
dist/**/*.js
dist/**/*.js.map
!dist/.gitkeep
node_modules/
```

- [ ] **Step 2: Update main.ts â€” add import-complete forwarding**

Add to `contributions.messages` in package.json:

```json
"import-complete": {
    "methods": ["default.importComplete"]
}
```

This wires the `import-complete` message to the browser panel's `importComplete` method so the panel can update its importing state.

- [ ] **Step 3: Install TypeScript and compile**

```bash
cd VFXBrowser/extensions/ikame-vfx-browser
npm init -y
npm install typescript --save-dev
npx tsc
```

Expected: Compiles with possible warnings about Editor global not being typed. All `.js` files appear in `dist/`.

- [ ] **Step 4: Verify dist structure**

```bash
ls -R dist/
```

Expected structure:
```
dist/
  main.js
  scene.js
  panels/
    browser/index.js, style.js
    import-review/index.js, style.js
  services/api.js, importer.js
  mappers/index.js, types.js, main.js, emission.js, shape.js, ...
  utils/json-helpers.js, curve-converter.js, gradient-converter.js
```

- [ ] **Step 5: Open in Cocos Creator and verify**

1. Open VFXBrowser project in Cocos Creator 3.8.8
2. Go to menu: Extensions â†’ IKame VFX Browser
3. Panel should open with toolbar, empty sidebar, empty list
4. Enter server URL, click Refresh
5. If server is running: catalog loads, categories appear, list populates
6. Click Import on any item â†’ Import Review panel opens

- [ ] **Step 6: Commit**

```bash
git add VFXBrowser/extensions/ikame-vfx-browser/
git commit -m "feat(cocos): complete ikame-vfx-browser extension v1 â€” browse, review, import"
```

---

### Task 12: Add TypeScript Declaration for Editor Global

**Files:**
- Create: `VFXBrowser/extensions/ikame-vfx-browser/src/@types/editor.d.ts`

- [ ] **Step 1: Create editor type declarations**

```typescript
/** Minimal type declarations for Cocos Creator Editor globals */
declare namespace Editor {
    namespace Panel {
        function open(panelId: string, ...args: any[]): void;
        function close(panelId: string): void;
        function define<T>(options: T): T;
    }
    namespace Message {
        function send(extensionName: string, message: string, ...args: any[]): void;
        function request(extensionName: string, message: string, ...args: any[]): Promise<any>;
        function broadcast(message: string, ...args: any[]): void;
    }
    namespace Profile {
        function getProject(extensionName: string, key: string, level?: string): Promise<any>;
        function setProject(extensionName: string, key: string, value: any, level?: string): Promise<void>;
        function getConfig(extensionName: string, key: string, level?: string): Promise<any>;
        function setConfig(extensionName: string, key: string, value: any, level?: string): Promise<void>;
    }
    namespace App {
        const path: string;
    }
    namespace Utils {
        namespace UUID {
            function compressUUID(uuid: string, minimal: boolean): string;
        }
    }
    function log(...args: any[]): void;
    function warn(...args: any[]): void;
    function error(...args: any[]): void;
}
```

- [ ] **Step 2: Update tsconfig.json to include declarations**

Add to `compilerOptions`:
```json
"typeRoots": ["./src/@types"]
```

- [ ] **Step 3: Recompile and verify no type errors**

```bash
cd VFXBrowser/extensions/ikame-vfx-browser
npx tsc
```

- [ ] **Step 4: Commit**

```bash
git add VFXBrowser/extensions/ikame-vfx-browser/src/@types/
git add VFXBrowser/extensions/ikame-vfx-browser/tsconfig.json
git commit -m "feat(cocos): add Editor type declarations for TypeScript compilation"
```

