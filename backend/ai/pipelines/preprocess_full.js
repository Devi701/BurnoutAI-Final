const fs = require('fs');
const path = require('path');
const parse = require('csv-parse/lib/sync');
const stringify = require('csv-stringify/lib/sync');

// Paths
const dataFile = path.join(__dirname, '../datasets/stress data full processed.csv');
const outputFile = path.join(__dirname, '../datasets/stress_data_full_processed_clean.csv');

// Load CSV
const rawData = fs.readFileSync(dataFile, 'utf8');

// Parse CSV
let records = parse(rawData, { columns: true, skip_empty_lines: true });

// Ensure all values are numeric
records = records.map(row => {
  const newRow = {};
  for (let key in row) {
    const val = parseFloat(row[key]);
    newRow[key] = isNaN(val) ? 0 : val;
  }
  return newRow;
});

// Save cleaned CSV
const outputCSV = stringify(records, { header: true });
fs.writeFileSync(outputFile, outputCSV);

console.log('Full dataset preprocessed successfully.');
