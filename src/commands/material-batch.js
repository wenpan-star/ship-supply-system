// filename: src/commands/material-batch.js
// 船舶物料申请系统 · 物料批量操作
// 全部为纯函数，输入旧 Vault，输出新 Vault，绝不修改入参
//
// 【设计要点】
//   批量操作的合并/覆盖逻辑集中在 mergeMaterialArrays 中，
//   供 Excel 导入、JSON 导入、程序化批量添加统一调用。
//
// 【API 保留说明】
//   本模块提供的三个命令在当前 UI 中未直接通过 dispatch 调用；
//   当前批量导入流程走 services/import-pipeline 后再由 writer
//   通过 replaceVault 提交。保留这三个命令的理由：
//     1. 它们是 facade 已注册的 API，删除会破坏 registerCommands 契约
//     2. 未来若需要"从代码侧直接批量写入"可作为规范入口
//     3. 单元测试可以独立验证合并/覆盖语义

import {
    MATERIAL_SOURCES,
    MAX_IMPA_LENGTH,
    MAX_DESCRIPTION_LENGTH,
    MAX_SPECIFICATION_LENGTH,
    MAX_UNIT_LENGTH,
    MAX_REMARK_LENGTH,
} from '../constants.js';

/**
 * 归一化一条待导入的物料
 * @param {*} raw
 * @param {string} defaultSource
 * @returns {Object|null}
 */
function normalizeIncomingMaterial(raw, defaultSource) {
    if (!raw || typeof raw !== 'object') return null;
    const impa = String(raw.impa || '').trim().slice(0, MAX_IMPA_LENGTH);
    if (!impa) return null;
    const source = Object.values(MATERIAL_SOURCES).includes(raw.source)
        ? raw.source
        : defaultSource;
    return {
        impa,
        description: String(raw.description || '').trim().slice(0, MAX_DESCRIPTION_LENGTH),
        specification: String(raw.specification || '').trim().slice(0, MAX_SPECIFICATION_LENGTH),
        unit: String(raw.unit || '').trim().slice(0, MAX_UNIT_LENGTH),
        remark: String(raw.remark || '').trim().slice(0, MAX_REMARK_LENGTH),
        source,
    };
}

/**
 * 合并策略
 * @param {Object[]} currentArray
 * @param {Object[]} incomingArray
 * @param {boolean} overwriteMode
 * @returns {Object[]}
 */
function mergeMaterialArrays(currentArray, incomingArray, overwriteMode) {
    if (overwriteMode) {
        return incomingArray.slice();
    }
    const materialMap = new Map();
    for (let index = 0; index < currentArray.length; index++) {
        materialMap.set(currentArray[index].impa, currentArray[index]);
    }
    for (let index = 0; index < incomingArray.length; index++) {
        const material = incomingArray[index];
        if (!materialMap.has(material.impa)) {
            materialMap.set(material.impa, material);
        }
    }
    return Array.from(materialMap.values());
}

/**
 * 批量追加物料（合并模式）
 * @param {Object} vault
 * @param {{language: string, materials: Object[], source?: string}} payload
 * @returns {Object}
 */
export function addMaterialsBatch(vault, payload) {
    const language = payload.language === 'en' ? 'en' : 'zh';
    const rawMaterials = Array.isArray(payload.materials) ? payload.materials : [];
    if (rawMaterials.length === 0) return vault;

    const defaultSource = Object.values(MATERIAL_SOURCES).includes(payload.source)
        ? payload.source
        : MATERIAL_SOURCES.BATCH;

    const incoming = [];
    for (let index = 0; index < rawMaterials.length; index++) {
        const normalized = normalizeIncomingMaterial(rawMaterials[index], defaultSource);
        if (normalized) incoming.push(normalized);
    }
    if (incoming.length === 0) return vault;

    const currentArray = language === 'en' ? vault.materialsEn : vault.materialsZh;
    const nextArray = mergeMaterialArrays(currentArray, incoming, false);

    return {
        materialsEn: language === 'en' ? nextArray : vault.materialsEn,
        materialsZh: language === 'zh' ? nextArray : vault.materialsZh,
        currentApplication: vault.currentApplication,
        recycleBin: vault.recycleBin,
        ui: vault.ui,
        settings: vault.settings,
        meta: vault.meta,
    };
}

/**
 * 覆盖式替换物料库
 * @param {Object} vault
 * @param {{language: string, materials: Object[], source?: string}} payload
 * @returns {Object}
 */
export function replaceMaterials(vault, payload) {
    const language = payload.language === 'en' ? 'en' : 'zh';
    const rawMaterials = Array.isArray(payload.materials) ? payload.materials : [];
    const defaultSource = Object.values(MATERIAL_SOURCES).includes(payload.source)
        ? payload.source
        : MATERIAL_SOURCES.IMPORT;

    const incoming = [];
    for (let index = 0; index < rawMaterials.length; index++) {
        const normalized = normalizeIncomingMaterial(rawMaterials[index], defaultSource);
        if (normalized) incoming.push(normalized);
    }

    return {
        materialsEn: language === 'en' ? incoming : vault.materialsEn,
        materialsZh: language === 'zh' ? incoming : vault.materialsZh,
        currentApplication: vault.currentApplication,
        recycleBin: vault.recycleBin,
        ui: vault.ui,
        settings: vault.settings,
        meta: vault.meta,
    };
}

/**
 * 统一导入入口（支持中英文同时导入）
 * @param {Object} vault
 * @param {{en?: Object[], zh?: Object[], overwriteMode?: boolean, source?: string}} payload
 * @returns {Object}
 */
export function applyImport(vault, payload) {
    const overwriteMode = payload.overwriteMode === true;
    const defaultSource = Object.values(MATERIAL_SOURCES).includes(payload.source)
        ? payload.source
        : MATERIAL_SOURCES.IMPORT;

    const rawEn = Array.isArray(payload.en) ? payload.en : [];
    const rawZh = Array.isArray(payload.zh) ? payload.zh : [];

    const incomingEn = [];
    for (let index = 0; index < rawEn.length; index++) {
        const normalized = normalizeIncomingMaterial(rawEn[index], defaultSource);
        if (normalized) incomingEn.push(normalized);
    }
    const incomingZh = [];
    for (let index = 0; index < rawZh.length; index++) {
        const normalized = normalizeIncomingMaterial(rawZh[index], defaultSource);
        if (normalized) incomingZh.push(normalized);
    }

    const nextEn = incomingEn.length > 0
        ? mergeMaterialArrays(vault.materialsEn, incomingEn, overwriteMode)
        : vault.materialsEn;
    const nextZh = incomingZh.length > 0
        ? mergeMaterialArrays(vault.materialsZh, incomingZh, overwriteMode)
        : vault.materialsZh;

    if (nextEn === vault.materialsEn && nextZh === vault.materialsZh) {
        return vault;
    }

    return {
        materialsEn: nextEn,
        materialsZh: nextZh,
        currentApplication: vault.currentApplication,
        recycleBin: vault.recycleBin,
        ui: vault.ui,
        settings: vault.settings,
        meta: vault.meta,
    };
}