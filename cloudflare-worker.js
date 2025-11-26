export default {
  async fetch(request, env) {
    // 1. CORS Headers - Allow requests from your application
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    };

    // 2. Handle Preflight (OPTIONS) requests immediately
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    try {
      // 3. Check for Bindings
      if (!env.R2_BUCKET) {
        throw new Error('Server Configuration Error: R2_BUCKET binding is missing.');
      }
      if (!env.AUTH_KEY_SECRET) {
        throw new Error('Server Configuration Error: AUTH_KEY_SECRET is missing.');
      }

      // 4. Security Check
      const authHeader = request.headers.get('Authorization');
      const url = new URL(request.url);

      // Allow public access to silver price? No, keep it secured for app use only.
      if (!authHeader || authHeader !== env.AUTH_KEY_SECRET) {
        return new Response('Unauthorized', { status: 403, headers: corsHeaders });
      }

      // --- SPECIAL ROUTE: SILVER PRICE ---
      if (url.pathname === '/price/silver') {
        try {
          // Fetch from a reliable public data source (GoldPrice.org data feed)
          const response = await fetch('https://data-asg.goldprice.org/dbXRates/EUR', {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
              'Referer': 'https://goldprice.org/'
            }
          });
          
          if (!response.ok) throw new Error('Upstream API failed');
          
          const data = await response.json();
          // Structure is usually { items: [{ xagPrice: <price_in_eur_per_ounce>, ... }] }
          const silverOunceEur = data.items[0].xagPrice;
          const silverGramEur = silverOunceEur / 31.1034768; // Convert Troy Ounce to Grams

          return new Response(JSON.stringify({ price: silverGramEur }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } catch (e) {
          return new Response(JSON.stringify({ error: e.message }), { status: 502, headers: corsHeaders });
        }
      }
      // -----------------------------------

      // 5. Parse the Filename from the URL for R2 operations
      const key = decodeURIComponent(url.pathname.slice(1)); // Remove leading slash

      if (!key || key.trim() === '') {
        return new Response('Missing filename', { status: 400, headers: corsHeaders });
      }

      // 6. Handle GET (Download/Proxy for CORS)
      if (request.method === 'GET') {
        const object = await env.R2_BUCKET.get(key);
        
        if (object === null) {
          return new Response('Object Not Found', { status: 404, headers: corsHeaders });
        }

        const headers = new Headers(corsHeaders);
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);
        // Important: Ensure Content-Type is set for images so the browser treats them as images
        if (!headers.has('Content-Type')) {
            headers.set('Content-Type', 'image/jpeg');
        }

        return new Response(object.body, {
          headers,
        });
      }

      // 7. Handle Upload (POST)
      if (request.method === 'POST') {
        await env.R2_BUCKET.put(key, request.body, {
          httpMetadata: {
            contentType: request.headers.get('Content-Type') || 'image/jpeg',
            cacheControl: 'public, max-age=31536000', // Cache for 1 year
          },
        });
        return new Response('Upload Successful', { status: 200, headers: corsHeaders });
      } 
      
      // 8. Handle Delete (DELETE)
      if (request.method === 'DELETE') {
        await env.R2_BUCKET.delete(key);
        return new Response('Deleted', { status: 200, headers: corsHeaders });
      }

      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });

    } catch (err) {
      return new Response(`Worker Error: ${err.message}`, { status: 500, headers: corsHeaders });
    }
  },
};