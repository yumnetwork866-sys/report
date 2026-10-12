const express = require('express');
const router = express.Router();
const { requireAnyPermission, requirePermission } = require('../lib/session');
const {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getUserBookings,
  unassignUserBookings,
} = require('../controllers/userController');

// GET /api/users
router.get('/', requireAnyPermission(['admin.users.manage', 'admin.roles.manage', 'admin.teams.manage']), getUsers);

// GET /api/users/:id/bookings
router.get('/:id/bookings', requirePermission('admin.users.manage'), getUserBookings);

// POST /api/users/:id/unassign-bookings
router.post('/:id/unassign-bookings', requirePermission('admin.users.manage'), unassignUserBookings);

// GET /api/users/:id
router.get('/:id', requirePermission('admin.users.manage'), getUserById);

// POST /api/users
router.post('/', requirePermission('admin.users.manage'), createUser);

// PUT /api/users/:id
router.put('/:id', requirePermission('admin.users.manage'), updateUser);

// DELETE /api/users/:id
router.delete('/:id', requirePermission('admin.users.manage'), deleteUser);

module.exports = router;
