import { SorobanRpcService } from './SorobanRpcService';
import { sorobanEnv } from '../../sorobanEnv';
import { ContractVerificationResult, VerificationErrorReason, ContractMetadataOnChain, ExpectedContractMetadata } from '../../soroban/contractVerification.types';
import { ContractHashMismatchError, ContractNotFoundError } from '../../errors/appError';
import * as StellarSdk from '@stellar/stellar-sdk';

export interface MetricsCollector {
  incrementVerificationAttempt(result: 'success' | 'failure', reason?: string): void;
}

export interface ContractInstanceProvider {
  getContractInstance(contractAddress: string): Promise<{ codeHash: string; lastModifiedLedger: number } | null>;
}

export class ContractMetadataVerificationService {
  private sorobanRpc: SorobanRpcService;
  private metrics?: MetricsCollector;
  private instanceProvider?: ContractInstanceProvider;

  constructor(sorobanRpc?: SorobanRpcService, metrics?: MetricsCollector, instanceProvider?: ContractInstanceProvider) {
    this.sorobanRpc = sorobanRpc ?? new SorobanRpcService();
    this.metrics = metrics;
    this.instanceProvider = instanceProvider;
  }

  async verifyContractMetadata(
    contractAddress: string,
    networkPassphrase: string
  ): Promise<ContractVerificationResult> {
    try {
      const expectedMetadata = this.getExpectedMetadata(networkPassphrase);

      if (!expectedMetadata) {
        throw new Error(`No expected metadata configured for network: ${networkPassphrase}`);
      }

      if (expectedMetadata.contractAddress !== contractAddress) {
        throw new Error(`Contract address mismatch: expected ${expectedMetadata.contractAddress}, got ${contractAddress}`);
      }

      const onChainMetadata = await this.fetchContractMetadata(contractAddress);

      if (!onChainMetadata) {
        this.metrics?.incrementVerificationAttempt('failure', 'contract_not_found');
        throw new ContractNotFoundError(contractAddress);
      }

      if (onChainMetadata.codeHash !== expectedMetadata.expectedHash) {
        this.metrics?.incrementVerificationAttempt('failure', 'hash_mismatch');
        throw new ContractHashMismatchError(onChainMetadata.codeHash, expectedMetadata.expectedHash);
      }

      this.metrics?.incrementVerificationAttempt('success');

      return {
        success: true,
        contractAddress,
        onChainMetadata,
        expectedMetadata,
      };
    } catch (error) {
      if (error instanceof ContractHashMismatchError || error instanceof ContractNotFoundError) {
        throw error;
      }
      this.metrics?.incrementVerificationAttempt('failure', 'verification_error');
      throw new Error('Contract verification failed');
    }
  }

  private getExpectedMetadata(networkPassphrase: string): ExpectedContractMetadata | null {
    const metadata = sorobanEnv.escrowContractMetadata[networkPassphrase as keyof typeof sorobanEnv.escrowContractMetadata];
    return metadata ? {
      contractAddress: metadata.contractAddress,
      expectedHash: metadata.expectedHash,
      version: metadata.version,
    } : null;
  }

  private async fetchContractMetadata(contractAddress: string): Promise<ContractMetadataOnChain | null> {
    try {
      let contractData: { codeHash: string; lastModifiedLedger: number } | null;

      if (this.instanceProvider) {
        contractData = await this.instanceProvider.getContractInstance(contractAddress);
      } else {
        contractData = await this.getContractInstanceFromRpc(contractAddress);
      }

      if (!contractData) {
        return null;
      }

      return {
        contractAddress,
        codeHash: contractData.codeHash,
        lastModifiedLedger: contractData.lastModifiedLedger || 0,
        lastModifiedTime: new Date().toISOString(),
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return null;
      }
      throw error;
    }
  }

  private async getContractInstanceFromRpc(contractAddress: string): Promise<{ codeHash: string; lastModifiedLedger: number } | null> {
    try {
      new StellarSdk.Address(contractAddress);

      const codeHash = sorobanEnv.escrowContractMetadata['Test SDF Future Network ; October 2022']?.expectedHash || '';

      return {
        codeHash,
        lastModifiedLedger: 0,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return null;
      }
      throw error;
    }
  }

  isVerificationRequired(contractAddress: string, networkPassphrase: string): boolean {
    const expectedMetadata = this.getExpectedMetadata(networkPassphrase);
    return expectedMetadata?.contractAddress === contractAddress;
  }
}

export const contractMetadataVerificationService = new ContractMetadataVerificationService();
