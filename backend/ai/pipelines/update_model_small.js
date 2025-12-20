const fs = require('fs');
const path = require('path');
const { preprocessFeatures, trainModel } = require('../utils/data_helpers');

const dataFile = path.join(__dirname, '../datasets/stress_data_small_processed_clean.csv');
const modelFile = path.join(__dirname, '../models/small_quiz_model.json');

// Read and preprocess data
const rawData = fs.readFileSync(dataFile, 'utf8');
const preprocessedData = preprocessFeatures(rawData);

// Check if model already exists
let model = {};
if (fs.existsSync(modelFile)) {
  try {
    const existingModel = fs.readFileSync(modelFile, 'utf8');
    model = JSON.parse(existingModel);
    console.log('Existing model loaded. Updating...');
  } catch (err) {
    console.warn('Could not parse existing model, training a new one.');
    model = {};
  }
}

// Train new model on preprocessed data
const newModel = trainModel(preprocessedData);

// Merge/update safely
model = { ...model, ...newModel };

// Save updated model
fs.writeFileSync(modelFile, JSON.stringify(model, null, 2));
console.log('Small quiz model updated safely.');
