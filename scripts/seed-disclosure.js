// One-off migration: moves the document rows that sections B and C of the frontend's
// PublicDisclosure page used to hardcode into the `disclosure_documents` table, so the
// admin panel owns them and the school can swap a PDF without a redeploy.
//
//   node scripts/seed-disclosure.js
//
// Idempotent — a row is matched on (section, title) and an existing match is left entirely
// alone. file_url is deliberately never overwritten: by the time this is re-run an admin may
// have replaced that document through the panel, and re-seeding must not revert their upload.

require('dotenv').config();

const DisclosureDocument = require('../models/DisclosureDocument');
const { promisePool, pool } = require('../config/database');

// The PDFs already sit in public/public_disclosure/ and are served by express.static.
const FILE_BASE = 'https://api.greenschoolguwahati.com/public_disclosure/';

// Duplicated from config/initDb.js on purpose: initDb only runs from the app's
// testConnection(), so a database that has never booted the app would have no table to seed.
const createDisclosureDocumentsTable = `
  CREATE TABLE IF NOT EXISTS disclosure_documents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    section CHAR(1) NOT NULL,
    title VARCHAR(500) NOT NULL,
    file_url VARCHAR(500) NOT NULL,
    link_label VARCHAR(100) NOT NULL DEFAULT 'Click to Download',
    link_type ENUM('download','view') NOT NULL DEFAULT 'download',
    is_numbered BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INT NOT NULL DEFAULT 0,
    is_visible BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_section_order (section, display_order)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

const SECTION_B_DOCUMENTS = [
  {
    title: 'Copies of affiliation/upgradation letter and recent extension of affiliation, if any',
    file: 'UPGRADATION_OF_AFFILIATION.pdf'
  },
  {
    title: 'Copies of societies/trust/company registration/renewal certificate, as applicable',
    file: 'VEDIC_GYAN_FOUNDATION_TRUST_DEED.pdf'
  },
  {
    title: 'Copy of No Objection Certificate (NOC) issued, if applicable, by the State Govt./UT',
    file: 'COPIES_OF_NOC.pdf'
  },
  {
    title:
      'Copies of the recognition certificate under the RTE Act, 2009, and its renewal if applicable',
    file: 'RECOGNITION_CERTIFICATE.pdf'
  },
  {
    title: 'Copy of valid building safety certificate as per the National Building Code',
    file: 'BUILDING_SAFETY_CERTIFICATE.pdf'
  },
  {
    title: 'Copy of valid fire safety certificate issued by the competent authority',
    file: 'FIRE_NOC.pdf'
  },
  {
    title:
      'Copy of the self certification submitted by the school for affiliation/upgradation/extension of affiliation',
    file: 'SELF_CERTIFICATION.pdf'
  },
  {
    title: 'Self certification for section increase',
    file: 'SELF_CERTIFICATION_FOR_SECTION_INCRESE.pdf'
  },
  {
    title: 'Copies of valid water, health and sanitation certificates',
    file: 'HEALTH_AND_HYGENE.pdf'
  },
  {
    title: 'Land Certificate',
    file: 'LAND_CERTIFICATE.pdf'
  },
  {
    title: 'Mandatory Disclosure',
    file: 'MANDATORY_DISCLOSURE.pdf'
  }
];

const SECTION_C_DOCUMENTS = [
  {
    title: 'Fee Structure of the School',
    file: 'FEE_STRUCTURE_2025_26.pdf'
  },
  {
    title: 'Annual Academic Calendar',
    file: 'ANNUAL_ACADEMIC_CALENDAR_2026_27.pdf'
  },
  {
    title: 'List of School Management Committee (SMC)',
    file: 'SCHOOL_MANAGEMENT_COMMITTEE_2025_26.pdf'
  },
  {
    title: 'List of Parents Teachers Association (PTA) Members',
    file: 'PARENTS_TEACHERS_ASSOCIATION_MEMBER_LIST_2025_26.pdf'
  },
  {
    title: 'Last three-year result of the board examination as per applicability',
    file: 'LAST_THREE_YEARS_RESULT.pdf'
  }
];

const asNumberedRow = (section) => (entry, index) => ({
  section,
  title: entry.title,
  file_url: FILE_BASE + entry.file,
  link_label: 'Click to Download',
  link_type: 'download',
  is_numbered: true,
  display_order: index + 1,
  is_visible: true
});

const SEED_ROWS = [
  ...SECTION_B_DOCUMENTS.map(asNumberedRow('B')),
  // Sits in the small unnumbered table under section B's numbered list, and opens in a new
  // tab instead of downloading — it is a YouTube link, not a file.
  {
    section: 'B',
    title: 'Link of YouTube video of the inspection of school',
    file_url: 'https://youtu.be/xflXKP24fjY',
    link_label: 'Click to View',
    link_type: 'view',
    is_numbered: false,
    display_order: 12,
    is_visible: true
  },
  ...SECTION_C_DOCUMENTS.map(asNumberedRow('C'))
];

const seedDisclosure = async () => {
  await promisePool.query(createDisclosureDocumentsTable);

  // Read the table once instead of querying per row — there are only ever a couple of dozen.
  const existing = await DisclosureDocument.getAll();
  const existingKeys = new Set(existing.map((row) => `${row.section}\u0000${row.title}`));

  let inserted = 0;
  let present = 0;

  for (const row of SEED_ROWS) {
    const key = `${row.section}\u0000${row.title}`;

    if (existingKeys.has(key)) {
      console.log(`  = [${row.section}] already present  ${row.title}`);
      present++;
      continue;
    }

    await DisclosureDocument.create(row);
    existingKeys.add(key);
    inserted++;
    console.log(`  + [${row.section}] inserted         ${row.title}`);
  }

  console.log(
    `\n📄 Seeded disclosure documents — ${inserted} inserted, ${present} already present of ${SEED_ROWS.length} total`
  );
};

// pool is the callback-style mysql2 pool, so end() takes a callback and returns nothing —
// calling .then()/.finally() on it would crash the failure path with a TypeError.
seedDisclosure()
  .then(() => pool.end(() => process.exit(0)))
  .catch((error) => {
    console.error('❌ Seeding disclosure documents failed:', error.message);
    pool.end(() => process.exit(1));
  });
