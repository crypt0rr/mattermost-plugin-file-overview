# Changelog

All notable changes to Mattermost File Overview are documented here.

## [0.3.1] - 2026-08-26

### Fixed

- Clear cached file rows, message context, pagination, and open previews when a browse or native-search request returns `401` or `403`.
- Prevent stale conversation metadata from remaining visible after access to the active channel is revoked.
- Keep the retry path available so the overview can recover when access is restored.

### Validation

- Webapp tests, coverage, lint, and TypeScript checks pass.
- Go tests, vet, lint, production build, and multi-platform package checks pass.
- Live Mattermost v11.7 and v11.10 installation and integration validation remains required before publication.

## [0.3.0] - 2026-08-25

### Added

- Message context for files, including post navigation and full Mattermost post permalinks.
