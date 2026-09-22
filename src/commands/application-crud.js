// filename: src/commands/application-crud.js
// 船舶物料申请系统 · 申请单头信息与生命周期
// 全部为纯函数，输入旧 Vault，输出新 Vault，绝不修改入参
//
// 【约定】当命令被"拒绝"（例如空 reqNo）时，返回原 vault 引用。
//
// 【Bug-4 修复】setReqNo 拒绝空 reqNo。
//   旧实现允许写入空字符串，触发"删旧键但不写新键"的路径，
//   导致申请单数据从存储中消失。现在空 reqNo 直接返回原 vault。

import {
    DEFAULT_APPLICANT,
} from '../constants.js';

/**
 * 构造新的空申请单
 * @param {string} reqNo
 * @param {string} applicant
 * @param {string} applyTime
 * @returns {Object}
 */
function createEmptyApplication(reqNo, applicant, applyTime) {
    return {
        reqNo: String(reqNo || ''),
        applicant: String(applicant || DEFAULT_APPLICANT),
        applyTime: String(applyTime || ''),
        items: [],
    };
}

/**
 * 更新申请单头信息，保留 items
 * @param {Object} vault
 * @param {Object} nextApplication
 * @returns {Object}
 */
function replaceApplicationHeader(vault, nextApplication) {
    return {
        materialsEn: vault.materialsEn,
        materialsZh: vault.materialsZh,
        currentApplication: nextApplication,
        recycleBin: vault.recycleBin,
        ui: vault.ui,
        settings: vault.settings,
        meta: vault.meta,
    };
}

/**
 * 设置申请次序号
 *
 * 【Bug-4 修复】空 reqNo 被拒绝（返回原 vault）。
 *   理由：persistVaultByAffects 在 reqNo 从非空变为空时，
 *   会删除旧 reqNo 对应的持久化键，但不会写入新键。
 *   为防止"输入框清空导致数据丢失"，此处直接拒绝空值。
 *
 * @param {Object} vault
 * @param {{reqNo: string}} payload
 * @returns {Object}
 */
export function setReqNo(vault, payload) {
    const reqNo = String(payload.reqNo || '');
    if (!reqNo) return vault;
    if (vault.currentApplication.reqNo === reqNo) return vault;
    return replaceApplicationHeader(vault, {
        reqNo,
        applicant: vault.currentApplication.applicant,
        applyTime: vault.currentApplication.applyTime,
        items: vault.currentApplication.items,
    });
}

/**
 * 设置申请人
 * @param {Object} vault
 * @param {{applicant: string}} payload
 * @returns {Object}
 */
export function setApplicant(vault, payload) {
    const applicant = String(payload.applicant || DEFAULT_APPLICANT);
    if (vault.currentApplication.applicant === applicant) return vault;
    return replaceApplicationHeader(vault, {
        reqNo: vault.currentApplication.reqNo,
        applicant,
        applyTime: vault.currentApplication.applyTime,
        items: vault.currentApplication.items,
    });
}

/**
 * 设置申请时间
 * @param {Object} vault
 * @param {{applyTime: string}} payload
 * @returns {Object}
 */
export function setApplyTime(vault, payload) {
    const applyTime = String(payload.applyTime || '');
    if (vault.currentApplication.applyTime === applyTime) return vault;
    return replaceApplicationHeader(vault, {
        reqNo: vault.currentApplication.reqNo,
        applicant: vault.currentApplication.applicant,
        applyTime,
        items: vault.currentApplication.items,
    });
}

/**
 * 加载指定申请单到当前工作区
 * @param {Object} vault
 * @param {{application: Object}} payload
 * @returns {Object}
 */
export function loadApplication(vault, payload) {
    if (!payload.application || typeof payload.application !== 'object') return vault;
    const nextApplication = {
        reqNo: String(payload.application.reqNo || ''),
        applicant: String(payload.application.applicant || DEFAULT_APPLICANT),
        applyTime: String(payload.application.applyTime || ''),
        items: Array.isArray(payload.application.items) ? payload.application.items.slice() : [],
    };
    return replaceApplicationHeader(vault, nextApplication);
}

/**
 * 新建空申请单
 * @param {Object} vault
 * @param {{reqNo: string, applicant?: string, applyTime?: string}} payload
 * @returns {Object}
 */
export function newApplication(vault, payload) {
    const reqNo = String(payload.reqNo || '');
    if (!reqNo) return vault;
    const nextApplication = createEmptyApplication(
        reqNo,
        payload.applicant || DEFAULT_APPLICANT,
        payload.applyTime || ''
    );
    return replaceApplicationHeader(vault, nextApplication);
}