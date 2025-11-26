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
      // 3. Check for Bindings (These must be set in Cloudflare Dashboard -> Settings -> Variables)
      if (!env.R2_BUCKET) {
        throw new Error('Server Configuration Error: R2_BUCKET binding is missing.');
      }
      if (!env.AUTH_KEY_SECRET) {
        throw new Error('Server Configuration Error: AUTH_KEY_SECRET is missing.');
      }

      // 4. Security Check
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || authHeader !== env.AUTH_KEY_SECRET) {
        return new Response('Unauthorized', { status: 403, headers: corsHeaders });
      }

      // 5. Parse the Filename from the URL
      const url = new URL(request.url);
      const key = decodeURIComponent(url.pathname.slice(1)); // Remove leading slash

      if (!key || key.trim() === '') {
        return new Response('Missing filename', { status: 400, headers: corsHeaders });
      }

      // 6. Handle Upload (POST)
      if (request.method === 'POST') {
        await env.R2_BUCKET.put(key, request.body, {
          httpMetadata: {
            contentType: request.headers.get('Content-Type') || 'image/jpeg',
            cacheControl: 'public, max-age=31536000', // Cache for 1 year
          },
        });
        return new Response('Upload Successful', { status: 200, headers: corsHeaders });
      } 
      
      // 7. Handle Delete (DELETE)
      if (request.method === 'DELETE') {
        await env.R2_BUCKET.delete(key);
        return new Response('Deleted', { status: 200, headers: corsHeaders });
      }

      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });

    } catch (err) {
      // Return error details to the client for debugging
      return new Response(`Worker Error: ${err.message}`, { status: 500, headers: corsHeaders });
    }
  },
};