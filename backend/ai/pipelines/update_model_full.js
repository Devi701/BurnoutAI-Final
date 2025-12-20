const fs = require('fs');
const path = require('path');
const parse = require('csv-parse/lib/sync'); // csv-parse v4
const { preprocessFeatures, trainModel } = require('./data_helpers'); // Adjust path if needed

// Paths
const dataFile = path.join(__dirname, '../datasets/stress data full processed.csv');
const modelFile = path.join(__dirname, '../models/full_model.json');

// Load CSV
const rawData = fs.readFileSync(dataFile, 'utf8');

// Parse CSV
let records = parse(rawData, {
  columns: true,
  skip_empty_lines: true
});

// Preprocess: convert all numeric fields to floats, replace invalids with 0
records = records.map(row => {
  const newRow = {};
  for (let key in row) {
    const val = parseFloat(row[key]);
    newRow[key] = isNaN(val) ? 0 : val;
  }
  return newRow;
});

// Train model
const model = trainModel(preprocessFeatures(records));

// Save model
fs.writeFileSync(modelFile, JSON.stringify(model, null, 2));
console.log('Full model updated successfully.');
