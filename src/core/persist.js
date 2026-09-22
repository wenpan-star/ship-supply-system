// filename: src/core/persist.js
// 船舶物料申请系统 · 分块持久化层
// 负责：分块存储逻辑、增量保存、解密失败检测
// 依赖：repository.js（存储介质）、crypto.js（加解密）、corruption.js（损坏标志）
//
// 【设计要点】
//   1. 分块写入：每 CHUNK_SIZE 条组成一个分片，独立加密存储
//   2. 增量保存：通过 chunkCache 比较，只写变化的分片
//   3. 解密失败检测：任何分片解密失败 → 标记数据损坏 → 拒绝后续写操作
//
// 【与 repository.js 的边界】
//   repository.js 只负责"字节流 ↔ 存储介质"，不关心是否分块
//   persist.js 负责"业务数组 ↔ 分块字节流"的转换
//
// 【分块键命名规则】
//   分片键：'chunk_<index>'（index 从 0 递增）
//   元信息键：'meta'（记录 { chunkCount, total }）
//   备份键：'backup_<任意键>'（用于密码变更回滚）
//
// 【缓存结构】
//   chunkCache = { en: Chunk[][], zh: Chunk[][] }
//   记录每个库最后保存/加载时的分片内容快照，
//   用于增量保存时判断哪些分片需要重新写入。
//
// 【本轮修改】
//   本批重构：从无效上传片段恢复为完整实现。
//   Bug-3 修复保持：loadChunkedData 拒绝非数组分片。
//     secureGetItem 对非加密字符串（例如历史遗留明文）会直接返回原字符串，
//     旧的 result.concat(chunk) 会把字符串按字符拆解，导致静默丢失物料。
//     现在只有 Array.isArray(chunk) 才合并，其余一律计入解密失败。
//   M-7 修复保持：saveChunkedData 的增量比较增加长度快速短路。
//     分片长度变化（追加/删除）场景下避免 JSON.stringify，
//     分片数达到数十片时能明显降低主线程阻塞。
//   S5 修复保持：密文备份/恢复逻辑集中在本模块。

import {
    CHUNK_SIZE,
    ENCRYPTION_PREFIX,
    BACKUP_KEY_PREFIX,
} from '../constants.js';
import {
    getRawItem,
    setRawItem,
    removeRawItem,
    getKeys,
} from './repository.js';
import {
    encryptData,
    decryptData,
} from './crypto.js';
import {
    isCorrupted,
    markCorrupted,
} from './corruption.js';

// 分片缓存：记录每个库最后保存的分片数据
// 用于增量保存时比较哪些分片需要重新写入
const chunkCache = {
    en: null,
    zh: null,
};

// ==================== 分块读写 ====================

/**
 * 保存分块数据
 * @param {string} storeName  'en' | 'zh'
 * @param {Object[]} fullArray
 * @param {boolean} [forceFullSave=false]  是否强制全量保存（密码变更时使用）
 * @returns {Promise<void>}
 */
