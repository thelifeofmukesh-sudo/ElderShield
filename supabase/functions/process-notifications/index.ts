// Supabase Edge Function: process-notifications
// Processes queued rows from notification_outbox via Resend API with retry & deduplication.
// Deploy with: supabase functions deploy process-notifications

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  const fromEmail = Deno.env.get('RESEND_FROM_EMAIL') || 'ElderShield <notifications@example.com>';

  if (!resendApiKey) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: 'RESEND_API_KEY is not configured in Edge Function secrets.',
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const admin = createClient(supabaseUrl, serviceRoleKey);
  const { data: queued } = await admin
    .from('notification_outbox')
    .select('*')
    .in('status', ['queued', 'failed'])
    .lt('attempt_count', 3)
    .limit(25);

  let sentCount = 0;
  let failedCount = 0;

  for (const item of queued ?? []) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [item.recipient_email],
        subject: item.subject,
        text: `${item.body_preview}\n\nReference: ${item.deduplication_key}`,
      }),
    });

    const nowIso = new Date().toISOString();
    if (res.ok) {
      sentCount++;
      await admin
        .from('notification_outbox')
        .update({
          status: 'sent_live',
          attempt_count: item.attempt_count + 1,
          last_attempt_at: nowIso,
          error_message: null,
        })
        .eq('id', item.id);
    } else {
      failedCount++;
      const errText = await res.text();
      await admin
        .from('notification_outbox')
        .update({
          status: 'failed',
          attempt_count: item.attempt_count + 1,
          last_attempt_at: nowIso,
          error_message: `Resend HTTP ${res.status}: ${errText.slice(0, 160)}`,
        })
        .eq('id', item.id);
    }
  }

  return new Response(
    JSON.stringify({ ok: true, processed: (queued ?? []).length, sentCount, failedCount }),
    { headers: { 'Content-Type': 'application/json' } }
  );
});
