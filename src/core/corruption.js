// filename: src/core/corruption.js
// 船舶物料申请系统 · 数据损坏检测与处理
// 负责：损坏状态管理、写操作阻塞、标志持久化
//
// 【重要】损坏标志持久化到 localStorage，避免"刷新页面绕过保护"
//
// 【m-36 修复】resetAllData 现在无论 IndexedDB 删除是否成功，
//   都会继续清理 localStorage 相关键。
//
// 【本轮修改】
//   清理清单新增 STORAGE_KEY_PRESET_INJECTED：
//     系统重置后，允许下次启动重新从 src/preset.js 注入预设物料库。

import {
    dropDatabase,
} from './repository.js';
import {
    STORAGE_KEY_META,
    STORAGE_KEY_AUDIT_LOGS,
    STORAGE_KEY_SETTINGS,
    STORAGE_KEY_CORRUPTION_FLAG,
    STORAGE_KEY_FAILED_ATTEMPTS,
    STORAGE_KEY_LOGIN_LOCKOUT_UNTIL,
    STORAGE_KEY_REQ_COLUMN_WIDTHS,
    STORAGE_KEY_MATERIAL_COLUMN_WIDTHS,
    STORAGE_KEY_ACTIVE_TAB,
    STORAGE_KEY_CURRENT_LANG,
    STORAGE_KEY_REQ_SORT_FIELD,
    STORAGE_KEY_REQ_SORT_ASC,
    STORAGE_KEY_REQ_DEFAULT_ORDER,
    STORAGE_KEY_REQ_SEARCH_KEYWORD,
    STORAGE_KEY_REQ_SEARCH_FIELD,
    STORAGE_KEY_MATERIAL_SEARCH_KEYWORD,
    STORAGE_KEY_MATERIAL_SEARCH_FIELD,
    STORAGE_KEY_MATERIAL_PAGE_SIZE,
    STORAGE_KEY_MATERIAL_CURRENT_PAGE,
    STORAGE_KEY_QUICK_SEARCH_KEYWORD,
    STORAGE_KEY_QUICK_SEARCH_FIELD,
    STORAGE_KEY_LAST_VIEWED_REQ_NO,
    STORAGE_KEY_PRESET_INJECTED,
} from '../constants.js';

/**
 * 从 localStorage 读取损坏标志
 * @returns {boolean}
 */
function readPersistedCorruptionFlag() {
    try {
        return localStorage.getItem(STORAGE_KEY_CORRUPTION_FLAG) === '1';
    } catch (readError) {
        console.warn('[corruption] 读取损坏标志失败:', readError);
        return false;
    }
}

/**
 * 将损坏标志写入 localStorage
 * @param {boolean} flag
 */
function persistCorruptionFlag(flag) {
    try {
        if (flag) {
            localStorage.setItem(STORAGE_KEY_CORRUPTION_FLAG, '1');
        } else {
            localStorage.removeItem(STORAGE_KEY_CORRUPTION_FLAG);
        }
    } catch (writeError) {
        console.warn('[corruption] 写入损坏标志失败:', writeError);
    }
}

// 损坏标志：true 时所有写操作都会被阻塞
// 启动时从 localStorage 恢复，避免刷新页面丢失
let corruptionDetected = readPersistedCorruptionFlag();

/**
 * 查询当前是否处于损坏状态
 * @returns {boolean}
 */
export function isCorrupted() {
    return corruptionDetected;
}

/**
 * 标记数据已损坏（同时持久化，避免刷新绕过）
 */
export function markCorrupted() {
    if (corruptionDetected) return;
    corruptionDetected = true;
    persistCorruptionFlag(true);
    console.error('[corruption] 数据损坏标志已置位，写操作已被阻塞。');
}

/**
 * 清除损坏标志
 */
export function clearCorrupted() {
    if (!corruptionDetected) return;
    corruptionDetected = false;
    persistCorruptionFlag(false);
    console.log('[corruption] 数据损坏标志已清除，写操作已恢复。');
}

/**
 * 断言当前未损坏
 * @param {string} operationName
 */
export function assertNotCorrupted(operationName) {
    if (corruptionDetected) {
        throw new Error(
            '检测到数据损坏，已阻止操作：' + operationName +
            '。请先导出备份或重置系统。'
        );
    }
}

/**
 * 完全重置系统
 * 清空 IndexedDB + localStorage 中的所有相关数据
 *
 * 【m-36 修复】即使 dropDatabase 抛异常，也继续清理 localStorage。
 * 【本轮修改】清理清单新增 STORAGE_KEY_PRESET_INJECTED：
 *   系统重置后，下次启动允许重新注入预设物料库。
 * @returns {Promise<void>}
 */
export async function resetAllData() {
    // 1. 尝试删除 IndexedDB 数据库（异常不阻塞后续清理）
    try {
        await dropDatabase();
    } catch (dropError) {
        console.error('[corruption] 删除 IndexedDB 数据库失败，继续清理 localStorage:', dropError);
    }

    // 2. 清除 localStorage 相关键
    const keysToRemove = [
        STORAGE_KEY_META,
        STORAGE_KEY_AUDIT_LOGS,
        STORAGE_KEY_SETTINGS,
        STORAGE_KEY_CORRUPTION_FLAG,
        STORAGE_KEY_FAILED_ATTEMPTS,
        STORAGE_KEY_LOGIN_LOCKOUT_UNTIL,
        STORAGE_KEY_REQ_COLUMN_WIDTHS,
        STORAGE_KEY_MATERIAL_COLUMN_WIDTHS,
        STORAGE_KEY_ACTIVE_TAB,
        STORAGE_KEY_CURRENT_LANG,
        STORAGE_KEY_REQ_SORT_FIELD,
        STORAGE_KEY_REQ_SORT_ASC,
        STORAGE_KEY_REQ_DEFAULT_ORDER,
        STORAGE_KEY_REQ_SEARCH_KEYWORD,
        STORAGE_KEY_REQ_SEARCH_FIELD,
        STORAGE_KEY_MATERIAL_SEARCH_KEYWORD,
        STORAGE_KEY_MATERIAL_SEARCH_FIELD,
        STORAGE_KEY_MATERIAL_PAGE_SIZE,
        STORAGE_KEY_MATERIAL_CURRENT_PAGE,
        STORAGE_KEY_QUICK_SEARCH_KEYWORD,
        STORAGE_KEY_QUICK_SEARCH_FIELD,
        STORAGE_KEY_LAST_VIEWED_REQ_NO,
        STORAGE_KEY_PRESET_INJECTED,
    ];
    for (let index = 0; index < keysToRemove.length; index++) {
        try {
            localStorage.removeItem(keysToRemove[index]);
        } catch (removeError) {
            console.warn('[corruption] 清理 localStorage 键失败: ' + keysToRemove[index], removeError);
        }
    }

    // 3. 清除内存标志（持久化标志已在上面被 removeItem 删除）
    corruptionDetected = false;
}