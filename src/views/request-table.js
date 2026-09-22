// filename: src/views/request-table.js
// 船舶物料申请系统 · 申请单表格视图
// 负责：渲染申请单表格、排序、过滤、选中、批量删除
//       申请单头三输入框（reqSerial / applicant / applyTime）与 Vault 双向同步
//
// 【Bug-1 修复】申请单头三输入框与 Vault 建立双向同步。
//   - change 事件 dispatch 对应命令
//   - subscribe('application' | 'ui') 时从 vault 反向同步
//   - 反向同步做焦点保护：用户正在编辑的输入框不被覆盖
//
// 【S11 保持】过滤/排序后行号显示"原始序号"。
// 【Bug-4 联动】setReqNo 被拒绝（空值）时输入框保持用户输入。

import {
    $,
    escapeHtml,
} from '../utils/dom.js';
import {
    getVaultSnapshot,
    dispatch,
    subscribe,
} from '../core/facade.js';
import {
    showConfirmDialog,
} from './modals/confirm.js';

let reqTableBody = null;
let itemCountBadge = null;
let selectAllCheckbox = null;
let reqSearchKeywordInput = null;
let reqSearchFieldSelect = null;
let reqColgroup = null;

// Bug-1：申请单头三输入框
let reqSerialInput = null;
let applicantSelect = null;
let applyTimeInput = null;

let handlers = {
    onExportExcel: function () {},
    onImportFromExcel: function () {},
    onLoad: function () {},
    onNew: function () {},
    onSave: function () {},
};

// 选中集合（会话级瞬态，不入 Vault）
const selectedImpaSet = new Set();

/**
 * 判断焦点是否在申请单表格的可编辑输入框内
 * @returns {boolean}
 */
function isEditingRequestTableInput() {
    const activeElement = document.activeElement;
    if (!activeElement) return false;
    const className = activeElement.className || '';
    return className.indexOf('qty-input') !== -1 ||
           className.indexOf('stock-manual-input') !== -1 ||
           className.indexOf('remark-input') !== -1;
}

/**
 * 判断焦点是否在申请单头三输入框之一
 * Bug-1：反向同步时用于焦点保护
 * @returns {boolean}
 */
function isEditingApplicationHeader() {
    const activeElement = document.activeElement;
    if (!activeElement) return false;
    return activeElement === reqSerialInput ||
           activeElement === applicantSelect ||
           activeElement === applyTimeInput;
}

export function initializeRequestTable(options) {
    handlers = Object.assign(handlers, options || {});
    reqTableBody = $('#reqTableBody');
    itemCountBadge = $('#itemCountBadge');
    selectAllCheckbox = $('#selectAllCheckbox');
    reqSearchKeywordInput = $('#reqSearchKeyword');
    reqSearchFieldSelect = $('#reqSearchFieldSelect');
    reqColgroup = $('#reqColgroup');

    // Bug-1：获取申请单头三输入框引用
    reqSerialInput = $('#reqSerial');
    applicantSelect = $('#applicant');
    applyTimeInput = $('#applyTime');

    bindTableEvents();
    bindToolbarEvents();
    bindSearchEvents();
    bindSelectAllEvent();
    bindHeaderButtons();
    bindApplicationHeaderEvents();
}

/**
 * Bug-1：绑定申请单头三输入框的 change 事件到对应命令
 * 使用 change（而非 input）避免每次击键都触发持久化。
 * datetime-local 也支持 change 事件，行为一致。
 */
function bindApplicationHeaderEvents() {
    if (reqSerialInput) {
        reqSerialInput.addEventListener('change', function () {
            dispatch('setReqNo', { reqNo: reqSerialInput.value });
        });
    }
    if (applicantSelect) {
        applicantSelect.addEventListener('change', function () {
            dispatch('setApplicant', { applicant: applicantSelect.value });
        });
    }
    if (applyTimeInput) {
        applyTimeInput.addEventListener('change', function () {
            dispatch('setApplyTime', { applyTime: applyTimeInput.value });
        });
    }
}

/**
 * Bug-1：从 Vault 反向同步申请单头三输入框。
 * 焦点保护：
 *   - 用户正在编辑的输入框不被覆盖（避免光标位置跳变）
 *   - 其余输入框按需刷新
 * @param {Object} vault
 */
function syncApplicationHeaderFromVault(vault) {
    if (!vault) return;
    const application = vault.currentApplication;

    if (reqSerialInput && document.activeElement !== reqSerialInput) {
        if (reqSerialInput.value !== application.reqNo) {
            reqSerialInput.value = application.reqNo;
        }
    }
    if (applicantSelect && document.activeElement !== applicantSelect) {
        if (applicantSelect.value !== application.applicant) {
            applicantSelect.value = application.applicant;
        }
    }
    if (applyTimeInput && document.activeElement !== applyTimeInput) {
        if (applyTimeInput.value !== application.applyTime) {
            applyTimeInput.value = application.applyTime;
        }
    }
}

