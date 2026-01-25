const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { Op } = require('sequelize');

// GET /api/teams?companyCode=XYZ
router.get('/', async (req, res) => {
  try {
    const { companyCode } = req.query;
    if (!companyCode) return res.status(400).json({ error: 'Company code required' });
    
    const Team = db.Team || db.sequelize.models.Team;
    const teams = await Team.findAll({ where: { companyCode } });
    res.json(teams);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/teams
router.post('/', async (req, res) => {
  try {
    const { name, companyCode } = req.body;
    if (!name || !companyCode) return res.status(400).json({ error: 'Name and Company Code required' });

    const Team = db.Team || db.sequelize.models.Team;
    const team = await Team.create({ name, companyCode });
    res.json(team);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/teams/:id
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: 'Team ID required' });

    const Team = db.Team || db.sequelize.models.Team;
    const User = db.User || db.sequelize.models.User;

    // Unassign users first
    await User.update({ teamId: null }, { where: { teamId: id } });
    // Delete team
    await Team.destroy({ where: { id } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/teams/assign
router.post('/assign', async (req, res) => {
  try {
    const { userId, teamId } = req.body;
    const safeTeamId = (teamId === undefined || teamId === null) ? null : Number.parseInt(teamId, 10);
    const User = db.User || db.sequelize.models.User;
    await User.update({ teamId: safeTeamId }, { where: { id: userId } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;