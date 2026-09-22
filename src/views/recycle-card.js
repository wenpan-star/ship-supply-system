// filename: src/views/recycle-card.js
// 船舶物料申请系统 · 回收站条目模板
// 纯函数：输入回收站条目与上下文，输出 HTML 字符串

import {
    escapeHtml,
} from '../utils/dom.js';

/**
 * 将时间戳格式化为相对时间字符串
 * @param {number} timestamp
 * @param {number} [now]
 * @returns {string}
 */
export function formatRelativeTime(timestamp, now) {
    if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) {
        return '未知时间';
    }
    const currentTime = (typeof now === 'number' && Number.isFinite(now))
        ? now
        : Date.now();
    const deltaMilliseconds = currentTime - timestamp;
    if (deltaMilliseconds < 0) return '刚刚';
    if (deltaMilliseconds < 60 * 1000) return '刚刚';
    if (deltaMilliseconds < 60 * 60 * 1000) {
        const minutes = Math.floor(deltaMilliseconds / (60 * 1000));
        return minutes + ' 分钟前';
    }
    if (deltaMilliseconds < 24 * 60 * 60 * 1000) {
        const hours = Math.floor(deltaMilliseconds / (60 * 60 * 1000));
        return hours + ' 小时前';
    }
    if (deltaMilliseconds < 30 * 24 * 60 * 60 * 1000) {
        const days = Math.floor(deltaMilliseconds / (24 * 60 * 60 * 1000));
        return days + ' 天前';
    }
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    return year + '-' + month + '-' + day + ' ' + hour + ':' + minute;
}

/**
 * 渲染单条回收站条目
 * @param {Object} item
 * @param {{isChecked: boolean, now?: number}} options
 * @returns {string}
 */
export function renderRecycleItem(item, options) {
    const effectiveOptions = options || {};
    const isChecked = !!effectiveOptions.isChecked;
    const checkboxChecked = isChecked ? 'checked' : '';
    const languageLabel = item.language === 'en' ? '英文库' : '中文库';
    const languageBadge = '<span class="recycle-item-tag">' + escapeHtml(languageLabel) + '</span>';
    const relativeTimeText = formatRelativeTime(item.deletedAt, effectiveOptions.now);
    const absoluteTimeText = (item.deletedAt > 0)
        ? new Date(item.deletedAt).toLocaleString('zh-CN')
        : '未知';
    const safeText = escapeHtml(item.material.description || item.material.impa);
    const safeImpa = escapeHtml(item.material.impa);
    const itemId = escapeHtml(item.id);

    return '<div class="recycle-item" data-id="' + itemId + '">' +
        '<input type="checkbox" class="recycle-item-checkbox" data-id="' + itemId + '" ' + checkboxChecked + ' aria-label="选择此回收站条目">' +
        '<div class="recycle-item-content">' +
        '<div class="recycle-item-header">' +
        languageBadge +
        '<span class="recycle-item-impa">' + safeImpa + '</span>' +
        '<span class="recycle-item-time" title="' + escapeHtml(absoluteTimeText) + '">' + escapeHtml(relativeTimeText) + '</span>' +
        '</div>' +
        '<div class="recycle-item-text">' + safeText + '</div>' +
        '</div>' +
        '<div class="recycle-item-actions">' +
        '<button class="icon-btn recycle-restore-btn" data-action="restore" data-id="' + itemId + '" type="button" title="恢复" aria-label="恢复此物料"><i class="fas fa-undo" aria-hidden="true"></i></button>' +
        '<button class="icon-btn recycle-purge-btn" data-action="purge" data-id="' + itemId + '" type="button" title="彻底删除" aria-label="彻底删除此物料"><i class="fas fa-times" aria-hidden="true"></i></button>' +
        '</div>' +
        '</div>';
}