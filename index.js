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

const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Status Dashboard</title>
<style>
body{font-family:system-ui,-apple-system,sans-serif;background:#0d1117;color:#c9d1d9;margin:0;padding:20px}
h1{color:#58a6ff;margin-bottom:20px}
.table{width:100%;border-collapse:collapse}
.table th,.table td{border:1px solid #30363d;padding:10px;text-align:left}
.table th{background:#161b22;color:#58a6ff}
.green{color:#3fb950;font-weight:bold}
.red{color:#f85149;font-weight:bold}
.loading{text-align:center;padding:40px;color:#8b949e}
</style>
</head>
<body>
<h1>Status Dashboard</h1>
<table class="table" id="status-table">
<thead><tr><th>Domain</th><th>Status</th><th>Last Checked</th></tr></thead>
<tbody id="tbody"><tr><td colspan="3" class="loading">Loading...</td></tr></tbody>
</table>
<script>
async function load(){
 try{
  const r=await fetch('/api/latest');
  if(!r.ok){document.getElementById('tbody').innerHTML='<tr><td colspan="3" class="red">No data available</td></tr>';return}
  const d=await r.json();
  const tb=document.getElementById('tbody');
  tb.innerHTML='';
  (d.results||[]).forEach(r=>{
   const tr=document.createElement('tr');
   const cls=r.status&&r.status===200?'green':'red';
   const tdUrl=document.createElement('td');
   tdUrl.textContent=r.url;
   const tdStatus=document.createElement('td');
   tdStatus.className=cls;
   tdStatus.textContent=r.status||'error';
   const tdTime=document.createElement('td');
   tdTime.textContent=r.timestamp;
   tr.appendChild(tdUrl);
   tr.appendChild(tdStatus);
   tr.appendChild(tdTime);
   tb.appendChild(tr);
  });
 }catch(e){document.getElementById('tbody').innerHTML='<tr><td colspan="3" class="red">Load failed</td></tr>'}
}
load();setInterval(load,30000);
</script>
</body>
</html>`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/latest") {
      const payload = await env.monitor_results.get("latest");
      if (!payload) {
        return new Response(JSON.stringify({ error: "no data", timestamp: new Date().toISOString() }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      }
      return new Response(payload, { headers: { "Content-Type": "application/json" } });
    }
    // Serve dashboard HTML for all other paths
    return new Response(DASHBOARD_HTML, {
      headers: { "Content-Type": "text/html" }
    });
  },
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
      const sendTelegram = async (domain, state, timestamp) => {
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
      };
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
