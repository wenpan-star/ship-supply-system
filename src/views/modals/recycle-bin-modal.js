// filename: src/views/modals/recycle-bin-modal.js
// 船舶物料申请系统 · 回收站面板模态框
//
// 【职责划分】本模块只负责"呈现 + 交互收集"，不执行业务操作。
//
// 【m-38 / m-39 修复】
//   - cleanup() 内部统一清空 currentResolve
//   - openRecycleBinModal 内部首先调用 cleanup()

import {
    renderRecycleItem,
} from '../recycle-card.js';

let modalElement = null;
let listElement = null;
let toolbarSelectAllButton = null;
let toolbarRestoreBatchButton = null;
let toolbarPurgeBatchButton = null;
let toolbarClearAllButton = null;
let toolbarCountLabel = null;
let closeButton = null;

let currentResolve = null;
let getItemsFunction = null;
let currentHandlers = null;
let selectedIds = new Set();
let lastFocusedElement = null;

function buildModal() {
    const modal = document.createElement('div');
    modal.id = 'recycleBinModal';
    modal.className = 'modal-overlay';
    modal.style.display = 'none';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'recycleBinModalTitle');
    modal.innerHTML =
        '<div class="modal-card" style="max-width:720px;">' +
        '<h3 id="recycleBinModalTitle" style="text-align:left;"><i class="fas fa-trash-alt"></i> 回收站</h3>' +
        '<div class="recycle-bin-toolbar">' +
        '<button class="btn btn-outline" id="recycleSelectAllBtn" type="button"><i class="fas fa-check-square"></i> 全选</button>' +
        '<button class="btn btn-outline" id="recycleRestoreBatchBtn" type="button"><i class="fas fa-undo"></i> 批量恢复</button>' +
        '<button class="btn btn-outline" id="recyclePurgeBatchBtn" type="button"><i class="fas fa-trash-alt"></i> 批量彻底删除</button>' +
        '<button class="btn btn-outline" id="recycleClearAllBtn" type="button"><i class="fas fa-broom"></i> 清空回收站</button>' +
        '<span class="recycle-bin-count" id="recycleBinCountLabel"></span>' +
        '</div>' +
        '<div class="recycle-bin-list" id="recycleBinList" role="list"></div>' +
        '<div class="modal-actions">' +
        '<button class="btn btn-outline" id="recycleBinCloseBtn" type="button">关闭</button>' +
        '</div>' +
        '</div>';
    document.body.appendChild(modal);
    return modal;
}

/**
 * 清理 DOM 与事件监听
 * 【m-38 修复】内部统一清空 currentResolve。
 */
function cleanup() {
    if (!modalElement) return null;

    const previousResolve = currentResolve;
    currentResolve = null;

    modalElement.style.display = 'none';
    modalElement.onkeydown = null;

    if (closeButton) closeButton.removeEventListener('click', handleClose);
    if (toolbarSelectAllButton) toolbarSelectAllButton.removeEventListener('click', handleSelectAllClick);
    if (toolbarRestoreBatchButton) toolbarRestoreBatchButton.removeEventListener('click', handleRestoreBatchClick);
    if (toolbarPurgeBatchButton) toolbarPurgeBatchButton.removeEventListener('click', handlePurgeBatchClick);
    if (toolbarClearAllButton) toolbarClearAllButton.removeEventListener('click', handleClearAllClick);
    modalElement.removeEventListener('click', handleBackdropClick);

    if (listElement) {
        listElement.removeEventListener('click', handleListClick);
        listElement.removeEventListener('change', handleListChange);
        listElement.innerHTML = '';
    }

    getItemsFunction = null;
    currentHandlers = null;
    selectedIds.clear();

    return previousResolve;
}

function restoreFocus() {
    if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
        try {
            lastFocusedElement.focus();
        } catch (focusError) {
            // 触发元素可能已移除
        }
    }
    lastFocusedElement = null;
}

function handleClose() {
    const resolver = cleanup();
    restoreFocus();
    if (resolver) resolver();
}

