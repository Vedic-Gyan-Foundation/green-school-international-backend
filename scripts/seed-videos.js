// One-off migration: moves the hardcoded YouTube links the frontend used to ship in
// src/pages/Gallery/videoLinks.json into the `videos` table, so the admin panel owns them.
//
//   node scripts/seed-videos.js [path/to/videoLinks.json]
//
// Idempotent — a link whose url is already in the table is skipped, so re-running after
// adding entries to the JSON only inserts the new ones.

require('dotenv').config();

const fs = require('fs');
const path = require('path');

const Video = require('../models/Video');
const { pool } = require('../config/database');

// The frontend sits beside this repo locally, but on the server it lives under a different
// parent (greenschool-website/ vs greenschool-backend/). Try both rather than assuming one,
// and fall back to the explicit argv path.
const VIDEO_LINKS_CANDIDATES = [
  // local checkout: both repos are siblings
  path.join(__dirname, '..', '..', 'the-green-school-international-frontend'),
  // server layout: /home/vedicuser/vedicfoundation/greenschool-website/<frontend>
  path.join(
    __dirname,
    '..',
    '..',
    '..',
    'greenschool-website',
    'the-green-school-international-frontend'
  )
].map((base) => path.join(base, 'src', 'pages', 'Gallery', 'videoLinks.json'));

const resolveVideoLinksPath = () => {
  if (process.argv[2]) return path.resolve(process.argv[2]);
  return (
    VIDEO_LINKS_CANDIDATES.find((candidate) => fs.existsSync(candidate)) ||
    VIDEO_LINKS_CANDIDATES[0]
  );
};

const seedVideos = async () => {
  const videoLinksPath = resolveVideoLinksPath();

  if (!fs.existsSync(videoLinksPath)) {
    throw new Error(
      `videoLinks.json not found at ${videoLinksPath}. Tried:\n  ` +
        VIDEO_LINKS_CANDIDATES.join('\n  ') +
        '\nPass an explicit path: node scripts/seed-videos.js <path/to/videoLinks.json>'
    );
  }

  const entries = JSON.parse(fs.readFileSync(videoLinksPath, 'utf8'));

  // Read the table once instead of querying per row — there are only ever a few dozen.
  const existing = await Video.getAll(1, 10000);
  const existingUrls = new Set((existing.videos || []).map((item) => item.url));

  let inserted = 0;
  let skipped = 0;

  for (const entry of entries) {
    const url = (entry.url || '').trim();
    const title = (entry.title || '').trim();

    if (!url || !title || existingUrls.has(url)) {
      skipped++;
      continue;
    }

    await Video.create({
      url,
      title,
      published_at: entry.publishedAt || null
    });

    existingUrls.add(url);
    inserted++;
  }

  console.log(
    `🎬 Seeded videos from ${videoLinksPath} — ${inserted} inserted, ${skipped} skipped of ${entries.length} total`
  );
};

seedVideos()
  .catch((error) => {
    console.error('❌ Seeding videos failed:', error.message);
    process.exitCode = 1;
  })
  .finally(() => {
    pool.end();
  });
