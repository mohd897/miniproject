const mongoose = require('mongoose');
const CryptoJS = require('crypto-js');

const walletSchema = new mongoose.Schema(
  {
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },

    // ── Solana Addresses ──────────────────────────────────
    publicKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    // Private key is AES-encrypted before storage — NEVER store plaintext
    encryptedPrivateKey: {
      type: String,
      required: true,
      select: false,
    },

    // ── Balances ──────────────────────────────────────────
    balance: { type: Number, default: 0, min: 0 },        // SOL balance (lamports/1e9)
    balanceUSD: { type: Number, default: 0 },              // cached USD value
    lastBalanceSync: { type: Date, default: Date.now },

    // ── Wallet Metadata ───────────────────────────────────
    label: { type: String, default: 'Main Wallet' },
    isActive: { type: Boolean, default: true },
    network: { type: String, enum: ['devnet', 'testnet', 'mainnet-beta'], default: 'devnet' },

    // ── Daily Limits ──────────────────────────────────────
    dailyLimit: { type: Number, default: 100 },            // SOL
    dailySent: { type: Number, default: 0 },
    dailyLimitResetAt: { type: Date, default: () => new Date(Date.now() + 86400000) },

    // ── Transaction Stats ─────────────────────────────────
    totalSent: { type: Number, default: 0 },
    totalReceived: { type: Number, default: 0 },
    transactionCount: { type: Number, default: 0 },

    // ── QR Code ───────────────────────────────────────────
    qrCodeUrl: { type: String, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
  }
);

// ── Decrypt private key (use only in backend services) ────
walletSchema.methods.getPrivateKey = function () {
  const bytes = CryptoJS.AES.decrypt(this.encryptedPrivateKey, process.env.ENCRYPTION_KEY);
  return bytes.toString(CryptoJS.enc.Utf8);
};

// ── Reset daily limit if needed ───────────────────────────
walletSchema.methods.checkAndResetDailyLimit = async function () {
  if (this.dailyLimitResetAt <= new Date()) {
    this.dailySent = 0;
    this.dailyLimitResetAt = new Date(Date.now() + 86400000);
    await this.save();
  }
};

walletSchema.index({ publicKey: 1 });
walletSchema.index({ owner: 1 });

module.exports = mongoose.model('Wallet', walletSchema);
