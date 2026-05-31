# IKAME VFX Framework — Domain Context

## Glossary

- **VFX Hub** — the complete system: server + web frontend + Unity editor tools for managing VFX assets internally
- **IKAME VFX** — the Unity project containing the particle effects library and editor tools
- **VFX Package** — a zip file containing a particle prefab + all dependencies (materials, textures, shaders) + metadata
- **Particle JSON** — a `{prefabName}.particle.json` file inside the zip that describes the full ParticleSystem hierarchy, enabling cross-engine import (e.g., Cocos Creator)
- **AssetBundle** — Unity binary bundle built for WebGL platform, used by the WebGL viewer for real-time preview
- **Blend Mode Tag** — either `"AB"` (Alpha Blend) or `"ADD"` (Additive), determines the material blending mode
- **Sprite Slice** — when a texture is a sprite sheet, each sub-sprite has rect/pivot/border metadata describing its position within the atlas
- **TSA (Texture Sheet Animation)** — Unity's ParticleSystem module that animates through sprite frames over particle lifetime

## Architecture

```
IKameVFXSever/ (Node.js Express)
  ├── REST API: /api/vfx/* (upload, catalog, download, bundle, admin)
  ├── Auth: /auth/* (Google OAuth, admin password)
  ├── Storage: /storage/{category}/{name}/ (zip + gif + bundle + meta.json)
  └── Serves: VFXHub/ (web) + webgl-build/ (Unity WebGL viewer)

VFXHub/ (React, own git repo)
  ├── Browse VFX as card grid with GIF thumbnails
  ├── Modal detail with WebGL live preview (iframe → Unity)
  ├── Hidden admin panel (5-click logo → password "zonzon2610" via POST /auth/admin)
  └── Google OAuth for download auth

IKAME_VFX/ (Unity 2022.3 URP, own git repo)
  ├── Assets/_IKameVFX/ — core VFX library (shaders, prefabs, textures)
  ├── Editor tools:
  │   ├── IKameVFXConverter — convert 3rd-party VFX to IKAME format
  │   ├── VFXPublisher — scan, GIF record, zip, upload to server
  │   ├── VFXBrowser — browse server catalog, import packages
  │   ├── GifEncoder/GifRecorder — animated GIF capture
  │   └── ParticlePreviewWindow — grid preview of particle effects
  └── Runtime:
      └── ParticleViewer — WebGL viewer (load AssetBundle, render, camera orbit)
```

---

## Particle JSON Export Spec

When uploading a VFX package, the Unity Publisher generates a `{prefabName}.particle.json` file at the root of the zip. This file captures the complete ParticleSystem hierarchy with enough detail to recreate the effect in other engines (primarily Cocos Creator).

### Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Export depth | Full — all ParticleSystem modules | Cocos extension decides what to use/ignore |
| Hierarchy | Preserve parent-children tree | Prefab may have 3-5 sub-emitters (fire, smoke, sparks) |
| Textures | Raw files in zip, JSON references by filename | Cocos extension handles format conversion |
| Sprite slicing | Full metadata (rect, pivot, border, meshType, packingTag, ppu) | Enables Cocos to reconstruct sprite atlas |
| Material info | Blend mode tag only ("AB" or "ADD") | Cocos has different material system; just needs blend intent |
| File naming | `{prefabName}.particle.json` at zip root | Clear association with prefab |

### JSON Schema

```json
{
  "version": 1,
  "generator": "IKameVFXPublisher",
  "prefabName": "BloodExplosion_IKAME",
  "root": {
    "name": "BloodExplosion_IKAME",
    "transform": {
      "localPosition": [0, 0, 0],
      "localRotation": [0, 0, 0, 1],
      "localScale": [1, 1, 1]
    },
    "particleSystem": {
      "blendMode": "ADD",
      "mainModule": {
        "duration": 1.0,
        "looping": false,
        "startDelay": 0,
        "startLifetime": { "mode": "constant", "value": 1.5 },
        "startSpeed": { "mode": "randomBetweenTwoConstants", "min": 2, "max": 5 },
        "startSize": { "mode": "constant", "value": 1.0 },
        "startRotation": { "mode": "constant", "value": 0 },
        "startColor": { "mode": "color", "value": [1, 0.5, 0, 1] },
        "gravityModifier": 0,
        "simulationSpace": "world",
        "playOnAwake": true,
        "maxParticles": 100
      },
      "emissionModule": {
        "enabled": true,
        "rateOverTime": { "mode": "constant", "value": 50 },
        "bursts": [
          { "time": 0, "count": { "mode": "constant", "value": 20 }, "cycles": 1, "interval": 0.01, "probability": 1 }
        ]
      },
      "shapeModule": {
        "enabled": true,
        "shapeType": "sphere",
        "radius": 0.5,
        "radiusThickness": 1,
        "angle": 25,
        "arc": 360,
        "position": [0, 0, 0],
        "rotation": [0, 0, 0],
        "scale": [1, 1, 1]
      },
      "velocityOverLifetimeModule": {
        "enabled": false,
        "x": { "mode": "constant", "value": 0 },
        "y": { "mode": "constant", "value": 0 },
        "z": { "mode": "constant", "value": 0 },
        "space": "local"
      },
      "sizeOverLifetimeModule": {
        "enabled": true,
        "size": { "mode": "curve", "curve": [[0, 1], [0.5, 0.8], [1, 0]] }
      },
      "colorOverLifetimeModule": {
        "enabled": true,
        "color": {
          "mode": "gradient",
          "gradient": {
            "colorKeys": [[0, [1, 0.7, 0, 1]], [0.5, [1, 0.3, 0, 1]], [1, [0.2, 0, 0, 0]]],
            "alphaKeys": [[0, 0], [0.1, 1], [0.8, 0.5], [1, 0]]
          }
        }
      },
      "rotationOverLifetimeModule": { "enabled": false },
      "noiseModule": { "enabled": false },
      "collisionModule": { "enabled": false },
      "subEmittersModule": { "enabled": false },
      "textureSheetAnimationModule": {
        "enabled": true,
        "mode": "sprites",
        "sprites": ["spark_atlas_0", "spark_atlas_1", "spark_atlas_2"],
        "frameOverTime": { "mode": "curve", "curve": [[0, 0], [1, 1]] },
        "cycleCount": 1
      },
      "trailModule": {
        "enabled": false
      },
      "rendererModule": {
        "renderMode": "billboard",
        "sortMode": "none",
        "normalDirection": 1,
        "minParticleSize": 0,
        "maxParticleSize": 0.5
      }
    },
    "children": [
      {
        "name": "Smoke",
        "transform": { "localPosition": [0, 0.2, 0], "localRotation": [0, 0, 0, 1], "localScale": [1, 1, 1] },
        "particleSystem": { "...same structure..." },
        "children": []
      }
    ]
  },
  "textures": {
    "spark_atlas.png": {
      "fileName": "spark_atlas.png",
      "width": 512,
      "height": 512,
      "filterMode": "bilinear",
      "wrapMode": "clamp",
      "sprites": [
        {
          "name": "spark_atlas_0",
          "rect": { "x": 0, "y": 256, "width": 256, "height": 256 },
          "pivot": { "x": 0.5, "y": 0.5 },
          "border": { "x": 0, "y": 0, "z": 0, "w": 0 },
          "meshType": "fullRect",
          "packingTag": "",
          "pixelsPerUnit": 100
        },
        {
          "name": "spark_atlas_1",
          "rect": { "x": 256, "y": 256, "width": 256, "height": 256 },
          "pivot": { "x": 0.5, "y": 0.5 },
          "border": { "x": 0, "y": 0, "z": 0, "w": 0 },
          "meshType": "fullRect",
          "packingTag": "",
          "pixelsPerUnit": 100
        }
      ]
    }
  }
}
```

