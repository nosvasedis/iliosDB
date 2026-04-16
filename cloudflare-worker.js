
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
      const isAdminRoute = url.pathname.startsWith('/admin/');
      const isMutation = ['POST', 'DELETE', 'PUT'].includes(request.method);
      // HEAD is read-only, so we treat it like GET (public)
      const isProtected = isMutation || isSilverRoute || isAdminRoute;

      if (isProtected && (!authHeader || authHeader !== env.AUTH_KEY_SECRET)) {
        return new Response('Unauthorized', { status: 403, headers: corsHeaders });
      }

      // --- ADMIN ROUTES: SELLER MANAGEMENT ---
      if (isAdminRoute) {
        // Requires SUPABASE_SERVICE_ROLE_KEY and SUPABASE_URL env secrets
        if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
          return new Response(JSON.stringify({ error: 'Missing Supabase admin configuration on worker.' }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        const supabaseAdmin = async (path, options = {}) => {
          const res = await fetch(`${env.SUPABASE_URL}${path}`, {
            ...options,
            headers: {
              'Content-Type': 'application/json',
              'apikey': env.SUPABASE_SERVICE_ROLE_KEY,
              'Authorization': `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
              ...(options.headers || {}),
            },
          });
          const text = await res.text();
          let json;
          try { json = JSON.parse(text); } catch { json = text; }
          return { ok: res.ok, status: res.status, data: json };
        };

        // POST /admin/create-seller  — Create a new seller auth user + profile
        if (url.pathname === '/admin/create-seller' && request.method === 'POST') {
          try {
            const body = await request.json();
            const { email, password, full_name, commission_percent } = body;
            if (!email || !password || !full_name) {
              return new Response(JSON.stringify({ error: 'Απαιτούνται email, password και full_name.' }), {
                status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }

            // 1. Create auth user via Supabase Admin API
            const authRes = await supabaseAdmin('/auth/v1/admin/users', {
              method: 'POST',
              body: JSON.stringify({
                email,
                password,
                email_confirm: true,
                user_metadata: { full_name },
              }),
            });

            if (!authRes.ok) {
              const msg = authRes.data?.msg || authRes.data?.message || JSON.stringify(authRes.data);
              return new Response(JSON.stringify({ error: `Σφάλμα δημιουργίας χρήστη: ${msg}` }), {
                status: authRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }

            const userId = authRes.data.id;

            // 2. Insert / upsert profile row
            const profileRes = await supabaseAdmin('/rest/v1/profiles', {
              method: 'POST',
              headers: { 'Prefer': 'resolution=merge-duplicates' },
              body: JSON.stringify({
                id: userId,
                email,
                full_name,
                role: 'seller',
                is_approved: true,
                commission_percent: commission_percent ?? null,
              }),
            });

            if (!profileRes.ok) {
              return new Response(JSON.stringify({ error: 'Ο χρήστης δημιουργήθηκε αλλά το προφίλ απέτυχε.', details: profileRes.data }), {
                status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }

            return new Response(JSON.stringify({ id: userId, email, full_name, commission_percent: commission_percent ?? null }), {
              status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          } catch (e) {
            return new Response(JSON.stringify({ error: e.message }), {
              status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }

        // POST /admin/update-seller  — Update seller profile + optional password reset
        if (url.pathname === '/admin/update-seller' && request.method === 'POST') {
          try {
            const body = await request.json();
            const { id, full_name, commission_percent, is_approved, new_password } = body;
            if (!id) {
              return new Response(JSON.stringify({ error: 'Απαιτείται id.' }), {
                status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }

            // Update profile via PostgREST
            const profilePayload = {};
            if (full_name !== undefined) profilePayload.full_name = full_name;
            if (commission_percent !== undefined) profilePayload.commission_percent = commission_percent;
            if (is_approved !== undefined) profilePayload.is_approved = is_approved;

            if (Object.keys(profilePayload).length > 0) {
              const profRes = await supabaseAdmin(`/rest/v1/profiles?id=eq.${id}`, {
                method: 'PATCH',
                headers: { 'Prefer': 'return=minimal' },
                body: JSON.stringify(profilePayload),
              });
              if (!profRes.ok) {
                return new Response(JSON.stringify({ error: 'Σφάλμα ενημέρωσης προφίλ.', details: profRes.data }), {
                  status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
              }
            }

            // Optional: reset password
            if (new_password) {
              const pwRes = await supabaseAdmin(`/auth/v1/admin/users/${id}`, {
                method: 'PUT',
                body: JSON.stringify({ password: new_password }),
              });
              if (!pwRes.ok) {
                return new Response(JSON.stringify({ error: 'Το προφίλ ενημερώθηκε αλλά η αλλαγή κωδικού απέτυχε.', details: pwRes.data }), {
                  status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
              }
            }

            return new Response(JSON.stringify({ success: true }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          } catch (e) {
            return new Response(JSON.stringify({ error: e.message }), {
              status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }

        // POST /admin/delete-seller  — Soft-delete (deactivate) a seller
        if (url.pathname === '/admin/delete-seller' && request.method === 'POST') {
          try {
            const body = await request.json();
            const { id } = body;
            if (!id) {
              return new Response(JSON.stringify({ error: 'Απαιτείται id.' }), {
                status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }

            // Soft-delete: set is_approved = false
            const profRes = await supabaseAdmin(`/rest/v1/profiles?id=eq.${id}`, {
              method: 'PATCH',
              headers: { 'Prefer': 'return=minimal' },
              body: JSON.stringify({ is_approved: false }),
            });

            if (!profRes.ok) {
              return new Response(JSON.stringify({ error: 'Σφάλμα απενεργοποίησης πλασιέ.', details: profRes.data }), {
                status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
              });
            }

            return new Response(JSON.stringify({ success: true }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          } catch (e) {
            return new Response(JSON.stringify({ error: e.message }), {
              status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }

        return new Response(JSON.stringify({ error: 'Unknown admin route' }), {
          status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // --- SPECIAL ROUTE: SILVER PRICE ---
      if (isSilverRoute) {
        try {
          // Attempt 1: goldprice.org (Direct EUR)
          try {
            const response = await fetch('https://data-asg.goldprice.org/dbXRates/EUR', {
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Referer': 'https://goldprice.org/',
                'Accept': 'application/json'
              },
              cf: { cacheTtl: 300 } // Cache for 5 mins
            });

            if (response.ok) {
              const data = await response.json();
              if (data.items && data.items[0] && data.items[0].xagPrice) {
                const silverOunceEur = data.items[0].xagPrice;
                const silverGramEur = silverOunceEur / 31.1034768;
                return new Response(JSON.stringify({ price: silverGramEur, source: 'goldprice.org' }), {
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
              }
            }
          } catch (e1) {
            console.error('GoldPrice.org failed:', e1.message);
          }

          // Attempt 2: gold-api.com (USD) + er-api.com (Conversion)
          const [priceRes, rateRes] = await Promise.all([
            fetch('https://api.gold-api.com/price/XAG'),
            fetch('https://open.er-api.com/v6/latest/USD')
          ]);

          if (priceRes.ok && rateRes.ok) {
            const priceData = await priceRes.json();
            const rateData = await rateRes.json();

            const silverOunceUsd = priceData.price;
            const usdEurRate = rateData.rates.EUR;

            if (silverOunceUsd && usdEurRate) {
              const silverOunceEur = silverOunceUsd * usdEurRate;
              const silverGramEur = silverOunceEur / 31.1034768;

              return new Response(JSON.stringify({ price: silverGramEur, source: 'gold-api+er-api' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
              });
            }
          }

          throw new Error('All silver price sources failed');
        } catch (e) {
          return new Response(JSON.stringify({ error: e.message }), { status: 502, headers: corsHeaders });
        }
      }

      // --- SPECIAL ROUTE: VAT / AFM LOOKUP (CORS Proxy) ---
      // This route is PUBLIC (no auth) because it's a read-only lookup.
      // The Worker proxies the request to avoid browser CORS restrictions.
      if (url.pathname === '/vat-lookup') {
        const afm = url.searchParams.get('afm');
        if (!afm || !/^\d{9}$/.test(afm)) {
          return new Response(JSON.stringify({ error: 'Invalid AFM: must be exactly 9 digits' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }

        // Helper: clean up "---" placeholder values the APIs sometimes return
        const cleanField = (val) => (val && val.trim() && val.trim() !== '---' ? val.trim() : null);

        // Attempt 1: VIES REST API (EU official)
        try {
          const viesRes = await fetch('https://ec.europa.eu/taxation_customs/vies/rest-api/check-vat-number', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ countryCode: 'EL', vatNumber: afm }),
          });
          if (viesRes.ok) {
            const d = await viesRes.json();
            if (d.valid && d.name) {
              return new Response(JSON.stringify({
                source: 'VIES',
                name: cleanField(d.name),
                address: cleanField(d.address),
                // VIES does not expose phone/email in its REST response
                phone: null,
                email: null,
              }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
          }
        } catch (e) {
          console.warn('VIES lookup failed:', e.message);
        }

        // Attempt 2: VATComply fallback (returns richer data when available)
        try {
          const vatRes = await fetch(`https://api.vatcomply.com/vat?vat_number=EL${afm}`, {
            headers: { 'Accept': 'application/json' },
          });
          if (vatRes.ok) {
            const d = await vatRes.json();
            if (d.valid && d.name) {
              return new Response(JSON.stringify({
                source: 'VATComply',
                name: cleanField(d.name),
                address: cleanField(d.address),
                phone: cleanField(d.phone),
                email: cleanField(d.email),
              }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
            }
          }
        } catch (e) {
          console.warn('VATComply lookup failed:', e.message);
        }

        // Both APIs failed or returned no data
        return new Response(JSON.stringify({ error: 'Δεν βρέθηκαν στοιχεία για το ΑΦΜ αυτό.' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
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
        try {
          await env.R2_BUCKET.delete(key);
          return new Response('File deleted successfully', { status: 200, headers: corsHeaders });
        } catch (err) {
          console.error('Delete error:', err);
          return new Response('Delete failed: ' + err.message, { status: 500, headers: corsHeaders });
        }
      }

      return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });

    } catch (err) {
      return new Response(`Worker Error: ${err.message}`, { status: 500, headers: corsHeaders });
    }
  },
};
