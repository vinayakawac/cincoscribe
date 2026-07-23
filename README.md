<p align="center">
  <img src="./cincoscribe.svg" width="120" height="120" alt="CincoScribe Logo" />
</p>

<h1 align="center">CincoScribe</h1>

<p align="center">
  Free, Local-First Audio Transcription &amp; Speech Synthesis Application
</p>

---

> [!NOTE]
> **Development Notice**: The **Manage Voices (Custom Voices)** feature is currently under active development and will be released in an upcoming version.

---

## Overview

CincoScribe is a privacy-first, desktop and web application designed for fast, accurate audio transcription and speech synthesis. It operates locally with no external tracking or remote license dependencies.

---

## Key Features

- **Audio Transcription**: Multi-language transcription powered by local WebAssembly Whisper models with timestamp support.
- **Speech Synthesis (TTS)**: Offline text-to-speech generation with model switching.
- **Audio Concatenation**: Multi-track audio merging tool for joining audio segments.
- **Privacy First**: 100% local execution with no tracking or remote telemetry.
- **Theme Options**: Built-in support for dark and light appearance modes.

---

## Monorepo Architecture

```
├── packages/
│   ├── core/             # Core transcription and utility logic
│   ├── desktop/          # Electron desktop application and FastAPI Python sidecar
│   ├── ui/               # Shared UI component library
│   └── web/              # Next.js web frontend application
├── js/                   # Core SPA page controllers and routing logic
├── css/                  # Application stylesheets and design system
├── index.html            # Primary application UI container
├── package.json          # Root monorepo workspace configuration
├── LICENSE               # MIT License
└── README.md             # Project documentation
```

---

## Prerequisites

- **Node.js**: Version 18.0 or higher
- **npm**: Version 9.0 or higher
- **Python**: Version 3.10+ (managed via `uv` or system Python `py`)

---

## Installation

Clone the repository and install all dependencies:

```bash
git clone https://github.com/vinayakawac/CincoScribe.git
cd CincoScribe
npm install
```

---

## Development Workflows

### Desktop Application (Electron + FastAPI Sidecar)

```bash
npm run dev:desktop
```

Launches the Electron application alongside the Python sidecar backend.

### Web Application

```bash
npm run dev:web
```

Launches the web application development server.

---

## Production Build Instructions

### Windows Desktop Installer

```bash
npm run build:desktop
```

Generates the NSIS installer inside `packages/desktop/dist/`.

### Web Application Bundle

```bash
npm run build:web
```

Generates the production web application build inside `packages/web/.next/`.

---

## License

This project is licensed under the MIT License. See [LICENSE](./LICENSE) for details.
