# AVERON Portfolio

A polished personal portfolio for Muhammed-Jamiu Yusuf and AVERON. The site uses an abstract brand mark instead of a portrait. It includes project detail pages, a private admin area, a project inbox, and optional video previews.

## Open in VS Code

1. Open this folder in VS Code.
2. Install Node.js 20 or newer.
3. Open the VS Code terminal and run `npm install`.
4. Copy `.env.example` to `.env`. Set a private `ADMIN_PASSWORD` and a long random `SESSION_SECRET` before using the admin area.
5. Run `npm start` and visit `http://localhost:3000`. The admin page is at `http://localhost:3000/admin`.

The local portfolio database is created at `backend/data/portfolio.db` the first time the server starts. Add your real projects in **Admin → Add a website**. The provided database starts empty; no sample client work is invented.

The home page shows up to three projects at first. Visitors can choose **View more projects** to expand the list, or **Show fewer projects** to collapse it again.

## Before publishing

- Set `ADMIN_PASSWORD` and `SESSION_SECRET` in the hosting environment. The server has no built-in public default password.
- For Vercel, also set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN` for a persistent database.
- Never commit or upload `.env` or database credentials.
- Publish only real project work. Add a strong cover image and a clear project description for each case study.
- Contact form submissions are stored under **Admin → Messages**. The inbox refreshes every 30 seconds while open. The current setup does not send email notifications, so messages appear in the admin inbox only.

## Main routes

- `/` — portfolio
- `/project/<slug>` — project case study
- `/admin` — private project editor and inbox

Videos can be uploaded in the admin area (up to 150 MB) or linked from YouTube, Vimeo, or Loom.
