// filename: src/views/material-table.js
// 船舶物料申请系统 · 物料库表格视图
// 负责：渲染物料表格、分页、搜索、编辑、删除
//
// 【M-5 修复】.inline-edit 单元格支持点击触发编辑。
//   旧实现中 .inline-edit 有 cursor:pointer 与 hover 高亮样式，
//   但点击无任何反应。现在复用 onEditMaterial 回调。

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
    SEARCH_DEBOUNCE_MS,
} from '../constants.js';

let materialSearchBody = null;
let currentLibraryCountSpan = null;
let searchKeywordInput = null;
let searchFieldSelect = null;
let matFirstPage = null;
let matPrevPage = null;
let matNextPage = null;
let matLastPage = null;
let matPageSizeSelect = null;
let matCurrentPageSpan = null;
let matTotalPagesSpan = null;
let materialColgroup = null;

// 派生状态缓存（会话级）
let filteredMaterialData = [];
let totalPages = 1;

// 编辑/删除回调
let handlers = {
    onEditMaterial: function () {},
    onDeleteMaterial: function () {},
};

/**
 * 初始化物料表格视图
 * @param {Object} options
 */
export function initializeMaterialTable(options) {
    handlers = Object.assign(handlers, options || {});
    materialSearchBody = $('#materialSearchBody');
    currentLibraryCountSpan = $('#currentLibraryCount');
    searchKeywordInput = $('#searchKeyword');
    searchFieldSelect = $('#searchFieldSelect');
    matFirstPage = $('#matFirstPage');
    matPrevPage = $('#matPrevPage');
    matNextPage = $('#matNextPage');
    matLastPage = $('#matLastPage');
    matPageSizeSelect = $('#matPageSizeSelect');
    matCurrentPageSpan = $('#matCurrentPageSpan');
    matTotalPagesSpan = $('#matTotalPagesSpan');
    materialColgroup = $('#materialColgroup');

    bindSearchEvents();
    bindPaginationEvents();
    bindTableEvents();
}

/**
 * 获取当前语言的物料数组
 * @returns {Object[]}
 */
function getCurrentMaterials() {
    const vault = getVaultSnapshot();
    if (!vault) return [];
    return vault.ui.currentLang === 'en' ? vault.materialsEn : vault.materialsZh;
}

/**
 * 执行搜索并更新派生状态
 */
export function performMaterialSearch() {
    const vault = getVaultSnapshot();
    if (!vault) return;
    const currentArray = getCurrentMaterials();
    const keyword = (searchKeywordInput ? searchKeywordInput.value : '').trim().toLowerCase();
    const field = searchFieldSelect ? searchFieldSelect.value : 'all';
    const pageSize = vault.ui.materialPageSize;

    if (!currentArray.length) {
        filteredMaterialData = [];
        totalPages = 1;
        renderMaterialTable();
        updatePaginationControls();
        updateLibraryCount();
        return;
    }

    let filtered;
    if (!keyword) {
        filtered = currentArray.slice();
    } else {
        filtered = currentArray.filter(function (material) {
            if (field === 'impa') return material.impa.toLowerCase().includes(keyword);
            if (field === 'description') return material.description.toLowerCase().includes(keyword);
            if (field === 'specification') return (material.specification || '').toLowerCase().includes(keyword);
            if (field === 'unit') return (material.unit || '').toLowerCase().includes(keyword);
            if (field === 'remark') return (material.remark || '').toLowerCase().includes(keyword);
            return material.impa.toLowerCase().includes(keyword) ||
                   material.description.toLowerCase().includes(keyword) ||
                   (material.specification || '').toLowerCase().includes(keyword) ||
                   (material.unit || '').toLowerCase().includes(keyword) ||
                   (material.remark || '').toLowerCase().includes(keyword);
        });
    }

    filteredMaterialData = filtered;
    totalPages = Math.ceil(filtered.length / pageSize);
    if (totalPages < 1) totalPages = 1;

    let currentPage = vault.ui.materialCurrentPage;
    if (currentPage > totalPages) {
        dispatch('setMaterialPage', { page: totalPages });
        currentPage = totalPages;
    }

    renderMaterialTable();
    updatePaginationControls();
    updateLibraryCount();
}

/**
 * 渲染物料表格
 */
export function renderMaterialTable() {
    if (!materialSearchBody) return;
    const vault = getVaultSnapshot();
    if (!vault) return;

    const pageSize = vault.ui.materialPageSize;
    const currentPage = vault.ui.materialCurrentPage;
    const start = (currentPage - 1) * pageSize;
    const pageData = filteredMaterialData.slice(start, start + pageSize);

    if (!pageData.length) {
        materialSearchBody.innerHTML = '<tr><td colspan="7">暂无物料</td></tr>';
        return;
    }

    let html = '';
    for (let index = 0; index < pageData.length; index++) {
        const item = pageData[index];
        const serial = start + index + 1;
        html += '<tr data-impa="' + escapeHtml(item.impa) + '">' +
            '<td>' + serial + '</td>' +
            '<td>' + escapeHtml(item.impa) + '</td>' +
            '<td><div class="inline-edit" data-field="description" data-impa="' + escapeHtml(item.impa) + '" title="' + escapeHtml(item.description) + '">' + escapeHtml(item.description) + '</div></td>' +
            '<td><div class="inline-edit" data-field="specification" data-impa="' + escapeHtml(item.impa) + '" title="' + escapeHtml(item.specification || '') + '">' + escapeHtml(item.specification || '') + '</div></td>' +
            '<td><div class="inline-edit" data-field="unit" data-impa="' + escapeHtml(item.impa) + '" title="' + escapeHtml(item.unit || '') + '">' + escapeHtml(item.unit || '') + '</div></td>' +
            '<td><div class="inline-edit" data-field="remark" data-impa="' + escapeHtml(item.impa) + '" title="' + escapeHtml(item.remark || '') + '">' + escapeHtml(item.remark || '') + '</div></td>' +
            '<td>' +
            '<button class="edit-material" data-impa="' + escapeHtml(item.impa) + '"><i class="far fa-edit"></i></button>' +
            '<button class="delete-material" data-impa="' + escapeHtml(item.impa) + '"><i class="far fa-trash-alt"></i></button>' +
            '</td>' +
            '</tr>';
    }
    materialSearchBody.innerHTML = html;
}

