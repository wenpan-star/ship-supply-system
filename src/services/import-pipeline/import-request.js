// filename: src/services/import-pipeline/import-request.js
// 船舶物料申请系统 · 申请单导入服务
// 职责：从 Excel 解析的原始数据中提取物料项，匹配物料库，返回可导入项与失败项
//
// 【导入策略】
//   - 同一 IMPA 出现在多行时，数量累加，库存取最后一次出现的值
//   - 物料库中不存在的 IMPA 归入 failedRows，由调用方决定导出
//   - 表头行在 MAX_HEADER_PROBE_ROWS 范围内探测
//
// 【与 validator.js 的一致性说明】
//   validator.js 的 validateSheet（M-4 修复后）与本模块的 findHeaderRowIndex
//   使用相同的探测策略：在 MAX_HEADER_PROBE_ROWS 内查找含 'impa' 的行。
//   两者是独立实现（validator 用于物料库导入，本模块用于申请单导入），
//   但行为必须保持一致。任何一侧的探测逻辑变更需同步另一侧。
//
// 【本轮修改】
//   无功能性改动。仅与 batch-import-ui.js 的 M-10 修复契约对齐确认。

import {
    MAX_IMPA_LENGTH,
} from '../../constants.js';

/**
 * 从表头行构建列索引映射
 * @param {Array} headerRow
 * @returns {Object}
 */
function buildRequestColumnMap(headerRow) {
    const headers = [];
    for (let index = 0; index < headerRow.length; index++) {
        headers.push(String(headerRow[index] || '').toLowerCase());
    }
    return {
        impa: headers.findIndex(function (headerText) {
            return headerText.includes('impa');
        }),
        desc: headers.findIndex(function (headerText) {
            return headerText.includes('description') || headerText.includes('物料描述');
        }),
        spec: headers.findIndex(function (headerText) {
            return headerText.includes('spec') || headerText.includes('规格');
        }),
        unit: headers.findIndex(function (headerText) {
            return headerText === '单位' || headerText === 'unit';
        }),
        qty: headers.findIndex(function (headerText) {
            return headerText.includes('申请数量') || headerText.includes('数量');
        }),
        stock: headers.findIndex(function (headerText) {
            return headerText.includes('库存') || headerText.includes('stock') || headerText.includes('manualstock');
        }),
        remark: headers.findIndex(function (headerText) {
            return headerText.includes('备注');
        }),
    };
}

/**
 * 在表头探测范围内查找表头行索引
 * @param {Array[]} rows
 * @param {number} maxProbeRows
 * @returns {number}
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
 * 执行申请单导入
 * @param {Object} parseResult  parseExcelFile 的返回值
 * @param {string[]} sheetNames  要处理的工作表名
 * @param {Object} vault  当前 Vault（用于物料库匹配）
 * @param {number} maxHeaderProbeRows
 * @returns {Promise<{items: Object[], addedCount: number, failedRows: Array, headerRow: Array}>}
 */
export async function executeRequestImport(parseResult, sheetNames, vault, maxHeaderProbeRows) {
    const combinedMaterials = vault.materialsEn.concat(vault.materialsZh);
    const materialMap = new Map();
    for (let index = 0; index < combinedMaterials.length; index++) {
        const material = combinedMaterials[index];
        if (!materialMap.has(material.impa)) {
            materialMap.set(material.impa, material);
        }
    }

    const itemsMap = new Map();
    const failedRows = [];
    let headerRow = [];

    for (let sheetIndex = 0; sheetIndex < sheetNames.length; sheetIndex++) {
        const sheetName = sheetNames[sheetIndex];
        const rows = parseResult.sheets[sheetName];
        if (!Array.isArray(rows)) continue;

        const headerIndex = findHeaderRowIndex(rows, maxHeaderProbeRows);
        if (headerIndex === -1) continue;

        const columnMap = buildRequestColumnMap(rows[headerIndex]);
        if (columnMap.impa === -1) continue;

        if (headerRow.length === 0) {
            headerRow = rows[headerIndex].slice();
        }

        for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex++) {
            const row = rows[rowIndex];
            if (!Array.isArray(row)) continue;
            const impaCell = row[columnMap.impa];
            const impa = String(impaCell == null ? '' : impaCell).trim().slice(0, MAX_IMPA_LENGTH);
            if (!impa) continue;

            if (!materialMap.has(impa)) {
                failedRows.push(row);
                continue;
            }

            const material = materialMap.get(impa);

            let quantity = 1;
            if (columnMap.qty !== -1) {
                const parsedQuantity = parseFloat(row[columnMap.qty]);
                if (!isNaN(parsedQuantity)) {
                    quantity = Math.max(0, parsedQuantity);
                }
            }

            let manualStock = 0;
            if (columnMap.stock !== -1) {
                const parsedStock = parseFloat(row[columnMap.stock]);
                if (!isNaN(parsedStock)) {
                    manualStock = Math.max(0, parsedStock);
                }
            }

            let remark = '';
            if (columnMap.remark !== -1 && row[columnMap.remark] != null) {
                remark = String(row[columnMap.remark]).trim();
            }

            if (itemsMap.has(impa)) {
                const existing = itemsMap.get(impa);
                existing.quantity += quantity;
                existing.manualStock = manualStock;
            } else {
                itemsMap.set(impa, {
                    impa: impa,
                    description: material.description,
                    spec: material.specification || '',
                    unit: material.unit || '',
                    quantity: quantity,
                    manualStock: manualStock,
                    remark: remark,
                });
            }
        }
    }

    const items = Array.from(itemsMap.values());
    return {
        items: items,
        addedCount: itemsMap.size,
        failedRows: failedRows,
        headerRow: headerRow,
    };
}