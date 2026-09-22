// filename: src/commands/ui-state.js
// 船舶物料申请系统 · UI 状态变更命令
// 全部为纯函数，输入旧 Vault，输出新 Vault，绝不修改入参
//
// 【约定】所有 setXxx 命令在"新值与旧值相同"时返回原 vault 引用。
//
// 【M-3 修复】setMaterialPageSize 在非法输入时若新旧值已一致
//   应返回原 vault 引用，与全局约定保持一致。

import {
    DEFAULT_MATERIAL_PAGE_SIZE,
    DEFAULT_REQ_COLUMN_WIDTHS,
    DEFAULT_MATERIAL_COLUMN_WIDTHS,
    MIN_COLUMN_WIDTH,
} from '../constants.js';

function replaceUiState(vault, nextUi) {
    return {
        materialsEn: vault.materialsEn,
        materialsZh: vault.materialsZh,
        currentApplication: vault.currentApplication,
        recycleBin: vault.recycleBin,
        ui: nextUi,
        settings: vault.settings,
        meta: vault.meta,
    };
}

export function setActiveTab(vault, payload) {
    const activeTab = payload.activeTab === 'materialTab' ? 'materialTab' : 'reqTab';
    if (vault.ui.activeTab === activeTab) return vault;
    return replaceUiState(vault, Object.assign({}, vault.ui, { activeTab }));
}

export function setCurrentLang(vault, payload) {
    const currentLang = payload.currentLang === 'en' ? 'en' : 'zh';
    if (vault.ui.currentLang === currentLang) return vault;
    return replaceUiState(vault, Object.assign({}, vault.ui, { currentLang }));
}

export function setReqFilterKeyword(vault, payload) {
    const keyword = String(payload.keyword || '');
    if (vault.ui.reqFilterKeyword === keyword) return vault;
    return replaceUiState(vault, Object.assign({}, vault.ui, { reqFilterKeyword: keyword }));
}

export function setReqSearchField(vault, payload) {
    const field = String(payload.field || 'all');
    if (vault.ui.reqSearchField === field) return vault;
    return replaceUiState(vault, Object.assign({}, vault.ui, { reqSearchField: field }));
}

export function setReqSort(vault, payload) {
    const field = payload.field === null || payload.field === undefined ? null : String(payload.field);
    const asc = payload.asc !== false;
    if (vault.ui.reqSortField === field && vault.ui.reqSortAsc === asc) return vault;
    return replaceUiState(vault, Object.assign({}, vault.ui, {
        reqSortField: field,
        reqSortAsc: asc,
    }));
}

export function resetReqSort(vault) {
    if (vault.ui.reqSortField === null && vault.ui.reqDefaultOrder === 'reverse') return vault;
    return replaceUiState(vault, Object.assign({}, vault.ui, {
        reqSortField: null,
        reqDefaultOrder: 'reverse',
    }));
}

/**
 * 设置物料库主搜索关键词
 * @param {Object} vault
 * @param {{keyword: string}} payload
 * @returns {Object}
 */
export function setMaterialSearchKeyword(vault, payload) {
    const keyword = String(payload.keyword || '');
    if (vault.ui.materialSearchKeyword === keyword) return vault;
    return replaceUiState(vault, Object.assign({}, vault.ui, { materialSearchKeyword: keyword }));
}

/**
 * 设置物料库主搜索字段
 * @param {Object} vault
 * @param {{field: string}} payload
 * @returns {Object}
 */
export function setMaterialSearchField(vault, payload) {
    const field = String(payload.field || 'all');
    if (vault.ui.materialSearchField === field) return vault;
    return replaceUiState(vault, Object.assign({}, vault.ui, { materialSearchField: field }));
}

export function setMaterialPage(vault, payload) {
    const page = Number(payload.page);
    if (!Number.isFinite(page) || page < 1) return vault;
    const normalizedPage = Math.floor(page);
    if (vault.ui.materialCurrentPage === normalizedPage) return vault;
    return replaceUiState(vault, Object.assign({}, vault.ui, { materialCurrentPage: normalizedPage }));
}

