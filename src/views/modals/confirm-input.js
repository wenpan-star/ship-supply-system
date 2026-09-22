// filename: src/views/modals/confirm-input.js
// 船舶物料申请系统 · 通用单行输入模态框
// 用于替代原生 prompt()，统一视觉风格与无障碍语义。
//
// 【设计目标】
//   完全等价地覆盖 prompt() 的两类用途：
//     1. 输入一个字符串（可为空、可带默认值、可加 placeholder）
//     2. 校验输入（required / 自定义 validator），不通过时不关闭
//
// 【返回值约定】
//   - 用户点击"确定"且通过校验 → resolve(<string>)
//   - 用户点击"取消" / 点击遮罩 / Esc → resolve(null)
//   与 prompt() 的语义一致（取消返回 null），便于调用方平滑替换。
//
// 【与现有模态框体系的一致性】
//   - DOM 动态创建，注入 body（与 confirm.js 相同风格）
//   - 使用 modal-overlay / modal-card / modal-field-group / modal-actions 类
//   - Enter 提交、Esc 取消（由 shortcuts.js 的关闭链触发 forceClose）
//   - role="dialog" / aria-modal / aria-labelledby 全套无障碍属性
//
// 【并发保护】
//   与 confirm.js 相同：若 currentResolve 非空，先以 null 关闭旧对话框，
//   再打开新的。由于 UI 层不应同时触发两次输入，此保护属于防御性编程。

let modalElement = null;
let titleElement = null;
let messageElement = null;
let inputElement = null;
let errorElement = null;
let okButton = null;
let cancelButton = null;
let currentResolve = null;
let currentOptions = null;

function buildModal() {
    const modal = document.createElement('div');
    modal.id = 'confirmInputModal';
    modal.className = 'modal-overlay';
    modal.style.display = 'none';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'confirmInputTitle');
    modal.innerHTML =
        '<div class="modal-card">' +
        '<div style="font-size:2rem;color:#1f6893;margin-bottom:0.5rem;"><i class="fas fa-keyboard" aria-hidden="true"></i></div>' +
        '<h3 id="confirmInputTitle"></h3>' +
        '<p id="confirmInputMessage"></p>' +
        '<div class="modal-field-group">' +
        '<label id="confirmInputLabel" for="confirmInputField">输入</label>' +
        '<input type="text" id="confirmInputField" autocomplete="off">' +
        '</div>' +
        '<div id="confirmInputError" class="modal-error"></div>' +
        '<div class="modal-actions">' +
        '<button id="confirmInputCancelBtn" type="button">取消</button>' +
        '<button id="confirmInputOkBtn" class="confirm-primary" type="button">确定</button>' +
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
    if (inputElement) inputElement.removeEventListener('keypress', handleInputKeypress);
    currentOptions = null;
    const resolver = currentResolve;
    currentResolve = null;
    return resolver;
}

/**
 * 执行一次校验：若存在 options.validator 则优先使用；
 * 否则按 options.required 与 inputType 做基础校验。
 * @returns {{ok: boolean, message: string, value: *}}
 */
function validateInput(rawValue) {
    const options = currentOptions || {};
    const value = String(rawValue == null ? '' : rawValue);

    if (options.required === true && value.length === 0) {
        return {
            ok: false,
            message: options.requiredMessage || '该字段不能为空',
            value: value,
        };
    }

    if (typeof options.validator === 'function') {
        let validationResult;
        try {
            validationResult = options.validator(value);
        } catch (validatorError) {
            console.warn('[confirm-input] validator 异常:', validatorError);
            return {
                ok: false,
                message: '校验失败：' + validatorError.message,
                value: value,
            };
        }
        // 支持三种返回：true/false 布尔、字符串（视为错误消息）、对象 {ok, message}
        if (validationResult === true || validationResult === undefined || validationResult === null) {
            return { ok: true, message: '', value: value };
        }
        if (validationResult === false) {
            return {
                ok: false,
                message: '输入无效',
                value: value,
            };
        }
        if (typeof validationResult === 'string') {
            return {
                ok: false,
                message: validationResult,
                value: value,
            };
        }
        if (typeof validationResult === 'object') {
            return {
                ok: validationResult.ok === true,
                message: validationResult.ok === true ? '' : (validationResult.message || '输入无效'),
                value: value,
            };
        }
        // 其他情况保守放行
        return { ok: true, message: '', value: value };
    }

    return { ok: true, message: '', value: value };
}

