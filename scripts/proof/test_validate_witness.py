"""Offline regressions: retained public bytes and clearly synthetic generated tries."""
import copy
import json
import pathlib
import subprocess
import sys
import unittest

import rlp
from eth_hash.auto import keccak
from trie import HexaryTrie
from validate_witness import FIELDS, QUANTITIES, validate_witness

PUBLIC = json.loads(pathlib.Path(__file__).with_name('sepolia-witness.json').read_text())
# Independent deployment pin from the prior canonical PoolManager code evidence, not proof['codeHash'].
PUBLIC_CODE_HASH = '0x09930125a49f5b95caf8052991cc14d1240dca8b43f42b899115b86867e4bce1'
PUBLIC_EXPECTED = {'chainId': '11155111', 'manager': '0xE03A1074c86CFeDd5C142C4F04F1a1536e203543',
                   'managerCodeHash': PUBLIC_CODE_HASH, 'blockNumber': '11682191', 'slots': PUBLIC['slots']}


def hx(value):
    return '0x' + value.hex()


def word(value):
    return value.to_bytes(32, 'big')


def proof_of(trie, key):
    return [hx(rlp.encode(node)) for node in trie.get_proof(key)]


def synthetic(kind='branches', storage_encoded=None, account_fields=None):
    """Generate offline MPTs, including embedded branches; this is not public-chain state.

    The inline case uses a decoy trie key with 63 shared nibbles, without claiming a known slot preimage.
    This deterministically exercises the hashed requested slot's inline descendants without brute force.
    """
    manager = bytes.fromhex('12' * 20)
    code = b'\x60\x00'
    code_hash = keccak(code)
    storage = HexaryTrie({})
    keys = [word(1), word(2)]
    values = [7, 0]
    if kind != 'empty':
        storage[keccak(keys[0])] = storage_encoded if storage_encoded is not None else rlp.encode(7)
    if kind == 'inline':
        target = keccak(keys[0])
        decoy = target[:-1] + bytes([target[-1] ^ 1])
        storage[decoy] = rlp.encode(8)
    elif kind == 'branches':
        storage[keccak(keys[1])] = rlp.encode(9)
        missing = 3
        while keccak(word(missing))[0] >> 4 in {keccak(k)[0] >> 4 for k in keys}:
            missing += 1
        keys.append(word(missing))
        values = [7, 9, 0]
    elif kind == 'empty':
        values = [0, 0]
    state = HexaryTrie({})
    account = account_fields if account_fields is not None else [2, 3, storage.root_hash, code_hash]
    state[keccak(manager)] = rlp.encode(account)
    header = copy.deepcopy(PUBLIC['header'])
    header['stateRoot'] = hx(state.root_hash)
    header['number'] = '0x7b'
    encoded = rlp.encode([int(header[k], 16) if k in QUANTITIES else bytes.fromhex(header[k][2:])
                          for k in FIELDS if header.get(k) is not None])
    header['hash'] = hx(keccak(encoded))
    artifact = {'scope': 'synthetic generated trie fixture', 'chainId': '31337', 'blockNumber': '123',
                'manager': hx(manager), 'blockHash': header['hash'], 'header': header, 'headerRlp': hx(encoded),
                'slots': [hx(k) for k in keys], 'proof': {
                    'address': hx(manager), 'nonce': '0x2', 'balance': '0x3',
                    'codeHash': hx(code_hash), 'storageHash': hx(storage.root_hash),
                    'accountProof': proof_of(state, keccak(manager)),
                    'storageProof': [{'key': hx(k), 'value': hex(value), 'proof': proof_of(storage, keccak(k))}
                                     for k, value in zip(keys, values)],
                }}
    expected = {'chainId': '31337', 'manager': hx(manager), 'managerCodeHash': hx(code_hash),
                'blockNumber': '123', 'slots': artifact['slots']}
    return artifact, expected


