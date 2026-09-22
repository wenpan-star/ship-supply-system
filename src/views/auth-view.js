// filename: src/views/auth-view.js
// 船舶物料申请系统 · 认证视图控制
// 负责：认证遮罩的显示/隐藏、密码强度实时反馈
//
// 【幂等性说明】
//   bindPasswordStrengthMeter 使用 strengthListenerBound 标志防止重复绑定。
//   bindAuthEnterKey 使用 onkeypress 属性赋值（自动覆盖），
//   即使被多次调用也不会累积监听器。
//
// 【无障碍增强】
//   showAuthOverlay 时对遮罩设置 role / aria-modal，
//   并使密码输入框获得焦点。
//
// 【与 index.html 初始状态的对齐】
//   authOverlay 的初始 style="display:flex;"
//   pwd2Container / pwdStrengthContainer 的初始 style="display:none;"
//   —— 本模块通过 element.style.display 严格对齐。

import {
    evaluatePasswordStrength,
    getPasswordStrengthInfo,
} from '../core/auth.js';
import {
    $,
} from '../utils/dom.js';

let strengthListenerBound = false;

/**
 * 绑定密码强度实时更新事件（幂等）
 */
export function bindPasswordStrengthMeter() {
    if (strengthListenerBound) return;
    const password1 = $('#authPassword1');
    const fill = $('#pwdStrengthFill');
    const text = $('#pwdStrengthText');
    if (!password1 || !fill || !text) return;
    password1.oninput = function () {
        const strength = evaluatePasswordStrength(password1.value);
        const info = getPasswordStrengthInfo(strength);
        fill.style.width = ((strength / 4) * 100) + '%';
        fill.style.background = info.color;
        text.textContent = info.text;
    };
    strengthListenerBound = true;
}

/**
 * 显示认证遮罩
 * 【无障碍】设置 role="dialog" / aria-modal，并聚焦密码框
 */
export function showAuthOverlay() {
    const overlay = $('#authOverlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    // 无障碍：对话框语义
    if (!overlay.getAttribute('role')) {
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'authTitle');
    }
    // 聚焦密码框（延后到 display 生效后）
    setTimeout(function () {
        const password1 = $('#authPassword1');
        if (password1 && typeof password1.focus === 'function') {
            password1.focus();
        }
    }, 100);
}

export function hideAuthOverlay() {
    const overlay = $('#authOverlay');
    if (overlay) overlay.style.display = 'none';
}

export function showMainApp() {
    const mainApp = $('#mainApp');
    if (mainApp) mainApp.style.display = 'block';
}

export function hideMainApp() {
    const mainApp = $('#mainApp');
    if (mainApp) mainApp.style.display = 'none';
}

export function setAuthError(messageText) {
    const error = $('#authError');
    if (error) error.innerText = String(messageText == null ? '' : messageText);
}

export function setAuthTitle(htmlContent) {
    const title = $('#authTitle');
    if (title) title.innerHTML = htmlContent;
}

export function setPassword2Visibility(visible) {
    const container = $('#pwd2Container');
    if (container) container.style.display = visible ? 'block' : 'none';
}

export function setStrengthContainerVisibility(visible) {
    const container = $('#pwdStrengthContainer');
    if (container) container.style.display = visible ? 'block' : 'none';
}

export function setAuthSubmitDisabled(disabled) {
    const submitBtn = $('#authSubmitBtn');
    if (submitBtn) submitBtn.disabled = disabled;
}

export function getAuthInputValues() {
    const password1 = $('#authPassword1');
    const password2 = $('#authPassword2');
    return {
        password1: password1 ? password1.value : '',
        password2: password2 ? password2.value : '',
    };
}

export function clearAuthInputs() {
    const password1 = $('#authPassword1');
    const password2 = $('#authPassword2');
    if (password1) password1.value = '';
    if (password2) password2.value = '';
}

export function bindAuthSubmit(handler) {
    const submitBtn = $('#authSubmitBtn');
    if (submitBtn) submitBtn.onclick = handler;
}

/**
 * 绑定 Enter 键提交（幂等：使用 onkeypress 属性赋值）
 * @param {Function} handler
 */
export function bindAuthEnterKey(handler) {
    const password1 = $('#authPassword1');
    const password2 = $('#authPassword2');
    if (password1) {
        password1.onkeypress = function (event) {
            if (event.key === 'Enter') handler();
        };
    }
    if (password2) {
        password2.onkeypress = function (event) {
            if (event.key === 'Enter') handler();
        };
    }
}