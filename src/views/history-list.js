// filename: src/views/history-list.js
// 船舶物料申请系统 · 历史申请单视图
// 负责：渲染历史申请单下拉、加载、刷新、删除
//
// 【Bug-1 联动】request-table.js 会自动同步申请单头输入框，
//   本模块的 dispatch('loadApplication' | 'newApplication') 无需额外同步 DOM。

import {
    $,
} from '../utils/dom.js';
import {
    getVaultSnapshot,
    dispatch,
} from '../core/facade.js';
import {
    getKeys,
    removeRawItem,
} from '../core/repository.js';
import {
    secureGetItem,
} from '../core/persist.js';
import {
    addLog,
} from '../core/audit-log.js';
import {
    DEFAULT_REQ_PREFIX,
    DEFAULT_APPLICANT,
} from '../constants.js';
import {
    getLocalDatetimeString,
    getLocalDateString,
} from '../utils/format.js';
import {
    showConfirmDialog,
} from './modals/confirm.js';

let historyReqSelect = null;
let refreshHistoryBtn = null;
let historyDeleteIconBtn = null;
let handlers = {
    onApplicationLoaded: function () {},
};

export function initializeHistoryList(options) {
    handlers = Object.assign(handlers, options || {});
    historyReqSelect = $('#historyReqSelect');
    refreshHistoryBtn = $('#refreshHistoryBtn');
    historyDeleteIconBtn = $('#historyDeleteIconBtn');

    bindEvents();
}

export async function refreshHistoryList() {
    if (!historyReqSelect) return false;
    try {
        const keys = await getKeys('app');
        historyReqSelect.innerHTML = '<option value="">-- 已保存的申请单 --</option>';
        const validKeys = keys.filter(function (key) {
            return !key.startsWith('chunk_') &&
                   key !== 'meta' &&
                   !key.startsWith('backup_') &&
                   key !== '__recycleBin__';
        });
        validKeys.sort(function (keyA, keyB) {
            return keyA.localeCompare(keyB);
        });
        for (let index = 0; index < validKeys.length; index++) {
            const option = document.createElement('option');
            option.value = validKeys[index];
            option.textContent = validKeys[index];
            historyReqSelect.appendChild(option);
        }
        return true;
    } catch (refreshError) {
        console.error('[history-list] 刷新历史申请单列表失败:', refreshError);
        historyReqSelect.innerHTML = '<option value="">-- 加载失败，请重试 --</option>';
        return false;
    }
}

export async function loadHistoryApplication(reqNo) {
    if (!reqNo) return false;
    const vault = getVaultSnapshot();
    if (!vault) return false;

    const currentItems = vault.currentApplication.items;
    if (currentItems.length > 0) {
        const userConfirmed = await showConfirmDialog(
            '当前申请单有 ' + currentItems.length + ' 条物料，是否放弃修改并加载其他申请单？'
        );
        if (!userConfirmed) return false;
    }

    let saved = null;
    try {
        saved = await secureGetItem('app', reqNo, null);
    } catch (loadError) {
        console.error('[history-list] 加载申请单失败:', loadError);
        return false;
    }

    if (saved && typeof saved === 'object') {
        dispatch('loadApplication', { application: saved });
        handlers.onApplicationLoaded(reqNo);
        return true;
    }

    const createNew = await showConfirmDialog(
        '申请单 ' + reqNo + ' 不存在。是否创建新的空申请单？'
    );
    if (!createNew) return false;

    dispatch('newApplication', {
        reqNo: reqNo,
        applicant: DEFAULT_APPLICANT,
        applyTime: getLocalDatetimeString(),
    });
    handlers.onApplicationLoaded(reqNo);
    return true;
}

export async function deleteHistoryApplication(reqNo) {
    if (!reqNo) {
        alert('请先选择要删除的申请单');
        return;
    }
    const confirmed = await showConfirmDialog('删除 ' + reqNo + ' ？此操作不可撤销。');
    if (!confirmed) return;

    try {
        await removeRawItem('app', reqNo);
        await refreshHistoryList();
        const vault = getVaultSnapshot();
        if (vault && vault.currentApplication.reqNo === reqNo) {
            const todayDate = getLocalDateString();
            const newReqNo = DEFAULT_REQ_PREFIX + todayDate;
            dispatch('newApplication', {
                reqNo: newReqNo,
                applicant: DEFAULT_APPLICANT,
                applyTime: getLocalDatetimeString(),
            });
            handlers.onApplicationLoaded(newReqNo);
        }
        addLog('删除申请单', reqNo);
    } catch (deleteError) {
        console.error('[history-list] 删除失败:', deleteError);
        alert('删除失败，请查看控制台信息');
    }
}

function bindEvents() {
    if (refreshHistoryBtn) {
        refreshHistoryBtn.addEventListener('click', function () {
            refreshHistoryList();
        });
    }
    if (historyReqSelect) {
        historyReqSelect.addEventListener('change', function () {
            const reqNo = historyReqSelect.value;
            if (reqNo) loadHistoryApplication(reqNo);
        });
    }
    if (historyDeleteIconBtn) {
        historyDeleteIconBtn.addEventListener('click', async function () {
            const reqNo = historyReqSelect ? historyReqSelect.value : '';
            if (reqNo) {
                await deleteHistoryApplication(reqNo);
            } else {
                alert('请选择');
            }
        });
    }
}