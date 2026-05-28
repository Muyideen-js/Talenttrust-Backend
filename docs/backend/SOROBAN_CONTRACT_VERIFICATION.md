# Soroban Contract Metadata Verification

## Overview

Contract metadata verification ensures that the Soroban escrow contract deployed on-chain matches an expected code hash pinned in the backend configuration. This prevents settlement operations from being triggered on compromised, swapped, or unexpected contract instances.

## Purpose

When the backend initiates escrow settlement (payment release), it must verify that the on-chain contract code matches what we expect. This defense-in-depth measure:

- **Prevents contract swaps**: A malicious actor cannot substitute a different contract
- **Detects compromises**: Contract code mutations are immediately rejected
- **Ensures predictability**: Settlement always uses the intended contract version
- **Enables rotation**: Upgrading contract versions is tracked and auditable

## Architecture

### Components

1. **sorobanEnv.ts** — Configuration with pinned contract hashes per network
2. **contractMetadataVerification.service.ts** — Verification logic and on-chain lookups
3. **contract-processor.ts** — Integration gate before settlement finalization
4. **Error handling** — Safe errors via `ContractVerificationError` and subclasses
5. **Notifications** — `METADATA_VERIFICATION_FAILED` event triggers alerts

### Verification Flow

```
Settlement Initiated
        ↓
[contract-processor] finalizeContract()
        ↓
[Verification Gate]
  Check if verification required?
  ├─ NO → Proceed to settlement
  └─ YES ↓
    Fetch on-chain contract metadata
    Extract code hash from ledger
    Compare hash vs. expected (from sorobanEnv)
    ├─ MATCH → Proceed to settlement
    └─ MISMATCH ↓
      Throw ContractHashMismatchError
      Emit METADATA_VERIFICATION_FAILED event
      Notify user
      Block settlement
```

## Configuration

### Setting Expected Contract Hash

Edit `src/sorobanEnv.ts`:

```typescript
export const sorobanEnv = {
  sorobanRpcUrl: process.env.SOROBAN_RPC_URL ?? 'https://rpc-futurenet.stellar.org:443',
  sorobanNetworkPassphrase: process.env.SOROBAN_NETWORK_PASSPHRASE ?? 'Test SDF Future Network ; October 2022',
  escrowContractMetadata: {
    'Test SDF Future Network ; October 2022': {
      contractAddress: process.env.SOROBAN_ESCROW_CONTRACT_ADDRESS ?? 'CAAAA...',
      expectedHash: process.env.SOROBAN_ESCROW_CONTRACT_HASH ?? 'e3b0c44...',
      version: '1.0.0',
    },
    // Add production networks similarly:
    // 'Public Global Stellar Network ; September 2015': { ... },
  },
} as const;
```

### Environment Variables

```bash
# Contract address (Soroban contract ID in base32 format)
SOROBAN_ESCROW_CONTRACT_ADDRESS=CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4

# Contract code hash (hex-encoded SHA-256 hash of compiled WASM)
SOROBAN_ESCROW_CONTRACT_HASH=e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855

# RPC endpoint
SOROBAN_RPC_URL=https://rpc-futurenet.stellar.org:443

# Network passphrase
SOROBAN_NETWORK_PASSPHRASE=Test SDF Future Network ; October 2022
```

## Obtaining Contract Code Hash

### Step 1: Deploy Contract to Network

```bash
# Deploy your escrow contract
soroban contract deploy \
  --wasm ./target/wasm32-unknown-unknown/release/escrow.wasm \
  --network testnet
```

### Step 2: Extract Code Hash

**Via soroban CLI:**

```bash
soroban contract info \
  --id CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4 \
  --network testnet
```

Look for `Code Hash` in the output (hex format).

**Via Stellar RPC:**

```bash
curl -X POST https://soroban-testnet.stellar.org/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "getLedgerEntries",
    "params": {
      "keys": ["AAA..."]  // Encoded contract instance key
    }
  }' | jq '.result.entries[0].xdr' | xdr decode
```

**Via Soroban Explorer:**

