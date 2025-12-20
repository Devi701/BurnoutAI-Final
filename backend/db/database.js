const { Sequelize } = require('sequelize');
const path = require('path');
const fs = require('fs');

const db = {};
let sequelize;

if (process.env.DATABASE_URL) {
  // Production / Render (PostgreSQL)
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    protocol: 'postgres',
    logging: false,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false // Required for Render's self-signed certs
      }
    }
  });
} else {
  // Development (SQLite)
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: path.join(__dirname, '../database.sqlite'),
    logging: false
  });
}

// Load models dynamically from the 'models' directory
const modelsDir = path.join(__dirname, 'models');
if (fs.existsSync(modelsDir)) {
  fs.readdirSync(modelsDir)
    .filter(file => {
      return (file.indexOf('.') !== 0) && (file.slice(-3) === '.js');
    })
    .forEach(file => {
      const model = require(path.join(modelsDir, file))(sequelize, Sequelize.DataTypes);
      db[model.name] = model;
    });
}

Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;