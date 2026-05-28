/**
 * Stellar / Soroban network defaults for local dev and tests.
 * Override with SOROBAN_RPC_URL and SOROBAN_NETWORK_PASSPHRASE.
 */
export const sorobanEnv = {
  sorobanRpcUrl: process.env.SOROBAN_RPC_URL ?? 'https://rpc-futurenet.stellar.org:443',
  sorobanNetworkPassphrase: process.env.SOROBAN_NETWORK_PASSPHRASE ?? 'Test SDF Future Network ; October 2022',
  escrowContractMetadata: {
    'Test SDF Future Network ; October 2022': {
      contractAddress: process.env.SOROBAN_ESCROW_CONTRACT_ADDRESS ?? 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
      expectedHash: process.env.SOROBAN_ESCROW_CONTRACT_HASH ?? 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      version: '1.0.0',
    },
  },
} as const;