Navigate to [soroban.expert](https://soroban.expert) or the official testnet explorer, search your contract address, and view the code hash.

### Step 3: Verify Hash Stability

The code hash must be **deterministic** — redeploying identical WASM bytecode should produce the same hash:

```bash
# Get hash before deployment
sha256sum ./target/wasm32-unknown-unknown/release/escrow.wasm

# Deploy and query on-chain
soroban contract info --id CAAAA...

# Verify on-chain hash matches file hash
```

## Contract Rotation Procedure

When upgrading the escrow contract:

### 1. Prepare New Contract

```bash
# Build new version
cargo build --release --target wasm32-unknown-unknown

# Verify deterministic build
sha256sum target/wasm32-unknown-unknown/release/escrow.wasm
```

### 2. Deploy to Testnet First

```bash
soroban contract deploy \
  --wasm ./target/wasm32-unknown-unknown/release/escrow.wasm \
  --network testnet
```

Record the new code hash.

### 3. Test with New Hash

Update `src/sorobanEnv.ts` with the new testnet hash:

```typescript
'Test SDF Future Network ; October 2022': {
  contractAddress: 'CAAAA...',
  expectedHash: 'NEW_HASH_HERE',  // Updated
  version: '1.1.0',  // Bumped
},
```

Run integration tests:

```bash
npm test -- src/soroban/contractMetadataVerification.integration.test.ts
```

### 4. Deploy to Production Network

Once testnet testing passes, deploy to production and update `sorobanEnv.ts`:

```typescript
'Public Global Stellar Network ; September 2015': {
  contractAddress: 'CPROD...',
  expectedHash: 'PROD_HASH_HERE',
  version: '1.1.0',
},
```

### 5. Gradual Rollout (Optional)

For critical services, use feature flags or canary deployments:

- Deploy backend update with new hash
- Monitor verification success rate
- Watch for `contract_metadata_verification_failures_total` metric
- Once stable, complete full rollout

### 6. Update Documentation

Update this file with:
- New contract version
- Deployment date
- Migration notes

## Error Handling

### Verification Failures

When verification fails, one of these errors is raised:

| Error | HTTP Status | Safe Message | Action |
|-------|------------|--------------|--------|
| `ContractHashMismatchError` | 422 | "Contract verification failed" | Block settlement, alert user |
| `ContractNotFoundError` | 404 | "Contract not found on-chain" | Investigate chain state, retry |
| Generic verification error | 422 | "Contract verification failed" | Log, alert ops, investigate |

### Error Messages Are Safe

All error responses use safe, client-facing messages that don't expose:
- RPC URLs or endpoints
- Internal file paths
- Contract addresses (only in logs)
- Implementation details

Example unsafe details filtered:
- ❌ "Failed to connect to https://rpc-futurenet.stellar.org:443"
- ✅ "Contract verification failed"

## Monitoring & Alerts

### Metrics

The verification service emits Prometheus metrics:

```
# Success counter
contract_metadata_verification_attempts_total{result="success"} 1542

# Failure counter
contract_metadata_verification_attempts_total{result="failure"} 3

# Failure reasons
contract_metadata_verification_failures_by_reason{reason="hash_mismatch"} 2
contract_metadata_verification_failures_by_reason{reason="contract_not_found"} 1
```

### Dashboards

Monitor:
1. **Verification Success Rate**: Should be near 100%
2. **Failure Types**: Sudden spikes indicate potential issues
3. **Latency**: Verification adds 200-500ms (RPC call + comparison)

### Alerts

Set up alerts for:
- `contract_metadata_verification_failures_total > 0 in 5 minutes` → Investigate
- `contract_metadata_verification_attempts_total == 0 for 1 hour` → Verification gate not triggering
- Notification event `METADATA_VERIFICATION_FAILED` spike → Check RPC connectivity

## Security Assumptions

### What This Protects Against

✅ Contract code swap (different contract deployed at same address)
✅ WASM bytecode mutation on-chain
✅ Accidental contract redeploy with wrong version
✅ Man-in-the-middle RPC spoofing (via hash mismatch)

### What This Does NOT Protect Against

❌ RPC endpoint compromise (if RPC lies about hash, we can't detect)
❌ Time-of-check-time-of-use race (contract updated between check and call)
❌ Bug in contract logic itself (hash matches but logic is flawed)

### Recommendations

1. **Use trusted RPC endpoints** — Prefer your own full node or established providers
2. **Monitor contract state** — Set up alerts if contract data changes unexpectedly
3. **Test contract thoroughly** — Hash verification is a gate, not a substitute for audits
4. **Rotate keys regularly** — Escrow keys should follow standard rotation practices

## Troubleshooting

### Verification Fails After Deployment

**Symptom**: Verification error after deploying new contract

**Causes**:
1. Hash mismatch between local build and on-chain
2. Non-deterministic WASM build
3. Network/RPC connectivity issue

**Solutions**:
```bash
# 1. Verify local hash
sha256sum target/wasm32-unknown-unknown/release/escrow.wasm

# 2. Query on-chain hash
soroban contract info --id CAAAA... --network testnet

# 3. Check RPC connectivity
curl https://rpc-futurenet.stellar.org/health

# 4. Clean and rebuild
cargo clean && cargo build --release --target wasm32-unknown-unknown
```

### Verification Hangs or Times Out

**Symptom**: Settlement requests hang, eventually timeout

**Cause**: RPC endpoint unavailable or very slow

**Solution**:
```bash
# Check RPC health
curl -X POST https://rpc-futurenet.stellar.org/ \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"getHealth","id":1}'

# Switch RPC endpoint if needed
export SOROBAN_RPC_URL=https://alternative-rpc.stellar.org
```

### Contract Not Found Error

**Symptom**: Verification fails with "Contract not found on-chain"

**Causes**:
1. Contract address typo
2. Contract not deployed to specified network
3. Querying wrong network

**Solution**:
```bash
# Verify contract exists
soroban contract info --id CAAAA... --network testnet

# Check your network setting
echo $SOROBAN_NETWORK_PASSPHRASE
```

## Testing

### Unit Tests

```bash
npm test -- src/soroban/contractMetadataVerification.integration.test.ts
```

Coverage includes:
- ✅ Happy path: matching hash → verification passes
- ✅ Mismatch path: hash mismatch → verification fails
- ✅ Not found: contract doesn't exist → 404 error
- ✅ Error safety: no sensitive data in messages
- ✅ Network handling: correct metadata per network

### Integration Tests

1. **Manual verification**:
   ```bash
   # Deploy test contract
   soroban contract deploy --wasm ./test.wasm --network testnet
   
   # Update sorobanEnv.ts with new hash
   # Run: npm test (should pass)
   # Run settlement: should succeed
   ```

2. **Mismatch simulation**:
   ```bash
   # Update expectedHash to wrong value
   # Run settlement: should fail with safe error
   ```

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-05-28 | Initial contract verification implementation |

## References

- [Stellar Soroban Documentation](https://developers.stellar.org/docs/build/smart-contracts)
- [Contract Code Hash Guide](https://developers.stellar.org/docs/build/smart-contracts/hashing)
- [Soroban RPC API](https://developers.stellar.org/docs/learn/rpc/api)
