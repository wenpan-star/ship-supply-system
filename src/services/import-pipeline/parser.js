// filename: src/services/import-pipeline/parser.js
// 船舶物料申请系统 · Excel 解析器
// 职责：将 Excel 文件解析为"原始行数据"结构，不做业务校验
//
// 【文件大小校验】
//   实际使用 MAX_IMPORT_FILE_SIZE_BYTES 常量：
//   在读取文件之前先校验 file.size，超过上限则拒绝解析。
//
// 【本轮修改】
//   无功能性改动，仅确认与 batch-import-ui.js（M-10 修复后）契约一致。

import {
    MAX_IMPORT_FILE_SIZE_BYTES,
} from '../../constants.js';

/**
 * 解析 Excel 文件
 * @param {File} file
 * @returns {Promise<{sheetNames: string[], sheets: Object, error: string|null}>}
 */
export function parseExcelFile(file) {
    return new Promise(function (resolve) {
        // 文件大小预检：避免大文件导致内存崩溃
        if (!file || typeof file.size !== 'number') {
            resolve({ sheetNames: [], sheets: {}, error: '文件对象无效' });
            return;
        }
        if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
            const maxSizeMegabytes = Math.floor(MAX_IMPORT_FILE_SIZE_BYTES / (1024 * 1024));
            resolve({
                sheetNames: [],
                sheets: {},
                error: '文件大小超过 ' + maxSizeMegabytes + 'MB 上限，请拆分后再导入',
            });
            return;
        }

        const reader = new FileReader();
        reader.onload = function (event) {
            try {
                if (typeof window.XLSX === 'undefined') {
                    resolve({ sheetNames: [], sheets: {}, error: 'XLSX 库未加载' });
                    return;
                }
                const arrayBuffer = event.target.result;
                const workbook = window.XLSX.read(arrayBuffer);
                const sheetNames = workbook.SheetNames.slice();
                const sheets = {};
                for (let index = 0; index < sheetNames.length; index++) {
                    const name = sheetNames[index];
                    const worksheet = workbook.Sheets[name];
                    const rows = window.XLSX.utils.sheet_to_json(worksheet, {
                        header: 1,
                        defval: '',
                    });
                    sheets[name] = rows;
                }
                resolve({ sheetNames: sheetNames, sheets: sheets, error: null });
            } catch (parseError) {
                resolve({
                    sheetNames: [],
                    sheets: {},
                    error: 'Excel 解析失败：' + parseError.message,
                });
            }
        };
        reader.onerror = function () {
            resolve({ sheetNames: [], sheets: {}, error: '文件读取失败' });
        };
        reader.readAsArrayBuffer(file);
    });
}