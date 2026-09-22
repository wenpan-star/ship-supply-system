// filename: src/views/toast.js
// 船舶物料申请系统 · 提示与状态栏
// 负责：底部 Toast 提示、状态栏文本更新、全局错误横幅
//
// 【M-33 修复】长消息自动多行显示。

import {
    TOAST_DURATION_MS,
} from '../constants.js';
import {
    $,
    createElement,
} from '../utils/dom.js';

// 超过该长度则启用多行样式
const TOAST_MULTILINE_THRESHOLD = 30;

let toastElement = null;
let toastTimer = null;

/**
 * 初始化 Toast 容器（应用启动时调用一次）
 */
export function initializeToast() {
    if (toastElement) return;
    toastElement = createElement('div', {
        attributes: {
            id: 'dynamicToast',
            role: 'status',
            'aria-live': 'polite',
        },
    });
    toastElement.className = 'toast-message';
    document.body.appendChild(toastElement);
}

/**
 * 显示一条提示
 * @param {string} messageText
 * @param {boolean} [isError=false]
 */
export function showMessage(messageText, isError) {
    if (!toastElement) initializeToast();
    const safeMessage = String(messageText == null ? '' : messageText);
    toastElement.textContent = safeMessage;
    toastElement.classList.remove('toast-success', 'toast-error', 'toast-multiline');
    if (isError === true) {
        toastElement.classList.add('toast-error');
    } else {
        toastElement.classList.add('toast-success');
    }
    // M-33：长消息启用多行
    if (safeMessage.length > TOAST_MULTILINE_THRESHOLD) {
        toastElement.classList.add('toast-multiline');
    }
    toastElement.classList.add('toast-visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
        toastTimer = null;
        toastElement.classList.remove('toast-visible');
    }, TOAST_DURATION_MS);
}

/**
 * 更新状态栏文本
 * @param {string} messageText
 * @param {string} [variant]  'default' | 'warning' | 'success' | 'error'
 */
export function updateStatusBar(messageText, variant) {
    const statusBar = $('#autoSaveStatus');
    if (!statusBar) return;
    statusBar.classList.remove('warning', 'success', 'error');
    if (variant === 'warning') statusBar.classList.add('warning');
    else if (variant === 'success') statusBar.classList.add('success');
    else if (variant === 'error') statusBar.classList.add('error');
    statusBar.textContent = String(messageText == null ? '' : messageText);
}

/**
 * 显示全局错误横幅（页面顶部红色条）
 * @param {string} messageText
 */
export function showGlobalErrorBanner(messageText) {
    const existing = document.querySelector('.global-error-banner');
    if (existing) existing.remove();

    const banner = createElement('div', {
        attributes: { class: 'global-error-banner' },
    });
    banner.textContent = String(messageText == null ? '' : messageText);
    document.body.prepend(banner);
}

/**
 * 移除全局错误横幅
 */
export function removeGlobalErrorBanner() {
    const existing = document.querySelector('.global-error-banner');
    if (existing) existing.remove();
}