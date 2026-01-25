const path = require('node:path');
const fs = require('node:fs');

const DP_PATH = path.join(__dirname, 'debug_predict');
let dp;
try {
  dp = require(DP_PATH);
} catch (e) {
  console.error('Failed to require debug_predict.js:', e.message);
  process.exit(1);
}

console.log('debug_predict exports:', Object.keys(dp));

const modelsDir = path.join(__dirname, '..', 'models');
const smallModel = path.join(modelsDir, 'small_quiz_model.json');
const fullModel = path.join(modelsDir, 'full_model.json');

const sampleRow = { stress: 7, sleep: 6, workload: 3, coffee: 1 };

async function tryPredict(fnName, ...args) {
  try {
    const fn = dp[fnName];
    if (typeof fn !== 'function') return null;
    const res = await fn(...args);
    console.log(`-> ${fnName} result:`, res);
    return res;
  } catch (e) {
    console.log(`-> ${fnName} threw:`, e.message);
    return null;
  }
}

async function inspectLoaders(loader) {
  console.log('Using loader:', loader.name || '(loader)');
  try {
    const lmSmall = loader.length === 2 ? loader(smallModel, { sync: true }) : loader(smallModel);
    console.log('Loaded small model keys:', Object.keys(lmSmall || {}));
    const features = lmSmall?.features || lmSmall?.meta || lmSmall?.metadata;
    console.log('Inferred features:', features);
  } catch (e) {
    console.log('loader error:', e.message);
  }
}

function inspectRowToFeatureArray(features) {
  console.log('rowToFeatureArray exists — producing array for sampleRow');
  try {
    if (Array.isArray(features)) {
      console.log('features from model/meta:', features);
      console.log('feature array:', dp.rowToFeatureArray(sampleRow, features));
    } else {
      console.log('no features found in meta; skipping rowToFeatureArray demo');
    }
  } catch (e) {
    console.log('rowToFeatureArray error:', e.message);
  }
}

async function inspectPredictions() {
  // Try high-level predictFromModel if present
  if (typeof dp.predictFromModel === 'function') {
    console.log('Calling predictFromModel(smallModel, sampleRow)');
    await tryPredict('predictFromModel', smallModel, sampleRow);
    console.log('Calling predictFromModel(fullModel, sampleRow)');
    await tryPredict('predictFromModel', fullModel, sampleRow);
  } else if (typeof dp.loadModelSync === 'function' && typeof dp.predictWithTree === 'function') {
    // Try lower-level predictWithTree if available
    try {
      const { tree, features } = dp.loadModelSync(smallModel);
      console.log('Loaded tree and features:', Array.isArray(features) ? features.length : 'none');
      const arr = typeof dp.rowToFeatureArray === 'function' ? dp.rowToFeatureArray(sampleRow, features) : Object.values(sampleRow);
      const out = dp.predictWithTree(tree, arr);
      console.log('predictWithTree output:', out);
    } catch (e) {
      console.log('predictWithTree flow failed:', e.message);
    }
  } else {
    console.log('No predictFromModel / loadModelSync+predictWithTree available. See exports above and paste debug_predict.js here.');
  }
}

// Top-level execution
  console.log('Model files exist:',
    fs.existsSync(smallModel), smallModel,
    fs.existsSync(fullModel), fullModel
  );

  // Prefer loadModel* if available
  if (dp.loadModelSync || dp.loadModel) {
    await inspectLoaders(dp.loadModelSync || dp.loadModel);
  }

  // If rowToFeatureArray exists, show mapping
  if (typeof dp.rowToFeatureArray === 'function') {
    const meta = dp.loadModelSync?.(smallModel) || {};
    const features = meta.features || (Array.isArray(meta) ? meta : null);
    inspectRowToFeatureArray(features);
  }

  await inspectPredictions();

  console.log('--- inspector done');