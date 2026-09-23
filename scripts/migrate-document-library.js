// One-off migration: reorganises the site's documents from "rows on the public disclosure page"
// into a library of documents plus placements saying where each one appears.
//
//   node scripts/migrate-document-library.js
//
// The problem it fixes: the same document is shown in more than one place under different
// captions, and the copies drifted. "Fee Structure of the School" (Public Disclosure section C)
// and "Fee Structure 2026-27" (Fee Structure menu) were two different files two academic years
// apart, both live, because whoever updated the menu had no way to know the compliance page
// served the same thing. After this migration they are ONE document with TWO placements, so
// replacing the file once updates both.
//
// disclosure_documents is READ, never written — it stays on disk untouched as a fallback.
// Idempotent: a document is matched on name and a placement on (location, label), and an
// existing placement is left entirely alone, so a re-run cannot revert a file an admin has
// since replaced through the panel.

require('dotenv').config();

const { promisePool, pool } = require('../config/database');

// Where the files already sit and are served from by express.static.
const DISCLOSURE_FILE_BASE = 'https://api.greenschoolguwahati.com/public_disclosure/';
const FEE_FILE_BASE = 'https://api.greenschoolguwahati.com/fee_structure/';

// Duplicated from config/initDb.js on purpose: initDb only runs from the app's testConnection(),
// so a database that has never booted the app would have no tables to migrate into.
const createDocumentsTable = `
  CREATE TABLE IF NOT EXISTS documents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    file_url VARCHAR(500) NOT NULL,
    kind ENUM('file','link') NOT NULL DEFAULT 'file',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_name (name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

const createDocumentPlacementsTable = `
  CREATE TABLE IF NOT EXISTS document_placements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    document_id INT NOT NULL,
    location VARCHAR(40) NOT NULL,
    label VARCHAR(500) NOT NULL,
    sublabel VARCHAR(255) NULL,
    icon VARCHAR(40) NULL,
    link_label VARCHAR(100) NULL,
    is_numbered BOOLEAN NOT NULL DEFAULT TRUE,
    display_order INT NOT NULL DEFAULT 0,
    is_visible BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
    INDEX idx_location_order (location, display_order)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
