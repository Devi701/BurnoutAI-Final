const fs = require('node:fs');
const path = require('node:path');
const { DecisionTreeRegression } = require('ml-cart');
const { parse } = require('csv-parse/sync');

// File paths
const dataFile = path.join(__dirname, '../datasets/daily_checkin_data.csv');
const modelDir = path.join(__dirname, '../models');
const modelFile = path.join(modelDir, 'daily_model.json');
const metaFile = modelFile + '.meta.json';

// Load CSV
const rawCSV = fs.readFileSync(dataFile, 'utf8');
const records = parse(rawCSV, { columns: true, skip_empty_lines: true, cast: true });

// Shuffle records
for (let i = records.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [records[i], records[j]] = [records[j], records[i]];
}

// --- Model Evaluation ---
console.log('Evaluating daily check-in model performance...');

const featureColumns = Object.keys(records[0]).filter(c => c !== 'burnout_score');
const targetColumn = 'burnout_score';
const trainSize = Math.floor(0.8 * records.length);

const trainRecords = records.slice(0, trainSize);
const testRecords = records.slice(trainSize);

const X_train = trainRecords.map(r => featureColumns.map(f => r[f]));
const y_train = trainRecords.map(r => r[targetColumn]);

const X_test = testRecords.map(r => featureColumns.map(f => r[f]));
const y_test = testRecords.map(r => r[targetColumn]);

const dtForEval = new DecisionTreeRegression({
  maxDepth: 10,
});
dtForEval.train(X_train, y_train);

const predictions = dtForEval.predict(X_test);

let sumSquaredError = 0;
const y_mean = y_test.reduce((a, b) => a + b, 0) / y_test.length;
let totalSumOfSquares = 0;

for (let i = 0; i < y_test.length; i++) {
  const error = y_test[i] - predictions[i];
  sumSquaredError += error * error;
  totalSumOfSquares += (y_test[i] - y_mean) * (y_test[i] - y_mean);
}

const rmse = Math.sqrt(sumSquaredError / y_test.length);
const r2 = 1 - (sumSquaredError / totalSumOfSquares);

console.log('--- Evaluation Results ---');
console.log(`Root Mean Squared Error (RMSE): ${rmse.toFixed(4)}`);
console.log(`R-squared (R²):                 ${r2.toFixed(4)}`);
console.log('--------------------------\n');

// --- Final Model Training ---
console.log('Training final model on the full dataset...');
const X_full = records.map(r => featureColumns.map(f => r[f]));
const y_full = records.map(r => r[targetColumn]);

const finalDt = new DecisionTreeRegression({
  maxDepth: 10,
});
finalDt.train(X_full, y_full);

// Ensure the models directory exists
if (!fs.existsSync(modelDir)) fs.mkdirSync(modelDir, { recursive: true });

fs.writeFileSync(modelFile, JSON.stringify(finalDt.toJSON(), null, 2));
fs.writeFileSync(metaFile, JSON.stringify({ features: featureColumns }, null, 2));
console.log('Daily check-in model and metadata saved.');