/**
 * 设置物料库分页大小
 *
 * 【M-3 修复】非法输入时先比较目标值（默认页大小 + 第 1 页）是否与现状相同，
 *   相同则返回原引用，避免无意义持久化。
 * @param {Object} vault
 * @param {{pageSize: number}} payload
 * @returns {Object}
 */
export function setMaterialPageSize(vault, payload) {
    const pageSize = Number(payload.pageSize);
    if (!Number.isFinite(pageSize) || pageSize < 1) {
        if (vault.ui.materialPageSize === DEFAULT_MATERIAL_PAGE_SIZE &&
            vault.ui.materialCurrentPage === 1) {
            return vault;
        }
        return replaceUiState(vault, Object.assign({}, vault.ui, {
            materialPageSize: DEFAULT_MATERIAL_PAGE_SIZE,
            materialCurrentPage: 1,
        }));
    }
    const normalizedPageSize = Math.floor(pageSize);
    if (vault.ui.materialPageSize === normalizedPageSize && vault.ui.materialCurrentPage === 1) return vault;
    return replaceUiState(vault, Object.assign({}, vault.ui, {
        materialPageSize: normalizedPageSize,
        materialCurrentPage: 1,
    }));
}

/**
 * 设置闪电添加搜索关键词
 * @param {Object} vault
 * @param {{keyword: string}} payload
 * @returns {Object}
 */
export function setQuickSearchKeyword(vault, payload) {
    const keyword = String(payload.keyword || '');
    if (vault.ui.quickSearchKeyword === keyword) return vault;
    return replaceUiState(vault, Object.assign({}, vault.ui, { quickSearchKeyword: keyword }));
}

export function setQuickSearchField(vault, payload) {
    const field = String(payload.field || 'all');
    if (vault.ui.quickSearchField === field) return vault;
    return replaceUiState(vault, Object.assign({}, vault.ui, { quickSearchField: field }));
}

export function setReqColumnWidths(vault, payload) {
    const widths = Array.isArray(payload.widths) ? payload.widths : [];
    if (widths.length !== DEFAULT_REQ_COLUMN_WIDTHS.length) return vault;
    const normalizedWidths = [];
    for (let index = 0; index < widths.length; index++) {
        const width = Number(widths[index]);
        if (!Number.isFinite(width) || width < MIN_COLUMN_WIDTH) {
            normalizedWidths.push(DEFAULT_REQ_COLUMN_WIDTHS[index]);
        } else {
            normalizedWidths.push(Math.round(width));
        }
    }
    const currentWidths = vault.ui.reqColumnWidths;
    let isChanged = false;
    for (let index = 0; index < currentWidths.length; index++) {
        if (currentWidths[index] !== normalizedWidths[index]) {
            isChanged = true;
            break;
        }
    }
    if (!isChanged) return vault;
    return replaceUiState(vault, Object.assign({}, vault.ui, {
        reqColumnWidths: normalizedWidths,
    }));
}

export function setMaterialColumnWidths(vault, payload) {
    const widths = Array.isArray(payload.widths) ? payload.widths : [];
    if (widths.length !== DEFAULT_MATERIAL_COLUMN_WIDTHS.length) return vault;
    const normalizedWidths = [];
    for (let index = 0; index < widths.length; index++) {
        const width = Number(widths[index]);
        if (!Number.isFinite(width) || width < MIN_COLUMN_WIDTH) {
            normalizedWidths.push(DEFAULT_MATERIAL_COLUMN_WIDTHS[index]);
        } else {
            normalizedWidths.push(Math.round(width));
        }
    }
    const currentWidths = vault.ui.materialColumnWidths;
    let isChanged = false;
    for (let index = 0; index < currentWidths.length; index++) {
        if (currentWidths[index] !== normalizedWidths[index]) {
            isChanged = true;
            break;
        }
    }
    if (!isChanged) return vault;
    return replaceUiState(vault, Object.assign({}, vault.ui, {
        materialColumnWidths: normalizedWidths,
    }));
}