export async function saveChunkedData(storeName, fullArray, forceFullSave) {
    if (isCorrupted()) {
        throw new Error(
            '检测到数据损坏，已阻止保存操作。请先处理数据损坏问题（导出备份或重新登录）。'
        );
    }
    const effectiveForceFullSave = forceFullSave === true;

    // 获取现有分片键
    const allKeys = await getKeys(storeName);
    const existingChunkKeys = allKeys.filter(function (key) {
        return key.startsWith('chunk_');
    });

    // 空数组：清除所有分片，只留 meta
    if (!Array.isArray(fullArray) || fullArray.length === 0) {
        for (let index = 0; index < existingChunkKeys.length; index++) {
            await removeRawItem(storeName, existingChunkKeys[index]);
        }
        await secureSetItem(storeName, 'meta', { chunkCount: 0, total: 0 });
        if (chunkCache[storeName]) {
            chunkCache[storeName] = [];
        }
        return;
    }

    // 切分成分片
    const chunks = [];
    for (let index = 0; index < fullArray.length; index += CHUNK_SIZE) {
        chunks.push(fullArray.slice(index, index + CHUNK_SIZE));
    }

    // 决定哪些分片需要写
    const cachedChunks = chunkCache[storeName];
    const chunksToWrite = [];

    if (!effectiveForceFullSave && cachedChunks && cachedChunks.length > 0) {
        // 增量比较
        for (let index = 0; index < chunks.length; index++) {
            const newChunk = chunks[index];
            const oldChunk = (index < cachedChunks.length) ? cachedChunks[index] : null;

            // M-7 优化：长度快速短路
            //   分片在"追加"或"删除"场景下长度必然变化，
            //   直接判定需要写入，避免对数十 MB 数据进行 JSON.stringify。
            //   长度相同时再走精确比较，语义与旧实现完全一致。
            if (!oldChunk || newChunk.length !== oldChunk.length) {
                chunksToWrite.push(index);
                continue;
            }

            const newChunkString = JSON.stringify(newChunk);
            const oldChunkString = JSON.stringify(oldChunk);
            if (newChunkString !== oldChunkString) {
                chunksToWrite.push(index);
            }
        }
        // 分片数减少时，删除多余分片
        if (chunks.length < cachedChunks.length) {
            for (let index = chunks.length; index < cachedChunks.length; index++) {
                await removeRawItem(storeName, 'chunk_' + index);
            }
        }
    } else {
        // 全量保存：所有分片都要写
        for (let index = 0; index < chunks.length; index++) {
            chunksToWrite.push(index);
        }
        // 清理超出数量的旧分片
        for (let index = 0; index < existingChunkKeys.length; index++) {
            const chunkIndex = parseInt(existingChunkKeys[index].split('_')[1], 10);
            if (isNaN(chunkIndex)) continue;
            if (chunkIndex >= chunks.length) {
                await removeRawItem(storeName, existingChunkKeys[index]);
            }
        }
    }

    // 写入需要更新的分片
    try {
        for (let index = 0; index < chunksToWrite.length; index++) {
            const chunkIndex = chunksToWrite[index];
            await secureSetItem(storeName, 'chunk_' + chunkIndex, chunks[chunkIndex]);
        }
    } catch (writeError) {
        console.error('[persist] 写入分片失败:', writeError.message);
        throw new Error('保存失败: ' + writeError.message);
    }

    // 更新 meta
    await secureSetItem(storeName, 'meta', {
        chunkCount: chunks.length,
        total: fullArray.length,
    });

    // 更新缓存
    chunkCache[storeName] = chunks.map(function (chunk) {
        return chunk.slice();
    });
}

/**
 * 加载分块数据
 *
 * 【Bug-3 修复】只有数组才合并到结果。
 *   secureGetItem 对非 v3:: 前缀的字符串会直接返回原值，
 *   旧实现的 result.concat(chunk) 会把该字符串按字符拆解为数组，
 *   导致下游归一化全部失败、静默清空物料库。
 *   现在将任何非数组的分片计入 decryptFailCount 并标记损坏。
 *
 * @param {string} storeName  'en' | 'zh'
 * @returns {Promise<Object[]>}
 */
