const fs = require('node:fs');
const path = require('node:path');

/**
 * Load model JSON and optional metadata (.meta.json).
 * Returns { tree, features, meta }
 */
function loadModelSync(modelPath) {
  const raw = fs.readFileSync(modelPath, 'utf8');
  const tree = JSON.parse(raw);
  let features = tree.features || tree.meta?.features || null;
  let meta = null;
  const metaPath = `${modelPath}.meta.json`;
  if (fs.existsSync(metaPath)) {
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
      if (!features && Array.isArray(meta.features)) features = meta.features;
    } catch (e) { console.debug('Failed to load meta:', e); }
  }
  return { tree, features, meta };
}

/**
 * Convert an object row to an ordered numeric array using features list.
 */
function rowToFeatureArray(obj = {}, features = []) {
  if (!Array.isArray(features) || !features.length) {
    // fallback: use numeric values in insertion order
    return Object.keys(obj).map(k => Number(obj[k] || 0));
  }
  return features.map((f) => {
    const v = obj.hasOwnProperty(f) ? obj[f] : (obj[f.toLowerCase()] ?? obj[f.toUpperCase()]);
    return Number(v == null ? 0 : v) || 0;
  });
}

/**
 * Generic decision-tree regression predictor that works with ml-cart toJSON format.
 * Accepts tree (root object or full model JSON) and numeric feature array.
 */
function getLeafValue(node) {
  if (node.prediction !== undefined) return node.prediction;
  if (node.value !== undefined) return node.value;
  if (node.output !== undefined) return node.output;
  return undefined;
}

function getSplitIndex(node) {
  if (node.splitFeature !== undefined) return node.splitFeature;
  if (node.feature !== undefined) return node.feature;
  if (node.splitIndex !== undefined) return node.splitIndex;
  return null;
}

function findFallbackLeafValue(node) {
  const keys = Object.keys(node);
  for (const k of keys) {
    if (k.toLowerCase().includes('predict') || k.toLowerCase().includes('value')) {
      const v = node[k];
      if (typeof v === 'number') return v;
    }
  }
  return 0;
}

function predictWithTree(tree, arr = []) {
  // tree may be the full model object with root property
  const root = tree.root || tree;
  function traverse(node) {
    if (!node) return 0;
    
    const leafVal = getLeafValue(node);
    if (leafVal !== undefined) return leafVal;

    const left = node.left || node.l || node.children?.[0];
    const right = node.right || node.r || node.children?.[1];
    
    const splitIdx = getSplitIndex(node);
    const splitValue = node.splitValue ?? node.threshold ?? node.valueToCompare ?? null;

    if (splitIdx === null || splitValue === null) {
      return findFallbackLeafValue(node);
    }

    const featureVal = arr[splitIdx];
    if (featureVal === undefined) return 0;
    // left comparison uses <= by convention
    if (featureVal <= splitValue) return traverse(left);
    return traverse(right);
  }

  return traverse(root);
}

/**
 * High level: load model, prepare features, apply meta normalization if present, predict.
 * Returns numeric raw prediction.
 */
function predictFromModel(modelPath, inputObj = {}) {
  const loaded = loadModelSync(modelPath);
  const { tree, features, meta } = loaded;
  let arr = rowToFeatureArray(inputObj, features || []);
  // if meta has mean/std, apply standardization
  if (meta && Array.isArray(meta.featureMean) && Array.isArray(meta.featureStd)) {
    const mean = meta.featureMean;
    const std = meta.featureStd;
    arr = arr.map((v, i) => {
      const m = mean[i] ?? 0;
      const s = std[i] ?? 1;
      return s === 0 ? (v - m) : ((v - m) / s);
    });
  }
  // If the model JSON expects raw (un-scaled) values, prediction still works.
  return predictWithTree(tree, arr);
}

module.exports = {
  loadModelSync,
  rowToFeatureArray,
  predictWithTree,
  predictFromModel,
};