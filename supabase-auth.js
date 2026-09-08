import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.115.0/+esm';

const config = window.VACATION_PORTAL_CONFIG || {};
const supabaseUrl = String(config.supabaseUrl || '').trim();
const publishableKey = String(config.supabasePublishableKey || '').trim();
const enabled = Boolean(supabaseUrl && publishableKey);
const LAST_EMAIL_KEY = 'vacationPortalSupabaseLastEmailV1';
const PENDING_OTP_KEY = 'vacationPortalSupabasePendingOtpV1';
const PENDING_OTP_MAX_AGE_MS = 15 * 60 * 1000;

let client = null;
let currentSession = null;
let currentMemberships = [];
let authMessage = '';
let authBusy = false;
let accountButton = null;
let overlay = null;
let dialog = null;
let lastFocused = null;
let initialized = false;
let pendingEmail = readLastEmail();
let otpRequested = restorePendingOtp();

const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, character => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[character]);

function readLastEmail() {
  try {
    return String(localStorage.getItem(LAST_EMAIL_KEY) || '').trim();
  } catch (error) {
    return '';
  }
}

function saveLastEmail(email) {
  const value = String(email || '').trim();
  pendingEmail = value;
  try {
    if (value) localStorage.setItem(LAST_EMAIL_KEY, value);
    else localStorage.removeItem(LAST_EMAIL_KEY);
  } catch (error) {}
}

function restorePendingOtp() {
  try {
    const pending = JSON.parse(localStorage.getItem(PENDING_OTP_KEY) || 'null');
    if (!pending || !pending.email || !pending.requestedAt) return false;
    if (Date.now() - Number(pending.requestedAt) > PENDING_OTP_MAX_AGE_MS) {
      localStorage.removeItem(PENDING_OTP_KEY);
      return false;
    }
    pendingEmail = String(pending.email || '').trim();
    return Boolean(pendingEmail);
  } catch (error) {
    return false;
  }
}

function rememberPendingOtp(email) {
  saveLastEmail(email);
  otpRequested = true;
  try {
    localStorage.setItem(PENDING_OTP_KEY, JSON.stringify({
      email: pendingEmail,
      requestedAt: Date.now()
    }));
  } catch (error) {}
}

function clearPendingOtp() {
  otpRequested = false;
  try {
    localStorage.removeItem(PENDING_OTP_KEY);
  } catch (error) {}
}

function ensureStyles() {
  if (document.getElementById('vacationSupabaseAuthStyles')) return;
  const style = document.createElement('style');
  style.id = 'vacationSupabaseAuthStyles';
  style.textContent = `
    #supabaseAccountButton{
      pointer-events:auto!important;display:grid!important;place-items:center!important;
      width:42px!important;min-width:42px!important;height:42px!important;min-height:42px!important;
      margin-top:8px!important;padding:0!important;border:1px solid #2a3141!important;
      border-radius:50%!important;color:#f1d892!important;background:#121827!important;
      box-shadow:0 5px 16px rgba(0,0,0,.22)!important;font-size:17px!important;line-height:1!important;cursor:pointer!important
    }
    #supabaseAccountButton[data-signed-in="true"]{
      border-color:#d8b565!important;box-shadow:0 0 0 2px rgba(216,181,101,.16),0 5px 16px rgba(0,0,0,.22)!important
    }
    .supabase-auth-overlay{
      position:fixed;inset:0;z-index:7000;display:grid;place-items:center;
      padding:max(18px,env(safe-area-inset-top)) max(18px,env(safe-area-inset-right))
        max(18px,env(safe-area-inset-bottom)) max(18px,env(safe-area-inset-left));
      background:rgba(5,9,16,.72);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)
    }
    .supabase-auth-overlay[hidden]{display:none!important}
    .supabase-auth-dialog{
      width:min(470px,100%);max-height:calc(100dvh - 36px);overflow:auto;padding:22px;
      border:1px solid #2a3141;border-radius:20px;color:#f7f5ef;background:#121827;
      box-shadow:0 24px 70px rgba(0,0,0,.45)
    }
    .supabase-auth-dialog .eyebrow{margin:0 0 5px;color:#d8b565;font-size:11px;font-weight:900;letter-spacing:.12em}
    .supabase-auth-dialog h2{margin:0 0 8px;color:#f7f5ef;font-family:Georgia,serif}
    .supabase-auth-dialog p{color:#b4bdc9}
    .supabase-auth-dialog label{display:block;margin:16px 0 6px;color:#f7f5ef;font-size:13px;font-weight:800}
    .supabase-auth-dialog input{
      box-sizing:border-box;width:100%;min-height:46px;padding:10px 12px;border:1px solid #343d50;border-radius:10px;
      color:#f7f5ef;background:#0d1320;font:inherit;outline:none
    }
    .supabase-auth-dialog input:focus{border-color:#d8b565;box-shadow:0 0 0 3px rgba(216,181,101,.14)}
    .supabase-auth-dialog .supabase-auth-code{font-size:22px;letter-spacing:.18em;text-align:center;font-variant-numeric:tabular-nums}
    .supabase-auth-actions{display:flex;flex-wrap:wrap;gap:9px;margin-top:17px}
    .supabase-auth-actions button{
      min-height:44px;padding:10px 14px;border:1px solid #343d50;border-radius:10px;
      color:#f1d892;background:#191f31;font-weight:850;cursor:pointer
    }
    .supabase-auth-actions button.primary{color:#080c16;border-color:#d8b565;background:#d8b565}
    .supabase-auth-actions button:disabled{opacity:.55;cursor:wait}
    .supabase-auth-status{
      margin:14px 0 0;padding:11px 12px;border:1px solid #2a3141;border-radius:11px;
      color:#c7cfda;background:#0d1320;font-size:13px;line-height:1.45
    }
    .supabase-auth-membership{margin:10px 0 0;padding:0;list-style:none}
    .supabase-auth-membership li{margin:7px 0;padding:9px 10px;border-radius:9px;background:#191f31;color:#e6e8e5}
    .supabase-auth-email{color:#f1d892;font-weight:800;overflow-wrap:anywhere}
    .supabase-auth-footnote{font-size:11px;color:#8f99a8!important}
  `;
  document.head.appendChild(style);
}

