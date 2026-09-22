// filename: src/services/import-pipeline/validator.js
// 船舶物料申请系统 · 导入数据校验器
// 职责：检查数据结构是否符合预期，返回可用的行集合
//
// 【表头识别规则】
//   - IMPA 列：表头包含 'impa' 即可
//   - 描述列：'description' / '物料描述'
//   - 规格列：'specification' / '规格' / 'model'
//   - 单位列：'unit' / '单位'
//   - 备注列：'remark' / '备注'
//   全部大小写不敏感。
//
// 【M-4 修复保持】表头探测：
//   不假设第 0 行是表头，而在 MAX_HEADER_PROBE_ROWS 内探测。
//
// 【本轮修改】
//   无功能性改动。仅契约验证。

import {
    MAX_HEADER_PROBE_ROWS,
} from '../../constants.js';

/**
 * 在给定行数组内查找表头行索引
 * 探测依据：单元格文本包含 'impa'（大小写不敏感）
 * @param {Array[]} rows
 * @param {number} maxProbeRows
 * @returns {number}  表头行索引；未找到时返回 -1
 */
function findHeaderRowIndex(rows, maxProbeRows) {
    const probeLimit = Math.min(rows.length, maxProbeRows);
    for (let index = 0; index < probeLimit; index++) {
        const row = rows[index];
        if (!Array.isArray(row)) continue;
        for (let cellIndex = 0; cellIndex < row.length; cellIndex++) {
            const cellText = String(row[cellIndex] || '').toLowerCase();
            if (cellText.includes('impa')) {
                return index;
            }
        }
    }
    return -1;
}

/**
 * 校验表头行，返回列索引映射
 * @param {Array} headerRow
 * @returns {Object}
 */
function buildColumnIndexMap(headerRow) {
    const headers = [];
    for (let index = 0; index < headerRow.length; index++) {
        headers.push(String(headerRow[index] || '').toLowerCase());
    }
    return {
        impa: headers.findIndex(function (headerText) {
            return headerText === 'impa' || headerText.includes('impa');
        }),
        desc: headers.findIndex(function (headerText) {
            return headerText === 'description' ||
                   headerText === '物料描述' ||
                   headerText.includes('description') ||
                   headerText.includes('物料描述');
        }),
        spec: headers.findIndex(function (headerText) {
            return headerText === 'specification' ||
                   headerText === '规格' ||
                   headerText === 'model' ||
                   headerText.includes('specification') ||
                   headerText.includes('规格') ||
                   headerText.includes('model');
        }),
        unit: headers.findIndex(function (headerText) {
            return headerText === '单位' ||
                   headerText === 'unit' ||
                   headerText.includes('单位') ||
                   headerText.includes('unit');
        }),
        remark: headers.findIndex(function (headerText) {
            return headerText === '备注' ||
                   headerText === 'remark' ||
                   headerText.includes('备注') ||
                   headerText.includes('remark');
        }),
    };
}

/**
 * 校验单张工作表
 *
 * 【M-4 修复】表头行不再假设为第 0 行，而是在 MAX_HEADER_PROBE_ROWS
 *   内探测。这允许 Excel 存在标题行、说明行等前置内容。
 * @param {Array[]} rows
 * @param {string} sheetName
 * @returns {{validRows: Object[], columnMap: Object|null, headerRowIndex: number, error: string|null}}
 */
export function validateSheet(rows, sheetName) {
    if (!Array.isArray(rows) || rows.length < 2) {
        return {
            validRows: [],
            columnMap: null,
            headerRowIndex: -1,
            error: '工作表 ' + sheetName + ' 数据过短',
        };
    }

    const headerRowIndex = findHeaderRowIndex(rows, MAX_HEADER_PROBE_ROWS);
    if (headerRowIndex === -1) {
        return {
            validRows: [],
            columnMap: null,
            headerRowIndex: -1,
            error: '工作表 ' + sheetName + ' 缺少 IMPA 列',
        };
    }

    const columnMap = buildColumnIndexMap(rows[headerRowIndex]);
    if (columnMap.impa === -1) {
        return {
            validRows: [],
            columnMap: null,
            headerRowIndex: headerRowIndex,
            error: '工作表 ' + sheetName + ' 缺少 IMPA 列',
        };
    }

    const validRows = [];
    for (let index = headerRowIndex + 1; index < rows.length; index++) {
        const row = rows[index];
        if (!Array.isArray(row)) continue;
        const impa = String(row[columnMap.impa] || '').trim();
        if (!impa) continue;
        validRows.push({
            impa: impa,
            description: columnMap.desc !== -1 ? String(row[columnMap.desc] || '') : '',
            specification: columnMap.spec !== -1 ? String(row[columnMap.spec] || '') : '',
            unit: columnMap.unit !== -1 ? String(row[columnMap.unit] || '') : '',
            remark: columnMap.remark !== -1 ? String(row[columnMap.remark] || '') : '',
        });
    }
    return {
        validRows: validRows,
        columnMap: columnMap,
        headerRowIndex: headerRowIndex,
        error: null,
    };
}

/**
 * 批量校验（中英文两表）
 * @param {Object} parseResult  parseExcelFile 的返回值
 * @param {boolean} hasCn
 * @param {boolean} hasEn
 * @returns {{zh?: Object[], en?: Object[], singleSheet?: Object, error: string|null}}
 */
export function validateSheets(parseResult, hasCn, hasEn) {
    if (hasCn && hasEn) {
        const cnValidation = validateSheet(parseResult.sheets['CN'], 'CN');
        if (cnValidation.error) return { error: cnValidation.error };
        const enValidation = validateSheet(parseResult.sheets['EN'], 'EN');
        if (enValidation.error) return { error: enValidation.error };
        if (cnValidation.validRows.length === 0 && enValidation.validRows.length === 0) {
            return { error: '两个工作表中均未找到有效物料数据' };
        }
        return {
            zh: cnValidation.validRows,
            en: enValidation.validRows,
            error: null,
        };
    }
    // 单表模式
    const firstSheetName = parseResult.sheetNames[0];
    if (!firstSheetName) {
        return { error: '文件中未找到任何工作表' };
    }
    const singleValidation = validateSheet(parseResult.sheets[firstSheetName], firstSheetName);
    if (singleValidation.error) return { error: singleValidation.error };
    return {
        singleSheet: {
            name: firstSheetName,
            rows: singleValidation.validRows,
            columnMap: singleValidation.columnMap,
        },
        error: null,
    };
}