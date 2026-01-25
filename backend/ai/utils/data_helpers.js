const fs = require('node:fs');
const { parse } = require('csv-parse/sync'); // csv-parse v4
const { stringify } = require('csv-stringify/sync'); // csv-stringify v5

// Parse CSV into array of objects
function parseCSV(csvData) {
  return parse(csvData, { columns: true, skip_empty_lines: true });
}

// Convert numeric fields to floats
function preprocessFeatures(records, numericFields) {
  return records.map(row => {
    const newRow = {};
    numericFields.forEach(key => {
      const val = Number.parseFloat(row[key]);
      newRow[key] = Number.isNaN(val) ? 0 : val;
    });
    return newRow;
  });
}

// Extract features and target
function getFeaturesAndTarget(records, featureCols, targetCol) {
  const X = records.map(r => featureCols.map(f => r[f]));
  const y = records.map(r => r[targetCol]);
  return { X, y };
}

module.exports = { parseCSV, preprocessFeatures, getFeaturesAndTarget };
