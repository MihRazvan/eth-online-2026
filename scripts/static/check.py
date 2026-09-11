#!/usr/bin/env python3
"""Fail on analyzer failure or any change to the explicitly reviewed findings."""
import hashlib
import json
import pathlib
import subprocess
import tempfile

root = pathlib.Path(__file__).resolve().parents[2]
review = json.loads((root / 'scripts/static/slither-reviewed.json').read_text())
with tempfile.TemporaryDirectory(prefix='feestrip-slither-') as directory:
    output = pathlib.Path(directory) / 'report.json'
    result = subprocess.run(['slither', '.', '--filter-paths',
        'contracts/lib|contracts/test|contracts/script|contracts/src/demo',
        '--json', str(output)], cwd=root, capture_output=True, text=True)
    if not output.exists():
        raise SystemExit('Slither did not produce a report: ' + result.stderr[-4000:])
    report = json.loads(output.read_text())
    if not report.get('success'):
        raise SystemExit('Slither analysis failed: ' + str(report.get('error')))
    actual = sorted(hashlib.sha256(d['description'].encode()).hexdigest()
        for d in report['results'].get('detectors', []))
    expected = sorted(d['sha256'] for d in review['findings'])
    if actual != expected:
        print(result.stdout[-4000:])
        print(result.stderr[-12000:])
        raise SystemExit('Static findings changed; inspect and explicitly review each delta.')
    print(f'Slither completed: {len(actual)} reviewed findings unchanged; no new findings. This is not an audit.')