`;

const SECTION_LOCATIONS = { B: 'disclosure_b', C: 'disclosure_c' };

// The shared document. Section C row 1 and the first Fee Structure menu entry are this one file;
// the client picked the 2026-27 PDF as the current one for both, which deliberately retires the
// 2025-26 file the compliance page was still serving.
const FEE_STRUCTURE_DOCUMENT_NAME = 'Fee Structure 2026-27';
const FEE_STRUCTURE_FILE_URL = `${FEE_FILE_BASE}Fee_Structure_2026_27.pdf`;

const FEE_STRUCTURE_PLACEMENT = {
  location: 'navbar_fee',
  label: 'Fee Structure 2026-27',
  sublabel: 'PDF · Current academic session',
  icon: 'document',
  display_order: 1
};

// The placements that bring their own new document with them. Ordered the way the report reads.
const NEW_ENTRIES = [
  {
    document: {
      name: 'FRC Fee approval 2026-2027',
      file_url: `${FEE_FILE_BASE}Fee_Fixation_Order_The_GreenSchool_International.pdf`,
      kind: 'file'
    },
    placement: {
      location: 'navbar_fee',
      label: 'FRC Fee approval 2026-2027',
      sublabel: 'PDF · Official fee fixation order',
      icon: 'sparkles',
      display_order: 2
    }
  },
  {
    // Bundled into the frontend at public/pdfs/Cancellation_Policy.pdf today, which is why it
    // cannot be swapped without a redeploy. Pointed at the server copy so it becomes replaceable.
    document: {
      name: 'Cancellation Policy',
      file_url: `${FEE_FILE_BASE}Cancellation_Policy.pdf`,
      kind: 'file'
    },
    placement: {
      location: 'navbar_fee',
      label: 'Cancellation Policy',
      sublabel: 'PDF · Refunds & cancellations',
      // Navbar.jsx draws this third entry with HiOutlineDocumentArrowDown in the leaf colour,
      // and 'shield' is the icon key whose entry in FEE_MENU_ICONS carries that pair — 'document'
      // is the same glyph in the brand colour, i.e. the first entry. Keep this as 'shield' or the
      // menu changes colour the moment the database takes over from the bundled fallback.
      icon: 'shield',
      display_order: 3
    }
  },
  {
    document: {
      name: 'Admission Form',
      file_url: `${DISCLOSURE_FILE_BASE}green-school-admission-form.pdf`,
      kind: 'file'
    },
    placement: {
      location: 'admission_form',
      label: 'Download Admission Form',
      is_numbered: false,
      display_order: 1
    }
  }
];

// How many of the entries below land where. Used to derive what a correct migration produces.
const NEW_LOCATION_COUNTS = { navbar_fee: 3, admission_form: 1 };
const EXPECTED_FEE_PLACEMENTS = 2;

const placementKey = (location, label) => `${location}\u0000${label}`;

// documents.name is VARCHAR(255) and some disclosure titles run longer, so cut at a word
// boundary rather than mid-word — this name is what the admin reads in the library list.
const truncateName = (title) => {
  const name = String(title).trim();
  if (name.length <= 255) return name;

  const cut = name.slice(0, 254);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 200 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
};

const findDocumentByName = async (connection, name) => {
  const [rows] = await connection.query(
    'SELECT id, name, file_url, kind FROM documents WHERE name = ? LIMIT 1',
    [name]
  );
  return rows[0] || null;
};

const findPlacement = async (connection, location, label) => {
  const [rows] = await connection.query(
    'SELECT id, document_id FROM document_placements WHERE location = ? AND label = ? LIMIT 1',
    [location, label]
  );
  return rows[0] || null;
};

const insertDocument = async (connection, { name, file_url, kind }) => {
  const [result] = await connection.query(
    'INSERT INTO documents (name, file_url, kind) VALUES (?, ?, ?)',
    [name, file_url, kind || 'file']
  );
  return result.insertId;
};

const insertPlacement = async (connection, placement) => {
  const [result] = await connection.query(
    `INSERT INTO document_placements
       (document_id, location, label, sublabel, icon, link_label, is_numbered, display_order,
        is_visible)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      placement.document_id,
      placement.location,
      placement.label,
      placement.sublabel || null,
      placement.icon || null,
      placement.link_label || null,
      placement.is_numbered === undefined ? true : placement.is_numbered,
      placement.display_order === undefined ? 0 : placement.display_order,
      placement.is_visible === undefined ? true : placement.is_visible
    ]
  );
  return result.insertId;
};

// Reads the live disclosure rows. Fails loudly on a missing or empty table: a half-built public
// disclosure page is a compliance problem, so no silent partial migration.
const readDisclosureRows = async () => {
  let rows;

  try {
    [rows] = await promisePool.query(
      `SELECT id, section, title, file_url, link_label, link_type, is_numbered, display_order,
              is_visible
       FROM disclosure_documents
       ORDER BY section ASC, display_order ASC, id ASC`
    );
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE') {
      throw new Error(
        'Table `disclosure_documents` does not exist — this migration converts it, it cannot ' +
          'invent it. Run scripts/seed-disclosure.js against this database first.'
      );
    }
    throw error;
  }

  if (rows.length === 0) {
    throw new Error(
      'Table `disclosure_documents` is empty — refusing to build the document library from ' +
        'nothing. Run scripts/seed-disclosure.js against this database first.'
    );
  }

  return rows;
};

// Section C row 1 is the fee structure the menu also links to. Identified by position, then
// checked by title: sharing the wrong document across two places is worse than stopping here.
const pickFeeStructureRow = (disclosureRows) => {
  const sectionC = disclosureRows.filter((row) => row.section === 'C');

  if (sectionC.length === 0) {
    throw new Error('No section C rows in `disclosure_documents` — nothing to share with the menu');
  }

  const feeRow = sectionC[0];

  if (!/fee\s*structure/i.test(feeRow.title)) {
    throw new Error(
      `Section C row 1 is "${feeRow.title}", which is not the fee structure. The Fee Structure ` +
        "menu is supposed to reuse that row's document — refusing to share the wrong file."
    );
  }

  return feeRow;
};

