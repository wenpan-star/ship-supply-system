// filename: src/commands/application-items.js
// 船舶物料申请系统 · 申请单物料项操作
// 全部为纯函数，输入旧 Vault，输出新 Vault，绝不修改入参
//
// 【约定】当命令被"拒绝"（重复 IMPA / 未找到目标 IMPA / 空值 /
//   非法数值）时，返回原 vault 引用。
//
// 【M-11 修复】updateItemQuantity 对非法数值改为拒绝（返回原 vault），
//   而不是静默变成 0。

import {
    MAX_IMPA_LENGTH,
    MAX_DESCRIPTION_LENGTH,
    MAX_SPECIFICATION_LENGTH,
    MAX_UNIT_LENGTH,
    MAX_REMARK_LENGTH,
} from '../constants.js';

/**
 * 替换申请单物料项数组
 * @param {Object} vault
 * @param {Object[]} nextItems
 * @returns {Object}
 */
function replaceApplicationItems(vault, nextItems) {
    return {
        materialsEn: vault.materialsEn,
        materialsZh: vault.materialsZh,
        currentApplication: {
            reqNo: vault.currentApplication.reqNo,
            applicant: vault.currentApplication.applicant,
            applyTime: vault.currentApplication.applyTime,
            items: nextItems,
        },
        recycleBin: vault.recycleBin,
        ui: vault.ui,
        settings: vault.settings,
        meta: vault.meta,
    };
}

/**
 * 添加物料项到申请单
 *
 * 拒绝场景（返回原 vault）：
 *   - payload.material 缺失或非对象
 *   - impa 为空
 *   - impa 已存在于当前申请单
 *
 * @param {Object} vault
 * @param {{material: Object, quantity?: number}} payload
 * @returns {Object}
 */
export function addItemToApplication(vault, payload) {
    if (!payload.material || typeof payload.material !== 'object') return vault;
    const impa = String(payload.material.impa || '').trim().slice(0, MAX_IMPA_LENGTH);
    if (!impa) return vault;

    const currentItems = vault.currentApplication.items;
    for (let index = 0; index < currentItems.length; index++) {
        if (currentItems[index].impa === impa) {
            return vault;
        }
    }

    let quantity = 1;
    if (payload.quantity !== undefined && payload.quantity !== null) {
        const parsedQuantity = Number(payload.quantity);
        if (Number.isFinite(parsedQuantity) && parsedQuantity >= 0) {
            quantity = parsedQuantity;
        }
    }

    const newItem = {
        impa,
        description: String(payload.material.description || '').trim().slice(0, MAX_DESCRIPTION_LENGTH),
        spec: String(payload.material.specification || '').trim().slice(0, MAX_SPECIFICATION_LENGTH),
        unit: String(payload.material.unit || '').trim().slice(0, MAX_UNIT_LENGTH),
        quantity,
        manualStock: 0,
        remark: String(payload.material.remark || '').trim().slice(0, MAX_REMARK_LENGTH),
    };

    return replaceApplicationItems(vault, currentItems.concat([newItem]));
}

/**
 * 从申请单删除单条物料项
 * @param {Object} vault
 * @param {{impa: string}} payload
 * @returns {Object}
 */
export function removeItemFromApplication(vault, payload) {
    const impa = String(payload.impa || '').trim();
    if (!impa) return vault;
    const currentItems = vault.currentApplication.items;
    const nextItems = currentItems.filter(function (item) {
        return item.impa !== impa;
    });
    if (nextItems.length === currentItems.length) return vault;
    return replaceApplicationItems(vault, nextItems);
}

/**
 * 批量删除申请单物料项
 * @param {Object} vault
 * @param {{impaList: string[]}} payload
 * @returns {Object}
 */
export function batchRemoveItemsFromApplication(vault, payload) {
    const impaList = Array.isArray(payload.impaList) ? payload.impaList : [];
    if (impaList.length === 0) return vault;
    const impaSet = new Set();
    for (let index = 0; index < impaList.length; index++) {
        impaSet.add(String(impaList[index]));
    }
    const currentItems = vault.currentApplication.items;
    const nextItems = currentItems.filter(function (item) {
        return !impaSet.has(item.impa);
    });
    if (nextItems.length === currentItems.length) return vault;
    return replaceApplicationItems(vault, nextItems);
}

/**
 * 更新单条物料项的申请数量
 *
 * 【M-11 修复】非法数值（NaN / Infinity / 负数）直接拒绝，
 *   返回原 vault。不再静默替换为 0。视图层已有 Math.max(0, ...)
 *   保护，因此正常运行不会触发本拒绝路径。
 *
 * @param {Object} vault
 * @param {{impa: string, quantity: number}} payload
 * @returns {Object}
 */