function handleBackdropClick(event) {
    if (event.target === modalElement) {
        handleClose();
    }
}

function getCurrentItems() {
    if (typeof getItemsFunction !== 'function') return [];
    const items = getItemsFunction();
    return Array.isArray(items) ? items : [];
}

function renderAll() {
    if (!listElement) return;
    const items = getCurrentItems();
    const existingIds = new Set();
    for (let index = 0; index < items.length; index++) {
        existingIds.add(items[index].id);
    }
    for (const selectedId of Array.from(selectedIds)) {
        if (!existingIds.has(selectedId)) selectedIds.delete(selectedId);
    }

    if (items.length === 0) {
        listElement.innerHTML = '<div class="empty-state" style="padding:2rem;text-align:center;color:#8ba0ae;"><i class="fas fa-trash-alt" style="font-size:2rem;margin-bottom:8px;display:block;"></i><p>回收站是空的</p></div>';
    } else {
        let html = '';
        for (let index = 0; index < items.length; index++) {
            const item = items[index];
            html += renderRecycleItem(item, {
                isChecked: selectedIds.has(item.id),
            });
        }
        listElement.innerHTML = html;
    }

    updateToolbarState(items.length);
}

function updateToolbarState(totalCount) {
    const selectedCount = selectedIds.size;
    const hasItems = totalCount > 0;
    const hasSelection = selectedCount > 0;

    if (toolbarCountLabel) {
        if (hasItems) {
            toolbarCountLabel.textContent = '共 ' + totalCount + ' 条，已选 ' + selectedCount + ' 条';
        } else {
            toolbarCountLabel.textContent = '';
        }
    }

    if (toolbarRestoreBatchButton) toolbarRestoreBatchButton.disabled = !hasSelection;
    if (toolbarPurgeBatchButton) toolbarPurgeBatchButton.disabled = !hasSelection;
    if (toolbarClearAllButton) toolbarClearAllButton.disabled = !hasItems;

    if (toolbarSelectAllButton) {
        if (!hasItems) {
            toolbarSelectAllButton.disabled = true;
            toolbarSelectAllButton.innerHTML = '<i class="fas fa-check-square"></i> 全选';
        } else if (selectedCount === totalCount) {
            toolbarSelectAllButton.disabled = false;
            toolbarSelectAllButton.innerHTML = '<i class="fas fa-square"></i> 取消全选';
        } else {
            toolbarSelectAllButton.disabled = false;
            toolbarSelectAllButton.innerHTML = '<i class="fas fa-check-square"></i> 全选';
        }
    }
}

function handleListChange(event) {
    const checkbox = event.target.closest('.recycle-item-checkbox');
    if (!checkbox) return;
    const binId = checkbox.getAttribute('data-id');
    if (!binId) return;
    if (checkbox.checked) {
        selectedIds.add(binId);
    } else {
        selectedIds.delete(binId);
    }
    updateToolbarState(getCurrentItems().length);
}

function handleListClick(event) {
    const actionButton = event.target.closest('[data-action]');
    if (!actionButton) return;
    event.stopPropagation();
    const action = actionButton.getAttribute('data-action');
    const binId = actionButton.getAttribute('data-id');
    if (!binId) return;
    if (action === 'restore') handleRestoreSingleClick(binId);
    else if (action === 'purge') handlePurgeSingleClick(binId);
}

async function handleRestoreSingleClick(binId) {
    if (!currentHandlers || typeof currentHandlers.onRestoreSingle !== 'function') return;
    try {
        await currentHandlers.onRestoreSingle(binId);
    } finally {
        renderAll();
    }
}

async function handlePurgeSingleClick(binId) {
    if (!currentHandlers || typeof currentHandlers.onPurgeSingle !== 'function') return;
    try {
        await currentHandlers.onPurgeSingle(binId);
    } finally {
        renderAll();
    }
}

function handleSelectAllClick() {
    const items = getCurrentItems();
    if (items.length === 0) return;
    const allSelected = items.every(function (item) { return selectedIds.has(item.id); });
    if (allSelected) {
        selectedIds.clear();
    } else {
        selectedIds = new Set(items.map(function (item) { return item.id; }));
    }
    renderAll();
}

