const assert = require('assert');
const { detectChanges } = require('./detectChanges.js');

let calls = [];
function mockSend(domain, state, timestamp) {
  calls.push({domain, state, timestamp});
}

const prev = {
  results: [
    {url: 'https://nael.org', status: 200, timestamp: '2026-11-10T12:00:00Z'},
  ]
};
const curr = [
  {url: 'https://nael.org', status: 500, timestamp: '2026-11-10T12:05:00Z'},
  {url: 'https://appzed.com', status: 200, timestamp: '2026-11-10T12:05:00Z'}
];

detectChanges(prev, curr, mockSend);

assert.strictEqual(calls.length, 1);
assert.deepStrictEqual(calls[0], {domain: 'https://nael.org', state: 'down', timestamp: '2026-11-10T12:05:00Z'});
console.log('test passed');
