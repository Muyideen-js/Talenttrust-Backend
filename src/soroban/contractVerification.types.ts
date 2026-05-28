export enum VerificationErrorReason {
  HASH_MISMATCH = 'HASH_MISMATCH',
  CONTRACT_NOT_FOUND = 'CONTRACT_NOT_FOUND',
  RPC_UNAVAILABLE = 'RPC_UNAVAILABLE',
  INVALID_NETWORK = 'INVALID_NETWORK',
}

export interface ContractMetadataOnChain {
  contractAddress: string;
  codeHash: string;
  lastModifiedLedger: number;
  lastModifiedTime: string;
}

export interface ExpectedContractMetadata {
  contractAddress: string;
  expectedHash: string;
  version: string;
}

export interface ContractVerificationResult {
  success: boolean;
  contractAddress: string;
  onChainMetadata?: ContractMetadataOnChain;
  expectedMetadata: ExpectedContractMetadata;
  reason?: VerificationErrorReason;
}
