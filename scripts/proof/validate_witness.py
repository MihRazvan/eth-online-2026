#!/usr/bin/env python3
"""Offline MPT authentication to a supplied execution header, not canonical consensus.

stdin: {artifact, expected: {chainId, manager, managerCodeHash, blockNumber, slots}}
stdout: authenticated header/account/slot data. The Node caller additionally binds ABI bytes.
Dependencies are pinned in scripts/proof/requirements.txt. No RPC, signatures or payout inputs.
"""
import json
import re
import sys

import rlp
from eth_hash.auto import keccak
from trie import HexaryTrie

FIELDS = [
    'parentHash', 'sha3Uncles', 'miner', 'stateRoot', 'transactionsRoot',
    'receiptsRoot', 'logsBloom', 'difficulty', 'number', 'gasLimit', 'gasUsed',
    'timestamp', 'extraData', 'mixHash', 'nonce', 'baseFeePerGas',
    'withdrawalsRoot', 'blobGasUsed', 'excessBlobGas', 'parentBeaconBlockRoot',
    'requestsHash',
]
QUANTITIES = {'difficulty', 'number', 'gasLimit', 'gasUsed', 'timestamp',
              'baseFeePerGas', 'blobGasUsed', 'excessBlobGas'}
WIDTHS = {'parentHash': 32, 'sha3Uncles': 32, 'miner': 20, 'stateRoot': 32,
          'transactionsRoot': 32, 'receiptsRoot': 32, 'logsBloom': 256,
          'mixHash': 32, 'nonce': 8, 'withdrawalsRoot': 32,
          'parentBeaconBlockRoot': 32, 'requestsHash': 32}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def raw(value, label, width=None):
    require(isinstance(value, str) and re.fullmatch(r'0x(?:[0-9a-fA-F]{2})*', value),
            f'Invalid {label} bytes')
    data = bytes.fromhex(value[2:])
    require(width is None or len(data) == width, f'Invalid {label} width')
    return data


def decimal(value, label, legacy_number=False):
    if legacy_number and type(value) is int:
        require(0 <= value <= (1 << 53) - 1, f'Unsafe {label} number')
        return value
    require(isinstance(value, str) and re.fullmatch(r'0|[1-9][0-9]*', value),
            f'Invalid {label} decimal')
    number = int(value)
    require(number < 1 << 256, f'{label} exceeds uint256')
    return number


def quantity(value, label):
    require(isinstance(value, str) and re.fullmatch(r'0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)', value),
            f'Invalid {label} quantity')
    number = int(value, 16)
    require(number < 1 << 256, f'{label} exceeds uint256')
    return number


def scalar(value, label):
    require(isinstance(value, bytes) and len(value) <= 32 and
            (len(value) == 0 or value[0] != 0), f'Noncanonical {label} integer')
    return int.from_bytes(value, 'big')


def canonical_rlp(data, label):
    try:
        decoded = rlp.decode(data, strict=True)
    except Exception as error:
        raise ValueError(f'Malformed {label} RLP') from error
    require(rlp.encode(decoded) == data, f'Noncanonical {label} RLP')
    return decoded


def proof_nodes(values, label):
    require(isinstance(values, list), f'Invalid {label} node list')
    nodes = []
    for value in values:
        node = canonical_rlp(raw(value, label), label)
        require(isinstance(node, list), f'Invalid {label} trie node')
        nodes.append(node)
    return nodes


def authenticate_path(root, key, proof, label):
    """Keccak-keyed Ethereum MPT path, including authenticated non-membership."""
    try:
        return HexaryTrie.get_from_proof(root, key, proof_nodes(proof, label))
    except Exception as error:
        raise ValueError(f'Invalid or incomplete {label} trie proof') from error


