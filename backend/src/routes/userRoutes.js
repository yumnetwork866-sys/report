const express = require('express');
const router = express.Router();
const { requirePermission } = require('../lib/session');
const {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser
} = require('../controllers/userController');

// GET /api/users
router.get('/', requirePermission('users'), getUsers);

// GET /api/users/:id
router.get('/:id', getUserById);

// POST /api/users
router.post('/', requirePermission('users'), createUser);

// PUT /api/users/:id
router.put('/:id', updateUser);

// DELETE /api/users/:id
router.delete('/:id', requirePermission('admin'), deleteUser);

module.exports = router;