export function updateItemQuantity(vault, payload) {
    const impa = String(payload.impa || '').trim();
    if (!impa) return vault;
    const currentItems = vault.currentApplication.items;
    let targetIndex = -1;
    for (let index = 0; index < currentItems.length; index++) {
        if (currentItems[index].impa === impa) {
            targetIndex = index;
            break;
        }
    }
    if (targetIndex === -1) return vault;

    const quantity = Number(payload.quantity);
    if (!Number.isFinite(quantity) || quantity < 0) return vault;

    if (currentItems[targetIndex].quantity === quantity) return vault;

    const nextItems = currentItems.slice();
    nextItems[targetIndex] = Object.assign({}, currentItems[targetIndex], {
        quantity,
    });
    return replaceApplicationItems(vault, nextItems);
}

/**
 * 更新单条物料项的库存（手动）
 * @param {Object} vault
 * @param {{impa: string, manualStock: number}} payload
 * @returns {Object}
 */
export function updateItemStock(vault, payload) {
    const impa = String(payload.impa || '').trim();
    if (!impa) return vault;
    const currentItems = vault.currentApplication.items;
    let targetIndex = -1;
    for (let index = 0; index < currentItems.length; index++) {
        if (currentItems[index].impa === impa) {
            targetIndex = index;
            break;
        }
    }
    if (targetIndex === -1) return vault;

    let manualStock = Number(payload.manualStock);
    if (!Number.isFinite(manualStock) || manualStock < 0) manualStock = 0;

    if (currentItems[targetIndex].manualStock === manualStock) return vault;

    const nextItems = currentItems.slice();
    nextItems[targetIndex] = Object.assign({}, currentItems[targetIndex], {
        manualStock,
    });
    return replaceApplicationItems(vault, nextItems);
}

/**
 * 更新单条物料项的备注
 * @param {Object} vault
 * @param {{impa: string, remark: string}} payload
 * @returns {Object}
 */
export function updateItemRemark(vault, payload) {
    const impa = String(payload.impa || '').trim();
    if (!impa) return vault;
    const currentItems = vault.currentApplication.items;
    let targetIndex = -1;
    for (let index = 0; index < currentItems.length; index++) {
        if (currentItems[index].impa === impa) {
            targetIndex = index;
            break;
        }
    }
    if (targetIndex === -1) return vault;

    const nextRemark = String(payload.remark || '').slice(0, MAX_REMARK_LENGTH);
    if (currentItems[targetIndex].remark === nextRemark) return vault;

    const nextItems = currentItems.slice();
    nextItems[targetIndex] = Object.assign({}, currentItems[targetIndex], {
        remark: nextRemark,
    });
    return replaceApplicationItems(vault, nextItems);
}

/**
 * 替换申请单的整个物料项数组（用于导入）
 *
 * 【重要语义】本命令是"完全替换"，不是"追加"。
 *   视图层（batch-import-ui.js）提供"导入申请单"入口时，
 *   必须向用户明确说明该行为，或增加"追加"选项。
 *
 * @param {Object} vault
 * @param {{items: Object[]}} payload
 * @returns {Object}
 */
export function replaceApplicationItemsFromPayload(vault, payload) {
    const rawItems = Array.isArray(payload.items) ? payload.items : [];
    const normalizedItems = [];
    for (let index = 0; index < rawItems.length; index++) {
        const raw = rawItems[index];
        if (!raw || typeof raw !== 'object') continue;
        const impa = String(raw.impa || '').trim().slice(0, MAX_IMPA_LENGTH);
        if (!impa) continue;
        let quantity = 1;
        if (raw.quantity !== undefined && raw.quantity !== null) {
            const parsedQuantity = Number(raw.quantity);
            if (Number.isFinite(parsedQuantity) && parsedQuantity >= 0) {
                quantity = parsedQuantity;
            }
        }
        let manualStock = 0;
        if (raw.manualStock !== undefined && raw.manualStock !== null) {
            const parsedStock = Number(raw.manualStock);
            if (Number.isFinite(parsedStock) && parsedStock >= 0) {
                manualStock = parsedStock;
            }
        }
        normalizedItems.push({
            impa,
            description: String(raw.description || '').trim().slice(0, MAX_DESCRIPTION_LENGTH),
            spec: String(raw.spec || '').trim().slice(0, MAX_SPECIFICATION_LENGTH),
            unit: String(raw.unit || '').trim().slice(0, MAX_UNIT_LENGTH),
            quantity,
            manualStock,
            remark: String(raw.remark || '').trim().slice(0, MAX_REMARK_LENGTH),
        });
    }
    return replaceApplicationItems(vault, normalizedItems);
}