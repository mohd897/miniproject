const {
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} = require('@solana/web3.js');
const bs58 = require('bs58');
const CryptoJS = require('crypto-js');
const { solanaConnection } = require('../config/solana');
const logger = require('../utils/logger');

// ── Generate a new Solana keypair ─────────────────────────
const generateWallet = () => {
  const keypair = Keypair.generate();
  const publicKey = keypair.publicKey.toBase58();
  const privateKeyBytes = keypair.secretKey; // Uint8Array

  // AES-encrypt the private key before returning
  const privateKeyHex = Buffer.from(privateKeyBytes).toString('hex');
  const encryptedPrivateKey = CryptoJS.AES.encrypt(
    privateKeyHex,
    process.env.ENCRYPTION_KEY
  ).toString();

  return { publicKey, encryptedPrivateKey };
};

// ── Decrypt private key and return Keypair ────────────────
const decryptKeypair = (encryptedPrivateKey) => {
  const bytes = CryptoJS.AES.decrypt(encryptedPrivateKey, process.env.ENCRYPTION_KEY);
  const privateKeyHex = bytes.toString(CryptoJS.enc.Utf8);
  const privateKeyBytes = Buffer.from(privateKeyHex, 'hex');
  return Keypair.fromSecretKey(new Uint8Array(privateKeyBytes));
};

// ── Get SOL balance ───────────────────────────────────────
const getBalance = async (publicKeyStr) => {
  const mongoose = require('mongoose');
  const Wallet = mongoose.model('Wallet');
  
  const wallet = await Wallet.findOne({ publicKey: publicKeyStr });
  const sol = wallet ? wallet.balance : 0;
  
  return {
    lamports: sol * LAMPORTS_PER_SOL,
    sol: sol,
  };
};

// ── Simulate a transaction (dry-run) ─────────────────────
const simulateTransaction = async (fromPublicKeyStr, toPublicKeyStr, amountSol) => {
  // Mocked for demo purposes to always succeed
  return {
    success: true,
    logs: ["Program 11111111111111111111111111111111 invoke [1]", "Program 11111111111111111111111111111111 success"],
    unitsConsumed: 150,
  };
};

// ── Execute a SOL transfer ────────────────────────────────
const sendSOL = async (encryptedPrivateKey, toPublicKeyStr, amountSol) => {
  // Mocked for demo purposes to always succeed without hitting the blockchain
  const crypto = require('crypto');
  const fakeSignature = crypto.randomBytes(32).toString('hex') + crypto.randomBytes(32).toString('hex');
  
  return {
    success: true,
    signature: fakeSignature,
    slot: Math.floor(Math.random() * 1000000),
    fee: 0.000005,
    blockHeight: Date.now(),
  };
};

// ── Airdrop SOL on devnet (testing only) ──────────────────
const requestAirdrop = async (publicKeyStr, amountSol = 1) => {
  try {
    const pubKey = new PublicKey(publicKeyStr);
    const lamports = amountSol * LAMPORTS_PER_SOL;
    const signature = await solanaConnection.requestAirdrop(pubKey, lamports);
    await solanaConnection.confirmTransaction(signature, 'confirmed');
    logger.info(`Airdrop of ${amountSol} SOL to ${publicKeyStr} confirmed`);
    return { success: true, signature };
  } catch (error) {
    logger.error(`Airdrop failed: ${error.message}`);
    return { success: false, error: error.message };
  }
};

// ── Get transaction by signature ──────────────────────────
const getTransactionDetails = async (signature) => {
  try {
    const tx = await solanaConnection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0,
    });
    return tx;
  } catch (error) {
    logger.error(`getTransactionDetails error: ${error.message}`);
    return null;
  }
};

// ── Validate a Solana public key ──────────────────────────
const isValidPublicKey = (key) => {
  try {
    new PublicKey(key);
    return true;
  } catch {
    return false;
  }
};

module.exports = {
  generateWallet,
  getBalance,
  simulateTransaction,
  sendSOL,
  requestAirdrop,
  getTransactionDetails,
  isValidPublicKey,
  LAMPORTS_PER_SOL,
};
