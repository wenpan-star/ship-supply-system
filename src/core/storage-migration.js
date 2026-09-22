// filename: src/core/storage-migration.js
// 船舶物料申请系统 · 存储迁移
// 负责：检测旧版本存储格式，自动迁移到当前格式
//
// 【为什么需要独立模块】
//   加密前缀从 v2:: 升级到 v3:: 时，旧数据需要识别并处理
//   未来若继续升级版本号，迁移逻辑应集中于此
//
// 【当前版本】
//   当前加密前缀为 v3::
//   历史前缀：v1::（已废弃）、v2::（已废弃）
//
// 【迁移策略】
//   1. 扫描 IndexedDB 中所有键的原始值
//   2. 检测是否存在旧前缀
//   3. 若存在：通知用户"检测到旧版数据，需要重新登录以迁移"
//   4. 用户确认后，清空旧数据（因为无法用新密钥解密）
//
// 【M-new-2 接入契约】
//   本模块的 detectLegacyData / purgeLegacyData 目前未被 main.js 调用，
//   但已按照"未来可直接接入"的契约完整实现。接入方式：
//     - 在 main.js 的 bootstrap 中，initializeRepository() 成功后、
//       startAuthFlow() 之前（或在 verifyPassword 成功后、loadInitialVault 之前）
//       调用 detectLegacyData()；
//     - 若返回 hasLegacy = true，用 showConfirmDialog 提示用户；
//     - 用户确认后调用 purgeLegacyData()；
//     - purgeLegacyData 完成后，loadChunkedData / secureGetItem 不会再把
//       旧字符串当作合法分片（见 persist.js 的 Bug-3 修复——非数组分片
//       会被视为损坏并标记 corruption）。
//   保留完整 API 的理由：
//     1. 未来接入时无需重建逻辑
//     2. 单元测试可独立验证
//     3. 保持公共接口完整性

import {
    ENCRYPTION_PREFIX,
} from '../constants.js';
import {
    getKeys,
    getRawItem,
    removeRawItem,
} from './repository.js';

// 已知的历史加密前缀列表
const LEGACY_PREFIXES = ['v1::', 'v2::'];

/**
 * 检测存储中是否存在旧版加密数据
 * @returns {Promise<{hasLegacy: boolean, legacyKeys: string[], storeName: string|null}>}
 */
export async function detectLegacyData() {
    const storeNames = ['en', 'zh', 'app', 'logs'];
    for (let storeIndex = 0; storeIndex < storeNames.length; storeIndex++) {
        const storeName = storeNames[storeIndex];
        try {
            const keys = await getKeys(storeName);
            const legacyKeys = [];
            for (let keyIndex = 0; keyIndex < keys.length; keyIndex++) {
                const key = keys[keyIndex];
                const rawValue = await getRawItem(storeName, key);
                if (typeof rawValue !== 'string') continue;
                for (let prefixIndex = 0; prefixIndex < LEGACY_PREFIXES.length; prefixIndex++) {
                    if (rawValue.startsWith(LEGACY_PREFIXES[prefixIndex])) {
                        legacyKeys.push(key);
                        break;
                    }
                }
            }
            if (legacyKeys.length > 0) {
                return {
                    hasLegacy: true,
                    legacyKeys: legacyKeys,
                    storeName: storeName,
                };
            }
        } catch (scanError) {
            console.warn('[migration] 扫描 ' + storeName + ' 失败:', scanError);
        }
    }
    return {
        hasLegacy: false,
        legacyKeys: [],
        storeName: null,
    };
}

/**
 * 清除所有旧版加密数据
 * 警告：本操作不可逆，仅在用户确认后调用
 * @returns {Promise<{removedCount: number, failedKeys: string[]}>}
 */
export async function purgeLegacyData() {
    const storeNames = ['en', 'zh', 'app', 'logs'];
    let removedCount = 0;
    const failedKeys = [];

    for (let storeIndex = 0; storeIndex < storeNames.length; storeIndex++) {
        const storeName = storeNames[storeIndex];
        try {
            const keys = await getKeys(storeName);
            for (let keyIndex = 0; keyIndex < keys.length; keyIndex++) {
                const key = keys[keyIndex];
                const rawValue = await getRawItem(storeName, key);
                if (typeof rawValue !== 'string') continue;
                let isLegacy = false;
                for (let prefixIndex = 0; prefixIndex < LEGACY_PREFIXES.length; prefixIndex++) {
                    if (rawValue.startsWith(LEGACY_PREFIXES[prefixIndex])) {
                        isLegacy = true;
                        break;
                    }
                }
                if (isLegacy) {
                    try {
                        await removeRawItem(storeName, key);
                        removedCount++;
                    } catch (removeError) {
                        failedKeys.push(storeName + '/' + key);
                    }
                }
            }
        } catch (storeError) {
            console.warn('[migration] 处理 ' + storeName + ' 失败:', storeError);
        }
    }

    return {
        removedCount: removedCount,
        failedKeys: failedKeys,
    };
}

/**
 * 检查当前加密前缀是否为最新
 * @returns {string}
 */
export function getCurrentEncryptionPrefix() {
    return ENCRYPTION_PREFIX;
}