export function getDisplayedItems() {
    const vault = getVaultSnapshot();
    if (!vault) return [];
    const allItems = vault.currentApplication.items;
    const defaultOrder = vault.ui.reqDefaultOrder;
    const sortField = vault.ui.reqSortField;
    const sortAsc = vault.ui.reqSortAsc;
    const filterKeyword = vault.ui.reqFilterKeyword;
    const filterField = vault.ui.reqSearchField;

    let orderedItems = defaultOrder === 'reverse' ? allItems.slice().reverse() : allItems.slice();

    if (filterKeyword && filterKeyword.trim()) {
        const lowerKeyword = filterKeyword.toLowerCase();
        orderedItems = orderedItems.filter(function (item) {
            if (filterField === 'impa') return item.impa.toLowerCase().includes(lowerKeyword);
            if (filterField === 'description') return item.description.toLowerCase().includes(lowerKeyword);
            if (filterField === 'specification') return (item.spec || '').toLowerCase().includes(lowerKeyword);
            if (filterField === 'remark') return (item.remark || '').toLowerCase().includes(lowerKeyword);
            return item.impa.toLowerCase().includes(lowerKeyword) ||
                   item.description.toLowerCase().includes(lowerKeyword) ||
                   (item.spec || '').toLowerCase().includes(lowerKeyword) ||
                   (item.remark || '').toLowerCase().includes(lowerKeyword);
        });
    }

    if (sortField) {
        const fieldMap = {
            'stock': 'manualStock',
            'quantity': 'quantity',
            'impa': 'impa',
            'description': 'description',
            'spec': 'spec',
            'unit': 'unit',
            'remark': 'remark',
        };
        const actualField = fieldMap[sortField] || sortField;
        orderedItems.sort(function (itemA, itemB) {
            let valueA;
            let valueB;
            if (actualField === 'manualStock') {
                valueA = itemA.manualStock == null ? 0 : itemA.manualStock;
                valueB = itemB.manualStock == null ? 0 : itemB.manualStock;
            } else if (actualField === 'quantity') {
                valueA = itemA.quantity || 0;
                valueB = itemB.quantity || 0;
            } else {
                valueA = String(itemA[actualField] || '').toLowerCase();
                valueB = String(itemB[actualField] || '').toLowerCase();
            }
            if (valueA < valueB) return sortAsc ? -1 : 1;
            if (valueA > valueB) return sortAsc ? 1 : -1;
            return 0;
        });
    }

    return orderedItems;
}

export function renderRequestTable() {
    if (!reqTableBody) return;
    const vault = getVaultSnapshot();
    if (!vault) return;

    const allItems = vault.currentApplication.items;
    if (!allItems.length) {
        reqTableBody.innerHTML = '<tr><td colspan="10">暂无物料，请从搜索区添加</td></tr>';
        if (itemCountBadge) itemCountBadge.innerText = '0 项';
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        }
        return;
    }

    const displayedItems = getDisplayedItems();
    if (displayedItems.length === 0) {
        reqTableBody.innerHTML = '<tr><td colspan="10">无匹配项，请调整过滤条件</td></tr>';
        if (itemCountBadge) itemCountBadge.innerText = allItems.length + ' 项';
        if (selectAllCheckbox) {
            selectAllCheckbox.checked = false;
            selectAllCheckbox.indeterminate = false;
        }
        return;
    }

    const itemIndexMap = new Map();
    for (let index = 0; index < allItems.length; index++) {
        itemIndexMap.set(allItems[index], index);
    }

    let html = '';
    for (let displayIndex = 0; displayIndex < displayedItems.length; displayIndex++) {
        const item = displayedItems[displayIndex];
        const originalIndex = itemIndexMap.get(item);
        const manualStock = item.manualStock == null ? 0 : item.manualStock;
        const quantityValue = (item.quantity !== undefined && item.quantity !== null) ? item.quantity : 1;
        const isChecked = selectedImpaSet.has(item.impa) ? ' checked' : '';
        html += '<tr data-original-idx="' + originalIndex + '">' +
            '<td class="checkbox-col"><input type="checkbox" class="req-item-checkbox" data-impa="' + escapeHtml(item.impa) + '"' + isChecked + '></td>' +
            // S11：显示原始序号而非显示序号
            '<td>' + (originalIndex + 1) + '</td>' +
            '<td>' + escapeHtml(item.impa) + '</td>' +
            '<td>' + escapeHtml(item.description) + '</td>' +
            '<td>' + escapeHtml(item.spec || '-') + '</td>' +
            '<td>' + escapeHtml(item.unit || '-') + '</td>' +
            '<td><input type="number" class="stock-manual-input" value="' + manualStock + '" step="any" min="0" data-impa="' + escapeHtml(item.impa) + '" style="width:90px;"></td>' +
            '<td><input type="number" class="qty-input" value="' + quantityValue + '" min="0" step="any" data-impa="' + escapeHtml(item.impa) + '" style="width:80px;"></td>' +
            '<td><input type="text" class="remark-input" placeholder="备注" value="' + escapeHtml(item.remark || '') + '" data-impa="' + escapeHtml(item.impa) + '" maxlength="200"></td>' +
            '<td><button class="delete-item" data-impa="' + escapeHtml(item.impa) + '"><i class="far fa-trash-alt"></i></button></td>' +
            '</tr>';
    }
    reqTableBody.innerHTML = html;
    if (itemCountBadge) itemCountBadge.innerText = allItems.length + ' 项';
    updateSelectAllState();
}

