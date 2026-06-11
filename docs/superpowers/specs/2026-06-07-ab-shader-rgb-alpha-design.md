# AB Shader — RGB Alpha Fix

## Problem

IKAME_Particle_AB uses `Blend SrcAlpha OneMinusSrcAlpha`. VFX textures from third-party sources often have black backgrounds with no alpha channel (or fully opaque alpha), designed for Additive blending where black = transparent. When used with the AB shader, black areas render as solid black blocks.

## Solution

Add a `_UseRGBAlpha` toggle (default ON) to the `Blend_CenterGlow` shader. When enabled, multiply the output alpha by `max(R, G, B)` of the final RGB color — making dark/black pixels transparent automatically.

## Changes

### File: `IKAME_VFX/Assets/_IKameVFX/Shader/Blend_CenterGlow.shader`

1. Add property:
   ```hlsl
   [Toggle]_UseRGBAlpha("Use RGB as Alpha", Float) = 1
   ```

2. Add uniform:
   ```hlsl
   uniform float _UseRGBAlpha;
   ```

3. Modify fragment output — before `appendResult87`, compute RGB-derived alpha:
   ```hlsl
   float rgbAlpha = max(finalRGB.r, max(finalRGB.g, finalRGB.b));
   // lerp(1, rgbAlpha, _UseRGBAlpha) = 1 when OFF, rgbAlpha when ON
   finalAlpha *= lerp(1, rgbAlpha, _UseRGBAlpha);
   ```

## Impact

- Existing `IKAME_Particle_AB` material: automatically picks up default ON (new property not yet saved in .mat)
- Textures with black backgrounds: black areas become transparent
- Textures with bright colors + proper alpha: minimal visual change (brightness near 1)
- Textures with intentionally dark areas: may become slightly more transparent
- To revert to old behavior: turn toggle OFF in material inspector

## No other changes needed

- No new materials required
- No converter changes
- ADD shader (`Blend One One`) unaffected — black is already transparent in additive blending
