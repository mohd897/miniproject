const { Connection, clusterApiUrl } = require('@solana/web3.js');

const NETWORKS = {
  devnet: clusterApiUrl('devnet'),
  testnet: clusterApiUrl('testnet'),
  mainnet: clusterApiUrl('mainnet-beta'),
};

const network = process.env.SOLANA_NETWORK || 'devnet';
const rpcUrl = process.env.SOLANA_RPC_URL || NETWORKS[network];

const solanaConnection = new Connection(rpcUrl, {
  commitment: 'confirmed',
  confirmTransactionInitialTimeout: 60000,
});

module.exports = { solanaConnection, network, rpcUrl };
