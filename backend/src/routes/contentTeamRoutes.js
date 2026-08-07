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
router.post('/', createTeam);
router.put('/:id', updateTeam);
router.delete('/:id', requirePermission('admin'), deleteTeam);

module.exports = router;
