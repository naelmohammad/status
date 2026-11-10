const ZONES = {
  "zones": [
    {
      "name": "nael.org",
      "subdomains": [
        "home.nael.org",
        "comfy.nael.org",
        "dev.nael.org",
        "hernme.nael.org",
        "nael.org",
        "nherme.nael.org",
        "ocla.nael.org",
        "ssh.nael.org",
        "staging.nael.org",
        "terminal.nael.org",
        "www.nael.org",
        "send.nael.org",
        "_atproto.nael.org",
        "_dmarc.nael.org",
        "google._domainkey.nael.org",
        "nael.org",
        "brain.nael.org"
      ]
    },
    {
      "name": "appzed.com",
      "subdomains": []
    },
    {
      "name": "appzed.net",
      "subdomains": []
    },
    {
      "name": "appzed.org",
      "subdomains": []
    },
    {
      "name": "ecloudly.com",
      "subdomains": []
    },
    {
      "name": "ecloudly.net",
      "subdomains": []
    },
    {
      "name": "nmatrix.net",
      "subdomains": []
    },
    {
      "name": "nmatrix.org",
      "subdomains": []
    },
    {
      "name": "palestineday.com",
      "subdomains": []
    },
    {
      "name": "palestineday.net",
      "subdomains": []
    },
    {
      "name": "poeticislam.com",
      "subdomains": []
    }
  ]
};

// Helper to create endpoint list from zones
function buildEndpoints() {
  const endpoints = [];
  for (const zone of ZONES.zones) {
    // zone root
    endpoints.push(`https://${zone.name}`);
    // subdomains
    for (const sub of zone.subdomains) {
      endpoints.push(`https://${sub}`);
    }
  }
  return endpoints;
}

async function fetchWithTimeout(url, timeout = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {signal: controller.signal});
    return response;
  } catch (e) {
    return null;
  } finally {
    clearTimeout(id);
  }
}

async function checkEndpoint(url) {
  const result = {
    url,
    status: null,
    tlsNotAfter: null,
    tunnelHealthy: false,
    error: null,
    timestamp: new Date().toISOString()
  };
  try {
    const resp = await fetchWithTimeout(url);
    if (!resp) throw new Error('no response');
    result.status = resp.status;
    // TLS info available on response.tls
    if (resp.tls && resp.tls.notAfter) {
      result.tlsNotAfter = resp.tls.notAfter;
    }
    // Tunnel health: check cf-argo-tunnel header
    const tunnelHeader = resp.headers.get('cf-argo-tunnel');
    if (tunnelHeader) {
      result.tunnelHealthy = true;
    }
  } catch (e) {
    result.error = e.message;
  }
  return result;
}

// Simple rate limiter: limit concurrent fetches
async function runChecks(endpoints) {
  const concurrency = 5;
  const results = [];
  let index = 0;
  async function worker() {
    while (index < endpoints.length) {
      const i = index++;
      const url = endpoints[i];
      const res = await checkEndpoint(url);
      console.log(`Checked ${url}: status=${res.status}, error=${res.error}`);
      results.push(res);
    }
  }
  const workers = [];
  for (let i = 0; i < concurrency; i++) workers.push(worker());
  await Promise.all(workers);
  return results;
}

import { detectChanges } from './detectChanges.js';

async function sendTelegram(domain, state, timestamp) {
  const token = env.TELEGRAM_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.warn('Telegram token or chat ID not set');
    return;
  }
  const msg = `Domain ${domain} is now ${state} at ${timestamp}`;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const body = JSON.stringify({chat_id: chatId, text: msg});
  try {
    const resp = await fetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body});
    if (!resp.ok) {
      console.error('Telegram send failed', await resp.text());
    }
  } catch (e) {
    console.error('Telegram send error', e);
  }
}

export default {
  async scheduled(event, env, ctx) {
    console.log('Scheduled worker starting');
    try {
      const endpoints = buildEndpoints();
      console.log(`Total endpoints to check: ${endpoints.length}`);
      const results = await runChecks(endpoints);
      const prevData = await env.monitor_results.get('latest');
      let prev = null;
      if (prevData) {
        try { prev = JSON.parse(prevData); } catch (e) { console.warn('Failed to parse prev data'); }
      }
      detectChanges(prev, results, sendTelegram);
      const payload = JSON.stringify({ timestamp: new Date().toISOString(), results });
      await env.monitor_results.put('latest', payload);
      console.log('Results stored in KV');
      return new Response('check complete', { status: 200 });
    } catch (e) {
      console.error('Scheduled worker error', e);
      return new Response('error', { status: 500 });
    }
  }
};
