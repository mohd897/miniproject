const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');
const { protect, restrictTo } = require('../middleware/auth');

// All admin routes require authentication + admin role
router.use(protect, restrictTo('admin'));

router.get('/dashboard', adminController.getDashboard);
router.get('/users', adminController.getAllUsers);
router.patch('/users/:id/freeze', adminController.toggleFreezeUser);
router.get('/transactions', adminController.getAllTransactions);
router.patch('/transactions/:id/flag', adminController.flagTransaction);
router.get('/security-logs', adminController.getSecurityLogs);
router.get('/risk-report', adminController.getRiskReport);
router.get('/analytics', adminController.getPlatformAnalytics);

module.exports = router;
