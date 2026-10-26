import dns from 'node:dns/promises';
import { domainToASCII } from 'node:url';
import { config } from '../config/config.js';

const localPartPattern = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/;

export function normalizeEmail(value) {
  return typeof value === 'string' ? value.trim().normalize('NFC').toLowerCase() : '';
}

export function parseEmailAddress(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim().normalize('NFC');
  if (!email || email.length > 254 || /[\s\r\n]/.test(email)) return null;
  const firstAt = email.indexOf('@');
  if (firstAt <= 0 || firstAt !== email.lastIndexOf('@')) return null;

  const local = email.slice(0, firstAt);
  const inputDomain = email.slice(firstAt + 1);
  const domain = domainToASCII(inputDomain).toLowerCase();
  if (local.length > 64 || !localPartPattern.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..')) return null;
  if (!domain || domain.length > 253 || domain.includes('_')) return null;

  const labels = domain.split('.');
  if (labels.length < 2 || labels.some(label =>
    !label || label.length > 63 || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label)
  )) return null;
  const topLevelDomain = labels.at(-1);
  if (!(/^[a-z]{2,63}$/.test(topLevelDomain) || /^xn--[a-z0-9-]{4,59}$/.test(topLevelDomain))) return null;

  return { email: `${local.toLowerCase()}@${domain}`, local: local.toLowerCase(), domain };
}

function isTransientDnsError(error) {
  if (error instanceof AggregateError) return error.errors.some(isTransientDnsError);
  return ['ETIMEOUT', 'ESERVFAIL', 'EREFUSED', 'EAI_AGAIN', 'ECONNREFUSED', 'EAI_FAIL'].includes(error?.code);
}

async function withDnsTimeout(promise, timeoutMs = 3500) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error('DNS lookup timed out.'), { code: 'ETIMEOUT' })), timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function validateEmailDomain(email) {
  const parsed = parseEmailAddress(email);
  if (!parsed) return { valid: false, reason: 'syntax' };

  const { allowedStudentDomains } = config.email;
  if (allowedStudentDomains.length && !allowedStudentDomains.includes(parsed.domain)) {
    return { valid: false, reason: 'domain_not_allowed' };
  }

  // Tests use the real route and database but intentionally do not depend on
  // public DNS. Production and development registrations always check routing.
  if (config.nodeEnv === 'test') return { valid: true, email: parsed.email };

  try {
    const records = await withDnsTimeout(dns.resolveMx(parsed.domain));
    if (records.some(record => record.exchange && record.exchange !== '.')) {
      return { valid: true, email: parsed.email };
    }
    return { valid: false, reason: 'no_mail_route' };
  } catch (mxError) {
    if (mxError?.code !== 'ENODATA' && mxError?.code !== 'ENOTFOUND') {
      if (isTransientDnsError(mxError)) return { valid: false, reason: 'dns_unavailable' };
      return { valid: false, reason: 'no_mail_route' };
    }

    // RFC-compliant domains may accept mail through their address records when
    // no MX record is published. NXDOMAIN is definitive and needs no fallback.
    if (mxError?.code === 'ENOTFOUND') return { valid: false, reason: 'no_mail_route' };
    try {
      await withDnsTimeout(Promise.any([
        dns.resolve4(parsed.domain),
        dns.resolve6(parsed.domain)
      ]));
      return { valid: true, email: parsed.email };
    } catch (addressError) {
      if (isTransientDnsError(addressError)) return { valid: false, reason: 'dns_unavailable' };
      return { valid: false, reason: 'no_mail_route' };
    }
  }
}

export default { normalizeEmail, parseEmailAddress, validateEmailDomain };
