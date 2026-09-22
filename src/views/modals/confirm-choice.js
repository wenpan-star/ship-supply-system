// filename: src/views/modals/confirm-choice.js
// 船舶物料申请系统 · 通用选项选择模态框
// 用于替代原生 prompt() 让用户从若干选项中选择一个。
//
// 【设计目标】
//   完全等价地覆盖 prompt() 的"输入数字选择"类用途，例如：
//     - 导入模式选择（1=覆盖 / 2=合并）
//     - 工作表选择（1=CN / 2=EN / 3=合并）
//   提供以下优于原生 prompt 的能力：
//     - 选项以按钮形式呈现，避免用户手输数字错误
//     - 每个选项有 label 与可选 description
//     - 支持默认选中项
//     - 键盘可达（Tab / Enter / 方向键）
//
// 【返回值约定】
//   - 用户点击某个选项 → resolve({ index, value })
//     * index 为选项在数组中的下标（从 0 开始）
//     * value 为选项的 value 字段（可能是字符串或数字）
//   - 用户点击"取消" / 点击遮罩 / Esc → resolve(null)
//
// 【并发保护】与 confirm.js 相同。

let modalElement = null;
let titleElement = null;
let messageElement = null;
let optionsContainer = null;
let cancelButton = null;
let currentResolve = null;
let currentOptions = null;
let optionButtons = null;

function buildModal() {
    const modal = document.createElement('div');
    modal.id = 'confirmChoiceModal';
    modal.className = 'modal-overlay';
    modal.style.display = 'none';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'confirmChoiceTitle');
    modal.innerHTML =
        '<div class="modal-card">' +
        '<div style="font-size:2rem;color:#1f6893;margin-bottom:0.5rem;"><i class="fas fa-list-ul" aria-hidden="true"></i></div>' +
        '<h3 id="confirmChoiceTitle"></h3>' +
        '<p id="confirmChoiceMessage"></p>' +
        '<div id="confirmChoiceOptions" class="modal-choice-options" role="group"></div>' +
        '<div class="modal-actions">' +
        '<button id="confirmChoiceCancelBtn" type="button">取消</button>' +
        '</div>' +
        '</div>';
    document.body.appendChild(modal);
    return modal;
}

