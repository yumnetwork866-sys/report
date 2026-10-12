const express = require('express');
const { requirePermission } = require('../lib/session');
const {
  getTeams,
  createTeam,
  updateTeam,
  deleteTeam,
} = require('../controllers/contentTeamController');

const router = express.Router();

router.get('/', getTeams);
router.post('/', requirePermission('admin.teams.manage'), createTeam);
router.put('/:id', requirePermission('admin.teams.manage'), updateTeam);
router.delete('/:id', requirePermission('admin.teams.manage'), deleteTeam);

module.exports = router;
