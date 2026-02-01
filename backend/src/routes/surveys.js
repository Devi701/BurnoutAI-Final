const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { Op } = require('sequelize');

// GET /api/surveys?companyCode=XYZ
router.get('/', async (req, res) => {
  try {
    const { companyCode } = req.query;
    if (!companyCode) return res.status(400).json({ error: 'Company code required' });

    const Survey = db.Survey || db.sequelize.models.Survey;
    const surveys = await Survey.findAll({ where: { companyCode } });
    res.json(surveys);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/surveys
router.post('/', async (req, res) => {
  try {
    const { companyCode, name, questions } = req.body;
    if (!companyCode || !name || !questions) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const Survey = db.Survey || db.sequelize.models.Survey;
    const survey = await Survey.create({ companyCode, name, questions, isActive: true });
    res.json(survey);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/surveys/:id/activate
router.put('/:id/activate', async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    
    const Survey = db.Survey || db.sequelize.models.Survey;
    const survey = await Survey.findByPk(id);
    if (!survey) return res.status(404).json({ error: 'Survey not found' });

    // If activating, deactivate others for this company (optional rule, but good for MVP)
    if (isActive) {
      await Survey.update({ isActive: false }, { where: { companyCode: survey.companyCode } });
    }

    survey.isActive = isActive;
    await survey.save();
    res.json(survey);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/surveys/active?companyCode=XYZ
router.get('/active', async (req, res) => {
  try {
    const { companyCode } = req.query;
    const Survey = db.Survey || db.sequelize.models.Survey;
    const survey = await Survey.findOne({ where: { companyCode, isActive: true } });
    res.json(survey); // Returns null if none active
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/surveys/:id/responses
router.post('/:id/responses', async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, answers } = req.body;
    
    const SurveyResponse = db.SurveyResponse || db.sequelize.models.SurveyResponse;
    await SurveyResponse.create({ surveyId: id, userId, answers });
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;