'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const config = read('config.js');
const auth = read('supabase-auth.js');
const docs = read('docs/SUPABASE.md');
const invitation = read('supabase/migrations/20260908041100_auth_invitations_and_membership_claim.sql');
const privateClaim = read('supabase/migrations/20260908041300_move_invitation_claim_definer_private.sql');

assert(
  /supabaseUrl:\s*'https:\/\/[a-z0-9]+\.supabase\.co'/.test(config),
  'PWA config must identify the Supabase project URL.'
);
assert(
  /supabasePublishableKey:\s*'sb_publishable_[^']+'/.test(config),
  'PWA config must use a modern browser-safe Supabase publishable key.'
);
assert(
  !/service_role[^\n]*['"][A-Za-z0-9._-]{20,}['"]/i.test(config),
  'No service-role credential may be shipped to the browser.'
);
assert(
  config.includes("script.type='module'") && config.includes("'./supabase-auth.js?v='"),
  'The PWA shell must load the isolated Supabase account module.'
);

assert(
  auth.includes("@supabase/supabase-js@2.115.0/+esm"),
  'Supabase browser SDK must be pinned to a reviewed v2 release.'
);
assert(
  auth.includes('persistSession: true') && auth.includes('autoRefreshToken: true') && auth.includes('detectSessionInUrl: true'),
  'Auth client must persist, refresh, and restore browser sessions.'
);
assert(
  auth.includes('signInWithOtp') && auth.includes("verifyOtp({") && auth.includes("type: 'email'"),
  'Account onboarding must send and verify an email OTP inside the PWA.'
);
assert(
  auth.includes('autocomplete="one-time-code"') && auth.includes('Email me a sign-in code'),
  'The installed PWA must provide a first-class one-time-code entry flow.'
);
assert(
  auth.includes('vacationPortalSupabaseLastEmailV1') && auth.includes('localStorage.setItem(LAST_EMAIL_KEY'),
  'The PWA should remember the last email used on this device so sign-in is prefilled.'
);
assert(
  auth.includes('vacationPortalSupabasePendingOtpV1') && auth.includes('PENDING_OTP_MAX_AGE_MS'),
  'A short-lived pending OTP state must survive app switching without persisting verification codes.'
);
assert(
  !auth.includes('emailRedirectTo: appRedirectUrl()'),
  'Primary installed-app auth must not depend on a Safari magic-link redirect.'
);
assert(
  auth.includes("client.rpc('claim_trip_invitations')"),
  'Signed-in users must claim only server-authorized trip invitations.'
);
assert(
  auth.includes(".from('trip_members')") && auth.includes(".eq('auth_user_id', currentSession.user.id)"),
  'Account status must read the signed-in user membership through RLS.'
);
assert(
  !auth.includes('service_role') && !auth.includes('serviceRole') && !auth.includes('access_token'),
  'The browser auth module must never contain a server credential or manually relay access tokens.'
);
assert(
  !/postMessage\([^\)]*(?:session|token|access)/i.test(auth),
  'Supabase session/token data must not be posted into the Apps Script iframe.'
);
assert(
  docs.includes('{{ .Token }}') && docs.includes('Email Templates'),
  'Supabase runbook must document the hosted email OTP template requirement.'
);

assert(invitation.includes('create table public.trip_invitations'), 'Auth foundation must create trip invitations.');
assert(invitation.includes('lower(coalesce(auth.jwt() ->> \'email\''), 'Invitation claims must derive email from the caller JWT.');
assert(invitation.includes('grant execute on function public.claim_trip_invitations() to authenticated'), 'Only authenticated callers should receive invitation-claim RPC access.');
assert(invitation.includes('revoke all on function public.claim_trip_invitations() from public, anon'), 'Anonymous/public invitation claim execution must be revoked.');

assert(
  privateClaim.includes('create or replace function private.claim_trip_invitations_for_user()') &&
  privateClaim.includes('security definer') &&
  privateClaim.includes("set search_path = ''"),
  'Privilege-bearing invitation logic must live in the private schema with a fixed search_path.'
);
assert(
  /create or replace function public\.claim_trip_invitations\(\)[\s\S]*security invoker/.test(privateClaim),
  'The public RPC wrapper must be SECURITY INVOKER so the exposed API schema has no signed-in SECURITY DEFINER function.'
);
assert(
  privateClaim.includes("lower(coalesce(auth.jwt() ->> 'email', ''))"),
  'The private claim function must bind invitations to the verified JWT email.'
);

console.log('PASS Supabase auth and permissions contract');
