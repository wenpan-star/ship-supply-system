// filename: src/views/modals/confirm.js
// 船舶物料申请系统 · 通用确认模态框
// 返回 Promise<boolean>，DOM 动态创建并注入 body
// 用于替换原生 confirm()，统一视觉风格

let modalElement = null;
let messageElement = null;
let okButton = null;
let cancelButton = null;
let currentResolve = null;

function buildModal() {
    const modal = document.createElement('div');
    modal.id = 'confirmDialog';
    modal.className = 'modal-overlay';
    modal.style.display = 'none';
    // 无障碍：对话框语义
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'confirmMessage');
    modal.innerHTML =
        '<div class="modal-card">' +
        '<div style="font-size:2.5rem;color:#cc7d1a;margin-bottom:1rem;"><i class="fas fa-question-circle"></i></div>' +
        '<div id="confirmMessage" style="font-size:1rem;margin-bottom:1.5rem;word-break:break-word;white-space:pre-wrap;line-height:1.55;text-align:left;"></div>' +
        '<div class="modal-actions">' +
        '<button id="confirmCancelBtn" type="button">取消</button>' +
        '<button id="confirmOkBtn" class="confirm-primary" type="button">确定</button>' +
        '</div>' +
        '</div>';
    document.body.appendChild(modal);
    return modal;
}

function cleanup() {
    if (!modalElement) return null;
    modalElement.style.display = 'none';
    modalElement.onkeydown = null;
    if (okButton) okButton.removeEventListener('click', handleOk);
    if (cancelButton) cancelButton.removeEventListener('click', handleCancel);
    modalElement.removeEventListener('click', handleBackdropClick);
    const resolver = currentResolve;
    currentResolve = null;
    return resolver;
}

function handleOk() {
    const resolver = cleanup();
    if (resolver) resolver(true);
}

function handleCancel() {
    const resolver = cleanup();
    if (resolver) resolver(false);
}

function handleBackdropClick(event) {
    if (event.target === modalElement) {
        handleCancel();
    }
}

/**
 * Enter 键处理：触发"确定"
 * @param {KeyboardEvent} event
 */
function handleKeydown(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        handleOk();
    }
}

/**
 * 显示确认对话框
 * @param {string} message
 * @returns {Promise<boolean>}
 */
export function showConfirmDialog(message) {
    if (!modalElement) {
        modalElement = buildModal();
        messageElement = modalElement.querySelector('#confirmMessage');
        okButton = modalElement.querySelector('#confirmOkBtn');
        cancelButton = modalElement.querySelector('#confirmCancelBtn');
    }

    if (currentResolve) {
        const oldResolver = currentResolve;
        currentResolve = null;
        oldResolver(false);
        cleanup();
    }

    messageElement.innerText = message;
    modalElement.style.display = 'flex';

    okButton.addEventListener('click', handleOk);
    cancelButton.addEventListener('click', handleCancel);
    modalElement.addEventListener('click', handleBackdropClick);
    // Enter 键：属性赋值（自动覆盖），无需显式移除
    modalElement.onkeydown = handleKeydown;

    return new Promise(function (resolve) {
        currentResolve = resolve;
    });
}

/**
 * 强制关闭（供 Esc 调用）
 * @returns {boolean}
 */
export function forceCloseConfirmDialog() {
    if (!currentResolve) return false;
    const resolver = currentResolve;
    currentResolve = null;
    cleanup();
    resolver(false);
    return true;
}