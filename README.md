# MyDiary — The Complete Shelf

An editorial 3D memory library powered by Three.js and inspired by [The Complete Shelf](https://github.com/mintdotgg/mint-playground/tree/main/experiences/complete-shelf), hosted statically on **GitHub Pages** and paired with a dedicated persistent storage backend on **`kaushals-mini-server`**.

## Features

- **3D Continuous Walnut Shelf:** Browse 19 varied clothbound hardcover notebooks (e.g., *Memories of 2022*, *Memories of 2023*, *Memories of 2024*, etc.) using drag, mouse wheel, arrow keys, navigation buttons, or timeline position ticks.
- **3D Pull-Forward Inspection:** Click any book to pull it off the shelf into an orbit, pan, and zoom inspection stage, preview saved memories inside, customize its clothbound cover, or open the full volume.
- **Book Memory Archive (`/book?id=...`):** View every memory bound inside a notebook with search and mood filters.
- **Dedicated Memory Composer Page (`/compose?bookId=...`):** Write a keepsake note, craft long-form diary paragraphs, upload multiple photos with captions and cover selection, choose an album layout (*Archival Polaroid*, *Editorial Grid*, or *Contact Sheet*), and bind it as a Memory Album.
- **Memory Album Spread (`/memory?bookId=...&id=...`):** Revisit any saved memory as a two-page editorial spread with full-screen lightbox photo viewing.

## Architecture: GitHub Pages + Instabox

- **Frontend (GitHub Pages):** Static export built via [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) into `./out` (`basePath: "/MyDiary"`). Enable in GitHub repo **Settings → Pages → Source: GitHub Actions**.
- **Backend (`kaushals-mini-server`):** Node.js + Express + Multer + PM2 on port `4321` (`https://4321-agq2i7yzuidu26jymgrfnit3ea.instabox.tech`) storing books, memories JSON, and uploaded photos under `storage-server/data/`.

## Storage on `kaushals-mini-server` (Instabox + PM2)

On `user@instabox-kaushals-mini-server:~$` (if you previously cloned an empty `MyDiary` directory, remove it first):

```bash
rm -rf MyDiary
git clone https://github.com/kaushalboii/MyDiary.git
cd MyDiary/storage-server
bash setup-mini-server.sh
```

Then open port **`4321`** in your Instabox **Ports** tab, copy the generated **`https://`** URL (HTTPS is required when accessing from GitHub Pages), click the **Storage** pill in the MyDiary header, paste the URL, and click **Save & Connect**.

> Optional security: edit `storage-server/.env` on `kaushals-mini-server` to set `DIARY_STORAGE_TOKEN=your-secret-token` and restart with `pm2 restart mydiary-storage --update-env`.

## Run Locally

```bash
npm install
npm --prefix storage-server install
npm run dev:all
```

- Web UI: `http://127.0.0.1:5203`
- Local Storage Server: `http://127.0.0.1:4321`