class WitnessValidationTests(unittest.TestCase):
    def test_public_header_account_and_all_four_slots(self):
        result = validate_witness(copy.deepcopy(PUBLIC), copy.deepcopy(PUBLIC_EXPECTED))
        self.assertEqual(result['blockHash'], '0x435e69c8a0f3ad2b97190657c410a92f69a2dd5a3af9241c4b55b3e2a003c3ea')
        self.assertEqual(result['values'], PUBLIC['values'])
        self.assertEqual(result['managerCodeHash'], PUBLIC_CODE_HASH)
        self.assertIn('canonical consensus and chain identity not established', result['scope'])

    def test_generated_branch_and_missing_child(self):
        artifact, expected = synthetic()
        self.assertEqual(validate_witness(artifact, expected)['values'], ['7', '9', '0'])

    def test_generated_inline_descendants_and_divergent_extension_absence(self):
        artifact, expected = synthetic('inline')
        decoded = [rlp.decode(bytes.fromhex(n[2:])) for n in artifact['proof']['storageProof'][0]['proof']]
        self.assertTrue(any(any(isinstance(child, list) for child in node) for node in decoded))
        self.assertEqual(validate_witness(artifact, expected)['values'], ['7', '0'])

    def test_empty_storage_trie_absence_needs_no_nodes(self):
        artifact, expected = synthetic('empty')
        self.assertEqual(artifact['proof']['storageProof'][0]['proof'], [])
        self.assertEqual(validate_witness(artifact, expected)['values'], ['0', '0'])

    def test_storage_order_and_padded_keys_do_not_change_expected_value_order(self):
        artifact, expected = synthetic()
        artifact['proof']['storageProof'].reverse()
        for entry in artifact['proof']['storageProof']:
            entry['key'] = hex(int(entry['key'], 16))
        self.assertEqual(validate_witness(artifact, expected)['values'], ['7', '9', '0'])

    def test_independent_code_pin_and_account_identity(self):
        mutations = [lambda a, e: e.update(managerCodeHash='0x' + '01' * 32),
                     lambda a, e: a['proof'].update(codeHash='0x' + '01' * 32),
                     lambda a, e: a['proof'].update(storageHash='0x' + '01' * 32),
                     lambda a, e: a['proof'].update(nonce='0x9'),
                     lambda a, e: a['proof'].update(balance='0x9'),
                     lambda a, e: a['proof'].update(address='0x' + '01' * 20),
                     lambda a, e: a.update(manager='0x' + '01' * 20),
                     lambda a, e: a.update(managerCode='0x00')]
        for mutate in mutations:
            with self.subTest(mutate=mutate):
                artifact, expected = copy.deepcopy(PUBLIC), copy.deepcopy(PUBLIC_EXPECTED)
                mutate(artifact, expected)
                with self.assertRaises(ValueError):
                    validate_witness(artifact, expected)

    def test_absent_manager_account_is_not_a_zero_account(self):
        artifact, expected = synthetic()
        other = '0x' + '34' * 20
        artifact['manager'] = other
        artifact['proof']['address'] = other
        expected['manager'] = other
        with self.assertRaisesRegex(ValueError, 'Manager account absent'):
            validate_witness(artifact, expected)

    def test_header_and_metadata_tampering(self):
        mutations = [lambda a, e: a.update(blockHash='0x' + '01' * 32),
                     lambda a, e: a.update(headerRlp=a['headerRlp'] + '00'),
                     lambda a, e: a['header'].update(stateRoot='0x' + '01' * 32),
                     lambda a, e: a['header'].update(number='0x00'),
                     lambda a, e: a['header'].pop('baseFeePerGas'),
                     lambda a, e: e.update(blockNumber='11682192'),
                     lambda a, e: e.update(chainId='1'),
                     lambda a, e: a.update(chainId=True),
                     lambda a, e: e.update(chainId='011155111'),
                     lambda a, e: a.update(blockNumber=1 << 54)]
        for mutate in mutations:
            with self.subTest(mutate=mutate):
                artifact, expected = copy.deepcopy(PUBLIC), copy.deepcopy(PUBLIC_EXPECTED)
                mutate(artifact, expected)
                with self.assertRaises(ValueError):
                    validate_witness(artifact, expected)

    def test_missing_and_tampered_account_or_storage_nodes(self):
        for branch in ['accountProof', 'storageProof']:
            for change in ['missing', 'tampered', 'malformed']:
                with self.subTest(branch=branch, change=change):
                    artifact, expected = synthetic()
                    nodes = artifact['proof'][branch] if branch == 'accountProof' else artifact['proof'][branch][0]['proof']
                    if change == 'missing':
                        nodes.clear()
                    elif change == 'tampered':
                        nodes[0] = nodes[0][:-2] + ('01' if nodes[0][-2:] != '01' else '02')
                    else:
                        nodes[0] = '0xc201'
                    with self.assertRaises(ValueError):
                        validate_witness(artifact, expected)

    def test_slot_substitution_duplicates_and_false_values(self):
        mutations = [lambda a, e: a['proof']['storageProof'][0].update(value='0x8'),
                     lambda a, e: a['proof']['storageProof'][-1].update(value='0x1'),
                     lambda a, e: a['proof']['storageProof'][0].update(key='0x4'),
                     lambda a, e: a['proof']['storageProof'][1].update(key='0x1'),
                     lambda a, e: a['proof']['storageProof'].pop(),
                     lambda a, e: a['slots'].reverse(),
                     lambda a, e: e.update(slots=[e['slots'][0], e['slots'][0]]),
                     lambda a, e: a.update(values=['7', '9', '1'])]
        for mutate in mutations:
            with self.subTest(mutate=mutate):
                artifact, expected = synthetic()
                # Avoid aliasing the expected slot list in test fixture mutations.
                expected = copy.deepcopy(expected)
                mutate(artifact, expected)
                with self.assertRaises(ValueError):
                    validate_witness(artifact, expected)

    def test_canonical_integer_and_claimed_storage_value_rules(self):
        for encoded in [rlp.encode(b'\x00\x07'), rlp.encode(b'\x00'), rlp.encode(b''), rlp.encode([])]:
            artifact, expected = synthetic(storage_encoded=encoded)
            with self.assertRaises(ValueError):
                validate_witness(artifact, expected)
        artifact, expected = synthetic(account_fields=[b'\x00\x02', 3, b'\x00' * 32, b'\x00' * 32])
        with self.assertRaises(ValueError):
            validate_witness(artifact, expected)

    def test_standalone_stdin_output_and_rejection(self):
        path = str(pathlib.Path(__file__).with_name('validate_witness.py'))
        success = subprocess.run([sys.executable, path], input=json.dumps({'artifact': PUBLIC, 'expected': PUBLIC_EXPECTED}),
                                 text=True, capture_output=True, check=True)
        self.assertEqual(json.loads(success.stdout)['values'], PUBLIC['values'])
        failure = subprocess.run([sys.executable, path], input='{"artifact":{},"artifact":{}}', text=True, capture_output=True)
        self.assertNotEqual(failure.returncode, 0)
        self.assertEqual(failure.stdout, '')
        self.assertIn('Duplicate JSON object key', failure.stderr)

    def test_authenticated_zero_leaf_matches_solidity_but_cannot_replace_a_nonzero_root(self):
        zero, expected = synthetic(storage_encoded=rlp.encode(b''))
        zero['proof']['storageProof'][0]['value'] = '0x0'
        self.assertEqual(validate_witness(zero, expected)['values'], ['0', '9', '0'])
        original, expected = synthetic()
        original['proof']['storageProof'][0] = copy.deepcopy(zero['proof']['storageProof'][0])
        with self.assertRaises(ValueError):
            validate_witness(original, expected)


if __name__ == '__main__':
    unittest.main()
