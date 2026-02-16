const fs = require('node:fs');
const path = require('node:path');
const { DecisionTreeRegression } = require('ml-cart');
const { generateTips } = require('./tipsService');

function resolveModelPath(fileName) {
  const candidates = [
    path.join(__dirname, '../../ai/models', fileName), // backend/ai/models (current layout)
    path.join(__dirname, '../ai/models', fileName) // backend/src/ai/models (legacy layout)
  ];
  return candidates.find(p => fs.existsSync(p)) || candidates[0];
}

const SMALL_MODEL = resolveModelPath('small_quiz_model.json');
const FULL_MODEL = resolveModelPath('full_model.json');
const DAILY_MODEL = resolveModelPath('daily_model.json');

// Simple in-memory cache to prevent reading files on every prediction
const modelCache = {};

/**
 * Loads a model and its feature metadata.
 * @param {string} modelPath - Path to the model's .json file.
 * @returns {{model: RandomForestRegression, features: string[]}}
 */
function loadModelAndMeta(modelPath) {
  if (modelCache[modelPath]) {
    return modelCache[modelPath];
  }
  try {
    const modelJSON = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
    const model = DecisionTreeRegression.load(modelJSON);
    const metaPath = `${modelPath}.meta.json`;
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    
    const result = { model, features: meta.features };
    modelCache[modelPath] = result; // Save to cache
    return result;
  } catch (e) { console.error('Model load error:', e.message); }
  return null;
}

/**
 * type: 'small'|'full'|'daily'
 * inputRow: object features
 */
function predictAndAdvise(type = 'small', inputRow = {}) {
  let modelPath;
  if (type === 'full') {
    modelPath = FULL_MODEL;
  } else if (type === 'daily') {
    modelPath = DAILY_MODEL;
  } else {
    modelPath = SMALL_MODEL;
  }

  // Load the Random Forest model and its feature list
  const { model, features } = loadModelAndMeta(modelPath) || {};
  if (!model || !features) {
    throw new Error(`Could not load model or metadata for type: ${type}`);
  }

  // The actual feature data might be at the top level or nested under a 'features' key.
  const featureData = inputRow.features || inputRow;

  // build feature array in exact expected order
  const featureArray = features.map(featureName => Number(featureData[featureName] || 0));

  // The model expects an array of feature arrays, so we wrap it.
  const predictionInput = [featureArray];

  // Run the model prediction
  const predictionResult = model.predict(predictionInput);
  const score = predictionResult[0]; // The result is an array, we need the first element.

  const tips = generateTips(score);
  return { score, tips };
}

module.exports = { predictAndAdvise };
