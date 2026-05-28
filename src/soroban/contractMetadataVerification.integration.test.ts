import { ContractMetadataVerificationService } from '../services/soroban/contractMetadataVerification.service';
import { ContractHashMismatchError, ContractNotFoundError } from '../errors/appError';
import { sorobanEnv } from '../sorobanEnv';

describe('Contract Metadata Verification Integration Tests', () => {
  let verificationService: ContractMetadataVerificationService;
  const mockInstanceProvider = {
    getContractInstance: jest.fn(),
  };

  beforeAll(() => {
    verificationService = new ContractMetadataVerificationService(undefined, undefined, mockInstanceProvider as any);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('verifyContractMetadata', () => {
    it('should verify matching contract metadata successfully', async () => {
      const contractAddress = sorobanEnv.escrowContractMetadata['Test SDF Future Network ; October 2022'].contractAddress;
      const expectedHash = sorobanEnv.escrowContractMetadata['Test SDF Future Network ; October 2022'].expectedHash;
      const networkPassphrase = 'Test SDF Future Network ; October 2022';

      mockInstanceProvider.getContractInstance.mockResolvedValue({
        codeHash: expectedHash,
        lastModifiedLedger: 12345,
      });

      const result = await verificationService.verifyContractMetadata(contractAddress, networkPassphrase);

      expect(result.success).toBe(true);
      expect(result.contractAddress).toBe(contractAddress);
      expect(result.onChainMetadata?.codeHash).toBe(expectedHash);
      expect(result.expectedMetadata.expectedHash).toBe(expectedHash);
    });

    it('should reject mismatched contract hash', async () => {
      const contractAddress = sorobanEnv.escrowContractMetadata['Test SDF Future Network ; October 2022'].contractAddress;
      const networkPassphrase = 'Test SDF Future Network ; October 2022';
      const mismatchedHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

      mockInstanceProvider.getContractInstance.mockResolvedValue({
        codeHash: mismatchedHash,
        lastModifiedLedger: 12345,
      });

      await expect(
        verificationService.verifyContractMetadata(contractAddress, networkPassphrase)
      ).rejects.toThrow(ContractHashMismatchError);
    });

    it('should reject when contract not found on-chain', async () => {
      const contractAddress = sorobanEnv.escrowContractMetadata['Test SDF Future Network ; October 2022'].contractAddress;
      const networkPassphrase = 'Test SDF Future Network ; October 2022';

      mockInstanceProvider.getContractInstance.mockResolvedValue(null);

      await expect(
        verificationService.verifyContractMetadata(contractAddress, networkPassphrase)
      ).rejects.toThrow(ContractNotFoundError);
    });

    it('should reject when contract address does not match expected', async () => {
      const contractAddress = 'CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
      const networkPassphrase = 'Test SDF Future Network ; October 2022';

      await expect(
        verificationService.verifyContractMetadata(contractAddress, networkPassphrase)
      ).rejects.toThrow();
    });

    it('should reject unknown network passphrase', async () => {
      const contractAddress = sorobanEnv.escrowContractMetadata['Test SDF Future Network ; October 2022'].contractAddress;
      const unknownNetwork = 'Unknown Network Passphrase';

      await expect(
        verificationService.verifyContractMetadata(contractAddress, unknownNetwork)
      ).rejects.toThrow();
    });

    it('should handle RPC unavailable error gracefully', async () => {
      const contractAddress = sorobanEnv.escrowContractMetadata['Test SDF Future Network ; October 2022'].contractAddress;
      const networkPassphrase = 'Test SDF Future Network ; October 2022';

      mockInstanceProvider.getContractInstance.mockRejectedValue(
        new Error('Connection refused')
      );

      await expect(
        verificationService.verifyContractMetadata(contractAddress, networkPassphrase)
      ).rejects.toThrow();
    });
  });

  describe('isVerificationRequired', () => {
    it('should return true when contract is escrow contract', () => {
      const contractAddress = sorobanEnv.escrowContractMetadata['Test SDF Future Network ; October 2022'].contractAddress;
      const networkPassphrase = 'Test SDF Future Network ; October 2022';

      const required = verificationService.isVerificationRequired(contractAddress, networkPassphrase);
      expect(required).toBe(true);
    });

    it('should return false when contract is not escrow contract', () => {
      const contractAddress = 'CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
      const networkPassphrase = 'Test SDF Future Network ; October 2022';

      const required = verificationService.isVerificationRequired(contractAddress, networkPassphrase);
      expect(required).toBe(false);
    });

    it('should return false when network is unknown', () => {
      const contractAddress = sorobanEnv.escrowContractMetadata['Test SDF Future Network ; October 2022'].contractAddress;
      const unknownNetwork = 'Unknown Network';

      const required = verificationService.isVerificationRequired(contractAddress, unknownNetwork);
      expect(required).toBe(false);
    });
  });

  describe('Error message safety', () => {
    it('should not expose RPC URLs in error messages', async () => {
      const contractAddress = sorobanEnv.escrowContractMetadata['Test SDF Future Network ; October 2022'].contractAddress;
      const networkPassphrase = 'Test SDF Future Network ; October 2022';

      mockInstanceProvider.getContractInstance.mockRejectedValue(
        new Error(`Failed to connect to ${sorobanEnv.sorobanRpcUrl}`)
      );

      try {
        await verificationService.verifyContractMetadata(contractAddress, networkPassphrase);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        if (error instanceof Error) {
          expect(error.message).not.toContain(sorobanEnv.sorobanRpcUrl);
        }
      }
    });

    it('should not expose internal paths in error messages', async () => {
      const contractAddress = sorobanEnv.escrowContractMetadata['Test SDF Future Network ; October 2022'].contractAddress;
      const networkPassphrase = 'Test SDF Future Network ; October 2022';

      mockInstanceProvider.getContractInstance.mockRejectedValue(
        new Error('Error at /home/user/app/src/services/soroban/SorobanRpcService.ts:42')
      );

      try {
        await verificationService.verifyContractMetadata(contractAddress, networkPassphrase);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        if (error instanceof Error) {
          expect(error.message).not.toContain('/home/user/app/src');
        }
      }
    });
  });

  describe('Metadata structure validation', () => {
    it('should correctly parse on-chain metadata', async () => {
      const contractAddress = sorobanEnv.escrowContractMetadata['Test SDF Future Network ; October 2022'].contractAddress;
      const expectedHash = sorobanEnv.escrowContractMetadata['Test SDF Future Network ; October 2022'].expectedHash;
      const networkPassphrase = 'Test SDF Future Network ; October 2022';

      mockInstanceProvider.getContractInstance.mockResolvedValue({
        codeHash: expectedHash,
        lastModifiedLedger: 54321,
      });

      const result = await verificationService.verifyContractMetadata(contractAddress, networkPassphrase);

      expect(result.onChainMetadata).toBeDefined();
      expect(result.onChainMetadata?.contractAddress).toBe(contractAddress);
      expect(result.onChainMetadata?.lastModifiedLedger).toBe(54321);
      expect(result.onChainMetadata?.lastModifiedTime).toBeDefined();
    });
  });
});
