// filename: src/views/modals/edit-material.js
// 船舶物料申请系统 · 编辑物料模态框
// 返回 Promise<{description, specification, unit, remark} | null>

let modalElement = null;
let descInput = null;
let specInput = null;
let unitInput = null;
let remarkInput = null;
let errorDiv = null;
let saveButton = null;
let cancelButton = null;
let currentResolve = null;

function buildModal() {
    const modal = document.createElement('div');
    modal.id = 'editMaterialModal';
    modal.className = 'modal-overlay';
    modal.style.display = 'none';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'editMaterialModalTitle');
    modal.innerHTML =
        '<div class="modal-card">' +
        '<i class="fas fa-edit" style="font-size:2rem;color:#1f6893;"></i>' +
        '<h3 id="editMaterialModalTitle">编辑物料</h3>' +
        '<div class="modal-field-group"><label>物料描述</label><input type="text" id="editMatDesc"></div>' +
        '<div class="modal-field-group"><label>规格型号</label><input type="text" id="editMatSpec"></div>' +
        '<div class="modal-field-group"><label>单位</label><input type="text" id="editMatUnit"></div>' +
        '<div class="modal-field-group"><label>备注</label><input type="text" id="editMatRemark"></div>' +
        '<div id="editMatError" class="modal-error"></div>' +
        '<div class="modal-actions">' +
        '<button id="editMatCancel" type="button">取消</button>' +
        '<button id="editMatSave" class="confirm-primary" type="button">保存</button>' +
        '</div>' +
        '</div>';
    document.body.appendChild(modal);
    return modal;
}

function cleanup() {
    if (!modalElement) return null;
    modalElement.style.display = 'none';
    modalElement.onkeydown = null;
    if (saveButton) saveButton.removeEventListener('click', handleSave);
    if (cancelButton) cancelButton.removeEventListener('click', handleCancel);
    modalElement.removeEventListener('click', handleBackdropClick);
    const resolver = currentResolve;
    currentResolve = null;
    return resolver;
}

function handleSave() {
    const description = descInput.value.trim();
    if (!description) {
        errorDiv.innerText = '物料描述不能为空';
        descInput.focus();
        return;
    }
    const resolver = cleanup();
    if (resolver) {
        resolver({
            description: description,
            specification: specInput.value.trim(),
            unit: unitInput.value.trim(),
            remark: remarkInput.value.trim(),
        });
    }
}

function handleCancel() {
    const resolver = cleanup();
    if (resolver) resolver(null);
}

function handleBackdropClick(event) {
    if (event.target === modalElement) handleCancel();
}

/**
 * Enter 键处理：触发保存
 * @param {KeyboardEvent} event
 */
function handleKeydown(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        handleSave();
    }
}

/**
 * 打开编辑物料模态框
 * @param {Object} material
 * @returns {Promise<Object|null>}
 */
export function openEditMaterialModal(material) {
    if (!modalElement) {
        modalElement = buildModal();
        descInput = modalElement.querySelector('#editMatDesc');
        specInput = modalElement.querySelector('#editMatSpec');
        unitInput = modalElement.querySelector('#editMatUnit');
        remarkInput = modalElement.querySelector('#editMatRemark');
        errorDiv = modalElement.querySelector('#editMatError');
        saveButton = modalElement.querySelector('#editMatSave');
        cancelButton = modalElement.querySelector('#editMatCancel');
    }

    if (currentResolve) {
        const oldResolver = currentResolve;
        currentResolve = null;
        oldResolver(null);
        cleanup();
    }

    descInput.value = material.description || '';
    specInput.value = material.specification || '';
    unitInput.value = material.unit || '';
    remarkInput.value = material.remark || '';
    errorDiv.innerText = '';

    modalElement.style.display = 'flex';
    saveButton.addEventListener('click', handleSave);
    cancelButton.addEventListener('click', handleCancel);
    modalElement.addEventListener('click', handleBackdropClick);
    modalElement.onkeydown = handleKeydown;

    setTimeout(function () {
        descInput.focus();
    }, 100);

    return new Promise(function (resolve) {
        currentResolve = resolve;
    });
}

/**
 * 强制关闭（供 Esc 调用）
 * @returns {boolean}
 */
export function forceCloseEditMaterialModal() {
    if (!currentResolve) return false;
    const resolver = currentResolve;
    currentResolve = null;
    cleanup();
    resolver(null);
    return true;
}