export async function loadChunkedData(storeName) {
    const meta = await secureGetItem(storeName, 'meta', null);

    let chunkKeys;
    try {
        const allKeys = await getKeys(storeName);
        chunkKeys = allKeys
            .filter(function (key) {
                return key.startsWith('chunk_');
            })
            .sort(function (keyA, keyB) {
                return parseInt(keyA.split('_')[1], 10) - parseInt(keyB.split('_')[1], 10);
            });
    } catch (keyError) {
        console.error('[persist] 获取 ' + storeName + ' 键列表失败:', keyError);
        return [];
    }

    if (!meta && chunkKeys.length === 0) {
        return [];
    }

    let result = [];
    let decryptFailCount = 0;

    for (let index = 0; index < chunkKeys.length; index++) {
        const chunkKey = chunkKeys[index];
        const chunk = await secureGetItem(storeName, chunkKey, null);
        if (Array.isArray(chunk)) {
            result = result.concat(chunk);
        } else if (chunk === null || chunk === undefined) {
            decryptFailCount++;
            console.error('[persist] 分片加载失败（可能解密错误）: ' + storeName + '/' + chunkKey);
        } else {
            decryptFailCount++;
            console.error(
                '[persist] 分片数据格式无效（期望数组，实际 ' + typeof chunk + '）: ' +
                storeName + '/' + chunkKey
            );
        }
    }

    if (decryptFailCount > 0) {
        console.warn(
            '[persist] ' + storeName + ' 库有 ' + decryptFailCount + ' 个分片未能加载，数据可能不完整。'
        );
        markCorrupted();
    }

    if (result.length === 0 && chunkKeys.length > 0) {
        console.error(
            '[persist] 严重警告：' + storeName + ' 所有分片解密均失败，可能密钥不匹配。'
        );
        markCorrupted();
    }

    // 更新 meta（仅在数据完整时）
    if (!isCorrupted() && decryptFailCount === 0) {
        try {
            if (meta && result.length !== meta.total) {
                await secureSetItem(storeName, 'meta', {
                    chunkCount: chunkKeys.length,
                    total: result.length,
                });
                console.log(
                    '[persist] ' + storeName + ' 元数据已更新：' + meta.total + ' → ' + result.length
                );
            } else if (!meta && result.length > 0) {
                await secureSetItem(storeName, 'meta', {
                    chunkCount: chunkKeys.length,
                    total: result.length,
                });
                console.log('[persist] ' + storeName + ' 元数据已创建：' + result.length + ' 条');
            }
        } catch (metaError) {
            console.warn('[persist] 更新 ' + storeName + ' 元数据失败:', metaError);
        }
    }

    // 重建缓存
    const chunks = [];
    for (let index = 0; index < result.length; index += CHUNK_SIZE) {
        chunks.push(result.slice(index, index + CHUNK_SIZE));
    }
    chunkCache[storeName] = chunks;

    return result;
}

// ==================== 单键读写 ====================

/**
 * 加密写入单个键
 * @param {string} storeName
 * @param {string} key
 * @param {*} value
 * @returns {Promise<void>}
 */
export async function secureSetItem(storeName, key, value) {
    if (isCorrupted()) {
        throw new Error('检测到数据损坏，已阻止写入操作。');
    }
    const encrypted = await encryptData(value);
    await setRawItem(storeName, key, encrypted);
}

/**
 * 解密读取单个键
 *
 * 关于非加密数据的兼容：
 *   若存储中的值不以 v3:: 开头（例如历史遗留的明文降级数据），
 *   本函数直接返回原值。这是有意为之的兼容策略，
 *   调用方应确保写入路径始终走 secureSetItem。
 *
 * 【重要契约】
 *   调用方拿到非数组值时，不得直接 concat / push 到业务数组，
 *   否则会导致字符爆炸式的数据污染。
 *   （loadChunkedData 已按此契约实现。）
 *
 * @param {string} storeName
 * @param {string} key
 * @param {*} [defaultValue=null]
 * @returns {Promise<*>}
 */
export async function secureGetItem(storeName, key, defaultValue) {
    const effectiveDefault = defaultValue === undefined ? null : defaultValue;
    const encryptedData = await getRawItem(storeName, key);
    if (!encryptedData) return effectiveDefault;
    if (typeof encryptedData !== 'string' || !encryptedData.startsWith(ENCRYPTION_PREFIX)) {
        // 非加密数据：直接返回（兼容明文降级场景）
        return encryptedData;
    }
    try {
        return await decryptData(encryptedData);
    } catch (decryptionError) {
        console.error(
            '[persist] [解密失败] 存储:' + storeName + ', 键:' + key + ', 错误:' + decryptionError.message
        );
        return effectiveDefault;
    }
}

/**
 * 删除指定键
 * @param {string} storeName
 * @param {string} key
 * @returns {Promise<void>}
 */
export async function secureRemoveItem(storeName, key) {
    await removeRawItem(storeName, key);
}

// ==================== 密文备份 / 恢复 ====================
// S5 修复：把原本分散在 auth.js 与 corruption.js 的实现统一到这里。
// 备份/恢复只操作原始密文，不解密，因此对损坏数据同样安全。

/**
 * 将指定存储的所有正式键（非 backup_ 前缀）备份到 backup_ 前缀键
 * @param {string} storeName
 * @returns {Promise<{backedUpCount: number, failedKeys: string[]}>}
 */
