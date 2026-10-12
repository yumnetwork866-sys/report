const express = require('express');
const { requirePermission } = require('../lib/session');
const { getRoles, createRole, updateRole, deleteRole } = require('../controllers/roleController');

const router = express.Router();

router.get('/', getRoles);
router.post('/', requirePermission('admin.roles.manage'), createRole);
router.put('/:key', requirePermission('admin.roles.manage'), updateRole);
router.delete('/:key', requirePermission('admin.roles.manage'), deleteRole);

module.exports = router;