function handleOk() {
    if (!currentOptions) return;
    const validation = validateInput(inputElement ? inputElement.value : '');
    if (!validation.ok) {
        if (errorElement) errorElement.innerText = validation.message;
        if (inputElement && typeof inputElement.focus === 'function') {
            inputElement.focus();
        }
        return;
    }
    const resolver = cleanup();
    if (resolver) resolver(validation.value);
}

function handleCancel() {
    const resolver = cleanup();
    if (resolver) resolver(null);
}

function handleBackdropClick(event) {
    if (event.target === modalElement) {
        handleCancel();
    }
}

function handleKeydown(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        handleOk();
    }
}

function handleInputKeypress(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        handleOk();
    }
}

/**
 * 打开通用输入模态框
 *
 * @param {Object} options
 * @param {string} [options.title='请输入']           对话框标题
 * @param {string} [options.message='']               正文说明（可为空字符串）
 * @param {string} [options.label='输入']             输入框标签
 * @param {string} [options.defaultValue='']          默认值
 * @param {string} [options.placeholder='']           输入框占位符
 * @param {boolean} [options.required=false]          是否必填
 * @param {string} [options.requiredMessage]          必填为空时的错误文案
 * @param {Function} [options.validator]              自定义校验；返回 true/false/字符串/{ok,message}
 * @param {string} [options.confirmText='确定']       确认按钮文案
 * @param {string} [options.cancelText='取消']        取消按钮文案
 * @param {string} [options.inputType='text']         输入框类型（text / password / number）
 * @returns {Promise<string|null>}  确认时返回字符串，取消时返回 null
 */
export function openConfirmInputModal(options) {
    const effectiveOptions = options || {};

    if (!modalElement) {
        modalElement = buildModal();
        titleElement = modalElement.querySelector('#confirmInputTitle');
        messageElement = modalElement.querySelector('#confirmInputMessage');
        inputElement = modalElement.querySelector('#confirmInputField');
        errorElement = modalElement.querySelector('#confirmInputError');
        okButton = modalElement.querySelector('#confirmInputOkBtn');
        cancelButton = modalElement.querySelector('#confirmInputCancelBtn');
    }

    // 防御性：若已有未关闭的对话框，先以 null 关闭
    if (currentResolve) {
        const previousResolver = currentResolve;
        currentResolve = null;
        cleanup();
        if (previousResolver) previousResolver(null);
    }

    currentOptions = effectiveOptions;

    const titleText = effectiveOptions.title || '请输入';
    const messageText = effectiveOptions.message || '';
    const labelText = effectiveOptions.label || '输入';
    const defaultValue = effectiveOptions.defaultValue == null ? '' : String(effectiveOptions.defaultValue);
    const placeholderText = effectiveOptions.placeholder == null ? '' : String(effectiveOptions.placeholder);
    const confirmText = effectiveOptions.confirmText || '确定';
    const cancelText = effectiveOptions.cancelText || '取消';
    const inputType = (effectiveOptions.inputType === 'password' || effectiveOptions.inputType === 'number')
        ? effectiveOptions.inputType
        : 'text';

    if (titleElement) titleElement.innerText = titleText;
    if (messageElement) {
        if (messageText) {
            messageElement.innerText = messageText;
            messageElement.style.display = '';
        } else {
            messageElement.innerText = '';
            messageElement.style.display = 'none';
        }
    }

    const labelElement = modalElement.querySelector('#confirmInputLabel');
    if (labelElement) labelElement.innerText = labelText;

    if (inputElement) {
        inputElement.type = inputType;
        inputElement.value = defaultValue;
        inputElement.placeholder = placeholderText;
    }
    if (errorElement) errorElement.innerText = '';
    if (okButton) okButton.innerText = confirmText;
    if (cancelButton) cancelButton.innerText = cancelText;

    modalElement.style.display = 'flex';
    if (okButton) okButton.addEventListener('click', handleOk);
    if (cancelButton) cancelButton.addEventListener('click', handleCancel);
    modalElement.addEventListener('click', handleBackdropClick);
    modalElement.onkeydown = handleKeydown;
    if (inputElement) inputElement.addEventListener('keypress', handleInputKeypress);

    setTimeout(function () {
        if (inputElement && typeof inputElement.focus === 'function') {
            inputElement.focus();
            if (typeof inputElement.select === 'function' && defaultValue.length > 0) {
                inputElement.select();
            }
        }
    }, 100);

    return new Promise(function (resolve) {
        currentResolve = resolve;
    });
}

/**
 * 强制关闭（供 Esc 调用）
 * @returns {boolean}
 */
export function forceCloseConfirmInputModal() {
    if (!currentResolve) return false;
    const resolver = currentResolve;
    currentResolve = null;
    cleanup();
    if (resolver) resolver(null);
    return true;
}