module.exports = function defineQuizResult(sequelize, DataTypes) {
  const QuizResult = sequelize.define('QuizResult', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      field: 'user_id',
    },
    quizType: {
      type: DataTypes.STRING, // 'small' or 'full'
      field: 'quiz_type',
    },
    score: DataTypes.REAL,
    breakdown: DataTypes.JSON,
  }, {
    tableName: 'quiz_results',
  });
  return QuizResult;
};