function cleanup() {
    if (!modalElement) return null;
    modalElement.style.display = 'none';
    modalElement.onkeydown = null;
    modalElement.removeEventListener('click', handleBackdropClick);
    if (optionButtons) {
        for (let index = 0; index < optionButtons.length; index++) {
            optionButtons[index].removeEventListener('click', optionButtons[index].__choiceHandler);
            optionButtons[index].__choiceHandler = null;
        }
    }
    if (cancelButton) cancelButton.removeEventListener('click', handleCancel);
    if (optionsContainer) optionsContainer.innerHTML = '';
    optionButtons = null;
    currentOptions = null;
    const resolver = currentResolve;
    currentResolve = null;
    return resolver;
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

/**
 * 选中某个选项并关闭
 * @param {number} optionIndex
 */
function selectOption(optionIndex) {
    if (!currentOptions) return;
    const choices = Array.isArray(currentOptions.choices) ? currentOptions.choices : [];
    if (optionIndex < 0 || optionIndex >= choices.length) return;
    const selected = choices[optionIndex];
    const resolver = cleanup();
    if (resolver) {
        resolver({
            index: optionIndex,
            value: selected.value,
        });
    }
}

/**
 * 打开通用选项选择模态框
 *
 * @param {Object} options
 * @param {string} [options.title='请选择']          对话框标题
 * @param {string} [options.message='']              正文说明（可为空字符串）
 * @param {Array<{value: *, label: string, description?: string}>} options.choices
 *       选项列表；每项必须包含 value 与 label
 * @param {number} [options.defaultIndex=0]          默认高亮/选中项索引
 * @param {string} [options.cancelText='取消']       取消按钮文案
 * @returns {Promise<{index: number, value: *}|null>}
 */
export function openConfirmChoiceModal(options) {
    const effectiveOptions = options || {};
    const rawChoices = Array.isArray(effectiveOptions.choices) ? effectiveOptions.choices : [];
    // 过滤非法项，只保留 { value, label } 均合法的条目
    const validChoices = [];
    for (let index = 0; index < rawChoices.length; index++) {
        const rawChoice = rawChoices[index];
        if (!rawChoice || typeof rawChoice !== 'object') continue;
        if (rawChoice.value === undefined) continue;
        if (typeof rawChoice.label !== 'string' || rawChoice.label.length === 0) continue;
        validChoices.push({
            value: rawChoice.value,
            label: rawChoice.label,
            description: typeof rawChoice.description === 'string' ? rawChoice.description : '',
        });
    }
    if (validChoices.length === 0) {
        // 无有效选项：直接返回 null，避免弹出空对话框
        return Promise.resolve(null);
    }
    effectiveOptions.choices = validChoices;

    if (!modalElement) {
        modalElement = buildModal();
        titleElement = modalElement.querySelector('#confirmChoiceTitle');
        messageElement = modalElement.querySelector('#confirmChoiceMessage');
        optionsContainer = modalElement.querySelector('#confirmChoiceOptions');
        cancelButton = modalElement.querySelector('#confirmChoiceCancelBtn');
    }

    // 防御性：若已有未关闭的对话框，先以 null 关闭
    if (currentResolve) {
        const previousResolver = currentResolve;
        currentResolve = null;
        cleanup();
        if (previousResolver) previousResolver(null);
    }

    currentOptions = effectiveOptions;

    const titleText = effectiveOptions.title || '请选择';
    const messageText = effectiveOptions.message || '';
    const cancelText = effectiveOptions.cancelText || '取消';

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
    if (cancelButton) cancelButton.innerText = cancelText;

    // 构建选项按钮
    optionButtons = [];
    optionsContainer.innerHTML = '';
    for (let index = 0; index < validChoices.length; index++) {
        const choice = validChoices[index];
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'modal-choice-option';
        button.setAttribute('data-choice-index', String(index));

        const labelSpan = document.createElement('span');
        labelSpan.className = 'modal-choice-option-label';
        labelSpan.innerText = choice.label;
        button.appendChild(labelSpan);

        if (choice.description) {
            const descSpan = document.createElement('span');
            descSpan.className = 'modal-choice-option-description';
            descSpan.innerText = choice.description;
            button.appendChild(descSpan);
        }

        const handler = (function (indexInClosure) {
            return function () {
                selectOption(indexInClosure);
            };
        })(index);
        button.__choiceHandler = handler;
        button.addEventListener('click', handler);

        optionsContainer.appendChild(button);
        optionButtons.push(button);
    }

    modalElement.style.display = 'flex';
    modalElement.addEventListener('click', handleBackdropClick);
    if (cancelButton) cancelButton.addEventListener('click', handleCancel);

    // 默认选中项：越界则回退到第 0 项
    let defaultIndex = 0;
    if (typeof effectiveOptions.defaultIndex === 'number' &&
        Number.isFinite(effectiveOptions.defaultIndex) &&
        effectiveOptions.defaultIndex >= 0 &&
        effectiveOptions.defaultIndex < validChoices.length) {
        defaultIndex = Math.floor(effectiveOptions.defaultIndex);
    }

    setTimeout(function () {
        if (optionButtons && optionButtons[defaultIndex] &&
            typeof optionButtons[defaultIndex].focus === 'function') {
            optionButtons[defaultIndex].focus();
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
export function forceCloseConfirmChoiceModal() {
    if (!currentResolve) return false;
    const resolver = currentResolve;
    currentResolve = null;
    cleanup();
    if (resolver) resolver(null);
    return true;
}