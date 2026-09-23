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

const DEFAULT_VIDEO_LINKS_PATH = path.join(
  __dirname,
  '..',
  '..',
  'the-green-school-international-frontend',
  'src',
  'pages',
  'Gallery',
  'videoLinks.json'
);

const seedVideos = async () => {
  const videoLinksPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_VIDEO_LINKS_PATH;

  if (!fs.existsSync(videoLinksPath)) {
    throw new Error(`videoLinks.json not found at ${videoLinksPath}`);
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
