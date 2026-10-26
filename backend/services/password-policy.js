const commonPasswords = new Set([
  'password', 'password1', 'password12', 'password123', 'password1234', 'password@123',
  'passw0rd', 'qwerty', 'qwerty123', 'qwerty1234', 'qwertyuiop', '123456', '1234567',
  '12345678', '123456789', '1234567890', '11111111', '00000000', '87654321', '987654321',
  'abcdefg', 'abcdefgh', 'abcd1234', 'abc12345', 'letmein', 'letmein123', 'welcome',
  'welcome1', 'welcome123', 'iloveyou', 'admin123', 'administrator', 'student123',
  'college123', 'changeme', 'changeme123', 'secret123', 'football', 'monkey123',
  'dragon123', 'sunshine', 'princess', 'trustno1', 'login123', 'pass1234', 'test1234',
  'india123', 'bangalore123', 'apscollege123'
]);

function hasEasyPattern(value) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (/^(.)\1{5,}$/.test(normalized)) return true;
  if (/^(?:012345|123456|234567|345678|456789|987654|876543|765432|654321)/.test(normalized)) return true;
  if (/^(?:qwerty|asdfgh|zxcvbn)/.test(normalized)) return true;
  return false;
}

export function getPasswordStrength(password, email = '') {
  if (typeof password !== 'string' || password.length < 8) return { level: 'weak', message: 'Use at least 8 characters.' };
  if (Buffer.byteLength(password, 'utf8') > 72) return { level: 'weak', message: 'Use 72 UTF-8 bytes or fewer for secure bcrypt hashing.' };
  const normalized = password.toLowerCase();
  const emailLocal = typeof email === 'string' ? email.split('@')[0].toLowerCase() : '';
  if (commonPasswords.has(normalized) || hasEasyPattern(password) || (emailLocal.length >= 4 && normalized.includes(emailLocal))) {
    return { level: 'weak', message: 'This password is common or easy to guess. Choose a different one.' };
  }

  const variety = [/[a-z]/.test(password), /[A-Z]/.test(password), /\d/.test(password), /[^A-Za-z0-9]/.test(password)].filter(Boolean).length;
  if (password.length >= 14 && variety >= 3) return { level: 'strong', message: 'Strong password.' };
  if (password.length >= 18 && variety >= 2) return { level: 'strong', message: 'Strong password.' };
  return { level: 'medium', message: 'Meets the minimum. A longer, less predictable phrase is stronger.' };
}

export function validatePassword(password, email = '') {
  const strength = getPasswordStrength(password, email);
  return { valid: strength.level !== 'weak', strength };
}

export default { getPasswordStrength, validatePassword };
