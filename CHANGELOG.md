# Changelog

All notable changes, working progress, and developers notes for the CincoScribe project.

> [!WARNING]
> **Project Status**: Still NOT an MVP yet. Critical functionality and packaging issues are currently under active development.

---

## [1.0.0] - 2026-07-16

### Successful Working Features (Fully Functional)
- **Theme Changer**: Works seamlessly between dark/light appearance.
- **Merge Audio**: Custom multi-track audio concatenation is fully working.
- **Transcriber**: Local browser and API-based scribing works.

### Refactored & Improved
- **Default Port Migration**: Migrated the FastAPI Python sidecar default startup port from `3901` to `5555`.
- **Models Page Refactoring**: Moved the Model Download Directory configuration and Model Migration workflow out of the Settings modal and directly into the Models Page.
- **Model Deletion Security**: Added an explicit confirmation warning dialog stating that deleting a model from local storage is `UNREVERSIBLE`.

### Fixed
- **Merge Audio page JS crash**: Restored the missing `Utils.fileToBase64` helper function, resolving a silent JS crash when attempting to merge files.
- **Settings Page CSS Restored**: Restored the `.setting-group` and relative flex styling classes that were accidentally removed.
- **History Delete Button**: Implemented the missing `AppState.deleteHistory` method, allowing users to successfully purge entries from their history.
- **Cache Invalidation**: Appended updated version query parameters (`?v=8` and `?v=9`) to critical script tags in `index.html` to prevent stale browser caching.

---

## [Pending Fixes & Working Area]

### Known Errors & Issues
- **Executable Build Failure**: Running `npm run build` and launching the generated desktop executable fails with a Javascript error on startup.
- **Folder Change Bug**: Changing the models directory doesn't work properly yet and requires additional stability fixes.
- **Model Download & Routing Issues**: Model download triggers can fail, and page routing problems are still present.
- **Firefox CORS (null) Block**: Connection refused if python server is not restarted on port 5555. Restarting the Electron app fixes this.
- **Browser WASM Download Flicker**: Dynamic WebAssembly model downloads via Transformers.js can trigger fast UI layout shifts during segment loading.

### Working Area & Next Steps
- **Text to Speech (TTS)**: Needs to be worked on (currently incomplete/non-functional).
- **CUDA/PyTorch Diagnostic tool**: Add a localized script to pre-verify system capability for GPU acceleration before downloading larger models.
- **Automatic Port Fallback**: Implement automated port scanning in the sidecar and Electron processes to dynamically assign an alternative port if `5555` is occupied.
