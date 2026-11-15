// Supabase Edge Function: redeem-invitation
// Verifies expiring single-use passcode hashes server-side using HMAC-SHA256.
// Deploy with: supabase functions deploy redeem-invitation

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function computeHmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const hmacSecret = Deno.env.get('INVITATION_HMAC_SECRET')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authentication required.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid user session.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { passcode, displayName, relationship } = await req.json();
    const cleanCode = String(passcode ?? '').trim().toUpperCase();
    if (!cleanCode) {
      return new Response(JSON.stringify({ error: 'Passcode is required.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: candidates } = await admin
      .from('invitations')
      .select('*')
      .is('redeemed_at', null)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString());

    let matched = null;
    for (const inv of candidates ?? []) {
      if (inv.attempt_count >= inv.max_attempts) continue;
      const hash = await computeHmacHex(hmacSecret, `${inv.code_salt}:${cleanCode}`);
      if (hash === inv.code_hash) {
        matched = inv;
        break;
      }
    }

    if (!matched) {
      return new Response(
        JSON.stringify({ error: 'Invalid, expired, revoked, or already redeemed passcode.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const nowIso = new Date().toISOString();
    await admin
      .from('invitations')
      .update({ redeemed_at: nowIso, redeemed_by: user.id })
      .eq('id', matched.id)
      .is('redeemed_at', null);

    // Role and permissions strictly from matched server invitation record
    const { data: membership, error: memberErr } = await admin
      .from('memberships')
      .insert({
        profile_id: matched.profile_id,
        user_id: user.id,
        display_name: String(displayName || user.email || 'Care Member').slice(0, 80),
        email: user.email ?? '',
        role: matched.role,
        relationship: String(relationship || '').slice(0, 80),
        permissions: matched.permissions,
        active: true,
      })
      .select()
      .single();

    if (memberErr) {
      return new Response(JSON.stringify({ error: memberErr.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    await admin.from('audit_events').insert({
      profile_id: matched.profile_id,
      actor_id: user.id,
      action_type: 'invitation.redeemed',
      summary: `Redeemed invitation ${matched.code_masked} as ${matched.role}.`,
      entity_type: 'invitation',
      entity_id: matched.id,
    });

    return new Response(JSON.stringify({ verified: true, membership }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