export async function backupStore(storeName) {
    const keys = await getKeys(storeName);
    const formalKeys = keys.filter(function (key) {
        return !key.startsWith(BACKUP_KEY_PREFIX);
    });
    let backedUpCount = 0;
    const failedKeys = [];

    for (let index = 0; index < formalKeys.length; index++) {
        const key = formalKeys[index];
        try {
            const rawValue = await getRawItem(storeName, key);
            if (rawValue !== null) {
                await setRawItem(storeName, BACKUP_KEY_PREFIX + key, rawValue);
                backedUpCount++;
            }
        } catch (backupError) {
            failedKeys.push(key);
            console.warn('[persist] 备份 ' + storeName + '/' + key + ' 失败:', backupError);
        }
    }

    return {
        backedUpCount: backedUpCount,
        failedKeys: failedKeys,
    };
}

/**
 * 从 backup_ 前缀键恢复指定存储
 * 恢复流程：
 *   1. 读取所有 backup_ 键的原始值到内存
 *   2. 删除所有正式键
 *   3. 将备份值写回原键
 *   4. 删除所有 backup_ 键
 * 任一环节失败都不中断，失败键记录在 failedKeys 中。
 * @param {string} storeName
 * @returns {Promise<{restoredCount: number, failedKeys: string[]}>}
 */
export async function restoreStore(storeName) {
    const keys = await getKeys(storeName);
    const backupKeys = keys.filter(function (key) {
        return key.startsWith(BACKUP_KEY_PREFIX);
    });
    const formalKeys = keys.filter(function (key) {
        return !key.startsWith(BACKUP_KEY_PREFIX);
    });
    const failedKeys = [];

    // 第一步：把所有备份值读进内存
    const backupValues = new Map();
    for (let index = 0; index < backupKeys.length; index++) {
        const backupKey = backupKeys[index];
        try {
            const value = await getRawItem(storeName, backupKey);
            if (value !== null) {
                backupValues.set(backupKey, value);
            } else {
                failedKeys.push(backupKey);
            }
        } catch (readError) {
            failedKeys.push(backupKey);
        }
    }

    // 第二步：删除所有正式键
    for (let index = 0; index < formalKeys.length; index++) {
        try {
            await removeRawItem(storeName, formalKeys[index]);
        } catch (removeError) {
            failedKeys.push(formalKeys[index]);
        }
    }

    // 第三步：将备份值写回原键
    let restoredCount = 0;
    const entries = Array.from(backupValues.entries());
    for (let index = 0; index < entries.length; index++) {
        const backupKey = entries[index][0];
        const value = entries[index][1];
        const originalKey = backupKey.substring(BACKUP_KEY_PREFIX.length);
        try {
            await setRawItem(storeName, originalKey, value);
            restoredCount++;
        } catch (writeError) {
            failedKeys.push(originalKey);
        }
    }

    // 第四步：清理备份键
    for (let index = 0; index < backupKeys.length; index++) {
        try {
            await removeRawItem(storeName, backupKeys[index]);
        } catch (removeError) {
            console.warn('[persist] 清理备份键失败:', removeError);
        }
    }

    return {
        restoredCount: restoredCount,
        failedKeys: failedKeys,
    };
}

/**
 * 清理指定存储中所有 backup_ 前缀的残留键
 * @param {string} storeName
 * @returns {Promise<number>}  清理的键数量
 */
export async function cleanupBackupKeys(storeName) {
    let cleanedCount = 0;
    try {
        const keys = await getKeys(storeName);
        for (let index = 0; index < keys.length; index++) {
            if (keys[index].startsWith(BACKUP_KEY_PREFIX)) {
                await removeRawItem(storeName, keys[index]);
                cleanedCount++;
            }
        }
    } catch (cleanupError) {
        console.warn('[persist] 清理 ' + storeName + ' 备份键失败:', cleanupError);
    }
    return cleanedCount;
}

// ==================== 缓存管理 ====================

/**
 * 清除分片缓存（用于密码变更等场景）
 */
export function clearChunkCache() {
    chunkCache.en = null;
    chunkCache.zh = null;
}

/**
 * 获取分片缓存快照（用于调试）
 * @returns {Object}
 */
export function getChunkCacheSnapshot() {
    return {
        en: chunkCache.en,
        zh: chunkCache.zh,
    };
}