### MinMaxCurve value format

Unity's `MinMaxCurve` is serialized based on its mode:

| Mode | JSON |
|------|------|
| `constant` | `{ "mode": "constant", "value": 5.0 }` |
| `curve` | `{ "mode": "curve", "curve": [[time, value], ...], "multiplier": 1.0 }` |
| `randomBetweenTwoConstants` | `{ "mode": "randomBetweenTwoConstants", "min": 1.0, "max": 5.0 }` |
| `randomBetweenTwoCurves` | `{ "mode": "randomBetweenTwoCurves", "curveMin": [...], "curveMax": [...], "multiplier": 1.0 }` |

### MinMaxGradient value format

| Mode | JSON |
|------|------|
| `color` | `{ "mode": "color", "value": [r, g, b, a] }` |
| `gradient` | `{ "mode": "gradient", "gradient": { "colorKeys": [[time, [r,g,b,a]], ...], "alphaKeys": [[time, alpha], ...] } }` |
| `randomBetweenTwoColors` | `{ "mode": "randomBetweenTwoColors", "min": [r,g,b,a], "max": [r,g,b,a] }` |
| `randomBetweenTwoGradients` | `{ "mode": "randomBetweenTwoGradients", "gradientMin": {...}, "gradientMax": {...} }` |

### ParticleSystem modules to export (full list)

1. **Main** — duration, looping, startDelay, startLifetime, startSpeed, startSize, startSize3D, startRotation, startRotation3D, startColor, gravityModifier, simulationSpace, scalingMode, playOnAwake, maxParticles
2. **Emission** — rateOverTime, rateOverDistance, bursts[]
3. **Shape** — shapeType, radius, radiusThickness, angle, arc, position, rotation, scale, meshShapeType, alignToDirection
4. **Velocity over Lifetime** — x, y, z, space, orbitalX/Y/Z, radial
5. **Limit Velocity over Lifetime** — speed, dampen, separateAxes
6. **Inherit Velocity** — mode, curve
7. **Force over Lifetime** — x, y, z, space
8. **Color over Lifetime** — color gradient
9. **Size over Lifetime** — size (separateAxes: x, y, z)
10. **Size by Speed** — size, range
11. **Rotation over Lifetime** — angularVelocity (separateAxes: x, y, z)
12. **Rotation by Speed** — angularVelocity, range
13. **External Forces** — multiplier
14. **Noise** — strength, frequency, scrollSpeed, damping, octaveCount, quality
15. **Collision** — type, mode, dampen, bounce, lifetime/speed loss
16. **Triggers** — not exported (runtime-specific)
17. **Sub Emitters** — birth/collision/death sub-emitter references (by child index)
18. **Texture Sheet Animation** — mode (grid/sprites), tiles, animation, frameOverTime, sprites[], cycleCount
19. **Lights** — not exported (engine-specific)
20. **Trails** — ratio, lifetime, minVertexDistance, worldSpace, dieWithParticle, widthOverTrail, colorOverTrail, colorOverLifetime
21. **Custom Data** — not exported
22. **Renderer** — renderMode, sortMode, normalDirection, material blend mode tag

### Cocos Creator Integration (future)

A Cocos Creator extension will:
1. Read `{prefabName}.particle.json` from imported zip
2. Map Unity ParticleSystem modules → Cocos Creator ParticleSystem3D properties
3. Import textures, reconstruct sprite sheets from slice metadata
4. Create Cocos materials based on blend mode tag (AB → alpha-blend, ADD → additive)
5. Rebuild the hierarchy as a Cocos Node tree with ParticleSystem components

Not all Unity modules map 1:1 to Cocos. The extension will handle unmapped modules gracefully (skip with warning log).
