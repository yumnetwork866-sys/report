const express = require('express');
const controller = require('../controllers/tiktokAppController');

const router = express.Router();

router.get('/', controller.listApps);
router.post('/', controller.createApp);
router.put('/:id', controller.updateApp);
router.delete('/:id', controller.deleteApp);
router.patch('/:id/status', controller.toggleAppStatus);

module.exports = router;
