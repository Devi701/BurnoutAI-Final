const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('csv-parse/sync');      // csv-parse v4
const { stringify } = require('csv-stringify/sync'); // csv-stringify v5

// File paths
const inputFile = path.join(__dirname, '../datasets/stress_data_small processed.csv');
const outputFile = path.join(__dirname, '../datasets/stress_data_small_processed_clean.csv');

// Load CSV
const rawCSV = fs.readFileSync(inputFile, 'utf8');

// Parse CSV
let records = parse(rawCSV, { columns: true, skip_empty_lines: true });

// Ensure all values are numeric
records = records.map(row => {
  const newRow = {};
  for (let key in row) {
    const val = Number.parseFloat(row[key].toString().trim());
    newRow[key] = Number.isNaN(val) ? 0 : val;  // Replace invalid numbers with 0
  }
  return newRow;
});

// Save cleaned CSV
const outputCSV = stringify(records, { header: true });
fs.writeFileSync(outputFile, outputCSV);
console.log('Small dataset preprocessed successfully.');
