// filename: src/core/vault.js
// 船舶物料申请系统 · Vault 状态形状与纯查询函数
// 本模块严禁 import 任何 UI、DOM、存储相关模块
// 所有函数均为纯函数：输入 vault，输出新值，绝不修改入参
//
// 【S6 修复保持】
//   normalizeRecycleBin 始终按 deletedAt 降序排序。
//
// 【与 M-new-1 的关系】
//   main.js 的 applyImportedBackup 现在直接依赖本模块的
//   normalizeRecycleBin 完成"降序 + 去重 + 截断"，
//   因此本函数是回收站排序语义的唯一权威实现。

import {
    MATERIAL_SOURCES,
    DELETION_SOURCES,
    DEFAULT_MATERIAL_PAGE_SIZE,
    DEFAULT_APPLICANT,
    DEFAULT_LANG,
    MAX_IMPA_LENGTH,
    MAX_DESCRIPTION_LENGTH,
    MAX_SPECIFICATION_LENGTH,
    MAX_UNIT_LENGTH,
    MAX_REMARK_LENGTH,
    MAX_RECYCLE_BIN_SIZE,
    DEFAULT_REQ_COLUMN_WIDTHS,
    DEFAULT_MATERIAL_COLUMN_WIDTHS,
} from '../constants.js';

// ==================== 形状构造 ====================

/**
 * 创建空 Vault
 * @returns {Object}
 */
export function createEmptyVault() {
    return {
        materialsEn: [],
        materialsZh: [],
        currentApplication: {
            reqNo: '',
            applicant: DEFAULT_APPLICANT,
            applyTime: '',
            items: [],
        },
        recycleBin: [],
        ui: {
            activeTab: 'reqTab',
            currentLang: DEFAULT_LANG,
            reqFilterKeyword: '',
            reqSearchField: 'all',
            reqSortField: null,
            reqSortAsc: true,
            reqDefaultOrder: 'reverse',
            materialSearchKeyword: '',
            materialSearchField: 'all',
            materialCurrentPage: 1,
            materialPageSize: DEFAULT_MATERIAL_PAGE_SIZE,
            quickSearchKeyword: '',
            quickSearchField: 'all',
            reqColumnWidths: DEFAULT_REQ_COLUMN_WIDTHS.slice(),
            materialColumnWidths: DEFAULT_MATERIAL_COLUMN_WIDTHS.slice(),
        },
        settings: {},
        meta: {
            dataCorruptionDetected: false,
        },
    };
}

// ==================== 归一化 ====================

/**
 * 归一化单条物料
 * @param {*} raw
 * @returns {Object|null}
 */
export function normalizeMaterial(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const impa = raw.impa == null ? '' : String(raw.impa).trim().slice(0, MAX_IMPA_LENGTH);
    if (!impa) return null;
    const description = raw.description == null ? '' : String(raw.description).trim().slice(0, MAX_DESCRIPTION_LENGTH);
    const source = Object.values(MATERIAL_SOURCES).includes(raw.source)
        ? raw.source
        : MATERIAL_SOURCES.IMPORT;
    return {
        impa,
        description,
        specification: raw.specification == null ? '' : String(raw.specification).trim().slice(0, MAX_SPECIFICATION_LENGTH),
        unit: raw.unit == null ? '' : String(raw.unit).trim().slice(0, MAX_UNIT_LENGTH),
        remark: raw.remark == null ? '' : String(raw.remark).trim().slice(0, MAX_REMARK_LENGTH),
        source,
    };
}

/**
 * 归一化物料数组
 * @param {*} rawArray
 * @returns {Object[]}
 */
export function normalizeMaterialArray(rawArray) {
    if (!Array.isArray(rawArray)) return [];
    const seenImpaSet = new Set();
    const result = [];
    for (let index = 0; index < rawArray.length; index++) {
        const normalized = normalizeMaterial(rawArray[index]);
        if (!normalized) continue;
        if (seenImpaSet.has(normalized.impa)) continue;
        seenImpaSet.add(normalized.impa);
        result.push(normalized);
    }
    return result;
}

/**
 * 归一化单条申请单物料项
 * @param {*} raw
 * @returns {Object|null}
 */
