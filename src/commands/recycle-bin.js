// filename: src/commands/recycle-bin.js
// 船舶物料申请系统 · 回收站命令
// 全部为纯函数，输入旧 Vault，输出新 Vault，绝不修改入参
//
// 【约定】
//   - restoreMaterialFromRecycleBin：冲突时返回原 vault
//   - restoreMaterialsFromRecycleBin：全部冲突时返回原 vault；部分冲突时恢复可恢复项
//   - purgeMaterialFromRecycleBin / purgeMaterialsFromRecycleBin：未找到时返回原 vault
//   - clearRecycleBin：已空时返回原 vault
//   - cleanupExpiredRecycleBinItems：无变化时返回原 vault
//
// 【与 M-new-1 的关系】
//   applyImportedBackup 合并回收站后交由 normalizeVault 排序，
//   而排序语义的权威实现在 vault.js 的 normalizeRecycleBin。
//   本模块的 deleteMaterial（material-crud.js）与
//   cleanupExpiredRecycleBinItems 共同保证运行期的"头部插入 + 降序"契约。

import {
    MAX_RECYCLE_BIN_SIZE,
    RECYCLE_BIN_RETENTION_DAYS,
} from '../constants.js';

// 一天的毫秒数（用于过期计算）
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * 从回收站恢复单条物料
 * 恢复策略：
 *   - 使用回收站条目中的 language 字段确定目标语言库
 *   - 若目标库中已存在同 IMPA 的物料 → 跳过（命令被拒）
 * @param {Object} vault
 * @param {{recycleBinItemId: string}} payload
 * @returns {Object}
 */
export function restoreMaterialFromRecycleBin(vault, payload) {
    const recycleBinItemId = payload.recycleBinItemId;
    if (!recycleBinItemId) return vault;

    let targetItem = null;
    for (let index = 0; index < vault.recycleBin.length; index++) {
        if (vault.recycleBin[index].id === recycleBinItemId) {
            targetItem = vault.recycleBin[index];
            break;
        }
    }
    if (!targetItem) return vault;

    const language = targetItem.language === 'en' ? 'en' : 'zh';
    const targetArray = language === 'en' ? vault.materialsEn : vault.materialsZh;

    // 冲突检查：目标库中已有同 IMPA
    for (let index = 0; index < targetArray.length; index++) {
        if (targetArray[index].impa === targetItem.material.impa) {
            return vault;
        }
    }

    const nextArray = targetArray.concat([targetItem.material]);
    const nextRecycleBin = vault.recycleBin.filter(function (item) {
        return item.id !== recycleBinItemId;
    });

    return {
        materialsEn: language === 'en' ? nextArray : vault.materialsEn,
        materialsZh: language === 'zh' ? nextArray : vault.materialsZh,
        currentApplication: vault.currentApplication,
        recycleBin: nextRecycleBin,
        ui: vault.ui,
        settings: vault.settings,
        meta: vault.meta,
    };
}

/**
 * 批量恢复
 * 冲突的条目保留在回收站，不静默丢弃
 * @param {Object} vault
 * @param {{recycleBinItemIds: string[]}} payload
 * @returns {Object}
 */
export function restoreMaterialsFromRecycleBin(vault, payload) {
    const idSet = new Set(payload.recycleBinItemIds || []);
    if (idSet.size === 0) return vault;

    // 按语言分组恢复
    const nextEn = vault.materialsEn.slice();
    const nextZh = vault.materialsZh.slice();
    const existingEnImpa = new Set();
    const existingZhImpa = new Set();

    for (let index = 0; index < nextEn.length; index++) {
        existingEnImpa.add(nextEn[index].impa);
    }
    for (let index = 0; index < nextZh.length; index++) {
        existingZhImpa.add(nextZh[index].impa);
    }

    const newRecycleBin = [];
    let restoredCount = 0;

    for (let index = 0; index < vault.recycleBin.length; index++) {
        const item = vault.recycleBin[index];
        if (!idSet.has(item.id)) {
            newRecycleBin.push(item);
            continue;
        }

        const language = item.language === 'en' ? 'en' : 'zh';
        const existingSet = language === 'en' ? existingEnImpa : existingZhImpa;

        if (existingSet.has(item.material.impa)) {
            // 冲突：保留在回收站
            newRecycleBin.push(item);
            continue;
        }

        if (language === 'en') {
            nextEn.push(item.material);
            existingEnImpa.add(item.material.impa);
        } else {
            nextZh.push(item.material);
            existingZhImpa.add(item.material.impa);
        }
        restoredCount++;
    }

    if (restoredCount === 0) return vault;

    return {
        materialsEn: nextEn,
        materialsZh: nextZh,
        currentApplication: vault.currentApplication,
        recycleBin: newRecycleBin,
        ui: vault.ui,
        settings: vault.settings,
        meta: vault.meta,
    };
}

