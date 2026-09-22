// filename: src/core/repository.js
// 船舶物料申请系统 · 存储仓储层
// 负责：localforage 实例管理、通用加密读写接口
// 不负责：分块逻辑（在 persist.js）、业务查询（在 vault.js）
//
// 【为什么独立于 persist.js】
//   repository.js 是"字节流 ↔ 存储介质"的抽象
//   persist.js 是"业务对象 ↔ 字节流"的分块逻辑
//   未来若换用 IndexedDB / OPFS，只需改 repository.js
//
// 【与 persist.js 的契约】
//   persist.js 通过本模块的 getRawItem / setRawItem / removeRawItem / getKeys
//   与存储介质交互，不直接访问 localforage 实例。

const DATABASE_NAME = 'IMPA_SecureDB_v96';

// localforage 实例：延迟初始化，避免模块加载时崩溃
let materialEnStore = null;
let materialZhStore = null;
let applicationStore = null;
let auditLogStore = null;
let isInitialized = false;

/**
 * 初始化所有存储实例
 * 必须在所有读写操作之前调用一次
 * @returns {boolean}  是否初始化成功
 */
export function initializeRepository() {
    if (isInitialized) return true;
    if (typeof window.localforage === 'undefined') {
        console.error('[repository] localforage 未加载，无法初始化存储');
        return false;
    }
    try {
        materialEnStore = window.localforage.createInstance({
            name: DATABASE_NAME,
            storeName: 'material_en',
        });
        materialZhStore = window.localforage.createInstance({
            name: DATABASE_NAME,
            storeName: 'material_zh',
        });
        applicationStore = window.localforage.createInstance({
            name: DATABASE_NAME,
            storeName: 'applications',
        });
        auditLogStore = window.localforage.createInstance({
            name: DATABASE_NAME,
            storeName: 'audit_logs',
        });
        isInitialized = true;
        return true;
    } catch (initializationError) {
        console.error('[repository] 初始化失败:', initializationError);
        return false;
    }
}

/**
 * 获取指定名称的存储实例
 * @param {string} storeName  'en' | 'zh' | 'app' | 'logs'
 * @returns {Object}
 */
export function getStore(storeName) {
    if (!isInitialized) {
        throw new Error('[repository] 未初始化，请先调用 initializeRepository');
    }
    if (storeName === 'en') return materialEnStore;
    if (storeName === 'zh') return materialZhStore;
    if (storeName === 'app') return applicationStore;
    if (storeName === 'logs') return auditLogStore;
    throw new Error('[repository] 未知的存储名称: ' + storeName);
}

/**
 * 读取指定键的原始值（未解密）
 * @param {string} storeName
 * @param {string} key
 * @returns {Promise<*>}  不存在时返回 null
 */
export async function getRawItem(storeName, key) {
    const store = getStore(storeName);
    const value = await store.getItem(key);
    return value === undefined ? null : value;
}

/**
 * 写入指定键的原始值（不加密）
 * @param {string} storeName
 * @param {string} key
 * @param {*} value
 * @returns {Promise<void>}
 */
export async function setRawItem(storeName, key, value) {
    const store = getStore(storeName);
    await store.setItem(key, value);
}

/**
 * 删除指定键
 * @param {string} storeName
 * @param {string} key
 * @returns {Promise<void>}
 */
export async function removeRawItem(storeName, key) {
    const store = getStore(storeName);
    await store.removeItem(key);
}

/**
 * 获取指定存储的全部键
 * @param {string} storeName
 * @returns {Promise<string[]>}
 */
export async function getKeys(storeName) {
    const store = getStore(storeName);
    return await store.keys();
}

/**
 * 清空整个数据库（用于系统重置）
 * @returns {Promise<void>}
 */
export async function dropDatabase() {
    await window.localforage.dropInstance({ name: DATABASE_NAME });
    isInitialized = false;
    materialEnStore = null;
    materialZhStore = null;
    applicationStore = null;
    auditLogStore = null;
}

/**
 * 检查仓储是否已初始化
 * @returns {boolean}
 */
export function isRepositoryInitialized() {
    return isInitialized;
}