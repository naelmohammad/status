const assert = require('assert');
const worker = require('./index.js').default;

// Mock KV
class KV {
  constructor(){ this.store = new Map(); }
  async get(key){ return this.store.get(key) || null; }
  async put(key,val){ this.store.set(key,val); }
}

// Mock fetch
const telegramCalls = [];
const endpointResponses = {
  'https://nael.org': {status:200},
  'https://appzed.com': {status:500},
};

global.fetch = async (url, opts) => {
  if (url.includes('/sendMessage')) {
    telegramCalls.push(url);
    return {ok:true, text: async()=>"{}"};
  }
  // endpoint check
  const status = endpointResponses[url] ? endpointResponses[url].status : 200;
  return {
    status,
    headers: {get:()=>null},
    tls:{notAfter:null},
    ok:true,
    json: async()=>({})
  };
};

(async () => {
  const env = {
    monitor_results: new KV(),
    TELEGRAM_TOKEN: 'TEST_TOKEN',
    TELEGRAM_CHAT_ID: '12345'
  };
  // set previous data: all 200
  const prev = { timestamp:'2026-11-10T12:00:00Z', results:[
    {url:'https://nael.org', status:200, timestamp:'2026-11-10T12:00:00Z'},
    {url:'https://appzed.com', status:200, timestamp:'2026-11-10T12:00:00Z'}
  ]};
  await env.monitor_results.put('latest', JSON.stringify(prev));

  await worker.scheduled({}, env, {});

  // verify telegram called once for appzed.com
  assert.strictEqual(telegramCalls.length, 1);
  assert(telegramCalls[0].includes('sendMessage'));
  console.log('telegram notification test passed');
})();
