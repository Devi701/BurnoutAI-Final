const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('csv-parse/sync');
const { DecisionTreeRegression } = require('ml-cart');

const dataFile = path.join(__dirname, '../datasets/stress_data_small_processed_clean.csv');
const modelFile = path.join(__dirname, '../models/small_quiz_model.json');

// Read and preprocess data
const rawData = fs.readFileSync(dataFile, 'utf8');
const records = parse(rawData, { columns: true, skip_empty_lines: true });

const featureColumns = Object.keys(records[0]).filter(c => c !== 'burnout_score');
const targetColumn = 'burnout_score';

const X = records.map(r => featureColumns.map(f => Number.parseFloat(r[f]) || 0));
const y = records.map(r => Number.parseFloat(r[targetColumn]) || 0);

// Train new model
const tree = new DecisionTreeRegression({ maxDepth: 7 });
tree.train(X, y);

// Save updated model
fs.writeFileSync(modelFile, JSON.stringify(tree.toJSON(), null, 2));
console.log('Small quiz model updated safely.');
