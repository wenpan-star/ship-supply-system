// filename: src/views/quick-add.js
// 船舶物料申请系统 · 闪电添加
// 负责：快速搜索物料库、点击添加物料到申请单
//
// 【S4 修复保持】区分"已存在"与"添加成功"，分别给出反馈。
// 【M-5 修复保持】无改动。

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
    showMessage,
} from './toast.js';
import {
    QUICK_SEARCH_MAX_RESULTS,
    QUICK_SEARCH_DEBOUNCE_MS,
} from '../constants.js';

let quickSearchInput = null;
let quickSearchFieldSelect = null;
let quickSearchResultsDiv = null;
let quickSearchTbody = null;
let clearQuickSearchBtn = null;

export function initializeQuickAdd() {
    quickSearchInput = $('#quickSearchInput');
    quickSearchFieldSelect = $('#quickSearchFieldSelect');
    quickSearchResultsDiv = $('#quickSearchResults');
    quickSearchTbody = $('#quickSearchTbody');
    clearQuickSearchBtn = $('#clearQuickSearchBtn');

    bindSearchEvents();
    bindResultEvents();
}

export function performQuickSearch() {
    if (!quickSearchInput || !quickSearchResultsDiv || !quickSearchTbody) return;
    const keyword = quickSearchInput.value.trim().toLowerCase();
    if (!keyword) {
        quickSearchResultsDiv.style.display = 'none';
        return;
    }

    const vault = getVaultSnapshot();
    if (!vault) return;
    const library = vault.ui.currentLang === 'en' ? vault.materialsEn : vault.materialsZh;
    const field = quickSearchFieldSelect ? quickSearchFieldSelect.value : 'all';

    const filtered = [];
    for (let index = 0; index < library.length; index++) {
        const material = library[index];
        let isMatch = false;
        if (field === 'impa') {
            isMatch = material.impa.toLowerCase().includes(keyword);
        } else if (field === 'description') {
            isMatch = material.description.toLowerCase().includes(keyword);
        } else if (field === 'specification') {
            isMatch = (material.specification || '').toLowerCase().includes(keyword);
        } else if (field === 'remark') {
            isMatch = (material.remark || '').toLowerCase().includes(keyword);
        } else {
            isMatch = material.impa.toLowerCase().includes(keyword) ||
                      material.description.toLowerCase().includes(keyword) ||
                      (material.specification || '').toLowerCase().includes(keyword) ||
                      (material.remark || '').toLowerCase().includes(keyword);
        }
        if (isMatch) {
            filtered.push(material);
            if (filtered.length >= QUICK_SEARCH_MAX_RESULTS) break;
        }
    }

    if (!filtered.length) {
        quickSearchTbody.innerHTML = '<tr><td colspan="5">未找到</td></tr>';
        quickSearchResultsDiv.style.display = 'block';
        return;
    }

    let rows = '';
    for (let index = 0; index < filtered.length; index++) {
        const material = filtered[index];
        rows += '<tr>' +
            '<td>' + escapeHtml(material.impa) + '</td>' +
            '<td>' + escapeHtml(material.description) + '</td>' +
            '<td>' + escapeHtml(material.specification || '-') + '</td>' +
            '<td>' + escapeHtml(material.unit || '-') + '</td>' +
            '<td><button class="add-quick-btn" ' +
            'data-impa="' + escapeHtml(material.impa) + '" ' +
            'data-desc="' + escapeHtml(material.description) + '" ' +
            'data-spec="' + escapeHtml(material.specification || '') + '" ' +
            'data-unit="' + escapeHtml(material.unit || '') + '" ' +
            'data-remark="' + escapeHtml(material.remark || '') + '">' +
            '<i class="fas fa-plus"></i> 添加</button></td>' +
            '</tr>';
    }
    quickSearchTbody.innerHTML = rows;
    quickSearchResultsDiv.style.display = 'block';
}

/**
 * 绑定搜索事件
 * 输入事件只 dispatch 命令，由订阅触发搜索
 */
function bindSearchEvents() {
    let searchTimer = null;
    if (quickSearchInput) {
        quickSearchInput.addEventListener('input', function () {
            if (searchTimer) clearTimeout(searchTimer);
            searchTimer = setTimeout(function () {
                searchTimer = null;
                dispatch('setQuickSearchKeyword', { keyword: quickSearchInput.value });
            }, QUICK_SEARCH_DEBOUNCE_MS);
        });
    }
    if (quickSearchFieldSelect) {
        quickSearchFieldSelect.addEventListener('change', function () {
            dispatch('setQuickSearchField', { field: quickSearchFieldSelect.value });
        });
    }
    if (clearQuickSearchBtn) {
        clearQuickSearchBtn.addEventListener('click', function () {
            if (quickSearchInput) quickSearchInput.value = '';
            dispatch('setQuickSearchKeyword', { keyword: '' });
        });
    }
}

/**
 * 绑定搜索结果点击事件
 * S4：区分"已存在"与"添加成功"，分别给出反馈
 */
function bindResultEvents() {
    if (!quickSearchResultsDiv) return;
    quickSearchResultsDiv.addEventListener('click', function (event) {
        const addButton = event.target.closest('.add-quick-btn');
        if (!addButton) return;
        const material = {
            impa: addButton.dataset.impa,
            description: addButton.dataset.desc,
            specification: addButton.dataset.spec,
            unit: addButton.dataset.unit,
            remark: addButton.dataset.remark,
        };

        // 添加前检测"是否已存在"，用于区分两种失败
        const vault = getVaultSnapshot();
        let alreadyExists = false;
        if (vault) {
            const items = vault.currentApplication.items;
            for (let index = 0; index < items.length; index++) {
                if (items[index].impa === material.impa) {
                    alreadyExists = true;
                    break;
                }
            }
        }

        const added = dispatch('addItemToApplication', { material: material });
        if (added) {
            showMessage('✅ 已添加 ' + material.impa);
            if (quickSearchResultsDiv) quickSearchResultsDiv.style.display = 'none';
            if (quickSearchInput) quickSearchInput.value = '';
            dispatch('setQuickSearchKeyword', { keyword: '' });
        } else if (alreadyExists) {
            showMessage('⚠️ ' + material.impa + ' 已在申请单中', true);
        } else {
            showMessage('⚠️ 添加失败，请检查物料数据', true);
        }
    });
}

/**
 * 订阅数据变更
 * 仅在此处调用 performQuickSearch，避免双重触发
 */
export function subscribeToVault() {
    subscribe('ui', function () {
        const vault = getVaultSnapshot();
        if (!vault) return;
        if (quickSearchInput && quickSearchInput.value !== vault.ui.quickSearchKeyword) {
            quickSearchInput.value = vault.ui.quickSearchKeyword;
        }
        if (quickSearchFieldSelect && quickSearchFieldSelect.value !== vault.ui.quickSearchField) {
            quickSearchFieldSelect.value = vault.ui.quickSearchField;
        }
        if (vault.ui.quickSearchKeyword.trim()) {
            performQuickSearch();
        } else if (quickSearchResultsDiv) {
            quickSearchResultsDiv.style.display = 'none';
        }
    });
}