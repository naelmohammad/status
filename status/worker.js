export default {
 async fetch(request, env){
 const url=new URL(request.url);
 if(url.pathname==="/api/latest"){
 const payload=await env.monitor_results.get('latest');
 if(!payload){return new Response('no data', {status:404});}
 return new Response(payload, {headers:{"Content-Type":"application/json"}});
 }
 return new Response('Not found', {status:404});
 }
};