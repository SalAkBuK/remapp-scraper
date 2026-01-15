const fs = require('fs');
const path = require('path');
const { normalizeProject } = require('../src/normalize/normalizeProject');

const filePath = process.argv[2];

if (!filePath) {
  console.error('Usage: node scripts/normalize_one.js <path-to-json-file>');
  process.exit(1);
}

const absolutePath = path.resolve(filePath);

if (!fs.existsSync(absolutePath)) {
  console.error(`File not found: ${absolutePath}`);
  process.exit(1);
}

try {
  const raw = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  const normalized = normalizeProject(raw);
  console.log(JSON.stringify(normalized, null, 2));
} catch (error) {
  console.error('Error processing file:', error);
  process.exit(1);
}