export function updatePaginationControls() {
    const vault = getVaultSnapshot();
    if (!vault) return;
    const currentPage = vault.ui.materialCurrentPage;
    if (matFirstPage) matFirstPage.disabled = currentPage === 1 || totalPages === 0;
    if (matPrevPage) matPrevPage.disabled = currentPage === 1 || totalPages === 0;
    if (matNextPage) matNextPage.disabled = currentPage === totalPages || totalPages === 0;
    if (matLastPage) matLastPage.disabled = currentPage === totalPages || totalPages === 0;
    if (matCurrentPageSpan) matCurrentPageSpan.innerText = String(currentPage);
    if (matTotalPagesSpan) matTotalPagesSpan.innerText = String(totalPages || 1);
}

export function updateLibraryCount() {
    if (!currentLibraryCountSpan) return;
    const currentArray = getCurrentMaterials();
    currentLibraryCountSpan.innerText = currentArray.length + ' 条';
}

export function goToMaterialPage(page) {
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    dispatch('setMaterialPage', { page: page });
}

/**
 * 绑定搜索事件
 * 输入事件只 dispatch 命令，由订阅触发搜索
 */
function bindSearchEvents() {
    let searchTimer = null;
    if (searchKeywordInput) {
        searchKeywordInput.addEventListener('input', function () {
            if (searchTimer) clearTimeout(searchTimer);
            searchTimer = setTimeout(function () {
                searchTimer = null;
                dispatch('setMaterialSearchKeyword', { keyword: searchKeywordInput.value });
            }, SEARCH_DEBOUNCE_MS);
        });
    }
    if (searchFieldSelect) {
        searchFieldSelect.addEventListener('change', function () {
            dispatch('setMaterialSearchField', { field: searchFieldSelect.value });
        });
    }
}

function bindPaginationEvents() {
    if (matFirstPage) {
        matFirstPage.addEventListener('click', function () { goToMaterialPage(1); });
    }
    if (matPrevPage) {
        matPrevPage.addEventListener('click', function () {
            const vault = getVaultSnapshot();
            if (vault) goToMaterialPage(vault.ui.materialCurrentPage - 1);
        });
    }
    if (matNextPage) {
        matNextPage.addEventListener('click', function () {
            const vault = getVaultSnapshot();
            if (vault) goToMaterialPage(vault.ui.materialCurrentPage + 1);
        });
    }
    if (matLastPage) {
        matLastPage.addEventListener('click', function () { goToMaterialPage(totalPages); });
    }
    if (matPageSizeSelect) {
        matPageSizeSelect.addEventListener('change', function () {
            dispatch('setMaterialPageSize', { pageSize: parseInt(matPageSizeSelect.value, 10) });
        });
    }
}

/**
 * 绑定表格事件
 *
 * 【M-5 修复】新增 .inline-edit 点击处理。
 *   旧实现只有 .edit-material / .delete-material 有事件绑定，
 *   但 CSS 给 .inline-edit 加了 cursor:pointer 与 hover 高亮，
 *   用户点击"看起来可点"的描述/规格/单位/备注单元格无任何反应。
 *   现在复用 onEditMaterial 回调，与编辑按钮一致。
 */
function bindTableEvents() {
    if (!materialSearchBody) return;

    materialSearchBody.addEventListener('click', function (event) {
        const editButton = event.target.closest('.edit-material');
        if (editButton) {
            const impa = editButton.dataset.impa;
            if (impa) handlers.onEditMaterial(impa);
            return;
        }
        const deleteButton = event.target.closest('.delete-material');
        if (deleteButton) {
            const impa = deleteButton.dataset.impa;
            if (impa) handlers.onDeleteMaterial(impa);
            return;
        }
        // M-5：内联单元格点击也触发编辑
        const inlineEditCell = event.target.closest('.inline-edit');
        if (inlineEditCell) {
            const impa = inlineEditCell.dataset.impa;
            if (impa) handlers.onEditMaterial(impa);
            return;
        }
    });
}

/**
 * 订阅数据变更
 * 仅在此处调用 performMaterialSearch，避免双重触发
 */
export function subscribeToVault() {
    subscribe('materials', function () {
        performMaterialSearch();
        updateLibraryCount();
    });
    subscribe('ui', function () {
        const vault = getVaultSnapshot();
        if (!vault) return;
        if (searchKeywordInput && searchKeywordInput.value !== vault.ui.materialSearchKeyword) {
            searchKeywordInput.value = vault.ui.materialSearchKeyword;
        }
        if (searchFieldSelect && searchFieldSelect.value !== vault.ui.materialSearchField) {
            searchFieldSelect.value = vault.ui.materialSearchField;
        }
        if (matPageSizeSelect && String(vault.ui.materialPageSize) !== matPageSizeSelect.value) {
            matPageSizeSelect.value = String(vault.ui.materialPageSize);
        }
        performMaterialSearch();
    });
}