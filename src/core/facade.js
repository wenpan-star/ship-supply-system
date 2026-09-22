// filename: src/core/facade.js
// 船舶物料申请系统 · 状态协调门面
// 整个应用唯一的状态入口/出口
//
// 【S1 / P2-15 修复保持】
//   - dispatch 与 replaceVault 把"上一版 Vault"传入持久化层，
//     用于识别申请单重命名并清理旧键
//   - replaceVault 尊重调用方传入的 affects 参数
//
// 【m-8 说明】
//   scheduleDebouncedPersist 的 slicesToDebounce 保持不含 meta。
//   理由：vault.meta 是纯内存快照（唯一字段 dataCorruptionDetected），
//   权威损坏状态由 core/corruption.js 的模块级状态 + localStorage 维护。
//   meta 变更不需要写入 IndexedDB，因此也不应被 debounced 调度。
//   persistVaultByAffects 因此没有 meta 分支，这是有意为之。
//
// 【与 persist.js 的契约】
//   - 只调用 saveChunkedData / secureSetItem
//   - 只通过 repository.js 的 removeRawItem 清理旧键
//   persist.js 恢复完整实现后，本模块的所有契约自动满足。

import {
    saveChunkedData,
    secureSetItem,
} from './persist.js';
import {
    removeRawItem,
} from './repository.js';
import {
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
    STORAGE_KEY_REQ_COLUMN_WIDTHS,
    STORAGE_KEY_MATERIAL_COLUMN_WIDTHS,
    STORAGE_KEY_SETTINGS,
} from '../constants.js';

// ==================== 切片名单 ====================
const VALID_SLICE_NAMES = ['materials', 'application', 'recycleBin', 'ui', 'settings', 'meta'];
const DEFAULT_REPLACE_SLICES = ['materials', 'application', 'recycleBin', 'ui', 'settings', 'meta'];

// ==================== 模块级状态 ====================
let currentVault = null;
const commandRegistry = new Map();
const subscribersBySlice = new Map();

const debounceTimers = {
    materials: null,
    application: null,
    recycleBin: null,
    ui: null,
    settings: null,
};

// ==================== 命令注册 ====================

function normalizeAffects(commandName, rawAffects) {
    if (!Array.isArray(rawAffects)) return [];
    const seenSlices = new Set();
    const normalizedAffects = [];
    for (let index = 0; index < rawAffects.length; index++) {
        const sliceName = rawAffects[index];
        if (typeof sliceName !== 'string') {
            console.warn(
                '[facade] 命令 "' + commandName + '" 的 affects[' + index +
                '] 不是字符串（实际为 ' + typeof sliceName + '），已忽略'
            );
            continue;
        }
        if (VALID_SLICE_NAMES.indexOf(sliceName) === -1) {
            console.warn(
                '[facade] 命令 "' + commandName + '" 的 affects[' + index +
                '] 使用了未知切片 "' + sliceName + '"，已忽略。合法切片：' +
                VALID_SLICE_NAMES.join(' / ')
            );
            continue;
        }
        if (seenSlices.has(sliceName)) continue;
        seenSlices.add(sliceName);
        normalizedAffects.push(sliceName);
    }
    return normalizedAffects;
}

export function registerCommand(name, definition) {
    if (typeof definition.run !== 'function') {
        throw new Error('[facade] 命令 "' + name + '" 缺少 run 函数');
    }
    const rawPersistMode = definition.persistMode || 'immediate';
    const validModes = ['immediate', 'debounced', 'skip'];
    let effectivePersistMode = rawPersistMode;
    if (validModes.indexOf(rawPersistMode) === -1) {
        console.warn(
            '[facade] 命令 "' + name + '" 使用了未知 persistMode "' +
            rawPersistMode + '"，回退为 immediate'
        );
        effectivePersistMode = 'immediate';
    }
    const normalizedAffects = normalizeAffects(name, definition.affects);
    commandRegistry.set(name, {
        run: definition.run,
        affects: normalizedAffects,
        persistMode: effectivePersistMode,
    });
}

export function registerCommands(map) {
    const names = Object.keys(map);
    for (let index = 0; index < names.length; index++) {
        registerCommand(names[index], map[names[index]]);
    }
}

// ==================== 只读访问 ====================

export function query(queryFunction) {
    if (!currentVault) {
        console.warn('[facade] Vault 尚未初始化');
        return undefined;
    }
    return queryFunction(currentVault);
}

export function getVaultSnapshot() {
    return currentVault;
}

export function setVault(vault) {
    currentVault = vault;
}

// ==================== 持久化 ====================

