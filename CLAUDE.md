# IKAME VFX Framework

Internal VFX asset management system for iKame Global. Unity 2022.3 (URP) particle effects library with LAN server, web preview, and cross-engine export.

## Project structure

- `IKameVFXSever/` — Node.js Express backend (REST API, file storage, Google OAuth)
- `VFXHub/` — React web frontend (browse, preview, download VFX)
- `IKAME_VFX/` — Unity project (VFX library, editor tools, WebGL viewer)

## Agent skills

### Issue tracker

Issues are tracked as local markdown files under `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — one `CONTEXT.md` at root, ADRs in `docs/adr/`. See `docs/agents/domain.md`.
