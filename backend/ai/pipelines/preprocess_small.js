const fs = require('fs');
const path = require('path');
const parse = require('csv-parse/lib/sync');      // csv-parse v4
const stringify = require('csv-stringify/lib/sync'); // csv-stringify v5

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
    const val = parseFloat(row[key].toString().trim());
    newRow[key] = isNaN(val) ? 0 : val;  // Replace invalid numbers with 0
  }
  return newRow;
});

// Save cleaned CSV
const outputCSV = stringify(records, { header: true });
fs.writeFileSync(outputFile, outputCSV);
console.log('Small dataset preprocessed successfully.');
