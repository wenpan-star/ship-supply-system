// filename: src/utils/excel.js
// 船舶物料申请系统 · Excel 工具
// 主要用于防止 CSV / 公式注入
//
// 【本轮修改】
//   无功能性改动。

/**
 * Excel 单元格安全化
 * 防御目标：CSV / 公式注入
 *   - 以 = + - @ 开头的字符串会被 Excel 当作公式执行
 *   - 通过在开头加单引号，强制 Excel 按文本处理
 * @param {*} value
 * @returns {string}
 */
export function sanitizeExcelCell(value) {
    if (value === null || value === undefined) return '';
    const stringValue = String(value);
    if (stringValue.length && '=+-@'.includes(stringValue[0])) {
        return "'" + stringValue;
    }
    return stringValue;
}