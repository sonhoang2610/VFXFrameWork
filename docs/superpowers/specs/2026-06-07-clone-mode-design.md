# Clone Mode — IKameVFXConverter

## Summary

Add a third tab **Clone** to `IKameVFXConverter.cs` alongside existing Single and Batch tabs. Clone mode handles VFX prefabs with complex shaders/materials that cannot be simplified to IKAME AB/ADD. Instead of replacing materials, it clones all assets (material, textures, shader) into `_IKameVFX/` folders and produces a self-contained prefab.

## Requirements

- New **Clone** tab with a single unified flow (handles both single prefab and folder drag-drop)
- Clone material, all textures referenced by material, trail material
- Clone shader only if it's a custom shader in `Assets/` (built-in and package shaders keep original reference)
- Clone TSA sprite textures, preserve spritesheet import settings
- TSA mode stays unchanged (Grid stays Grid, Sprites stays Sprites)
- SubFolder field for organizing output under `_IKameVFX/` subfolders
- Prefab output preserves folder structure from dragged folders (same as Batch tab)

## UI Layout

```
[ Single | Batch | Clone ]
```

### Clone Tab

```
Sub Folder: [___________]

┌─ Drag Prefabs or Folders Here ──────────────┐
└─────────────────────────────────────────────┘
path/to/  prefabA.prefab  [X]
path/to/  prefabB.prefab  [X]
[Scan]  [Clear All]

── Assets to Clone: 12 ────────────────────────
Type     | Asset              | Status | Used | Action
Material | Fire_Mat.mat       | --     | 3    | Clone
Texture  | fire_tex.png       | --     | 3    | Clone
Shader   | CustomFire.shader  | --     | 2    | Clone
Material | Trail_Mat.mat      | Exists | 1    | OK
TSA Spr  | spark.png (3spr)   | --     | 1    | Clone

[Clone All Assets]  [Create All Prefabs]
```

## Output Folders

| Asset type | Destination |
|---|---|
| Material | `Assets/_IKameVFX/Material/{subFolder}/` |
| Texture | `Assets/_IKameVFX/Texture/{subFolder}/` |
| Shader | `Assets/_IKameVFX/Shader/{subFolder}/` |
| Prefab | User-selected folder + `{subFolder}/` + relative path |

## Data Model

### CloneAssetEntry

```csharp
private enum CloneAssetType { Material, Texture, Shader, TSASprites }

private class CloneAssetEntry
{
    public CloneAssetType type;
    public Object originalAsset;
    public Object clonedAsset;       // null until cloned
    public string originalPath;
    public string clonedPath;        // null until cloned
    public int usedByCount;
    // TSA-specific
    public List<Sprite> tsaSourceSprites;
    public List<Sprite> tsaClonedSprites;
}
```

Reuses existing fields from the converter:
- `clonePrefabs` — `List<GameObject>`
- `cloneRelativePaths` — `Dictionary<GameObject, string>`
- `cloneSubFolder` — `string`
- `cloneAssets` — `List<CloneAssetEntry>`

## Clone Logic

### Scan (`ScanCloneAssets`)

For each prefab, iterate all ParticleSystems:

1. **Material** (`renderer.sharedMaterial`): skip built-in → add to asset list as `Material`
2. **Textures in material**: iterate all texture properties on the shader → add each as `Texture`
3. **Shader** (`material.shader`): only if path starts with `Assets/` → add as `Shader`
4. **Trail material** (`renderer.trailMaterial`): same as main material
5. **TSA sprites**: if TSA enabled + Sprites mode + spriteCount > 0 → collect sprites, add backing textures as `TSASprites`

Deduplicate by `originalPath` — increment `usedByCount` for duplicates.

Check existing: for each entry, check if asset already exists at destination path → set `clonedAsset` if found.

### Clone All Assets (`CloneAllAssets`)

Process in order: **Shader → Texture → TSASprites → Material** (materials last, so we can update their references).

1. **Shader**: `AssetDatabase.CopyAsset(srcPath, destPath)` to `Shader/{subFolder}/`
2. **Texture**: `AssetDatabase.CopyAsset` to `Texture/{subFolder}/`, preserve import settings via `CopySourceTextureSettings`
3. **TSA Sprites**: Copy backing texture to `Texture/{subFolder}/`, preserve spritesheet settings (same approach as existing `CloneTSASprites` but output to `Texture/` not `SpriteAtlas/`), load cloned sprites by name match
4. **Material**: `AssetDatabase.CopyAsset` to `Material/{subFolder}/`, then:
   - Load cloned material
   - If shader was cloned → `clonedMat.shader = clonedShader`
   - For each texture property → if texture was cloned → `clonedMat.SetTexture(prop, clonedTexture)`
   - `EditorUtility.SetDirty` + save

### Create Prefabs (`CreateClonedPrefabs`)

For each prefab:

1. Determine output folder: user-selected + `{subFolder}/` + relative path
2. `AssetDatabase.CopyAsset` prefab → `{name}_Clone.prefab`
3. `PrefabUtility.LoadPrefabContents` → iterate ParticleSystems:
   - `renderer.sharedMaterial` → find matching `CloneAssetEntry` by original → swap to `clonedAsset`
   - `renderer.trailMaterial` → same swap
   - TSA sprites → find matching cloned sprites → swap (keep TSA mode unchanged)
4. `PrefabUtility.SaveAsPrefabAsset` + unload

## Methods Summary

New methods to add:

| Method | Purpose |
|---|---|
| `DrawCloneTab()` | UI for Clone tab |
| `DrawCloneAssetEntry(CloneAssetEntry)` | UI row per asset |
| `HandleClonePrefabDrop(Rect)` | Drag-drop handler (reuse logic from `HandlePrefabDrop`) |
| `ScanCloneAssets()` | Scan prefabs, collect unique assets |
| `CloneAllAssets()` | Clone all assets to _IKameVFX folders |
| `CreateClonedPrefabs()` | Copy prefabs, swap all references |
| `CloneTextureRaw(Texture2D)` | Copy texture preserving import settings (not as sprite) |
| `CloneShader(Shader)` | Copy .shader if custom |
| `CloneMaterialWithRemap(Material)` | Copy material, remap texture + shader refs |

Reused existing methods:

| Method | Usage |
|---|---|
| `IsBuiltInMaterial(Material)` | Skip built-in materials |
| `GetMainTexture(Material)` | Get texture from material |
| `GetSubFolder(root, sub)` | Create subfolder hierarchy |
| `CopySourceTextureSettings(src, dest)` | Preserve texture import settings |
| `DetectIsAdditive(Material)` | Not used in Clone mode |

## Edge Cases

- **Same texture used by multiple materials**: deduplicated in scan, cloned once, all materials reference same clone
- **Material with no textures**: still cloned (shader-only material)
- **Shader from Packages/ or built-in**: skip clone, cloned material keeps original shader reference
- **TSA Grid mode**: keep Grid mode unchanged, texture is already cloned as part of material texture scan (no special handling needed)
- **Prefab with mix of simple + complex particles**: all particles get cloned treatment (no AB/ADD option in Clone tab)
- **Existing cloned asset at dest path**: show "Exists" status, skip re-clone
