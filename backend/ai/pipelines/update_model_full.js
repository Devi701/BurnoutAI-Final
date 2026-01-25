const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('csv-parse/sync'); // csv-parse v4
const { DecisionTreeRegression } = require('ml-cart');

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
const featureCols = [
  'EE1','EE2','EE3','EE4','EE5','EE6','EE7',
  'S1','S2','S3','S4','S5',
  'SFQ1','SFQ2','SFQ3',
  'wp1','wp2','wp3','wp4',
  'cogn1','cogn2','cogn3','cogn4',
  'SS1','SS2','SS3','CS1','CS2','CS3',
  'auton1','auton2','auton3'
];
const targetCol = 'burnout_score';

const X = records.map(r => featureCols.map(f => {
  const val = Number.parseFloat(r[f]);
  return Number.isNaN(val) ? 0 : val;
}));
const y = records.map(r => {
  const val = Number.parseFloat(r[targetCol]);
  return Number.isNaN(val) ? 0 : val;
});

// Train model
const tree = new DecisionTreeRegression({ maxDepth: 7 });
tree.train(X, y);

// Save model
fs.writeFileSync(modelFile, JSON.stringify(tree.toJSON(), null, 2));
console.log('Full model updated successfully.');
