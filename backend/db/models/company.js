module.exports = (sequelize, DataTypes) => {
  const Company = sequelize.define('Company', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: DataTypes.STRING,
    code: {
      type: DataTypes.STRING,
      unique: true,
    },
  }, {
    tableName: 'companies',
    timestamps: false,
  });
  return Company;
};