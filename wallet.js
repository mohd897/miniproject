const express = require('express');
const { body, param } = require('express-validator');
const router = express.Router();
const walletController = require('../controllers/walletController');
const { protect } = require('../middleware/auth');

router.use(protect);

router.get('/', walletController.getWallet);
router.get('/balance', walletController.getBalance);
router.get('/stats', walletController.getWalletStats);
router.get('/lookup/:address', walletController.lookupWallet);
router.post('/add-funds',
  body('amount').optional().isFloat({ min: 1 }),
  walletController.addFunds
);

module.exports = router;
