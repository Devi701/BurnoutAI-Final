module.exports = (sequelize, DataTypes) => {
  const Checkin = sequelize.define('Checkin', {
    stress: {
      type: DataTypes.FLOAT,
      defaultValue: 0
    },
    sleep: {
      type: DataTypes.FLOAT,
      defaultValue: 0
    },
    workload: {
      type: DataTypes.FLOAT,
      defaultValue: 0
    },
    coffee: {
      type: DataTypes.FLOAT,
      defaultValue: 0
    },
    companyCode: {
      type: DataTypes.STRING,
      allowNull: true
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  });

  return Checkin;
};