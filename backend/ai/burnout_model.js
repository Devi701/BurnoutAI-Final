const fs = require('node:fs');
const path = require('node:path');
const { DecisionTreeRegression } = require('ml-cart');

function loadModel(modelPath) {
  try {
    if (!fs.existsSync(modelPath)) {
      console.warn(`Model file not found: ${modelPath}`);
      return null;
    }
    const raw = fs.readFileSync(modelPath, 'utf8');
    const treeJSON = JSON.parse(raw);
    return DecisionTreeRegression.load(treeJSON);
  } catch (error) {
    console.error(`Failed to load model from ${modelPath}:`, error);
    return null;
  }
}

const smallModelPath = path.join(__dirname, 'models/small_quiz_model.json');
const fullModelPath = path.join(__dirname, 'models/full_model.json');

const smallModel = loadModel(smallModelPath);
const fullModel = loadModel(fullModelPath);

function predictSmall(input) {
  if (!smallModel) {
    console.warn('Small model not loaded. Returning default score.');
    return 0;
  }
  const features = [
    input.EE1,input.EE4,input.EE7,input.S1,input.S3,
    input.SFQ1,input.SFQ5,input.wp1,input.wp3,input.auton1
  ];
  return Math.max(0, Math.min(100, smallModel.predict([features])[0]));
}

function predictFull(input) {
  if (!fullModel) {
    console.warn('Full model not loaded. Returning default score.');
    return 0;
  }
  const features = [
    input.EE1,input.EE2,input.EE3,input.EE4,input.EE5,input.EE6,input.EE7,
    input.S1,input.S2,input.S3,input.S4,input.S5,
    input.SFQ1,input.SFQ2,input.SFQ3,
    input.wp1,input.wp2,input.wp3,input.wp4,
    input.cogn1,input.cogn2,input.cogn3,input.cogn4,
    input.SS1,input.SS2,input.SS3,
    input.CS1,input.CS2,input.CS3,
    input.auton1,input.auton2,input.auton3
  ];
  return Math.max(0, Math.min(100, fullModel.predict([features])[0]));
}

module.exports = { predictSmall, predictFull };