export function normalizeApplicationItem(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const impa = raw.impa == null ? '' : String(raw.impa).trim().slice(0, MAX_IMPA_LENGTH);
    if (!impa) return null;

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

    return {
        impa,
        description: raw.description == null ? '' : String(raw.description).trim().slice(0, MAX_DESCRIPTION_LENGTH),
        spec: raw.spec == null ? '' : String(raw.spec).trim().slice(0, MAX_SPECIFICATION_LENGTH),
        unit: raw.unit == null ? '' : String(raw.unit).trim().slice(0, MAX_UNIT_LENGTH),
        quantity,
        manualStock,
        remark: raw.remark == null ? '' : String(raw.remark).trim().slice(0, MAX_REMARK_LENGTH),
    };
}

/**
 * 归一化申请单
 * @param {*} raw
 * @returns {Object}
 */
export function normalizeApplication(raw) {
    const source = (raw && typeof raw === 'object') ? raw : {};
    const rawItems = Array.isArray(source.items) ? source.items : [];
    const normalizedItems = [];
    const seenImpaSet = new Set();
    for (let index = 0; index < rawItems.length; index++) {
        const normalizedItem = normalizeApplicationItem(rawItems[index]);
        if (!normalizedItem) continue;
        if (seenImpaSet.has(normalizedItem.impa)) continue;
        seenImpaSet.add(normalizedItem.impa);
        normalizedItems.push(normalizedItem);
    }
    return {
        reqNo: source.reqNo == null ? '' : String(source.reqNo).trim(),
        applicant: source.applicant == null ? DEFAULT_APPLICANT : String(source.applicant).trim(),
        applyTime: source.applyTime == null ? '' : String(source.applyTime),
        items: normalizedItems,
    };
}

/**
 * 归一化回收站条目
 * @param {*} raw
 * @returns {Object|null}
 */
export function normalizeRecycleBinItem(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const material = normalizeMaterial(raw.material);
    if (!material) return null;
    const deletedAt = Number(raw.deletedAt);
    if (!Number.isFinite(deletedAt) || deletedAt <= 0) return null;
    const language = raw.language === 'en' ? 'en' : 'zh';
    const deletionSource = Object.values(DELETION_SOURCES).includes(raw.deletionSource)
        ? raw.deletionSource
        : DELETION_SOURCES.SINGLE;
    return {
        id: raw.id == null ? material.impa : String(raw.id),
        language,
        material,
        deletedAt: Math.floor(deletedAt),
        deletionSource,
    };
}

/**
 * 归一化回收站数组
 *
 * 【S6 修复】始终按 deletedAt 降序排序，再截断到容量上限。
 * 【M-new-1 关联】main.js 的 applyImportedBackup 直接依赖本函数
 *   完成"降序 + 去重 + 截断"——这是回收站排序语义的唯一权威实现。
 * @param {*} rawArray
 * @returns {Object[]}
 */
export function normalizeRecycleBin(rawArray) {
    if (!Array.isArray(rawArray)) return [];
    const seenIds = new Set();
    const result = [];
    for (let index = 0; index < rawArray.length; index++) {
        const normalized = normalizeRecycleBinItem(rawArray[index]);
        if (!normalized) continue;
        if (seenIds.has(normalized.id)) continue;
        seenIds.add(normalized.id);
        result.push(normalized);
    }

    // 无论是否超限，都按时间降序排序（最新在前）
    result.sort(function (itemA, itemB) {
        return itemB.deletedAt - itemA.deletedAt;
    });

    if (result.length > MAX_RECYCLE_BIN_SIZE) {
        return result.slice(0, MAX_RECYCLE_BIN_SIZE);
    }
    return result;
}

/**
 * 归一化 ui 状态
 * @param {*} rawUi
 * @returns {Object}
 */
