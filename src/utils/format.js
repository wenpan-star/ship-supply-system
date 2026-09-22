// filename: src/utils/format.js
// 船舶物料申请系统 · 格式化工具
// 无副作用、无依赖
//
// 【m-4 修复】getFileTimestamp 由 UTC 改为本地日期。

/**
 * 获取本地时间字符串（YYYY-MM-DDTHH:MM）
 * 用于 datetime-local 输入框
 * @param {Date} [date]
 * @returns {string}
 */
export function getLocalDatetimeString(date) {
    const pad = (value) => String(value).padStart(2, '0');
    const targetDate = date || new Date();
    const year = targetDate.getFullYear();
    const month = pad(targetDate.getMonth() + 1);
    const day = pad(targetDate.getDate());
    const hours = pad(targetDate.getHours());
    const minutes = pad(targetDate.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

/**
 * 获取本地日期字符串（YYYY-MM-DD）
 * @param {Date} [date]
 * @returns {string}
 */
export function getLocalDateString(date) {
    const pad = (value) => String(value).padStart(2, '0');
    const targetDate = date || new Date();
    const year = targetDate.getFullYear();
    const month = pad(targetDate.getMonth() + 1);
    const day = pad(targetDate.getDate());
    return `${year}-${month}-${day}`;
}

/**
 * 获取用于文件名的日期戳（YYYY-MM-DD）
 * 【m-4 修复】使用本地日期，与 getLocalDateString 保持一致
 * @returns {string}
 */
export function getFileTimestamp() {
    return getLocalDateString();
}

/**
 * 按 codePoint 安全截断字符串
 * 避免在 surrogate pair 中间截断（例如 emoji 被切成两半）
 * @param {string} text
 * @param {number} maxLength
 * @param {string} [suffix='...']
 * @returns {string}
 */
export function truncateByCodePoint(text, maxLength, suffix) {
    const effectiveSuffix = suffix === undefined ? '...' : suffix;
    const characters = Array.from(String(text));
    if (characters.length <= maxLength) return String(text);
    return characters.slice(0, maxLength).join('') + effectiveSuffix;
}

/**
 * 格式化文件大小为人类可读字符串
 * @param {number} bytes
 * @returns {string}
 */
export function formatFileSize(bytes) {
    if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size = size / 1024;
        unitIndex++;
    }
    return size.toFixed(unitIndex === 0 ? 0 : 1) + ' ' + units[unitIndex];
}