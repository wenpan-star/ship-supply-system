// filename: src/commands/material-crud.js
// 船舶物料申请系统 · 物料单条 CRUD
// 全部为纯函数，输入旧 Vault，输出新 Vault，绝不修改入参
//
// 【约定】
//   - addMaterial 拒绝场景：空 impa、空 description、重复 impa
//   - editMaterial 拒绝场景：未找到 impa、空 description
//   - deleteMaterial 拒绝场景：未找到 impa
//   - clearAllMaterials 拒绝场景：两个库都已为空
//   所有拒绝均返回原 vault 引用，facade.dispatch 返回 false。
//
// 【deleteMaterial 的软删除契约】
//   1. 从物料库移除
//   2. 追加到 recycleBin 头部（含语言、来源、时间戳）
//   3. 若超过 MAX_RECYCLE_BIN_SIZE 截断最旧条目
//   4. 保留 vault.recycleBin 原有内容（不丢失任何现有条目）
//
// 【本轮修改】
//   m-new-4 修复：deleteMaterial 改用 generateRecycleBinItemId
//     生成回收站条目 ID，替代手写拼接的 language::impa::Date.now()。
//     在时间戳之外加入随机串，避免同毫秒同 IMPA 的 id 碰撞。

import {
    MATERIAL_SOURCES,
    DELETION_SOURCES,
    MAX_IMPA_LENGTH,
    MAX_DESCRIPTION_LENGTH,
    MAX_SPECIFICATION_LENGTH,
    MAX_UNIT_LENGTH,
    MAX_REMARK_LENGTH,
    MAX_RECYCLE_BIN_SIZE,
} from '../constants.js';
import {
    generateRecycleBinItemId,
} from '../utils/id.js';

/**
 * 将一段新数据写入指定语言库，并返回新的 Vault
 * @param {Object} vault
 * @param {string} language
 * @param {Object[]} nextArray
 * @returns {Object}
 */
function replaceMaterialArray(vault, language, nextArray) {
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
 * 新增单条物料
 * @param {Object} vault
 * @param {Object} payload
 * @returns {Object}
 */
export function addMaterial(vault, payload) {
    const language = payload.language === 'en' ? 'en' : 'zh';
    const impa = String(payload.impa || '').trim().slice(0, MAX_IMPA_LENGTH);
    const description = String(payload.description || '').trim().slice(0, MAX_DESCRIPTION_LENGTH);
    if (!impa || !description) return vault;

    const currentArray = language === 'en' ? vault.materialsEn : vault.materialsZh;
    for (let index = 0; index < currentArray.length; index++) {
        if (currentArray[index].impa === impa) return vault;
    }

    const source = Object.values(MATERIAL_SOURCES).includes(payload.source)
        ? payload.source
        : MATERIAL_SOURCES.CUSTOM;

    const newMaterial = {
        impa,
        description,
        specification: String(payload.specification || '').trim().slice(0, MAX_SPECIFICATION_LENGTH),
        unit: String(payload.unit || '').trim().slice(0, MAX_UNIT_LENGTH),
        remark: String(payload.remark || '').trim().slice(0, MAX_REMARK_LENGTH),
        source,
    };

    const nextArray = currentArray.concat([newMaterial]);
    return replaceMaterialArray(vault, language, nextArray);
}

/**
 * 编辑单条物料
 * @param {Object} vault
 * @param {Object} payload
 * @returns {Object}
 */
export function editMaterial(vault, payload) {
    const language = payload.language === 'en' ? 'en' : 'zh';
    const impa = String(payload.impa || '').trim();
    if (!impa) return vault;

    const currentArray = language === 'en' ? vault.materialsEn : vault.materialsZh;
    let targetIndex = -1;
    for (let index = 0; index < currentArray.length; index++) {
        if (currentArray[index].impa === impa) {
            targetIndex = index;
            break;
        }
    }
    if (targetIndex === -1) return vault;

    const original = currentArray[targetIndex];
    const nextDescription = payload.description !== undefined
        ? String(payload.description).trim().slice(0, MAX_DESCRIPTION_LENGTH)
        : original.description;
    if (!nextDescription) return vault;

    const nextMaterial = {
        impa: original.impa,
        description: nextDescription,
        specification: payload.specification !== undefined
            ? String(payload.specification).trim().slice(0, MAX_SPECIFICATION_LENGTH)
            : original.specification,
        unit: payload.unit !== undefined
            ? String(payload.unit).trim().slice(0, MAX_UNIT_LENGTH)
            : original.unit,
        remark: payload.remark !== undefined
            ? String(payload.remark).trim().slice(0, MAX_REMARK_LENGTH)
            : original.remark,
        source: original.source,
    };

    const nextArray = currentArray.slice();
    nextArray[targetIndex] = nextMaterial;
    return replaceMaterialArray(vault, language, nextArray);
}

/**
 * 删除单条物料（软删除）
 * 流程：
 *   1. 定位物料
 *   2. 从物料库移除
 *   3. 构造回收站条目（语言 + 来源 + 时间戳 + 唯一 ID）
 *   4. 前置到 recycleBin
 *   5. 若超过 MAX_RECYCLE_BIN_SIZE，截断末尾（最旧）
 *
 * 【m-new-4 修复】id 使用 generateRecycleBinItemId 生成，
 *   在时间戳之外追加随机串，避免同毫秒同 IMPA 的 id 碰撞。
 *
 * @param {Object} vault
 * @param {Object} payload
 * @returns {Object}
 */
export function deleteMaterial(vault, payload) {
    const language = payload.language === 'en' ? 'en' : 'zh';
    const impa = String(payload.impa || '').trim();
    if (!impa) return vault;

    const currentArray = language === 'en' ? vault.materialsEn : vault.materialsZh;
    let targetMaterial = null;
    for (let index = 0; index < currentArray.length; index++) {
        if (currentArray[index].impa === impa) {
            targetMaterial = currentArray[index];
            break;
        }
    }
    if (!targetMaterial) return vault;

    const nextArray = currentArray.filter(function (material) {
        return material.impa !== impa;
    });

    const recycleBinItem = {
        id: generateRecycleBinItemId(language, impa),
        language,
        material: {
            impa: targetMaterial.impa,
            description: targetMaterial.description,
            specification: targetMaterial.specification,
            unit: targetMaterial.unit,
            remark: targetMaterial.remark,
            source: targetMaterial.source,
        },
        deletedAt: Date.now(),
        deletionSource: payload.deletionSource === DELETION_SOURCES.BATCH
            ? DELETION_SOURCES.BATCH
            : DELETION_SOURCES.SINGLE,
    };

    const currentRecycleBin = Array.isArray(vault.recycleBin) ? vault.recycleBin : [];
    const nextRecycleBin = [recycleBinItem].concat(currentRecycleBin)
        .slice(0, MAX_RECYCLE_BIN_SIZE);

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
 * 清空全部物料库（中英文）
 * 【注意】清空物料库不进回收站（与删除标签同理）
 * @param {Object} vault
 * @returns {Object}
 */
export function clearAllMaterials(vault) {
    if (vault.materialsEn.length === 0 && vault.materialsZh.length === 0) return vault;
    return {
        materialsEn: [],
        materialsZh: [],
        currentApplication: vault.currentApplication,
        recycleBin: vault.recycleBin,
        ui: vault.ui,
        settings: vault.settings,
        meta: vault.meta,
    };
}