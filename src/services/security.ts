// PIN hashing (PBKDF2 via Web Crypto) and local biometric unlock (WebAuthn platform authenticator).
// Everything stays on the device: no server, no network.

const enc = new TextEncoder();

export const b64 = {
  encode(buf: ArrayBuffer | Uint8Array): string {
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
  },
  decode(s: string): Uint8Array<ArrayBuffer> {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '='));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },
  url(buf: ArrayBuffer | Uint8Array): string {
    return b64.encode(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
};

function random(n: number): Uint8Array<ArrayBuffer> {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return a;
}

/**
 * PBKDF2 cost is calibrated on the device itself so one verification takes ~`targetMs`
 * (a fixed 210k iterations took 1–2 s on mid-range phones). Note: a 4–6 digit PIN has at most
 * 10^6 combinations, so the hash protects against casual reading of the stored value, not a
 * determined offline attack; the real protection is the phone's own lock.
 */
export const PIN_ITERATIONS = { min: 20_000, max: 600_000, targetMs: 150 };

export async function calibrateIterations(targetMs = PIN_ITERATIONS.targetMs): Promise<number> {
  const probe = 40_000;
  const key = await crypto.subtle.importKey('raw', enc.encode('0000'), 'PBKDF2', false, ['deriveBits']);
  // Warm-up: the first derivation carries one-off setup cost that would make the device look
  // slower than it is (it under-estimated iterations by ~3x in measurements).
  await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: random(16), iterations: 1000 }, key, 256);
  const t = performance.now();
  await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: random(16), iterations: probe }, key, 256);
  const ms = Math.max(1, performance.now() - t);
  const n = Math.round((probe * targetMs) / ms / 1000) * 1000;
  return Math.min(PIN_ITERATIONS.max, Math.max(PIN_ITERATIONS.min, n));
}

/** Hash for a new PIN, with iterations calibrated for this device. */
export async function createPinHash(pin: string) {
  return hashPin(pin, undefined, await calibrateIterations());
}

export async function hashPin(pin: string, saltB64?: string, iterations = 210000) {
  const salt = saltB64 ? b64.decode(saltB64) : random(16);
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return { hash: b64.encode(bits), salt: b64.encode(salt), iterations };
}

export async function verifyPin(pin: string, stored: { pinHash: string | null; pinSalt: string | null; pinIterations: number }) {
  if (!stored.pinHash || !stored.pinSalt) return false;
  const { hash } = await hashPin(pin, stored.pinSalt, stored.pinIterations);
  // constant-time comparison
  if (hash.length !== stored.pinHash.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ stored.pinHash.charCodeAt(i);
  return diff === 0;
}

// ---------------- Biometrics (WebAuthn) ----------------

export async function biometricAvailable(): Promise<boolean> {
  try {
    return (
      window.isSecureContext &&
      typeof window.PublicKeyCredential !== 'undefined' &&
      (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable())
    );
  } catch {
    return false;
  }
}

export interface BiometricCredential {
  credentialId: string;
  publicKey: string | null;
  alg: number | null;
}

export async function registerBiometric(appName: string): Promise<BiometricCredential> {
  const cred = (await navigator.credentials.create({
    publicKey: {
      rp: { name: appName, id: location.hostname },
      user: { id: random(16), name: 'jeybi-user', displayName: appName },
      challenge: random(32),
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
      attestation: 'none',
      timeout: 60000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) throw new Error('cancelled');
  const resp = cred.response as AuthenticatorAttestationResponse;
  const pk = typeof resp.getPublicKey === 'function' ? resp.getPublicKey() : null;
  const alg = typeof resp.getPublicKeyAlgorithm === 'function' ? resp.getPublicKeyAlgorithm() : null;
  return { credentialId: b64.encode(cred.rawId), publicKey: pk ? b64.encode(pk) : null, alg };
}

/** DER-encoded ECDSA signature → raw r||s (64 bytes) as Web Crypto expects. */
function derToRaw(der: Uint8Array): Uint8Array<ArrayBuffer> {
  let p = 2;
  if (der[1] & 0x80) p += der[1] & 0x7f;
  const read = () => {
    p++; // 0x02
    const len = der[p++];
    let v = der.slice(p, p + len);
    p += len;
    while (v.length > 32 && v[0] === 0) v = v.slice(1);
    const out = new Uint8Array(32);
    out.set(v, 32 - v.length);
    return out;
  };
  const r = read(), s = read();
  const raw = new Uint8Array(64);
  raw.set(r, 0);
  raw.set(s, 32);
  return raw;
}

export async function verifyBiometric(stored: BiometricCredential): Promise<boolean> {
  const challenge = random(32);
  const cred = (await navigator.credentials.get({
    publicKey: {
      challenge,
      rpId: location.hostname,
      allowCredentials: [{ type: 'public-key', id: b64.decode(stored.credentialId), transports: ['internal'] }],
      userVerification: 'required',
      timeout: 60000,
    },
  })) as PublicKeyCredential | null;
  if (!cred) return false;
  if (b64.encode(cred.rawId) !== stored.credentialId) return false;
  const resp = cred.response as AuthenticatorAssertionResponse;
  const clientData = JSON.parse(new TextDecoder().decode(resp.clientDataJSON));
  if (clientData.type !== 'webauthn.get' || clientData.challenge !== b64.url(challenge) || clientData.origin !== location.origin) return false;
  const authData = new Uint8Array(resp.authenticatorData);
  const flags = authData[32];
  if (!(flags & 0x01) || !(flags & 0x04)) return false; // user present + user verified
  if (!stored.publicKey || stored.alg == null) return true; // browser couldn't expose the key; UV flag is our check
  const cdHash = new Uint8Array(await crypto.subtle.digest('SHA-256', resp.clientDataJSON));
  const signed = new Uint8Array(authData.length + cdHash.length);
  signed.set(authData, 0);
  signed.set(cdHash, authData.length);
  const sig = new Uint8Array(resp.signature);
  if (stored.alg === -7) {
    const key = await crypto.subtle.importKey('spki', b64.decode(stored.publicKey), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, derToRaw(sig), signed);
  }
  if (stored.alg === -257) {
    const key = await crypto.subtle.importKey('spki', b64.decode(stored.publicKey), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    return crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig, signed);
  }
  return true;
}