function updateCountOnly() {
    const vault = getVaultSnapshot();
    if (!vault || !itemCountBadge) return;
    itemCountBadge.innerText = vault.currentApplication.items.length + ' 项';
}

function updateSelectAllState() {
    if (!selectAllCheckbox) return;
    const checkboxes = document.querySelectorAll('.req-item-checkbox');
    if (!checkboxes.length) {
        selectAllCheckbox.checked = false;
        selectAllCheckbox.indeterminate = false;
        return;
    }
    let allChecked = true;
    let anyChecked = false;
    for (let index = 0; index < checkboxes.length; index++) {
        if (checkboxes[index].checked) anyChecked = true;
        else allChecked = false;
    }
    selectAllCheckbox.checked = allChecked;
    selectAllCheckbox.indeterminate = !allChecked && anyChecked;
}

function bindTableEvents() {
    const reqTable = $('#reqTable');
    if (!reqTable) return;

    reqTable.addEventListener('change', function (event) {
        const element = event.target;
        if (element.classList.contains('stock-manual-input')) {
            const impa = element.dataset.impa;
            const parsedStock = parseFloat(element.value);
            dispatch('updateItemStock', {
                impa: impa,
                manualStock: Number.isFinite(parsedStock) ? Math.max(0, parsedStock) : 0,
            });
        } else if (element.classList.contains('qty-input')) {
            const impa = element.dataset.impa;
            const parsedQuantity = parseFloat(element.value);
            dispatch('updateItemQuantity', {
                impa: impa,
                quantity: Number.isFinite(parsedQuantity) ? Math.max(0, parsedQuantity) : 0,
            });
        } else if (element.classList.contains('remark-input')) {
            const impa = element.dataset.impa;
            dispatch('updateItemRemark', {
                impa: impa,
                remark: element.value,
            });
        } else if (element.classList.contains('req-item-checkbox')) {
            const impa = element.dataset.impa;
            if (element.checked) selectedImpaSet.add(impa);
            else selectedImpaSet.delete(impa);
            updateSelectAllState();
        }
    });

    reqTable.addEventListener('click', function (event) {
        const deleteButton = event.target.closest('.delete-item');
        if (!deleteButton) return;
        const impa = deleteButton.dataset.impa;
        if (impa) {
            dispatch('removeItemFromApplication', { impa: impa });
            selectedImpaSet.delete(impa);
        }
    });

    const sortableHeaders = document.querySelectorAll('#reqTable th[data-sort]');
    for (let index = 0; index < sortableHeaders.length; index++) {
        sortableHeaders[index].addEventListener('click', function () {
            const field = sortableHeaders[index].dataset.sort;
            const vault = getVaultSnapshot();
            if (!vault) return;
            const sameField = vault.ui.reqSortField === field;
            const nextAsc = sameField ? !vault.ui.reqSortAsc : true;
            dispatch('setReqSort', { field: field, asc: nextAsc });
            updateSortIndicators();
        });
    }
}

function bindToolbarEvents() {
    const batchDeleteReqBtn = $('#batchDeleteReqBtn');
    if (batchDeleteReqBtn) {
        batchDeleteReqBtn.addEventListener('click', async function () {
            const impaList = Array.from(selectedImpaSet);
            if (impaList.length === 0) {
                alert('请先选中');
                return;
            }
            const confirmed = await showConfirmDialog(
                '确定删除选中的 ' + impaList.length + ' 条物料吗？'
            );
            if (!confirmed) return;
            dispatch('batchRemoveItemsFromApplication', { impaList: impaList });
            selectedImpaSet.clear();
            updateSelectAllState();
        });
    }
}