// What a correct migration produces, derived from the rows actually read rather than written
// down as 20/21/12/5/3/1. Those are the right numbers for the 17 rows live today, and this
// returns exactly them for that input — but the disclosure admin panel is live, so staff can
// legitimately add an 18th row before anyone runs this, and a hardcoded count would answer
// that by rolling the whole migration back over a difference that is not an error.
const expectedTotals = (disclosureRows, feeRow) => {
  const locations = { navbar_fee: NEW_LOCATION_COUNTS.navbar_fee };
  locations.admission_form = NEW_LOCATION_COUNTS.admission_form;

  for (const row of disclosureRows) {
    const location = SECTION_LOCATIONS[row.section];
    locations[location] = (locations[location] || 0) + 1;
  }

  // One document per distinct name: the fee structure is renamed and then shared, so it is
  // counted once under its new name and not at all under its disclosure title.
  const names = new Set(disclosureRows.map((row) => truncateName(row.title)));
  names.delete(truncateName(feeRow.title));
  names.add(FEE_STRUCTURE_DOCUMENT_NAME);
  for (const entry of NEW_ENTRIES) {
    names.add(entry.document.name);
  }

  return {
    documents: names.size,
    placements:
      disclosureRows.length + NEW_LOCATION_COUNTS.navbar_fee + NEW_LOCATION_COUNTS.admission_form,
    locations
  };
};