function persistUiToLocalStorage(ui) {
    try {
        localStorage.setItem(STORAGE_KEY_ACTIVE_TAB, ui.activeTab);
        localStorage.setItem(STORAGE_KEY_CURRENT_LANG, ui.currentLang);
        localStorage.setItem(STORAGE_KEY_REQ_SORT_FIELD, ui.reqSortField || '');
        localStorage.setItem(STORAGE_KEY_REQ_SORT_ASC, String(ui.reqSortAsc));
        localStorage.setItem(STORAGE_KEY_REQ_DEFAULT_ORDER, ui.reqDefaultOrder);
        localStorage.setItem(STORAGE_KEY_REQ_SEARCH_KEYWORD, ui.reqFilterKeyword || '');
        localStorage.setItem(STORAGE_KEY_REQ_SEARCH_FIELD, ui.reqSearchField || 'all');
        localStorage.setItem(STORAGE_KEY_MATERIAL_SEARCH_KEYWORD, ui.materialSearchKeyword || '');
        localStorage.setItem(STORAGE_KEY_MATERIAL_SEARCH_FIELD, ui.materialSearchField || 'all');
        localStorage.setItem(STORAGE_KEY_MATERIAL_PAGE_SIZE, String(ui.materialPageSize));
        localStorage.setItem(STORAGE_KEY_MATERIAL_CURRENT_PAGE, String(ui.materialCurrentPage));
        localStorage.setItem(STORAGE_KEY_QUICK_SEARCH_KEYWORD, ui.quickSearchKeyword || '');
        localStorage.setItem(STORAGE_KEY_QUICK_SEARCH_FIELD, ui.quickSearchField || 'all');
        localStorage.setItem(STORAGE_KEY_REQ_COLUMN_WIDTHS, JSON.stringify(ui.reqColumnWidths));
        localStorage.setItem(STORAGE_KEY_MATERIAL_COLUMN_WIDTHS, JSON.stringify(ui.materialColumnWidths));
    } catch (storageError) {
        console.warn('[facade] UI 状态写入 localStorage 失败:', storageError);
    }
}

function persistSettingsToLocalStorage(settings) {
    try {
        localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(settings));
    } catch (storageError) {
        console.warn('[facade] 设置写入 localStorage 失败:', storageError);
    }
}

/**
 * 按切片持久化 Vault
 *
 * 【S1 修复】重命名申请单时先删除旧键：
 *   比较 previousVault 与 vault 的 currentApplication.reqNo，
 *   若发生变化，先 removeRawItem('app', previousReqNo) 再写新键。
 *
 * 【m-8 说明】本函数不处理 'meta' 切片。
 *   vault.meta 是纯内存快照；权威损坏状态由 corruption.js 管理。
 *   registry.js 中 meta 相关命令（markCorrupted / clearCorruptedFlag）
 *   目前仅用于测试与未来可能的视图层纯函数渲染，不影响持久化层。
 *
 * @param {Object} vault         新 Vault
 * @param {Object|null} previousVault  旧 Vault（可为 null）
 * @param {string[]} affects     受影响的切片
 * @returns {Promise<void>}
 */
async function persistVaultByAffects(vault, previousVault, affects) {
    const affectsSet = new Set(affects);

    if (affectsSet.has('materials')) {
        await saveChunkedData('en', vault.materialsEn);
        await saveChunkedData('zh', vault.materialsZh);
    }

    if (affectsSet.has('application')) {
        const application = vault.currentApplication;
        const previousApplication = previousVault ? previousVault.currentApplication : null;
        // 若申请单被重命名，先删除旧键，避免产生孤儿数据
        if (previousApplication && previousApplication.reqNo &&
            application && application.reqNo &&
            application.reqNo !== previousApplication.reqNo) {
            try {
                await removeRawItem('app', previousApplication.reqNo);
            } catch (removeError) {
                console.warn('[facade] 删除旧申请单键失败:', removeError);
            }
        }
        if (application && application.reqNo) {
            await secureSetItem('app', application.reqNo, application);
        }
    }

    if (affectsSet.has('recycleBin')) {
        await secureSetItem('app', '__recycleBin__', vault.recycleBin);
    }

    if (affectsSet.has('ui')) {
        persistUiToLocalStorage(vault.ui);
    }

    if (affectsSet.has('settings')) {
        persistSettingsToLocalStorage(vault.settings);
    }
}

/**
 * 调度防抖持久化
 *
 * 【m-8 说明】slicesToDebounce 不含 'meta'。
 *   理由见 persistVaultByAffects 头部注释。
 */
