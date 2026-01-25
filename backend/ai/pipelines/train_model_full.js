const fs = require('node:fs');
const path = require('node:path');
const { DecisionTreeRegression } = require('ml-cart');
const { parse } = require('csv-parse/sync'); // Use CSV parser

// Paths
const dataFile = path.join(__dirname, '../datasets/stress_data_full_processed_clean.csv');
const modelDir = path.join(__dirname, '../models');
const modelFile = path.join(modelDir, 'full_model.json');
const metaFile = modelFile + '.meta.json';

try {
  // Load CSV
  const rawCSV = fs.readFileSync(dataFile, 'utf8');
  const records = parse(rawCSV, { columns: true, skip_empty_lines: true });

  // Feature columns (must match training CSV header)
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

  // Prepare X (features) and y (target), convert non-numeric to 0
  const X = records.map(r => featureCols.map(f => {
    const val = Number.parseFloat(r[f]);
    return Number.isNaN(val) ? 0 : val;
  }));
  const y = records.map(r => {
    const val = Number.parseFloat(r[targetCol]);
    return Number.isNaN(val) ? 0 : val;
  });

  // compute feature means/std and target min/max for metadata (useful for normalization)
  const n = X.length || 1;
  const featureCount = featureCols.length;
  const means = new Array(featureCount).fill(0);
  const sqSums = new Array(featureCount).fill(0);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < featureCount; j++) {
      const v = X[i][j] || 0;
      means[j] += v;
      sqSums[j] += v * v;
    }
  }
  for (let j = 0; j < featureCount; j++) {
    means[j] = means[j] / n;
  }
  const stds = new Array(featureCount);
  for (let j = 0; j < featureCount; j++) {
    const mean = means[j];
    const variance = (sqSums[j] / n) - (mean * mean);
    const st = Math.sqrt(Math.max(0, variance));
    stds[j] = st === 0 ? 1 : st; // avoid zero std
  }

  const targetMin = Math.min(...y);
  const targetMax = Math.max(...y);

  // Train Decision Tree
  const tree = new DecisionTreeRegression({ maxDepth: 7 });
  tree.train(X, y);

  // Save model and metadata
  // Ensure the models directory exists
  if (!fs.existsSync(modelDir)) fs.mkdirSync(modelDir, { recursive: true });

  fs.writeFileSync(modelFile, JSON.stringify(tree.toJSON(), null, 2));
  const meta = {
    features: featureCols,
    featureMean: means,
    featureStd: stds,
    targetMin,
    targetMax,
    trainedAt: new Date().toISOString()
  };
  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2));

  console.log('Full model trained and saved.');
  console.log('Metadata saved to', metaFile);
} catch (err) {
  console.error('Error training full model:', err?.message ?? err);
  process.exit(1);
}