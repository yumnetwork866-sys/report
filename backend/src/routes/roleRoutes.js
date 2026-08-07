const express = require('express');
const { requirePermission } = require('../lib/session');
const { getRoles, createRole, updateRole, deleteRole } = require('../controllers/roleController');

const router = express.Router();

router.get('/', getRoles);
router.post('/', createRole);
router.put('/:key', updateRole);
router.delete('/:key', requirePermission('admin'), deleteRole);

module.exports = router;