def authenticate_header(artifact, expected_number):
    header = artifact.get('header')
    require(isinstance(header, dict), 'Missing header object')
    encoded = raw(artifact.get('headerRlp'), 'header RLP')
    decoded = canonical_rlp(encoded, 'header')
    require(isinstance(decoded, list) and 15 <= len(decoded) <= len(FIELDS),
            'Unsupported header field count')
    require(all(isinstance(field, bytes) for field in decoded), 'Nested header field')
    reconstructed = []
    omitted = False
    for index, key in enumerate(FIELDS):
        value = header.get(key)
        if value is None:
            require(index >= 15, f'Missing required header {key}')
            omitted = True
            continue
        require(not omitted, 'Noncontiguous optional header fields')
        if key in QUANTITIES:
            n = quantity(value, f'header {key}')
            reconstructed.append(n.to_bytes((n.bit_length() + 7) // 8, 'big'))
        else:
            reconstructed.append(raw(value, f'header {key}', WIDTHS.get(key)))
    require(decoded == reconstructed, 'Header object and encoded header differ')
    require(scalar(decoded[8], 'header number') == expected_number, 'Wrong header endpoint number')
    digest = keccak(encoded)
    require(digest == raw(artifact.get('blockHash'), 'artifact block hash', 32) ==
            raw(header.get('hash'), 'header hash', 32), 'Header hash mismatch')
    return digest, decoded[3]


def validate_witness(artifact, expected):
    require(isinstance(artifact, dict) and isinstance(expected, dict), 'Expected artifact and expectation objects')
    chain_id = decimal(expected.get('chainId'), 'expected chain ID')
    require(chain_id > 0, 'Expected chain ID must be positive')
    number = decimal(expected.get('blockNumber'), 'expected block number')
    require(decimal(artifact.get('chainId'), 'artifact chain ID', True) == chain_id, 'Chain metadata mismatch')
    require(decimal(artifact.get('blockNumber'), 'artifact block number', True) == number, 'Endpoint metadata mismatch')
    manager = raw(expected.get('manager'), 'expected manager', 20)
    code_hash = raw(expected.get('managerCodeHash'), 'expected manager code hash', 32)
    require(raw(artifact.get('manager'), 'artifact manager', 20) == manager, 'Artifact manager mismatch')
    slots = expected.get('slots')
    require(isinstance(slots, list) and len(slots) > 0, 'Expected nonempty slot list')
    keys = [raw(slot, 'expected slot', 32) for slot in slots]
    require(len(set(keys)) == len(keys), 'Duplicate expected slot')
    artifact_slots = artifact.get('slots')
    require(isinstance(artifact_slots, list), 'Missing artifact slots')
    require([raw(slot, 'artifact slot', 32) for slot in artifact_slots] == keys,
            'Artifact slot list differs from expected ordered slots')
    block_hash, state_root = authenticate_header(artifact, number)
    proof = artifact.get('proof')
    require(isinstance(proof, dict), 'Missing EIP-1186 proof')
    require(raw(proof.get('address'), 'proof address', 20) == manager, 'Proof manager mismatch')
    account_raw = authenticate_path(state_root, keccak(manager), proof.get('accountProof'), 'account')
    require(account_raw != b'', 'Manager account absent')
    account = canonical_rlp(account_raw, 'account')
    require(isinstance(account, list) and len(account) == 4, 'Invalid account fields')
    require(scalar(account[0], 'account nonce') == quantity(proof.get('nonce'), 'proof nonce'), 'Account nonce mismatch')
    require(scalar(account[1], 'account balance') == quantity(proof.get('balance'), 'proof balance'), 'Account balance mismatch')
    require(isinstance(account[2], bytes) and len(account[2]) == 32 and
            account[2] == raw(proof.get('storageHash'), 'proof storage root', 32), 'Account storage root mismatch')
    require(isinstance(account[3], bytes) and len(account[3]) == 32 and
            account[3] == code_hash == raw(proof.get('codeHash'), 'proof code hash', 32),
            'Manager code hash differs from independently expected pin')
    if 'managerCode' in artifact:
        require(keccak(raw(artifact['managerCode'], 'manager code')) == code_hash, 'Retained manager code mismatch')
    storage = proof.get('storageProof')
    require(isinstance(storage, list) and len(storage) == len(keys), 'Missing or extra storage proofs')
    by_key = {}
    for entry in storage:
        require(isinstance(entry, dict), 'Invalid storage proof entry')
        key = entry.get('key')
        require(isinstance(key, str) and re.fullmatch(r'0x[0-9a-fA-F]{1,64}', key), 'Invalid storage key')
        key_bytes = int(key, 16).to_bytes(32, 'big')
        require(key_bytes in keys and key_bytes not in by_key, 'Substituted or duplicate storage key')
        by_key[key_bytes] = entry
    values = []
    for key in keys:
        entry = by_key[key]
        encoded_value = authenticate_path(account[2], keccak(key), entry.get('proof'), 'storage')
        value = scalar(canonical_rlp(encoded_value, 'storage value'), 'storage value') if encoded_value else 0
        # Public Ethereum normally deletes zero slots; Anvil can retain an authenticated
        # canonical RLP integer-zero leaf. Both decode to zero in the Solidity verifier.
        # The full path/root still has to authenticate; noncanonical integers are rejected above.
        require(value == quantity(entry.get('value'), 'proof storage value'), 'Claimed storage value differs from authenticated value')
        values.append(str(value))
    if 'values' in artifact:
        require(isinstance(artifact['values'], list) and
                [str(decimal(value, 'retained storage value')) for value in artifact['values']] == values,
                'Retained values differ from authenticated values')
    return {'blockHash': '0x' + block_hash.hex(), 'stateRoot': '0x' + state_root.hex(),
            'storageRoot': '0x' + account[2].hex(), 'slots': ['0x' + key.hex() for key in keys],
            'values': values, 'managerCodeHash': '0x' + code_hash.hex(),
            'scope': 'authenticated to supplied execution header; canonical consensus and chain identity not established'}


def unique_object(pairs):
    result = {}
    for key, value in pairs:
        require(key not in result, 'Duplicate JSON object key')
        result[key] = value
    return result


def main():
    try:
        request = json.load(sys.stdin, object_pairs_hook=unique_object)
        require(isinstance(request, dict), 'Expected JSON request object')
        result = validate_witness(request.get('artifact'), request.get('expected'))
        print(json.dumps(result, separators=(',', ':')))
    except Exception as error:
        # Do not echo input artifacts, paths, RPC endpoints, or traceback internals.
        message = str(error) if isinstance(error, ValueError) else 'Malformed witness input'
        print('Witness validation failed: ' + message, file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
