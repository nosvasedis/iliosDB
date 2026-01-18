
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

      // 4. Security Check
      const authHeader = request.headers.get('Authorization');
      const url = new URL(request.url);

      // SECURITY UPDATE:
      // Allow public GET/HEAD access to images (for CORS/Canvas).
      // Protect POST/DELETE (Mutations) and special routes like /price/silver.
      const isSilverRoute = url.pathname === '/price/silver';
      const isMutation = ['POST', 'DELETE', 'PUT'].includes(request.method);
      // HEAD is read-only, so we treat it like GET (public)
      const isProtected = isMutation || isSilverRoute;

      if (isProtected && (!authHeader || authHeader !== env.AUTH_KEY_SECRET)) {
        return new Response('Unauthorized', { status: 403, headers: corsHeaders });
      }

      // --- SPECIAL ROUTE: SILVER PRICE ---
      if (isSilverRoute) {
        try {
          const response = await fetch('https://data-asg.goldprice.org/dbXRates/EUR', {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
              'Referer': 'https://goldprice.org/'
            }
          });
          
          if (!response.ok) throw new Error('Upstream API failed');
          
          const data = await response.json();
          const silverOunceEur = data.items[0].xagPrice;
          const silverGramEur = silverOunceEur / 31.1034768; 

          return new Response(JSON.stringify({ price: silverGramEur }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        } catch (e) {
          return new Response(JSON.stringify({ error: e.message }), { status: 502, headers: corsHeaders });
        }
      }

      // 5. Parse the Filename
      // FIX: Handle root path requests gracefully to avoid "Missing filename" log noise
      if (url.pathname === '/' || url.pathname === '') {
          return new Response('Ilios Image Handler Active', { status: 200, headers: corsHeaders });
      }

      const key = decodeURIComponent(url.pathname.slice(1)); // Remove leading slash

      if (!key || key.trim() === '') {
        return new Response('Missing filename', { status: 400, headers: corsHeaders });
      }

      // 6. Handle GET and HEAD (Download/Check)
      // FIX: Added HEAD support so the Audit tool receives a 200 OK instead of 405
      if (request.method === 'GET' || request.method === 'HEAD') {
        const object = await env.R2_BUCKET.get(key);
        
        if (object === null) {
          return new Response('Object Not Found', { status: 404, headers: corsHeaders });
        }

        const headers = new Headers(corsHeaders);
        object.writeHttpMetadata(headers);
        headers.set('etag', object.httpEtag);
        
        if (!headers.has('Content-Type')) {
            headers.set('Content-Type', 'image/jpeg');
        }

        // Return body for GET, null for HEAD
        const body = request.method === 'HEAD' ? null : object.body;

        return new Response(body, {
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
        // FORTIFICATION: DISABLE DELETION (The Vault Strategy)
        // We pretend to delete (return 200) but DO NOT execute the delete command.
        // This protects files from accidental deletion via the app.
        return new Response('Deleted (Soft)', { status: 200, headers: corsHeaders });
      }

      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });

    } catch (err) {
      return new Response(`Worker Error: ${err.message}`, { status: 500, headers: corsHeaders });
    }
  },
};