function ensureUi() {
  ensureStyles();
  const tools = document.getElementById('appTools');
  if (tools && !document.getElementById('supabaseAccountButton')) {
    accountButton = document.createElement('button');
    accountButton.id = 'supabaseAccountButton';
    accountButton.type = 'button';
    accountButton.textContent = '👤';
    accountButton.setAttribute('aria-label', 'Account');
    accountButton.title = 'Account';
    accountButton.addEventListener('click', openAccount);
    tools.appendChild(accountButton);
  } else {
    accountButton = document.getElementById('supabaseAccountButton');
  }

  if (!document.getElementById('supabaseAuthOverlay')) {
    overlay = document.createElement('div');
    overlay.id = 'supabaseAuthOverlay';
    overlay.className = 'supabase-auth-overlay';
    overlay.hidden = true;
    overlay.innerHTML = '<section class="supabase-auth-dialog" role="dialog" aria-modal="true" aria-labelledby="supabaseAuthTitle" id="supabaseAuthDialog"></section>';
    overlay.addEventListener('click', event => {
      if (event.target === overlay) closeAccount();
    });
    document.body.appendChild(overlay);
  } else {
    overlay = document.getElementById('supabaseAuthOverlay');
  }
  dialog = document.getElementById('supabaseAuthDialog');
  updateAccountButton();
}

function updateAccountButton() {
  if (!accountButton) return;
  const signedIn = Boolean(currentSession && currentSession.user);
  accountButton.dataset.signedIn = signedIn ? 'true' : 'false';
  accountButton.setAttribute('aria-label', signedIn ? 'Account signed in' : 'Sign in');
  accountButton.title = signedIn ? 'Account · signed in' : 'Sign in';
}

function signedOutMarkup() {
  if (otpRequested && pendingEmail) {
    return `
      <p class="eyebrow">SUPABASE ACCOUNT</p>
      <h2 id="supabaseAuthTitle">Enter your sign-in code</h2>
      <p>We sent a one-time code to <strong class="supabase-auth-email">${esc(pendingEmail)}</strong>. Enter it here to sign in directly inside the app.</p>
      <label for="supabaseAuthCode">Verification code</label>
      <input id="supabaseAuthCode" class="supabase-auth-code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" maxlength="10" placeholder="123456">
      ${authMessage ? `<div class="supabase-auth-status" role="status">${esc(authMessage)}</div>` : ''}
      <div class="supabase-auth-actions">
        <button class="primary" type="button" data-auth-action="verify-code" ${authBusy ? 'disabled' : ''}>${authBusy ? 'Verifying…' : 'Verify & sign in'}</button>
        <button type="button" data-auth-action="resend-code" ${authBusy ? 'disabled' : ''}>Resend code</button>
        <button type="button" data-auth-action="change-email" ${authBusy ? 'disabled' : ''}>Use a different email</button>
        <button type="button" data-auth-action="close">Cancel</button>
      </div>
      <p class="supabase-auth-footnote">The code is verified by Supabase. Your session stays in the PWA and is not sent into the Apps Script iframe.</p>`;
  }

  return `
    <p class="eyebrow">SUPABASE ACCOUNT</p>
    <h2 id="supabaseAuthTitle">Sign in to your vacation account</h2>
    <p>Use a one-time email code so the installed app can establish its own secure session without bouncing through Safari.</p>
    <label for="supabaseAuthEmail">Email address</label>
    <input id="supabaseAuthEmail" type="email" inputmode="email" autocomplete="email" value="${esc(pendingEmail || readLastEmail())}" placeholder="you@example.com">
    ${authMessage ? `<div class="supabase-auth-status" role="status">${esc(authMessage)}</div>` : ''}
    <div class="supabase-auth-actions">
      <button class="primary" type="button" data-auth-action="send-code" ${authBusy ? 'disabled' : ''}>${authBusy ? 'Sending…' : 'Email me a sign-in code'}</button>
      <button type="button" data-auth-action="close">Cancel</button>
    </div>
    <p class="supabase-auth-footnote">This device remembers the last email you used for convenience. The existing portal continues to work while signed out.</p>`;
}