function scheduleDebouncedPersist(vault, previousVault, affects) {
    const slicesToDebounce = ['materials', 'application', 'recycleBin', 'ui', 'settings'];
    for (let index = 0; index < slicesToDebounce.length; index++) {
        const slice = slicesToDebounce[index];
        if (affects.indexOf(slice) === -1) continue;
        if (debounceTimers[slice]) {
            clearTimeout(debounceTimers[slice]);
        }
        debounceTimers[slice] = setTimeout(function () {
            debounceTimers[slice] = null;
            const latestVault = currentVault;
            if (!latestVault) return;
            persistVaultByAffects(latestVault, previousVault, [slice]).catch(function (error) {
                console.error('[facade] 防抖持久化失败 (' + slice + '):', error);
            });
        }, 400);
    }
}

// ==================== 命令派发 ====================

export function dispatch(commandName, payload) {
    if (!currentVault) {
        console.warn(
            '[facade] Vault 未初始化，命令 "' + commandName + '" 被拒。'
        );
        return false;
    }

    const command = commandRegistry.get(commandName);
    if (!command) {
        console.warn('[facade] 未注册的命令: ' + commandName);
        return false;
    }

    const previousVault = currentVault;
    let nextVault;

    try {
        nextVault = command.run(currentVault, payload || {});
    } catch (commandError) {
        console.error(
            '[facade] 命令 "' + commandName + '" 执行异常:',
            commandError
        );
        return false;
    }

    if (!nextVault || nextVault === previousVault) {
        return false;
    }

    currentVault = nextVault;

    if (command.persistMode === 'debounced') {
        scheduleDebouncedPersist(currentVault, previousVault, command.affects);
    } else if (command.persistMode === 'skip') {
        // 显式不持久化
    } else {
        persistVaultByAffects(currentVault, previousVault, command.affects).catch(function (persistError) {
            console.error('[facade] 持久化失败:', persistError);
        });
    }

    notifySubscribers(command.affects);
    return true;
}

/**
 * 全量替换 Vault
 *
 * 【P2-15 修复】尊重调用方传入的 affects 参数：
 *   - 若 affects 为空/非法 → 回退到全部切片
 *   - 若 affects 有效 → 只持久化指定切片
 *
 * 【S1 支持】会把原 currentVault 作为 previousVault 传给持久化层，
 *   以便识别申请单重命名并清理旧键。
 *
 * @param {Object} nextVault
 * @param {string[]} [affects]
 */
export function replaceVault(nextVault, affects) {
    if (!nextVault || typeof nextVault !== 'object') {
        console.warn(
            '[facade] replaceVault 被拒：nextVault 必须是对象（实际为 ' +
            typeof nextVault + '）'
        );
        return;
    }

    const previousVault = currentVault;
    currentVault = nextVault;

    let effectiveAffects;
    if (!Array.isArray(affects) || affects.length === 0) {
        effectiveAffects = DEFAULT_REPLACE_SLICES.slice();
    } else {
        const normalizedAffects = normalizeAffects('replaceVault', affects);
        effectiveAffects = normalizedAffects.length > 0
            ? normalizedAffects
            : DEFAULT_REPLACE_SLICES.slice();
    }

    persistVaultByAffects(currentVault, previousVault, effectiveAffects).catch(function (persistError) {
        console.error('[facade] 持久化失败:', persistError);
    });

    notifySubscribers(effectiveAffects);
}

// ==================== 订阅 ====================

/**
 * 订阅切片变更
 *
 * 返回的清理函数目前未被调用方使用（应用生命周期与页面一致），
 * 保留以便未来支持动态卸载模块时释放订阅。
 *
 * @param {string} slice
 * @param {Function} handler
 * @returns {Function} 清理函数
 */
export function subscribe(slice, handler) {
    if (typeof handler !== 'function') {
        return function () {};
    }
    if (VALID_SLICE_NAMES.indexOf(slice) === -1) {
        console.warn(
            '[facade] subscribe 使用了未知切片 "' + slice +
            '"，该订阅永远不会被触发。合法切片：' +
            VALID_SLICE_NAMES.join(' / ')
        );
    }
    if (!subscribersBySlice.has(slice)) {
        subscribersBySlice.set(slice, new Set());
    }
    subscribersBySlice.get(slice).add(handler);
    return function () {
        const sliceSubscribers = subscribersBySlice.get(slice);
        if (sliceSubscribers) sliceSubscribers.delete(handler);
    };
}

function notifySubscribers(slices) {
    if (!Array.isArray(slices) || slices.length === 0) return;
    const notifiedHandlers = new Set();
    for (let sliceIndex = 0; sliceIndex < slices.length; sliceIndex++) {
        const handlers = subscribersBySlice.get(slices[sliceIndex]);
        if (!handlers) continue;
        handlers.forEach(function (handler) {
            if (notifiedHandlers.has(handler)) return;
            notifiedHandlers.add(handler);
            try {
                handler(currentVault);
            } catch (handlerError) {
                console.error(
                    '[facade] 订阅者异常 (slice=' + slices[sliceIndex] + '):',
                    handlerError
                );
            }
        });
    }
}