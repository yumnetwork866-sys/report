const express = require('express');
const controller = require('../controllers/tiktokAppController');
const { requireAnyPermission } = require('../lib/session');

const router = express.Router();
const requireAppManage = requireAnyPermission(['app.manage', 'admin.shops.manage']);

router.get('/', controller.listApps);
router.get('/active', controller.listActiveApps);
router.get('/:id/secret', requireAppManage, controller.getAppSecret);
router.post('/', requireAppManage, controller.createApp);
router.put('/:id', requireAppManage, controller.updateApp);
router.delete('/:id', requireAppManage, controller.deleteApp);
router.patch('/:id/status', requireAppManage, controller.toggleAppStatus);

module.exports = router;
