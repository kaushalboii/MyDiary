# MyDiary 📖

An editorial **3D physical memory library & interactive flipbook diary** built with **Next.js 16**, **React 19**, **Three.js**, and **Tailwind CSS v4**. Experience personal diaries, notes, and photo albums as clothbound hardcovers resting on a continuous walnut shelf with synchronized flipbook page turning, full customization, and client-side **AES-256-GCM** vault security.

> **Created with ❤️ by [M Kaushal Maran](https://github.com/kaushalboii)**
>
> [![Sponsor kaushalboii](https://img.shields.io/badge/Sponsor-%E2%9D%A4-ea4aaa?style=flat-square&logo=GitHub%20Sponsors)](https://github.com/sponsors/kaushalboii)
> [![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
> [![Security: E2EE Vault](https://img.shields.io/badge/Security-AES--256--GCM-green.svg)](SECURITY.md)
> [![GitHub Release](https://img.shields.io/github/v/release/kaushalboii/MyDiary)](https://github.com/kaushalboii/MyDiary/releases)

---

## 💖 Sponsor & Support

MyDiary is an independent open-source creation by **[M Kaushal Maran](https://github.com/kaushalboii)**. If you love using MyDiary, find it inspiring, or want to support ongoing development, physical book aesthetics, and cloud sync infrastructure, please consider sponsoring!

<div align="center">

<a href="https://github.com/sponsors/kaushalboii">
  <img src="https://img.shields.io/badge/Sponsor%20@kaushalboii-%E2%9D%A4-ea4aaa?style=for-the-badge&logo=githubsponsors&logoColor=white" alt="Sponsor on GitHub" height="42" />
</a>

<br /><br />

<a href="https://github.com/sponsors/kaushalboii">
  <img src="https://img.shields.io/badge/GitHub%20Sponsors-M%20Kaushal%20Maran-181717?style=flat-square&logo=github&logoColor=white" alt="GitHub Sponsors Profile" />
</a>
&nbsp;
<a href="https://github.com/sponsors/kaushalboii">
  <img src="https://img.shields.io/badge/Sponsorship%20Tiers-Custom%20%26%20Monthly-2ea44f?style=flat-square&logo=github" alt="Sponsorship Tiers" />
</a>

<p>
  <strong>Click above to sponsor via GitHub Sponsors. Every tier and one-time tip is deeply appreciated!</strong>
</p>

</div>

---

## 📸 Visual Preview

| 3D Walnut Shelf | Full-Scale 3D FlipBook Reader |
| :---: | :---: |
| ![3D Bookshelf](docs/screenshots/desktop-shelf-light.png) | ![FlipBook Reader](docs/screenshots/desktop-flipbook.png) |

| Book Studio Customizer | Flexible Memory Composer |
| :---: | :---: |
| ![Book Studio](docs/screenshots/desktop-book-studio.png) | ![Memory Composer](docs/screenshots/desktop-compose.png) |

---

## ✨ Features

- **Continuous 3D Walnut Shelf (`/`):** Three.js procedural bookshelf with clothbound spines, tactile paper thickness, smooth mouse/keyboard navigation, and 3D pull-forward book inspection.
- **Interactive 3D FlipBook Reader (`/book`):** Opens hardcover into synchronized page spreads (desktop) or single-sheet swipe (mobile) with photo zoom lightboxes and an **Inline Arrange** canvas.
- **Book Studio Customizer:** Real-time visual editor for bookcloth textures, secondary bands, gold foil accents, motif art, paper rulings (dot grid, lined, graph, smooth), and fonts.
- **Flexible Memory Composer (`/compose`):** Freeform memory creation supporting text, note cards, photos, and custom spread placement without mandatory fields.
- **Vault Security & Privacy:** Client-side passphrase encryption using **PBKDF2-SHA256 (310k iterations)** and **AES-256-GCM**. Zero personal entries, credentials, or private URLs are bundled in static builds.
- **Offline Mode & Sync:** Automatic fallback to browser `IndexedDB` when disconnected, with seamless one-click restoration when reconnected.
- **Verlet Rope Theme Toggle:** Pull or drag the hanging cord to simulate real-time Verlet pendulum physics and switch between warm Light Mode and Obsidian Dark Mode.

---

## 🛠️ Tech Stack

- **Frontend:** Next.js 16 (Static Export), React 19, TypeScript
- **3D & Physics:** Three.js, Verlet Integration Rope Engine
- **Styling & UI:** Tailwind CSS v4, Lucide Icons, Newsreader & Inter fonts
- **Security & Vault:** WebCrypto API (`PBKDF2-SHA256` + `AES-256-GCM`)
- **Storage Backend (Optional):** Node.js, Express, `scrypt` hashing & HMAC media signing

---

## 📁 Project Structure

```text
MyDiary/
├── .github/
│   ├── FUNDING.yml            # GitHub Sponsors configuration
│   └── workflows/             # GitHub Actions CI/CD workflows
│       ├── deploy.yml         # GitHub Pages static export deployment
│       ├── keepalive.yml      # Storage backend health ping
│       └── release.yml        # Automated GitHub releases on tag push
├── docs/                      # Screenshots and documentation assets
├── scripts/                   # Local orchestration utilities
│   └── dev-all.mjs            # Concurrent runner for Next.js and backend
├── src/
│   ├── app/                   # Next.js 16 App Router
│   │   ├── book/page.tsx      # 3D FlipBook interactive reader & in-book editor
│   │   ├── compose/page.tsx   # Memory composer studio route
│   │   ├── memory/page.tsx    # Single-memory focused reading view
│   │   ├── page.tsx           # Home 3D walnut bookshelf experience
│   │   ├── layout.tsx         # Root layout with font imports & theme setup
│   │   ├── robots.ts          # SEO crawler configuration
│   │   └── sitemap.ts         # Dynamic static sitemap
│   ├── components/            # Reusable UI & modal components
│   │   ├── DiaryShelfExperience.tsx # Three.js canvas integration
│   │   ├── FlipBookReader.tsx       # Physics-based dual-page flipbook
│   │   ├── FreeformPageBlocks.tsx   # Draggable block layout engine
│   │   ├── MemoryEditorModal.tsx    # In-book real-time memory editor
│   │   ├── VolumeEditorModal.tsx    # Book studio cloth, motif & styling customizer
│   │   ├── StorageSettingsModal.tsx # Account, E2EE vault & sync modal
│   │   └── ThemeToggle.tsx          # Verlet rope pendulum light/dark toggle
│   ├── lib/                   # Core business logic & security libraries
│   │   ├── memory-layout.ts   # Spread calculation, styling & block synchronization
│   │   ├── storage-client.ts  # Client-side API, offline IndexedDB & encryption hooks
│   │   ├── vault-security.ts  # WebCrypto AES-256-GCM + PBKDF2 encryption engine
│   │   └── types.ts           # Comprehensive TypeScript type definitions
│   └── three/                 # Three.js 3D rendering pipeline
│       ├── ShelfEngine.ts     # Procedural shelf, shadows & lighting
│       ├── cover-art.ts       # Canvas procedural cloth & gold foil generative textures
│       └── book-motion.ts     # Physics animation & inspection camera math
├── storage-server/            # Optional lightweight Node.js storage microservice
│   ├── server.mjs             # Multi-tenant scoped API with Scrypt & HMAC auth
│   ├── setup-mini-server.sh   # One-command production deployment script
│   └── default-books.json     # Starter books baseline
├── .env.example               # Frontend environment template
├── LICENSE                    # MIT License with author attribution
├── package.json               # Project manifest, scripts & dependencies
├── SECURITY.md                # Anti-tamper & E2EE security policy
└── tsconfig.json              # Strict TypeScript configuration
```

---

## 🔒 Security & Anti-Tamper Architecture

MyDiary is built with **Zero-Knowledge privacy** at its foundation:
- **Client-Side Encryption:** All journal texts, notes, and coordinates are encrypted using `AES-256-GCM` in the user's browser via the WebCrypto API.
- **Key Derivation:** Master keys are derived from your passphrase using `PBKDF2-SHA256` with **310,000 iterations** and a unique per-user salt.
- **Zero-Knowledge Storage:** The server only stores ciphertext. Even if server files are accessed without authorization, **no entries can be decrypted without the user's secret passphrase**.
- **No Leaked Secrets:** Static builds contain zero tokens or private URLs. Passwords and tokens are never stored in plaintext `localStorage`.
- See [SECURITY.md](SECURITY.md) for full security specifications and reporting guidelines.

---

## 🚀 Quick Start

### 1. Clone the repository
```bash
git clone https://github.com/kaushalboii/MyDiary.git
cd MyDiary
```

### 2. Install dependencies
```bash
npm install
npm --prefix storage-server install
```

### 3. Run development server
```bash
# Starts both Next.js frontend and local storage server
npm run dev:all
```

- **Web App:** [http://127.0.0.1:5203](http://127.0.0.1:5203)
- **Local Storage API:** [http://127.0.0.1:4321](http://127.0.0.1:4321)

### 4. Build for Production
```bash
npm run build
```
Generates a static export bundle inside the `out/` directory, ready to deploy to GitHub Pages, Vercel, or Netlify.

---

## 📜 Available Scripts

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts the Next.js frontend on port `5203` |
| `npm run dev:storage` | Starts the local Node.js storage server on port `4321` |
| `npm run dev:all` | Runs frontend and storage server together |
| `npm run build` | Builds the static export production bundle (`out/`) |
| `npm run start` | Serves the static `out/` build locally |
| `npm run type-check` | Runs TypeScript compiler checks |

---

## 🔒 Optional Self-Hosted Storage Server

To run your own private storage backend:

```bash
cd storage-server
cp .env.example .env
node server.mjs
```

Inside the web app, navigate to **Menu → Security & Members**, enter your private storage URL, and claim your encrypted vault.

---

## 👤 Author & Creator

**Created with ❤️ by [M Kaushal Maran](https://github.com/kaushalboii)**

- GitHub: [@kaushalboii](https://github.com/kaushalboii)
- Repository: [https://github.com/kaushalboii/MyDiary](https://github.com/kaushalboii/MyDiary)

---

## 📄 License & Intellectual Property Ownership

Copyright © 2026 **M Kaushal Maran**. All rights reserved.

This project is licensed under the [MIT License](LICENSE).

### What this means:
- **Sole Ownership:** The original concept, 3D physical shelf & flipbook experience, editorial layouts, and source code are the original creation and intellectual property of **M Kaushal Maran**.
- **Usage Rights:** Anyone is permitted to use, run, fork, study, and build upon this project for free.
- **Mandatory Attribution:** Any copies, forks, or derivative distributions **must retain the original copyright notice and attribution to M Kaushal Maran**. Users and forks cannot claim ownership or creation of the original concept or project.
