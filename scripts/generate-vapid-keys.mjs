import { generateKeyPairSync } from 'node:crypto';

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const pub = publicKey.export({ format: 'jwk' });
const priv = privateKey.export({ format: 'jwk' });
const toBuffer = (value) => Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const publicRaw = Buffer.concat([Buffer.from([4]), toBuffer(pub.x), toBuffer(pub.y)]).toString('base64url');

console.log(`PUSH_VAPID_PUBLIC_KEY=${publicRaw}`);
console.log(`PUSH_VAPID_PRIVATE_KEY=${priv.d}`);