function bindSearchEvents() {
    let searchTimer = null;
    if (reqSearchKeywordInput) {
        reqSearchKeywordInput.addEventListener('input', function () {
            if (searchTimer) clearTimeout(searchTimer);
            searchTimer = setTimeout(function () {
                searchTimer = null;
                dispatch('setReqFilterKeyword', { keyword: reqSearchKeywordInput.value });
            }, 300);
        });
    }
    if (reqSearchFieldSelect) {
        reqSearchFieldSelect.addEventListener('change', function () {
            dispatch('setReqSearchField', { field: reqSearchFieldSelect.value });
        });
    }
    const clearSearchBtn = $('#clearSearchBtn');
    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', function () {
            if (reqSearchKeywordInput) reqSearchKeywordInput.value = '';
            dispatch('setReqFilterKeyword', { keyword: '' });
        });
    }
    const resetAddOrderBtn = $('#resetAddOrderBtn');
    if (resetAddOrderBtn) {
        resetAddOrderBtn.addEventListener('click', function () {
            dispatch('resetReqSort', {});
            updateSortIndicators();
        });
    }
}

function bindSelectAllEvent() {
    if (!selectAllCheckbox) return;
    selectAllCheckbox.addEventListener('change', function () {
        const checked = selectAllCheckbox.checked;
        const checkboxes = document.querySelectorAll('.req-item-checkbox');
        for (let index = 0; index < checkboxes.length; index++) {
            checkboxes[index].checked = checked;
            const impa = checkboxes[index].dataset.impa;
            if (checked) selectedImpaSet.add(impa);
            else selectedImpaSet.delete(impa);
        }
        updateSelectAllState();
    });
}

function bindHeaderButtons() {
    const exportExcelBtn = $('#exportExcelBtn');
    if (exportExcelBtn) {
        exportExcelBtn.addEventListener('click', function () {
            handlers.onExportExcel();
        });
    }
    const importBtn = $('#importReqFromExcelBtn');
    if (importBtn) {
        importBtn.addEventListener('click', function () {
            handlers.onImportFromExcel();
        });
    }
    const loadReqBtn = $('#loadReqBtn');
    if (loadReqBtn) {
        loadReqBtn.addEventListener('click', function () {
            handlers.onLoad();
        });
    }
    const newReqBtn = $('#newReqBtn');
    if (newReqBtn) {
        newReqBtn.addEventListener('click', function () {
            handlers.onNew();
        });
    }
    const manualSaveBtn = $('#manualSaveBtn');
    if (manualSaveBtn) {
        manualSaveBtn.addEventListener('click', function () {
            handlers.onSave();
        });
    }
}

export function updateSortIndicators() {
    const vault = getVaultSnapshot();
    if (!vault) return;
    const indicators = document.querySelectorAll('#reqTable th[data-sort] .sort-indicator');
    for (let index = 0; index < indicators.length; index++) {
        indicators[index].textContent = '';
    }
    if (vault.ui.reqSortField) {
        const targetHeader = document.querySelector('#reqTable th[data-sort="' + vault.ui.reqSortField + '"] .sort-indicator');
        if (targetHeader) {
            targetHeader.textContent = vault.ui.reqSortAsc ? '▲' : '▼';
        }
    }
}

export function getSelectedImpaCount() {
    return selectedImpaSet.size;
}

export function clearSelectedImpa() {
    selectedImpaSet.clear();
    updateSelectAllState();
}

export function subscribeToVault() {
    subscribe('application', function (vault) {
        // Bug-1：先同步申请单头（内部有焦点保护）
        syncApplicationHeaderFromVault(vault);
        if (isEditingRequestTableInput()) {
            updateCountOnly();
            return;
        }
        renderRequestTable();
        updateSortIndicators();
    });
    subscribe('ui', function (vault) {
        if (!vault) return;
        // Bug-1：tab / 语言切换后再次同步申请单头（幂等，有缓存）
        syncApplicationHeaderFromVault(vault);
        if (reqSearchKeywordInput && reqSearchKeywordInput.value !== vault.ui.reqFilterKeyword) {
            reqSearchKeywordInput.value = vault.ui.reqFilterKeyword;
        }
        if (reqSearchFieldSelect) {
            reqSearchFieldSelect.value = vault.ui.reqSearchField;
        }
        if (isEditingRequestTableInput()) {
            updateCountOnly();
            return;
        }
        renderRequestTable();
        updateSortIndicators();
    });
}

/**
 * Bug-1：暴露给 main.js 的启动同步函数
 * 首次启动时调用一次，将 vault 中的申请单头填到 DOM。
 * @param {Object} vault
 */
export function syncApplicationHeaderOnStartup(vault) {
    syncApplicationHeaderFromVault(vault);
}