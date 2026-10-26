import { config } from '../config/config.js';

let testEmailTransport = null;

export class EmailDeliveryError extends Error {
  constructor(code = 'delivery_failed', diagnostics = null) {
    super('Email delivery is unavailable.');
    this.code = code;
    this.diagnostics = diagnostics;
    this.name = 'EmailDeliveryError';
  }
}

function sanitizeProviderText(value, fallback) {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  let safeText = value
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .replace(/\bre_[A-Za-z0-9_-]{6,}\b/g, '[redacted-api-key]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/\b\d{6}\b/g, '[redacted-code]')
    .replace(/\b(api[\s_-]?key|password|session[\s_-]?secret|secret|token)(\s*[:=]\s*)[^\s,;]+/gi, '$1$2[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 240);
  for (const secret of [config.email.resendApiKey, config.sessionSecret]) {
    if (typeof secret === 'string' && secret.length >= 8) {
      safeText = safeText.split(secret).join('[redacted-secret]');
    }
  }
  return safeText;
}

function getProviderDiagnostics(payload, httpStatus) {
  const providerName = sanitizeProviderText(payload?.name, 'unknown')
    .replace(/[^A-Za-z0-9_.-]/g, '_')
    .slice(0, 80) || 'unknown';
  return {
    httpStatus: Number.isInteger(httpStatus) ? httpStatus : null,
    providerName,
    providerMessage: sanitizeProviderText(payload?.message, 'No structured provider error message was returned.')
  };
}

function logEmailFailure(status, message) {
  const safeStatus = Number.isInteger(status)
    ? String(status)
    : String(status || 'unavailable').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || 'unavailable';
  const safeMessage = sanitizeProviderText(message, 'No safe provider error message was available.');
  console.error(`Email send failed (${safeStatus}): ${safeMessage}`);
}

export function isEmailDeliveryConfigured() {
  if (config.nodeEnv === 'test' && testEmailTransport) return true;
  return config.email.provider === 'resend' && Boolean(config.email.resendApiKey && config.email.fromAddress);
}

// The injected sender is available only to the automated test process. It is never
// exposed through an HTTP route and receives only mail that already contains a
// cryptographically generated, single-use code.
export function setTestEmailTransport(transport) {
  if (config.nodeEnv !== 'test') throw new Error('Test email transport is available only in NODE_ENV=test.');
  testEmailTransport = transport;
}

export async function sendEmail({ to, subject, text, html }) {
  if (config.nodeEnv === 'test' && testEmailTransport) {
    try {
      await testEmailTransport({ to, subject, text, html });
      return { status: 'test_transport_accepted' };
    } catch (error) {
      logEmailFailure('test-transport', error?.message || 'Injected email transport failed.');
      throw error;
    }
  }

  if (!isEmailDeliveryConfigured()) {
    logEmailFailure('not-configured', 'Email delivery is not configured.');
    throw new EmailDeliveryError('not_configured');
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.email.resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: `${config.email.fromName} <${config.email.fromAddress}>`,
        to: [to],
        subject,
        text,
        html
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      // Keep only bounded, sanitized diagnostic fields for server-side logs;
      // HTTP responses remain generic and never expose provider details.
      let providerPayload = null;
      try {
        providerPayload = await response.json();
      } catch {
        // Some proxies return a non-JSON error page; status still identifies it.
      }
      const diagnostics = getProviderDiagnostics(providerPayload, response.status);
      logEmailFailure(response.status, diagnostics.providerMessage);
      throw new EmailDeliveryError('provider_rejected', diagnostics);
    }
    return { status: 'provider_accepted' };
  } catch (error) {
    if (error instanceof EmailDeliveryError) throw error;
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError' || error?.code === 'UND_ERR_CONNECT_TIMEOUT';
    logEmailFailure('unavailable', timedOut ? 'Email request timed out.' : 'Email request failed due to a network error.');
    throw new EmailDeliveryError(timedOut ? 'timeout' : 'network_error');
  }
}

export default { sendEmail, isEmailDeliveryConfigured };
