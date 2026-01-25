const fs = require('node:fs');
const path = require('node:path');
const { DecisionTreeRegression } = require('ml-cart');
const { parse } = require('csv-parse/sync'); // For reading CSV

// File paths
const dataFile = path.join(__dirname, '../datasets/stress_data_pseudolabeled.csv');
const modelDir = path.join(__dirname, '../models');
const modelFile = path.join(modelDir, 'small_quiz_model.json');
const metaFile = modelFile + '.meta.json';

// Load CSV
const rawCSV = fs.readFileSync(dataFile, 'utf8');
const records = parse(rawCSV, { columns: true, skip_empty_lines: true });

// Shuffle records to ensure random distribution for train/test split
for (let i = records.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1));
  [records[i], records[j]] = [records[j], records[i]];
}

// --- Model Evaluation ---
console.log('Evaluating model performance...');

// Define feature columns and split data into training and testing sets (80/20)
const featureColumns = Object.keys(records[0]).filter(c => c !== 'burnout_score');
const targetColumn = 'burnout_score';
const trainSize = Math.floor(0.8 * records.length);

const trainRecords = records.slice(0, trainSize);
const testRecords = records.slice(trainSize);

const X_train = trainRecords.map(r => featureColumns.map(f => Number.parseFloat(r[f]) || 0));
const y_train = trainRecords.map(r => Number.parseFloat(r[targetColumn]) || 0);

const X_test = testRecords.map(r => featureColumns.map(f => Number.parseFloat(r[f]) || 0));
const y_test = testRecords.map(r => Number.parseFloat(r[targetColumn]) || 0);

// Train a temporary model on the training set
const dtForEval = new DecisionTreeRegression({
  maxDepth: 7,
});
dtForEval.train(X_train, y_train);

// Make predictions on the test set
const predictions = dtForEval.predict(X_test);

// Calculate evaluation metrics
let sumSquaredError = 0;
let sumAbsoluteError = 0;
const y_mean = y_test.reduce((a, b) => a + b, 0) / y_test.length;
let totalSumOfSquares = 0;

for (let i = 0; i < y_test.length; i++) {
  const error = y_test[i] - predictions[i];
  sumSquaredError += error * error;
  sumAbsoluteError += Math.abs(error);
  totalSumOfSquares += (y_test[i] - y_mean) * (y_test[i] - y_mean);
}

const mse = sumSquaredError / y_test.length;
const rmse = Math.sqrt(mse);
const mae = sumAbsoluteError / y_test.length;
const r2 = 1 - (sumSquaredError / totalSumOfSquares);

console.log('--- Evaluation Results ---');
console.log(`Root Mean Squared Error (RMSE): ${rmse.toFixed(4)}`);
console.log(`Mean Absolute Error (MAE):      ${mae.toFixed(4)}`);
console.log(`R-squared (R²):                 ${r2.toFixed(4)}`);
console.log('--------------------------\n');

// --- Final Model Training ---
console.log('Training final model on the full dataset...');

// Prepare the full dataset
const X_full = records.map(r => featureColumns.map(f => Number.parseFloat(r[f]) || 0));
const y_full = records.map(r => Number.parseFloat(r[targetColumn]) || 0);

// Train the final Decision Tree model on all data
const finalRf = new DecisionTreeRegression({
  maxDepth: 7
});
finalRf.train(X_full, y_full);

// Save the final model and metadata
if (!fs.existsSync(modelDir)) fs.mkdirSync(modelDir, { recursive: true });

fs.writeFileSync(modelFile, JSON.stringify(finalRf.toJSON(), null, 2));
fs.writeFileSync(metaFile, JSON.stringify({ features: featureColumns }, null, 2));
console.log('Small quiz model and metadata saved.');