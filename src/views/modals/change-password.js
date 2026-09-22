// filename: src/views/modals/change-password.js
// 船舶物料申请系统 · 修改密码模态框
//
// 【M-26 修复】移除对密码的 trim()，与登录流程保持一致。
//   内存泄漏防护：强度更新监听器使用 `oninput` 属性赋值。

import {
    changePassword,
    evaluatePasswordStrength,
    getPasswordStrengthInfo,
} from '../../core/auth.js';

let modalElement = null;
let oldInput = null;
let new1Input = null;
let new2Input = null;
let errorDiv = null;
let confirmButton = null;
let cancelButton = null;
let currentResolve = null;
let strengthFill = null;
let strengthText = null;

function buildModal() {
    const modal = document.createElement('div');
    modal.id = 'changePasswordModal';
    modal.className = 'modal-overlay';
    modal.style.display = 'none';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'changePasswordModalTitle');
    modal.innerHTML =
        '<div class="modal-card">' +
        '<i class="fas fa-key" style="font-size:2rem;color:#1f6893;"></i>' +
        '<h3 id="changePasswordModalTitle">修改主密码</h3>' +
        '<p>请输入当前密码和新密码</p>' +
        '<div class="modal-field-group"><label>当前密码</label><input type="password" id="changePwdOld" autocomplete="off"></div>' +
        '<div class="modal-field-group"><label>新密码 (最少6位)</label><input type="password" id="changePwdNew1" autocomplete="off"><div class="password-strength-meter"><div id="changePwdStrengthFill" class="strength-fill" style="background: #ccc;"></div></div><div id="changePwdStrengthText" class="strength-text">请输入新密码</div></div>' +
        '<div class="modal-field-group"><label>确认新密码</label><input type="password" id="changePwdNew2" autocomplete="off"></div>' +
        '<div id="changePwdError" class="modal-error"></div>' +
        '<div class="modal-actions">' +
        '<button id="changePwdCancel" type="button">取消</button>' +
        '<button id="changePwdConfirm" class="confirm-primary" type="button">确认修改</button>' +
        '</div>' +
        '</div>';
    document.body.appendChild(modal);
    return modal;
}

function cleanup() {
    if (!modalElement) return;
    modalElement.style.display = 'none';
    modalElement.onkeydown = null;
    if (confirmButton) confirmButton.removeEventListener('click', handleConfirm);
    if (cancelButton) cancelButton.removeEventListener('click', handleCancel);
    modalElement.removeEventListener('click', handleBackdropClick);
    if (oldInput) oldInput.removeEventListener('keypress', handleEnter);
    if (new1Input) new1Input.removeEventListener('keypress', handleEnter);
    if (new2Input) new2Input.removeEventListener('keypress', handleEnter);
    // 关键：清除 oninput 以避免内存泄漏
    if (new1Input) new1Input.oninput = null;
    currentResolve = null;
}

function handleCancel() {
    cleanup();
    if (currentResolve) {
        const resolver = currentResolve;
        currentResolve = null;
        resolver(null);
    }
}

function handleBackdropClick(event) {
    if (event.target === modalElement) handleCancel();
}

function handleEnter(event) {
    if (event.key === 'Enter') {
        handleConfirm();
    }
}

/**
 * Enter 键兜底：当焦点在 modal 本身而非 input 时也能触发
 * @param {KeyboardEvent} event
 */
function handleKeydown(event) {
    if (event.key === 'Enter' && event.target === modalElement) {
        event.preventDefault();
        handleConfirm();
    }
}

/**
 * 确认修改密码
 * 【M-26 修复】不再对密码做 trim()，与登录流程保持一致。
 */
async function handleConfirm() {
    const oldPassword = oldInput.value;
    const newPassword1 = new1Input.value;
    const newPassword2 = new2Input.value;
    if (!oldPassword) {
        errorDiv.innerText = '请输入当前密码';
        oldInput.focus();
        return;
    }
    if (!newPassword1 || newPassword1.length < 6) {
        errorDiv.innerText = '新密码至少6位';
        new1Input.focus();
        return;
    }
    if (newPassword1 !== newPassword2) {
        errorDiv.innerText = '两次新密码不一致';
        new2Input.focus();
        return;
    }
    try {
        confirmButton.disabled = true;
        confirmButton.innerText = '修改中...';
        await changePassword(oldPassword, newPassword1, newPassword2);
        const resolver = currentResolve;
        currentResolve = null;
        cleanup();
        alert('密码修改成功！所有数据已重加密');
        if (resolver) resolver(true);
    } catch (changeError) {
        errorDiv.innerText = changeError.message;
        confirmButton.disabled = false;
        confirmButton.innerText = '确认修改';
    }
}

/**
 * 打开修改密码模态框
 * @returns {Promise<boolean|null>}
 */
export function openChangePasswordModal() {
    if (!modalElement) {
        modalElement = buildModal();
        oldInput = modalElement.querySelector('#changePwdOld');
        new1Input = modalElement.querySelector('#changePwdNew1');
        new2Input = modalElement.querySelector('#changePwdNew2');
        errorDiv = modalElement.querySelector('#changePwdError');
        confirmButton = modalElement.querySelector('#changePwdConfirm');
        cancelButton = modalElement.querySelector('#changePwdCancel');
        strengthFill = modalElement.querySelector('#changePwdStrengthFill');
        strengthText = modalElement.querySelector('#changePwdStrengthText');
    }

    if (currentResolve) {
        const oldResolver = currentResolve;
        currentResolve = null;
        oldResolver(null);
        cleanup();
    }

    oldInput.value = '';
    new1Input.value = '';
    new2Input.value = '';
    errorDiv.innerText = '';
    confirmButton.disabled = false;
    confirmButton.innerText = '确认修改';
    strengthFill.style.width = '0%';
    strengthFill.style.background = '#ccc';
    strengthText.textContent = '请输入新密码';

    // 使用 oninput 属性赋值（自动覆盖旧处理器），避免监听器累积
    new1Input.oninput = function () {
        const strength = evaluatePasswordStrength(new1Input.value);
        const info = getPasswordStrengthInfo(strength);
        strengthFill.style.width = ((strength / 4) * 100) + '%';
        strengthFill.style.background = info.color;
        strengthText.textContent = info.text;
    };

    modalElement.style.display = 'flex';
    confirmButton.addEventListener('click', handleConfirm);
    cancelButton.addEventListener('click', handleCancel);
    modalElement.addEventListener('click', handleBackdropClick);
    oldInput.addEventListener('keypress', handleEnter);
    new1Input.addEventListener('keypress', handleEnter);
    new2Input.addEventListener('keypress', handleEnter);
    modalElement.onkeydown = handleKeydown;

    setTimeout(function () {
        oldInput.focus();
    }, 100);

    return new Promise(function (resolve) {
        currentResolve = resolve;
    });
}

/**
 * 强制关闭（供 Esc 调用）
 * @returns {boolean}
 */
export function forceCloseChangePasswordModal() {
    if (!currentResolve) return false;
    const resolver = currentResolve;
    currentResolve = null;
    cleanup();
    resolver(null);
    return true;
}