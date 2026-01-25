// ...existing exports...
/**
 * Normalize a raw burnout score to 0-100 scale.
 * @param {number} rawScore
 * @param {number} minScore
 * @param {number} maxScore
 * @returns {number} normalized score
 */
function normalizeScore(rawScore, minScore, maxScore) {
  if (minScore === maxScore) return 0;
  let score = ((rawScore - minScore) / (maxScore - minScore)) * 100;
  return Math.max(0, Math.min(100, score)); // clamp between 0–100
}

/**
 * Aggregate feature scores into a single raw burnout score.
 * This is a placeholder for your model’s output if you want to weight features manually.
 * @param {Object} features
 * @param {Object} weights
 * @returns {number} raw burnout score
 */
function calculateRawScore(features, weights) {
  let score = 0;
  Object.keys(weights).forEach(key => {
    if (key in features) score += features[key] * weights[key];
  });
  return score;
}

/**
 * Optional transform: map incoming object to cleaned object the model expects.
 * Add feature renames / derived features here if your training pipeline did so.
 * If you don't need transforms, this returns the same object.
 */
function transform(obj = {}) {
  // Example: ensure numeric types and lowercase keys used in training
  const out = {};
  Object.keys(obj).forEach(k => {
    const v = obj[k];
    if (typeof v === 'number') {
      out[k] = v;
    } else if (v === '' || v == null) {
      out[k] = 0;
    } else {
      out[k] = Number(v) || 0;
    }
  });
  // add derived features if training pipeline used them, e.g. out['stressRatio'] = out.stress / Math.max(1,out.sleep);
  return out;
}

/**
 * Optional normalize: takes feature array and returns normalized array.
 * Implement if your model used scaling (mean/std or min/max).
 * Default: pass-through.
 */
function normalize(arr = []) {
  // If you recorded mean/std in training, apply here:
  // return arr.map((v,i) => (v - MEAN[i]) / STD[i]);
  return arr;
}

// Expose optional global min/max used for normalizeScore
const minScore = 0;
const maxScore = 1;

module.exports = { normalizeScore, calculateRawScore, transform, normalize, minScore, maxScore };