/**
 * 从回收站彻底删除单条
 * @param {Object} vault
 * @param {{recycleBinItemId: string}} payload
 * @returns {Object}
 */
export function purgeMaterialFromRecycleBin(vault, payload) {
    const recycleBinItemId = payload.recycleBinItemId;
    if (!recycleBinItemId) return vault;

    const newRecycleBin = vault.recycleBin.filter(function (item) {
        return item.id !== recycleBinItemId;
    });
    if (newRecycleBin.length === vault.recycleBin.length) return vault;

    return {
        materialsEn: vault.materialsEn,
        materialsZh: vault.materialsZh,
        currentApplication: vault.currentApplication,
        recycleBin: newRecycleBin,
        ui: vault.ui,
        settings: vault.settings,
        meta: vault.meta,
    };
}

/**
 * 从回收站批量彻底删除
 * @param {Object} vault
 * @param {{recycleBinItemIds: string[]}} payload
 * @returns {Object}
 */
export function purgeMaterialsFromRecycleBin(vault, payload) {
    const idSet = new Set(payload.recycleBinItemIds || []);
    if (idSet.size === 0) return vault;

    const newRecycleBin = vault.recycleBin.filter(function (item) {
        return !idSet.has(item.id);
    });
    if (newRecycleBin.length === vault.recycleBin.length) return vault;

    return {
        materialsEn: vault.materialsEn,
        materialsZh: vault.materialsZh,
        currentApplication: vault.currentApplication,
        recycleBin: newRecycleBin,
        ui: vault.ui,
        settings: vault.settings,
        meta: vault.meta,
    };
}

/**
 * 清空回收站
 * @param {Object} vault
 * @returns {Object}
 */
export function clearRecycleBin(vault) {
    if (!Array.isArray(vault.recycleBin) || vault.recycleBin.length === 0) return vault;

    return {
        materialsEn: vault.materialsEn,
        materialsZh: vault.materialsZh,
        currentApplication: vault.currentApplication,
        recycleBin: [],
        ui: vault.ui,
        settings: vault.settings,
        meta: vault.meta,
    };
}

/**
 * 清理回收站中超过保留期的条目
 *
 * 【说明】normalizeRecycleBinItem 保证 deletedAt > 0，
 * 因此本函数的 deletedAt === 0 分支实际不可达；
 * 保留该分支是为未来数据格式兼容（防御性编程）。
 *
 * @param {Object} vault
 * @param {{now?: number}} [payload]
 * @returns {Object}
 */
export function cleanupExpiredRecycleBinItems(vault, payload) {
    if (!Array.isArray(vault.recycleBin) || vault.recycleBin.length === 0) return vault;
    const now = (payload && typeof payload.now === 'number' && Number.isFinite(payload.now))
        ? payload.now
        : Date.now();
    const cutoffTimestamp = now - RECYCLE_BIN_RETENTION_DAYS * MILLISECONDS_PER_DAY;

    const filtered = vault.recycleBin.filter(function (item) {
        // 无有效时间戳：永久保留（防御性分支）
        if (item.deletedAt === 0) return true;
        return item.deletedAt >= cutoffTimestamp;
    });

    if (filtered.length === vault.recycleBin.length) return vault;

    return {
        materialsEn: vault.materialsEn,
        materialsZh: vault.materialsZh,
        currentApplication: vault.currentApplication,
        recycleBin: filtered,
        ui: vault.ui,
        settings: vault.settings,
        meta: vault.meta,
    };
}