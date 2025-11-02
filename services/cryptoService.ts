
import { encode, decode } from '../utils/helpers';

const KEY_STORAGE_NAME = 'gemini-ai-studio-crypto-key';
let cryptoKey: CryptoKey | null = null;

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const getKey = async (): Promise<CryptoKey> => {
    if (cryptoKey) {
        return cryptoKey;
    }

    const storedKey = localStorage.getItem(KEY_STORAGE_NAME);
    if (storedKey) {
        const jwk = JSON.parse(storedKey);
        cryptoKey = await window.crypto.subtle.importKey(
            'jwk',
            jwk,
            { name: 'AES-GCM' },
            true,
            ['encrypt', 'decrypt']
        );
        return cryptoKey;
    }

    const newKey = await window.crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );
    const jwk = await window.crypto.subtle.exportKey('jwk', newKey);
    localStorage.setItem(KEY_STORAGE_NAME, JSON.stringify(jwk));
    cryptoKey = newKey;
    return cryptoKey;
};

export const cryptoService = {
    async encrypt(data: object): Promise<string> {
        const key = await getKey();
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const dataString = JSON.stringify(data);
        const encodedData = textEncoder.encode(dataString);

        const encryptedContent = await window.crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            encodedData
        );

        const ivBase64 = encode(iv);
        const contentBase64 = encode(new Uint8Array(encryptedContent));

        return `${ivBase64}:${contentBase64}`;
    },

    async decrypt<T>(encryptedString: string): Promise<T> {
        const key = await getKey();
        const [ivBase64, contentBase64] = encryptedString.split(':');
        
        if (!ivBase64 || !contentBase64) {
            throw new Error("Invalid encrypted data format.");
        }

        const iv = decode(ivBase64);
        const encryptedContent = decode(contentBase64);

        const decryptedContent = await window.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv },
            key,
            encryptedContent
        );
        
        const decodedString = textDecoder.decode(decryptedContent);
        return JSON.parse(decodedString) as T;
    },
    
    async getExportableKey(): Promise<JsonWebKey | null> {
        const storedKey = localStorage.getItem(KEY_STORAGE_NAME);
        return storedKey ? JSON.parse(storedKey) : null;
    },

    async importKey(jwk: JsonWebKey): Promise<void> {
        localStorage.setItem(KEY_STORAGE_NAME, JSON.stringify(jwk));
        cryptoKey = null; // Force re-initialization on next use
        await getKey(); // Pre-cache the imported key
    },
    
    clearKey(): void {
        localStorage.removeItem(KEY_STORAGE_NAME);
        cryptoKey = null;
    }
};
