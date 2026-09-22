// filename: src/services/import-pipeline/transformer.js
// 船舶物料申请系统 · 导入数据转换器
// 职责：将校验后的行数据转换为规范化的物料记录
//
// 【空描述回退】
//   若原始行 description 为空，回退为 'IMPA <impa>'，
//   避免出现"有 IMPA 但描述为空"的物料记录。
//
// 【本轮修改】
//   无功能性改动。仅契约验证。

import {
    MAX_IMPA_LENGTH,
    MAX_DESCRIPTION_LENGTH,
    MAX_SPECIFICATION_LENGTH,
    MAX_UNIT_LENGTH,
    MAX_REMARK_LENGTH,
} from '../../constants.js';

/**
 * 将单行数据转为标准物料记录
 * @param {Object} rawRow
 * @param {string} source
 * @returns {Object}
 */
export function transformRow(rawRow, source) {
    const impa = String(rawRow.impa || '').trim().slice(0, MAX_IMPA_LENGTH);
    const description = String(rawRow.description || '').trim().slice(0, MAX_DESCRIPTION_LENGTH) || ('IMPA ' + impa);
    return {
        impa: impa,
        description: description,
        specification: String(rawRow.specification || '').trim().slice(0, MAX_SPECIFICATION_LENGTH),
        unit: String(rawRow.unit || '').trim().slice(0, MAX_UNIT_LENGTH),
        remark: String(rawRow.remark || '').trim().slice(0, MAX_REMARK_LENGTH),
        source: source,
    };
}

/**
 * 将校验结果转换为按语言分组的物料记录
 *
 * 单表模式下的语言判定：
 *   通过"描述+规格+备注"三个字段拼接后是否含中文字符来启发式判断。
 *   若含中文 → 归入中文库，否则归入英文库。
 *
 * @param {Object} validation  validateSheets 的返回值
 * @param {string} source
 * @param {Function} [progressCallback]
 * @returns {{en: Object[], zh: Object[]}}
 */
export function transformToMaterialRecords(validation, source, progressCallback) {
    const result = { en: [], zh: [] };

    if (validation.zh) {
        for (let index = 0; index < validation.zh.length; index++) {
            result.zh.push(transformRow(validation.zh[index], source));
            if (progressCallback && index % 100 === 0) {
                progressCallback('转换中文数据 ' + index + '/' + validation.zh.length, 50);
            }
        }
    }
    if (validation.en) {
        for (let index = 0; index < validation.en.length; index++) {
            result.en.push(transformRow(validation.en[index], source));
            if (progressCallback && index % 100 === 0) {
                progressCallback('转换英文数据 ' + index + '/' + validation.en.length, 55);
            }
        }
    }

    if (validation.singleSheet) {
        const rows = validation.singleSheet.rows;
        // 判断目标语言：通过列头是否含中文推测
        let isChineseHeader = false;
        const sampleRow = rows.length > 0 ? rows[0] : null;
        if (sampleRow) {
            // 简单启发式：检查任一字段是否含中文字符
            const combined = (sampleRow.description || '') + (sampleRow.specification || '') + (sampleRow.remark || '');
            if (/[\u4e00-\u9fa5]/.test(combined)) {
                isChineseHeader = true;
            }
        }
        for (let index = 0; index < rows.length; index++) {
            const record = transformRow(rows[index], source);
            if (isChineseHeader) {
                result.zh.push(record);
            } else {
                result.en.push(record);
            }
            if (progressCallback && index % 100 === 0) {
                progressCallback('转换数据 ' + index + '/' + rows.length, 55);
            }
        }
    }

    return result;
}