async function handleRestoreBatchClick() {
    if (selectedIds.size === 0) return;
    if (!currentHandlers || typeof currentHandlers.onRestoreBatch !== 'function') return;
    const binIds = Array.from(selectedIds);
    let shouldClearSelection = true;
    try {
        const handlerResult = await currentHandlers.onRestoreBatch(binIds);
        if (handlerResult === false) shouldClearSelection = false;
    } finally {
        if (shouldClearSelection) selectedIds.clear();
        renderAll();
    }
}

async function handlePurgeBatchClick() {
    if (selectedIds.size === 0) return;
    if (!currentHandlers || typeof currentHandlers.onPurgeBatch !== 'function') return;
    const binIds = Array.from(selectedIds);
    let shouldClearSelection = true;
    try {
        const handlerResult = await currentHandlers.onPurgeBatch(binIds);
        if (handlerResult === false) shouldClearSelection = false;
    } finally {
        if (shouldClearSelection) selectedIds.clear();
        renderAll();
    }
}

async function handleClearAllClick() {
    if (!currentHandlers || typeof currentHandlers.onClearAll !== 'function') return;
    let shouldClearSelection = true;
    try {
        const handlerResult = await currentHandlers.onClearAll();
        if (handlerResult === false) shouldClearSelection = false;
    } finally {
        if (shouldClearSelection) selectedIds.clear();
        renderAll();
    }
}

/**
 * 打开回收站面板
 * 【m-39 修复】入口首先调用 cleanup()，确保任何残留状态与监听器被清除。
 *
 * @param {Object} options
 * @returns {Promise<void>}
 */
export function openRecycleBinModal(options) {
    if (!modalElement) {
        modalElement = buildModal();
        listElement = modalElement.querySelector('#recycleBinList');
        toolbarSelectAllButton = modalElement.querySelector('#recycleSelectAllBtn');
        toolbarRestoreBatchButton = modalElement.querySelector('#recycleRestoreBatchBtn');
        toolbarPurgeBatchButton = modalElement.querySelector('#recyclePurgeBatchBtn');
        toolbarClearAllButton = modalElement.querySelector('#recycleClearAllBtn');
        toolbarCountLabel = modalElement.querySelector('#recycleBinCountLabel');
        closeButton = modalElement.querySelector('#recycleBinCloseBtn');
    }

    // m-39：先清理（若有旧 resolve，用 void 忽略；其语义等同旧实现的"先拒后开"）
    if (currentResolve) {
        const oldResolver = currentResolve;
        currentResolve = null;
        cleanup();
        if (oldResolver) oldResolver();
    }

    if (document.activeElement && document.activeElement !== document.body) {
        lastFocusedElement = document.activeElement;
    } else {
        lastFocusedElement = null;
    }

    getItemsFunction = (typeof options.getItems === 'function')
        ? options.getItems
        : function () { return []; };
    currentHandlers = options.handlers || null;

    selectedIds.clear();
    renderAll();

    modalElement.style.display = 'flex';
    closeButton.addEventListener('click', handleClose);
    toolbarSelectAllButton.addEventListener('click', handleSelectAllClick);
    toolbarRestoreBatchButton.addEventListener('click', handleRestoreBatchClick);
    toolbarPurgeBatchButton.addEventListener('click', handlePurgeBatchClick);
    toolbarClearAllButton.addEventListener('click', handleClearAllClick);
    modalElement.addEventListener('click', handleBackdropClick);
    listElement.addEventListener('click', handleListClick);
    listElement.addEventListener('change', handleListChange);

    setTimeout(function () {
        if (closeButton && typeof closeButton.focus === 'function') {
            closeButton.focus();
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
export function forceCloseRecycleBinModal() {
    if (!currentResolve) return false;
    const resolver = currentResolve;
    currentResolve = null;
    cleanup();
    restoreFocus();
    if (resolver) resolver();
    return true;
}