function renderAccount() {
  ensureUi();
  if (!dialog) return;

  if (!enabled) {
    dialog.innerHTML = `
      <p class="eyebrow">SUPABASE ACCOUNT</p>
      <h2 id="supabaseAuthTitle">Account setup is not configured</h2>
      <p>The PWA is still using the existing Apps Script portal normally.</p>
      <div class="supabase-auth-actions"><button type="button" data-auth-action="close">Close</button></div>`;
    bindDialogActions();
    return;
  }

  const user = currentSession && currentSession.user;
  if (!user) {
    dialog.innerHTML = signedOutMarkup();
  } else {
    const memberships = currentMemberships.length
      ? `<ul class="supabase-auth-membership">${currentMemberships.map(row => `<li><strong>${esc(row.role || 'traveler')}</strong>${row.traveler_id ? ' · traveler linked' : ''}</li>`).join('')}</ul>`
      : '<div class="supabase-auth-status">Signed in successfully. No trip membership is linked to this account yet.</div>';

    dialog.innerHTML = `
      <p class="eyebrow">SUPABASE ACCOUNT</p>
      <h2 id="supabaseAuthTitle">Account connected</h2>
      <p class="supabase-auth-email">${esc(user.email || 'Verified account')}</p>
      ${memberships}
      ${authMessage ? `<div class="supabase-auth-status" role="status">${esc(authMessage)}</div>` : ''}
      <div class="supabase-auth-actions">
        <button class="primary" type="button" data-auth-action="refresh" ${authBusy ? 'disabled' : ''}>Refresh access</button>
        <button type="button" data-auth-action="sign-out" ${authBusy ? 'disabled' : ''}>Sign out</button>
        <button type="button" data-auth-action="close">Close</button>
      </div>`;
  }
  bindDialogActions();
}

function bindDialogActions() {
  if (!dialog) return;
  dialog.querySelectorAll('[data-auth-action]').forEach(button => {
    button.addEventListener('click', async () => {
      const action = button.getAttribute('data-auth-action');
      if (action === 'close') return closeAccount();
      if (action === 'send-code') return sendEmailCode();
      if (action === 'verify-code') return verifyEmailCode();
      if (action === 'resend-code') return sendEmailCode(pendingEmail);
      if (action === 'change-email') return changeEmail();
      if (action === 'sign-out') return signOut();
      if (action === 'refresh') return refreshMemberships(true);
    });
  });
}

function openAccount() {
  ensureUi();
  lastFocused = document.activeElement;
  overlay.hidden = false;
  renderAccount();
  setTimeout(() => {
    const focusTarget = dialog && (dialog.querySelector('input') || dialog.querySelector('button'));
    if (focusTarget) focusTarget.focus();
  }, 0);
}

function closeAccount() {
  if (overlay) overlay.hidden = true;
  if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
}

function changeEmail() {
  clearPendingOtp();
  authMessage = '';
  renderAccount();
  setTimeout(() => {
    const input = document.getElementById('supabaseAuthEmail');
    if (input) {
      input.focus();
      input.select();
    }
  }, 0);
}

async function sendEmailCode(explicitEmail) {
  if (!client || authBusy) return;
  const input = document.getElementById('supabaseAuthEmail');
  const email = String(explicitEmail || (input && input.value) || pendingEmail || '').trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    authMessage = 'Enter a valid email address.';
    renderAccount();
    return;
  }

  saveLastEmail(email);
  authBusy = true;
  authMessage = '';
  renderAccount();
  try {
    const { error } = await client.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true }
    });
    if (error) {
      authMessage = String(error.message || 'The sign-in code could not be sent.');
      clearPendingOtp();
    } else {
      rememberPendingOtp(email);
      authMessage = 'Code sent. Check your email, then enter the code here.';
    }
  } catch (error) {
    authMessage = String(error && error.message ? error.message : 'The sign-in code could not be sent.');
    clearPendingOtp();
  } finally {
    authBusy = false;
    renderAccount();
  }
}