export function normalizeUiState(rawUi) {
    const source = (rawUi && typeof rawUi === 'object') ? rawUi : {};
    const empty = createEmptyVault().ui;

    const normalizeColumnWidths = function (rawWidths, defaults) {
        if (!Array.isArray(rawWidths) || rawWidths.length !== defaults.length) {
            return defaults.slice();
        }
        const result = [];
        for (let index = 0; index < rawWidths.length; index++) {
            const width = Number(rawWidths[index]);
            if (!Number.isFinite(width) || width <= 0) {
                result.push(defaults[index]);
            } else {
                result.push(Math.round(width));
            }
        }
        return result;
    };

    return {
        activeTab: source.activeTab === 'materialTab' ? 'materialTab' : 'reqTab',
        currentLang: source.currentLang === 'en' ? 'en' : 'zh',
        reqFilterKeyword: source.reqFilterKeyword == null ? '' : String(source.reqFilterKeyword),
        reqSearchField: source.reqSearchField == null ? 'all' : String(source.reqSearchField),
        reqSortField: source.reqSortField == null ? null : String(source.reqSortField),
        reqSortAsc: source.reqSortAsc !== false,
        reqDefaultOrder: source.reqDefaultOrder === 'normal' ? 'normal' : 'reverse',
        materialSearchKeyword: source.materialSearchKeyword == null ? '' : String(source.materialSearchKeyword),
        materialSearchField: source.materialSearchField == null ? 'all' : String(source.materialSearchField),
        materialCurrentPage: Number.isFinite(Number(source.materialCurrentPage)) && Number(source.materialCurrentPage) > 0
            ? Math.floor(Number(source.materialCurrentPage))
            : 1,
        materialPageSize: Number.isFinite(Number(source.materialPageSize)) && Number(source.materialPageSize) > 0
            ? Math.floor(Number(source.materialPageSize))
            : DEFAULT_MATERIAL_PAGE_SIZE,
        quickSearchKeyword: source.quickSearchKeyword == null ? '' : String(source.quickSearchKeyword),
        quickSearchField: source.quickSearchField == null ? 'all' : String(source.quickSearchField),
        reqColumnWidths: normalizeColumnWidths(source.reqColumnWidths, empty.reqColumnWidths),
        materialColumnWidths: normalizeColumnWidths(source.materialColumnWidths, empty.materialColumnWidths),
    };
}

/**
 * 归一化整个 Vault
 * @param {*} rawVault
 * @returns {Object}
 */
export function normalizeVault(rawVault) {
    const source = (rawVault && typeof rawVault === 'object') ? rawVault : {};
    const empty = createEmptyVault();
    return {
        materialsEn: normalizeMaterialArray(source.materialsEn),
        materialsZh: normalizeMaterialArray(source.materialsZh),
        currentApplication: normalizeApplication(source.currentApplication),
        recycleBin: normalizeRecycleBin(source.recycleBin),
        ui: normalizeUiState(source.ui),
        settings: Object.assign({}, empty.settings, source.settings || {}),
        meta: {
            dataCorruptionDetected: source.meta && source.meta.dataCorruptionDetected === true,
        },
    };
}

// ==================== 纯查询 ====================

/**
 * 判断 IMPA 是否存在于指定语言库
 * @param {Object} vault
 * @param {string} language
 * @param {string} impa
 * @returns {boolean}
 */
export function hasMaterial(vault, language, impa) {
    const array = language === 'en' ? vault.materialsEn : vault.materialsZh;
    for (let index = 0; index < array.length; index++) {
        if (array[index].impa === impa) return true;
    }
    return false;
}

/**
 * 按 IMPA 查找物料
 * @param {Object} vault
 * @param {string} language
 * @param {string} impa
 * @returns {Object|null}
 */
export function findMaterialByImpa(vault, language, impa) {
    const array = language === 'en' ? vault.materialsEn : vault.materialsZh;
    for (let index = 0; index < array.length; index++) {
        if (array[index].impa === impa) return array[index];
    }
    return null;
}

/**
 * 获取当前语言的物料数组
 * @param {Object} vault
 * @returns {Object[]}
 */
export function getCurrentMaterials(vault) {
    return vault.ui.currentLang === 'en' ? vault.materialsEn : vault.materialsZh;
}

/**
 * 判断申请单中是否已存在该 IMPA
 * @param {Object} vault
 * @param {string} impa
 * @returns {boolean}
 */
export function applicationHasItem(vault, impa) {
    const items = vault.currentApplication.items;
    for (let index = 0; index < items.length; index++) {
        if (items[index].impa === impa) return true;
    }
    return false;
}

/**
 * 统计物料库总条数（两种语言合计）
 * @param {Object} vault
 * @returns {number}
 */
export function countAllMaterials(vault) {
    return vault.materialsEn.length + vault.materialsZh.length;
}

/**
 * 按 ID 查找回收站条目
 * @param {Object} vault
 * @param {string} recycleBinItemId
 * @returns {Object|null}
 */
export function findRecycleBinItemById(vault, recycleBinItemId) {
    if (!recycleBinItemId) return null;
    if (!Array.isArray(vault.recycleBin)) return null;
    for (let index = 0; index < vault.recycleBin.length; index++) {
        if (vault.recycleBin[index].id === recycleBinItemId) {
            return vault.recycleBin[index];
        }
    }
    return null;
}

/**
 * 统计回收站条数
 * @param {Object} vault
 * @returns {number}
 */
export function countRecycleBinItems(vault) {
    return Array.isArray(vault.recycleBin) ? vault.recycleBin.length : 0;
}