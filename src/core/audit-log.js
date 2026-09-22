// filename: src/core/audit-log.js
// 船舶物料申请系统 · 审计日志
// 负责：操作日志记录、IndexedDB 加密存储、localStorage 备份、导出
//
// 【m-43 修复保持】localStorage 备份写入合并：
//   使用 isLocalStorageBackupInProgress + pendingLocalStorageBackup 标志，
//   N 次连续 addLog 最多 2 次 localStorage 写入，且不丢失数据。
//
// 【与 persist.js 的契约】
//   本模块依赖 persist.js 的以下导出：
//     secureSetItem / secureGetItem / secureRemoveItem
//   persist.js 恢复完整实现后，所有契约自动满足。

import {
    MAX_AUDIT_LOG_COUNT,
    LOCALSTORAGE_LOG_COUNT,
    LOG_SAVE_DEBOUNCE_MS,
    STORAGE_KEY_AUDIT_LOGS,
} from '../constants.js';
import {
    secureSetItem,
    secureGetItem,
    secureRemoveItem,
} from './persist.js';
import {
    encryptData,
    decryptData,
    isKeyCached,
} from './crypto.js';

// 内存中的日志数组（最新在前）
let operationLogs = [];

// 日志保存防抖定时器
let logSaveDebounceTimer = null;

// localStorage 备份写入状态（m-43）
let isLocalStorageBackupInProgress = false;
let pendingLocalStorageBackup = false;

/**
 * 添加一条日志
 * @param {string} action    操作名称
 * @param {string} [details] 详情（可选）
 */
export function addLog(action, details) {
    const logEntry = {
        timestamp: new Date().toISOString(),
        action: action,
        details: details || '',
    };
    operationLogs.unshift(logEntry);

    if (operationLogs.length > MAX_AUDIT_LOG_COUNT) {
        operationLogs.pop();
    }

    if (logSaveDebounceTimer) {
        clearTimeout(logSaveDebounceTimer);
    }
    logSaveDebounceTimer = setTimeout(function () {
        logSaveDebounceTimer = null;
        saveLogsToIndexedDB();
    }, LOG_SAVE_DEBOUNCE_MS);

    if (isKeyCached()) {
        scheduleLocalStorageBackup();
    }
}

/**
 * 将内存日志保存到 IndexedDB
 * @returns {Promise<void>}
 */
export async function saveLogsToIndexedDB() {
    if (!isKeyCached()) return;
    try {
        const logsToSave = operationLogs.slice(0, MAX_AUDIT_LOG_COUNT);
        await secureSetItem('logs', 'full_logs', logsToSave);
    } catch (saveError) {
        console.warn('[audit-log] 日志写入 IndexedDB 失败', saveError);
    }
}

/**
 * 调度 localStorage 备份（m-43）
 *
 * 合并策略：
 *   - 若已有写入进行中，仅设置 pending 标志
 *   - 写入完成时若 pending 为 true，再触发一次
 *   - 单次写入始终写入"当前最新"的日志数组，
 *     因此不会丢失数据（合并的是写入次数，不是数据版本）
 */
function scheduleLocalStorageBackup() {
    if (isLocalStorageBackupInProgress) {
        pendingLocalStorageBackup = true;
        return;
    }
    isLocalStorageBackupInProgress = true;
    (async function () {
        try {
            const logsToBackup = operationLogs.slice(0, LOCALSTORAGE_LOG_COUNT);
            const encrypted = await encryptData(logsToBackup);
            localStorage.setItem(STORAGE_KEY_AUDIT_LOGS, encrypted);
        } catch (backupError) {
            console.warn('[audit-log] 日志写入 localStorage 备份失败', backupError);
        } finally {
            isLocalStorageBackupInProgress = false;
            if (pendingLocalStorageBackup) {
                pendingLocalStorageBackup = false;
                scheduleLocalStorageBackup();
            }
        }
    })();
}

/**
 * 从 IndexedDB 加载日志到内存
 * @returns {Promise<void>}
 */
export async function loadLogsFromIndexedDB() {
    if (!isKeyCached()) return;
    try {
        const encryptedLogs = await secureGetItem('logs', 'full_logs', null);
        if (Array.isArray(encryptedLogs)) {
            operationLogs = encryptedLogs;
            return;
        }
        // 回退：尝试从 localStorage 备份读取
        const fallback = localStorage.getItem(STORAGE_KEY_AUDIT_LOGS);
        if (fallback) {
            const decrypted = await decryptData(fallback);
            if (Array.isArray(decrypted)) {
                operationLogs = decrypted;
            }
        }
    } catch (loadError) {
        console.warn('[audit-log] 日志加载异常', loadError);
        operationLogs = [];
    }
}

/**
 * 获取当前内存中的日志副本
 * @returns {Array}
 */
export function getOperationLogs() {
    return operationLogs.slice();
}

/**
 * 获取日志总数
 * @returns {number}
 */
export function getLogCount() {
    return operationLogs.length;
}

/**
 * 格式化日志为文本（用于导出）
 * @returns {string}
 */
export function formatLogsAsText() {
    const lines = [];
    for (let index = 0; index < operationLogs.length; index++) {
        const log = operationLogs[index];
        lines.push(log.timestamp + ' | ' + log.action + ' | ' + log.details);
    }
    return lines.join('\n');
}

/**
 * 清空所有日志
 * 同时清空 IndexedDB 中的 full_logs 键，避免下次加载恢复
 * @returns {Promise<void>}
 */
export async function clearLogs() {
    operationLogs = [];
    if (logSaveDebounceTimer) {
        clearTimeout(logSaveDebounceTimer);
        logSaveDebounceTimer = null;
    }
    // 重置 localStorage 备份状态，避免 pending 标志遗留
    isLocalStorageBackupInProgress = false;
    pendingLocalStorageBackup = false;
    try {
        localStorage.removeItem(STORAGE_KEY_AUDIT_LOGS);
    } catch (localStorageError) {
        console.warn('[audit-log] 清空 localStorage 备份失败', localStorageError);
    }
    try {
        await secureRemoveItem('logs', 'full_logs');
    } catch (idbError) {
        console.warn('[audit-log] 清空 IndexedDB 日志失败', idbError);
    }
}

/**
 * 强制立即保存（用于 beforeunload）
 *
 * 【使用注意】调用方必须在调用本函数之前完成所有 addLog 调用，
 * 否则新日志会进入未触发的防抖定时器而丢失。
 *
 * @returns {Promise<void>}
 */
export async function flushLogs() {
    if (logSaveDebounceTimer) {
        clearTimeout(logSaveDebounceTimer);
        logSaveDebounceTimer = null;
    }
    await saveLogsToIndexedDB();
}