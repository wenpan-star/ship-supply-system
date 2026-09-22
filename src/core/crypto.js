// filename: src/core/crypto.js
// 船舶物料申请系统 · 加密内核
// 使用 Web Crypto API：PBKDF2(SHA-256) 派生密钥 + AES-256-GCM 加密
// 本模块为纯函数，无副作用，不接触 DOM、存储
//
// 【性能优化】派生的 CryptoKey 被缓存。
// 【并发保护】多处同时请求密钥时只触发一次派生。
// 【安全边界】缓存密钥只存在于内存中，clearCachedKey 用于密码变更时清除。

import {
    PBKDF2_ITERATIONS,
    SALT_LENGTH,
    AES_GCM_IV_LENGTH,
    MIN_ENCRYPTED_PAYLOAD_LENGTH,
    ENCRYPTION_PREFIX,
} from '../constants.js';

// 缓存的派生密钥：首次派生后所有后续加/解密都复用
let cachedEncryptionKey = null;

// 并发保护：多处同时请求时只触发一次派生
let pendingKeyDerivationPromise = null;

/**
 * 将 Uint8Array 转为 Base64 字符串
 * 使用分块方式避免 spread 超长栈溢出
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function bytesToBase64(bytes) {
    const CHUNK_SIZE = 0x8000;
    let binaryString = '';
    for (let index = 0; index < bytes.length; index += CHUNK_SIZE) {
        const chunk = bytes.subarray(index, index + CHUNK_SIZE);
        binaryString += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binaryString);
}

/**
 * 将 Base64 字符串还原为 Uint8Array
 * @param {string} base64String
 * @returns {Uint8Array}
 */
export function base64ToBytes(base64String) {
    const binaryString = atob(base64String);
    const bytes = new Uint8Array(binaryString.length);
    for (let index = 0; index < binaryString.length; index++) {
        bytes[index] = binaryString.charCodeAt(index);
    }
    return bytes;
}

/**
 * 通过 PBKDF2 派生 AES-256-GCM 密钥
 * 结果被缓存：首次调用约 200-400ms，后续调用 <1ms
 * @param {string} password
 * @param {Uint8Array} salt
 * @returns {Promise<CryptoKey>}
 */
export async function deriveKeyFromPassword(password, salt) {
    if (cachedEncryptionKey) {
        return cachedEncryptionKey;
    }
    if (!pendingKeyDerivationPromise) {
        pendingKeyDerivationPromise = (async function () {
            try {
                const encoder = new TextEncoder();
                const keyMaterial = await window.crypto.subtle.importKey(
                    'raw',
                    encoder.encode(password),
                    'PBKDF2',
                    false,
                    ['deriveKey']
                );
                const derivedKey = await window.crypto.subtle.deriveKey(
                    {
                        name: 'PBKDF2',
                        salt: salt,
                        iterations: PBKDF2_ITERATIONS,
                        hash: 'SHA-256',
                    },
                    keyMaterial,
                    { name: 'AES-GCM', length: 256 },
                    false,
                    ['encrypt', 'decrypt']
                );
                cachedEncryptionKey = derivedKey;
                return derivedKey;
            } catch (derivationError) {
                // 派生失败时清空 pending 状态，允许后续重试
                pendingKeyDerivationPromise = null;
                throw derivationError;
            }
        })();
    }
    return pendingKeyDerivationPromise;
}

/**
 * 清除缓存的密钥（用于密码变更）
 * 安全性：显式清除可避免旧密钥在内存中残留
 */
export function clearCachedKey() {
    cachedEncryptionKey = null;
    pendingKeyDerivationPromise = null;
}

/**
 * 检查密钥是否已派生
 * @returns {boolean}
 */
export function isKeyCached() {
    return cachedEncryptionKey !== null;
}

/**
 * 计算 authHash（用于验证密码）
 * @param {string} password
 * @param {Uint8Array} salt
 * @returns {Promise<string>}
 */
export async function computeAuthHash(password, salt) {
    const encoder = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        'PBKDF2',
        false,
        ['deriveBits']
    );
    const bits = await window.crypto.subtle.deriveBits(
        {
            name: 'PBKDF2',
            salt: salt,
            iterations: PBKDF2_ITERATIONS,
            hash: 'SHA-256',
        },
        keyMaterial,
        256
    );
    return bytesToBase64(new Uint8Array(bits));
}

/**
 * 加密任意可 JSON 序列化的对象
 * 输出格式：v3::<Base64([12 字节 IV][密文 + AuthTag])>
 * @param {*} data
 * @returns {Promise<string>}
 */
export async function encryptData(data) {
    if (!cachedEncryptionKey) {
        throw new Error('加密密钥未初始化，请先调用 deriveKeyFromPassword');
    }
    const plaintext = JSON.stringify(data);
    const dataBytes = new TextEncoder().encode(plaintext);
    const initializationVector = window.crypto.getRandomValues(
        new Uint8Array(AES_GCM_IV_LENGTH)
    );
    const encryptedBuffer = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: initializationVector },
        cachedEncryptionKey,
        dataBytes
    );
    const combinedArray = new Uint8Array(
        initializationVector.length + encryptedBuffer.byteLength
    );
    combinedArray.set(initializationVector, 0);
    combinedArray.set(new Uint8Array(encryptedBuffer), initializationVector.length);
    return ENCRYPTION_PREFIX + bytesToBase64(combinedArray);
}

/**
 * 解密由 encryptData 生成的字符串
 * 【加固】先校验最小长度，再进入 subtle.decrypt
 * @param {string} encryptedBase64
 * @returns {Promise<*>} 解密失败时抛出异常（调用方需处理）
 */
export async function decryptData(encryptedBase64) {
    if (!cachedEncryptionKey) {
        throw new Error('解密密钥未初始化，请先调用 deriveKeyFromPassword');
    }
    if (typeof encryptedBase64 !== 'string' || !encryptedBase64.startsWith(ENCRYPTION_PREFIX)) {
        throw new Error('无效的加密数据格式：缺少前缀 ' + ENCRYPTION_PREFIX);
    }
    const rawData = base64ToBytes(encryptedBase64.slice(ENCRYPTION_PREFIX.length));
    if (rawData.length < MIN_ENCRYPTED_PAYLOAD_LENGTH) {
        throw new Error(
            '无效的加密数据长度：期望至少 ' + MIN_ENCRYPTED_PAYLOAD_LENGTH +
            ' 字节（IV + AuthTag），实际 ' + rawData.length + ' 字节'
        );
    }
    const initializationVector = rawData.slice(0, AES_GCM_IV_LENGTH);
    const ciphertext = rawData.slice(AES_GCM_IV_LENGTH);
    const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: initializationVector },
        cachedEncryptionKey,
        ciphertext
    );
    return JSON.parse(new TextDecoder().decode(decryptedBuffer));
}

/**
 * 生成随机盐
 * @returns {Uint8Array}
 */
export function generateSalt() {
    return window.crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
}

/**
 * 检测当前环境是否支持 Web Crypto
 * @returns {boolean}
 */
export function isCryptoAvailable() {
    try {
        return !!(window.crypto && window.crypto.subtle);
    } catch (error) {
        return false;
    }
}