const migrate = async () => {
  // DDL commits implicitly in MySQL, so both tables are created before the transaction opens.
  await promisePool.query(createDocumentsTable);
  await promisePool.query(createDocumentPlacementsTable);
  console.log('✅ Tables "documents" and "document_placements" created/verified\n');

  const disclosureRows = await readDisclosureRows();
  const feeRow = pickFeeStructureRow(disclosureRows);
  console.log(`📚 Read ${disclosureRows.length} rows from disclosure_documents\n`);

  const connection = await promisePool.getConnection();

  const report = {
    documentsCreated: [],
    placementsCreated: [],
    placementsPresent: 0,
    feeChange: null,
    feeReplacedNote: false,
    sharedPlacements: []
  };

  try {
    await connection.beginTransaction();

    // document id for each (location, label) we have processed, so the fee structure document
    // can be looked up by its placement rather than by a name the migration itself rewrites.
    const documentIdByPlacement = new Map();
    // Placements this run actually inserted. Only these mean "the library did not know about
    // this document until a moment ago", which is the one condition under which it is safe to
    // overwrite a document's file.
    const createdThisRun = new Set();

    for (const row of disclosureRows) {
      const location = SECTION_LOCATIONS[row.section];

      if (!location) {
        throw new Error(
          `disclosure_documents row ${row.id} has section '${row.section}', which maps to no ` +
            'location. Expected B or C.'
        );
      }

      // The label is regulator-facing text — it is carried across verbatim.
      const label = row.title;
      const key = placementKey(location, label);
      const existingPlacement = await findPlacement(connection, location, label);

      if (existingPlacement) {
        documentIdByPlacement.set(key, existingPlacement.document_id);
        report.placementsPresent++;
        console.log(`  = [${location}] already placed   ${label}`);
        continue;
      }

      const name = truncateName(row.title);
      const kind = row.link_type === 'view' ? 'link' : 'file';
      let document = await findDocumentByName(connection, name);

      if (!document) {
        const documentId = await insertDocument(connection, {
          name,
          file_url: row.file_url,
          kind
        });
        document = { id: documentId, name };
        report.documentsCreated.push(name);
      }

      await insertPlacement(connection, {
        document_id: document.id,
        location,
        label,
        link_label: row.link_label,
        is_numbered: row.is_numbered,
        display_order: row.display_order,
        is_visible: row.is_visible
      });

      documentIdByPlacement.set(key, document.id);
      createdThisRun.add(key);
      report.placementsCreated.push(`[${location}] ${label}`);
      console.log(`  + [${location}] placed           ${label}`);
    }

    // The shared placement. The document already exists — it was created (or found) from section
    // C row 1 above — so this adds a second placement rather than a second document.
    const feeKey = placementKey('disclosure_c', feeRow.title);
    const feeDocumentId = documentIdByPlacement.get(feeKey);

    if (!feeDocumentId) {
      throw new Error(
        `Could not resolve the document behind Public Disclosure section C "${feeRow.title}" — ` +
          'the Fee Structure menu has nothing to share.'
      );
    }

    const existingFeePlacement = await findPlacement(
      connection,
      FEE_STRUCTURE_PLACEMENT.location,
      FEE_STRUCTURE_PLACEMENT.label
    );

    if (existingFeePlacement) {
      report.placementsPresent++;
      console.log(`  = [navbar_fee] already placed   ${FEE_STRUCTURE_PLACEMENT.label}`);
    } else {
      // Repointing the shared document happens only when this run created its section C
      // placement — i.e. the library had never heard of this document until a moment ago.
      // Gating on the navbar placement alone is not enough: deleting that one row from the
      // admin panel (fees not announced yet, say) and re-running would then overwrite the PDF
      // and the name the admin had since set, and commit that as a "migration".
      if (createdThisRun.has(feeKey)) {
        const [feeRows] = await connection.query(
          'SELECT id, name, file_url FROM documents WHERE id = ?',
          [feeDocumentId]
        );
        const feeDocument = feeRows[0];

        await connection.query('UPDATE documents SET name = ?, file_url = ? WHERE id = ?', [
          FEE_STRUCTURE_DOCUMENT_NAME,
          FEE_STRUCTURE_FILE_URL,
          feeDocumentId
        ]);

        report.feeChange = {
          nameFrom: feeDocument.name,
          nameTo: FEE_STRUCTURE_DOCUMENT_NAME,
          urlFrom: feeDocument.file_url,
          urlTo: FEE_STRUCTURE_FILE_URL
        };
      } else {
        report.feeReplacedNote = true;
      }

      await insertPlacement(connection, {
        document_id: feeDocumentId,
        ...FEE_STRUCTURE_PLACEMENT
      });

      report.placementsCreated.push(`[navbar_fee] ${FEE_STRUCTURE_PLACEMENT.label}`);
      console.log(`  + [navbar_fee] placed           ${FEE_STRUCTURE_PLACEMENT.label}`);
      console.log('      ↳ reuses the section C document — one file, two places on the site');
    }

    for (const entry of NEW_ENTRIES) {
      const { location, label } = entry.placement;
      const existing = await findPlacement(connection, location, label);

      if (existing) {
        report.placementsPresent++;
        console.log(`  = [${location}] already placed   ${label}`);
        continue;
      }

      let document = await findDocumentByName(connection, entry.document.name);

      if (!document) {
        const documentId = await insertDocument(connection, entry.document);
        document = { id: documentId };
        report.documentsCreated.push(entry.document.name);
      }

      await insertPlacement(connection, { document_id: document.id, ...entry.placement });
      report.placementsCreated.push(`[${location}] ${label}`);
      console.log(`  + [${location}] placed           ${label}`);
    }

    // Which placements ended up sharing the fee structure document — reported, and verified below.
    const [sharedRows] = await connection.query(
      `SELECT location, label, display_order FROM document_placements
       WHERE document_id = ? ORDER BY location ASC, display_order ASC`,
      [feeDocumentId]
    );
    report.sharedPlacements = sharedRows;

    const createdAnything = report.documentsCreated.length + report.placementsCreated.length > 0;

    await verify(
      connection,
      feeDocumentId,
      createdAnything,
      expectedTotals(disclosureRows, feeRow)
    );
    await connection.commit();

    printReport(report, disclosureRows.length);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

// Runs inside the transaction, so a failed check throws, rolls back, and leaves the live site
// exactly as it was.
const verify = async (connection, feeDocumentId, createdAnything, expected) => {
  const failures = [];

  const [[documentCount]] = await connection.query('SELECT COUNT(*) AS total FROM documents');
  if (Number(documentCount.total) !== expected.documents) {
    failures.push(`documents: expected ${expected.documents}, found ${documentCount.total}`);
  }

  const [[placementCount]] = await connection.query(
    'SELECT COUNT(*) AS total FROM document_placements'
  );
  if (Number(placementCount.total) !== expected.placements) {
    failures.push(`placements: expected ${expected.placements}, found ${placementCount.total}`);
  }

  const [[feePlacementCount]] = await connection.query(
    'SELECT COUNT(*) AS total FROM document_placements WHERE document_id = ?',
    [feeDocumentId]
  );
  if (Number(feePlacementCount.total) !== EXPECTED_FEE_PLACEMENTS) {
    failures.push(
      `fee structure document is shared by ${feePlacementCount.total} placements, expected ` +
        `${EXPECTED_FEE_PLACEMENTS} (Public Disclosure section C and the Fee Structure menu)`
    );
  }

  const [locationRows] = await connection.query(
    'SELECT location, COUNT(*) AS total FROM document_placements GROUP BY location'
  );
  const found = Object.fromEntries(locationRows.map((row) => [row.location, Number(row.total)]));

  for (const [location, count] of Object.entries(expected.locations)) {
    const total = found[location] || 0;
    if (total !== count) {
      failures.push(`${location}: expected ${count} placements, found ${total}`);
    }
  }

  for (const location of Object.keys(found)) {
    if (!(location in expected.locations)) {
      failures.push(`unexpected location '${location}' with ${found[location]} placements`);
    }
  }

  if (failures.length > 0) {
    // A re-run that created nothing but counts differently means the admin has added or removed
    // documents since — say so, rather than letting the operator read it as a broken migration.
    const context = createdAnything
      ? ''
      : '\n   This run created nothing, so the database was already migrated and these counts ' +
        'are\n   the result of later admin panel activity, not of a failed migration.';

    throw new Error(
      `Verification failed, rolling back:\n   - ${failures.join('\n   - ')}${context}`
    );
  }

  const layout = Object.entries(expected.locations)
    .map(([location, count]) => `${location} ${count}`)
    .join(', ');
  console.log(
    `\n🔍 Verified: ${expected.documents} documents, ${expected.placements} placements ` +
      `(${layout}), fee structure document shared by ${EXPECTED_FEE_PLACEMENTS} placements`
  );
};

const printReport = (report, disclosureRowCount) => {
  const created = report.documentsCreated.length + report.placementsCreated.length;

  console.log('\n────────────────────────────────────────────────────────────');

  if (created === 0) {
    console.log('📗 Already migrated — every document and placement was already present.');
    console.log(`   Nothing was changed (${report.placementsPresent} placements verified).`);
  } else {
    console.log(
      `📗 Migrated ${disclosureRowCount} disclosure rows into a document library — ` +
        `${report.documentsCreated.length} documents created, ` +
        `${report.placementsCreated.length} placements created, ` +
        `${report.placementsPresent} already present`
    );
  }

  if (report.feeChange) {
    console.log('\n🔗 Shared document — the point of this migration:');
    console.log(`   name     ${report.feeChange.nameFrom}`);
    console.log(`         →  ${report.feeChange.nameTo}`);
    console.log(`   file_url ${report.feeChange.urlFrom}`);
    console.log(`         →  ${report.feeChange.urlTo}`);
    console.log('   Public Disclosure section C now serves the 2026-27 fee structure instead of');
    console.log('   the stale 2025-26 file. Its label on that page is unchanged.');
  }

  if (report.feeReplacedNote) {
    console.log(
      '\n🔗 Re-added the Fee Structure menu entry against the document Public Disclosure'
    );
    console.log('   section C already uses. Its file was left exactly as it is — an admin has');
    console.log('   owned it since the first run. Check the menu caption still reads correctly.');
  }

  if (report.sharedPlacements.length > 0) {
    console.log('\n   That one document is shown in these places:');
    for (const placement of report.sharedPlacements) {
      console.log(`     • [${placement.location}] ${placement.label}`);
    }
    console.log('   Replacing its file through the admin panel updates all of them at once.');
  }

  console.log('────────────────────────────────────────────────────────────');
};

// pool is the callback-style mysql2 pool, so end() takes a callback and returns nothing —
// calling .then()/.finally() on it would crash the failure path with a TypeError.
migrate()
  .then(() => pool.end(() => process.exit(0)))
  .catch((error) => {
    console.error(`\n❌ Document library migration failed: ${error.message}`);
    console.error('   Nothing was committed — the site is unchanged.');
    pool.end(() => process.exit(1));
  });