async function verifyEmailCode() {
  if (!client || authBusy || !pendingEmail) return;
  const input = document.getElementById('supabaseAuthCode');
  const code = String(input && input.value || '').replace(/\s+/g, '');
  if (!/^\d{6,10}$/.test(code)) {
    authMessage = 'Enter the verification code from your email.';
    renderAccount();
    return;
  }

  authBusy = true;
  authMessage = '';
  renderAccount();
  try {
    const result = await client.auth.verifyOtp({
      email: pendingEmail,
      token: code,
      type: 'email'
    });
    if (result.error || !result.data || !result.data.session) {
      authMessage = String(result.error && result.error.message ? result.error.message : 'That code could not be verified.');
      return;
    }

    currentSession = result.data.session;
    saveLastEmail(currentSession.user && currentSession.user.email ? currentSession.user.email : pendingEmail);
    clearPendingOtp();
    await refreshMemberships(false);
    authMessage = 'Secure account session established.';
    updateAccountButton();
  } catch (error) {
    authMessage = String(error && error.message ? error.message : 'That code could not be verified.');
  } finally {
    authBusy = false;
    renderAccount();
  }
}

async function signOut() {
  if (!client || authBusy) return;
  if (currentSession && currentSession.user && currentSession.user.email) saveLastEmail(currentSession.user.email);
  authBusy = true;
  renderAccount();
  try {
    const { error } = await client.auth.signOut();
    authMessage = error ? String(error.message || 'Could not sign out.') : 'Signed out.';
    if (!error) {
      currentSession = null;
      currentMemberships = [];
      clearPendingOtp();
    }
  } catch (error) {
    authMessage = String(error && error.message ? error.message : 'Could not sign out.');
  } finally {
    authBusy = false;
    updateAccountButton();
    renderAccount();
  }
}

async function refreshMemberships(showMessage) {
  if (!client || !currentSession || !currentSession.user) {
    currentMemberships = [];
    return [];
  }

  authBusy = true;
  if (showMessage) renderAccount();

  try {
    // The exposed RPC is SECURITY INVOKER. Its privilege-bearing implementation
    // lives in the private schema and only matches the verified email in the JWT.
    const claim = await client.rpc('claim_trip_invitations');
    if (claim.error) console.warn('Trip invitation claim did not complete.', claim.error);

    const membershipResult = await client
      .from('trip_members')
      .select('trip_id,traveler_id,role,active')
      .eq('auth_user_id', currentSession.user.id)
      .eq('active', true);

    if (membershipResult.error) {
      currentMemberships = [];
      authMessage = 'Account is signed in, but trip permissions could not be loaded yet.';
    } else {
      currentMemberships = membershipResult.data || [];
      if (showMessage) {
        authMessage = currentMemberships.length
          ? 'Trip permissions refreshed.'
          : 'Account is verified. Trip access has not been linked yet.';
      }
    }
  } catch (error) {
    currentMemberships = [];
    authMessage = String(error && error.message ? error.message : 'Trip permissions could not be loaded yet.');
  } finally {
    authBusy = false;
    updateAccountButton();
    if (showMessage) renderAccount();
  }
  return currentMemberships;
}

async function initialize() {
  if (initialized) return;
  initialized = true;
  ensureUi();
  if (!enabled) return;

  client = createClient(supabaseUrl, publishableKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
  window.VacationSupabase = client;

  try {
    const initial = await client.auth.getSession();
    currentSession = initial.data && initial.data.session ? initial.data.session : null;
    if (initial.error) console.warn('Supabase session restore failed.', initial.error);
    if (currentSession) {
      if (currentSession.user && currentSession.user.email) saveLastEmail(currentSession.user.email);
      clearPendingOtp();
      await refreshMemberships(false);
    }
    updateAccountButton();
  } catch (error) {
    console.warn('Supabase account initialization failed.', error);
    authMessage = 'Account services could not initialize. The existing portal is still available.';
  }

  client.auth.onAuthStateChange((event, session) => {
    currentSession = session || null;
    if (!session) {
      currentMemberships = [];
      updateAccountButton();
      if (overlay && !overlay.hidden) renderAccount();
      return;
    }

    if (session.user && session.user.email) saveLastEmail(session.user.email);
    clearPendingOtp();

    // Defer database work out of the auth callback itself.
    setTimeout(async () => {
      await refreshMemberships(false);
      if (event === 'SIGNED_IN') authMessage = 'Secure account session established.';
      updateAccountButton();
      if (overlay && !overlay.hidden) renderAccount();
    }, 0);
  });
}

document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && overlay && !overlay.hidden) closeAccount();
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize, { once: true });
} else {
  initialize();
}
