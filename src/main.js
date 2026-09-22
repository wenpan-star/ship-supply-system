// filename: src/main.js
// 船舶物料申请系统 · 应用入口
// 唯一职责：初始化所有子系统并接线
//
// 【本轮修改】
//   M-new-1 修复：applyImportedBackup 回收站合并语义。
//     旧实现在 concat 后直接 slice(0, MAX_RECYCLE_BIN_SIZE)，
//     保留了"现有条目在前、导入条目在后"的顺序，
//     可能导致旧条目占满配额而丢弃导入中更高优（更新）的条目。
//     现在只做 concat，交由 normalizeVault → normalizeRecycleBin
//     统一执行"按 deletedAt 降序 + 去重 + 截断到容量上限"。
//   其余修复保持不变：
//     - Bug-1（申请单头双向同步启动注入）
//     - M-1（导入回收站使用常量）
//     - M-2（新建申请单文案）
//     - M-6（上次查看 reqNo 恢复）
//     - M-8（导入备份并发 IO）
//     - m-21 / m-22（移除冗余动态 import）

import {
    XLSX_CDN_URLS,
    LOCALFORAGE_CDN_URLS,
    STORAGE_KEY_META,
    STORAGE_KEY_FAILED_ATTEMPTS,
    STORAGE_KEY_LOGIN_LOCKOUT_UNTIL,
    STORAGE_KEY_SETTINGS,
    STORAGE_KEY_ACTIVE_TAB,
    STORAGE_KEY_CURRENT_LANG,
    STORAGE_KEY_REQ_SORT_FIELD,
    STORAGE_KEY_REQ_SORT_ASC,
    STORAGE_KEY_REQ_DEFAULT_ORDER,
    STORAGE_KEY_REQ_SEARCH_KEYWORD,
    STORAGE_KEY_REQ_SEARCH_FIELD,
    STORAGE_KEY_MATERIAL_SEARCH_KEYWORD,
    STORAGE_KEY_MATERIAL_SEARCH_FIELD,
    STORAGE_KEY_MATERIAL_PAGE_SIZE,
    STORAGE_KEY_MATERIAL_CURRENT_PAGE,
    STORAGE_KEY_QUICK_SEARCH_KEYWORD,
    STORAGE_KEY_QUICK_SEARCH_FIELD,
    STORAGE_KEY_REQ_COLUMN_WIDTHS,
    STORAGE_KEY_MATERIAL_COLUMN_WIDTHS,
    STORAGE_KEY_LAST_VIEWED_REQ_NO,
    DEFAULT_REQ_PREFIX,
    DEFAULT_APPLICANT,
    DEFAULT_REQ_COLUMN_WIDTHS,
    DEFAULT_MATERIAL_COLUMN_WIDTHS,
} from './constants.js';
import {
    initializeRepository,
} from './core/repository.js';
import {
    createEmptyVault,
    normalizeVault,
    countRecycleBinItems,
} from './core/vault.js';
import {
    setVault,
    dispatch,
    getVaultSnapshot,
    subscribe,
    replaceVault,
} from './core/facade.js';
import {
    loadChunkedData,
    secureGetItem,
    secureSetItem,
} from './core/persist.js';
import {
    isCorrupted,
} from './core/corruption.js';
import {
    readMeta,
    setupMasterPassword,
    verifyPassword,
    recordFailedLogin,
    resetFailedLogin,
    getLoginLockoutState,
    syncLoginStateFromStorage,
    requirePasswordAuth,
} from './core/auth.js';
import {
    addLog,
    flushLogs,
    getOperationLogs,
    formatLogsAsText,
} from './core/audit-log.js';
import {
    encryptData,
    decryptData,
} from './core/crypto.js';
import {
    registerAllCommands,
} from './commands/registry.js';
import {
    getLocalDatetimeString,
    getLocalDateString,
} from './utils/format.js';
import {
    initializeToast,
    showMessage,
    updateStatusBar,
} from './views/toast.js';
import {
    bindPasswordStrengthMeter,
    showMainApp,
    hideAuthOverlay,
    setAuthError,
    setAuthTitle,
    setPassword2Visibility,
    setStrengthContainerVisibility,
    setAuthSubmitDisabled,
    getAuthInputValues,
    bindAuthSubmit,
    bindAuthEnterKey,
} from './views/auth-view.js';
import {
    initializeRequestTable,
    renderRequestTable,
    updateSortIndicators,
    subscribeToVault as subscribeRequestTable,
    getSelectedImpaCount,
    syncApplicationHeaderOnStartup,
} from './views/request-table.js';
import {
    initializeMaterialTable,
    performMaterialSearch,
    updateLibraryCount,
    subscribeToVault as subscribeMaterialTable,
} from './views/material-table.js';
import {
    initializeQuickAdd,
    subscribeToVault as subscribeQuickAdd,
} from './views/quick-add.js';
import {
    initializeHistoryList,
    refreshHistoryList,
    loadHistoryApplication,
} from './views/history-list.js';
import {
    initializeBatchImportUI,
    batchAddMaterialsFromExcel,
    importRequestFromExcel,
} from './views/batch-import-ui.js';
import {
    initResizeHandlers,
    applyColumnWidths,
} from './views/column-resize.js';
import {
    openChangePasswordModal,
} from './views/modals/change-password.js';
import {
    openExportBackupModal,
} from './views/modals/export-backup.js';
import {
    openCorruptionRecoveryModal,
    handleCorruptionChoice,
} from './views/modals/corruption-recovery.js';
import {
    openRecycleBinModal,
} from './views/modals/recycle-bin-modal.js';
import {
    showConfirmDialog,
} from './views/modals/confirm.js';
import {
    openEditMaterialModal,
} from './views/modals/edit-material.js';
import {
    exportRequestToExcel,
    exportBackupExcel,
} from './services/export-suite/excel-export.js';
import {
    exportBackupJSON,
} from './services/export-suite/json-export.js';
import {
    initializeShortcuts,
} from './shortcuts.js';

// ==================== 依赖加载 ====================

function loadScript(url) {
    return new Promise(function (resolve, reject) {
        const script = document.createElement('script');
        script.src = url;
        script.onload = function () { resolve(); };
        script.onerror = function () { reject(new Error('加载失败: ' + url)); };
        document.head.appendChild(script);
    });
}

async function tryLoadWithRetry(cdnList, libraryName) {
    for (let index = 0; index < cdnList.length; index++) {
        try {
            await loadScript(cdnList[index]);
            console.log('✅ ' + libraryName + ' 加载成功: ' + cdnList[index]);
            return;
        } catch (loadError) {
            console.warn('⚠️ ' + libraryName + ' CDN 加载失败: ' + cdnList[index], loadError);
        }
    }
    throw new Error(libraryName + ' 所有 CDN 均加载失败');
}

async function loadAllLibraries() {
    const xlsxPromise = (typeof window.XLSX !== 'undefined')
        ? Promise.resolve()
        : tryLoadWithRetry(XLSX_CDN_URLS, 'XLSX');
    const localforagePromise = (typeof window.localforage !== 'undefined')
        ? Promise.resolve()
        : tryLoadWithRetry(LOCALFORAGE_CDN_URLS, 'localforage');
    await Promise.all([xlsxPromise, localforagePromise]);
}

// ==================== 状态恢复 ====================

function restoreUiStateFromLocalStorage(vault) {
    try {
        const savedActiveTab = localStorage.getItem(STORAGE_KEY_ACTIVE_TAB);
        if (savedActiveTab === 'materialTab' || savedActiveTab === 'reqTab') {
            vault.ui.activeTab = savedActiveTab;
        }
        const savedLang = localStorage.getItem(STORAGE_KEY_CURRENT_LANG);
        if (savedLang === 'en' || savedLang === 'zh') {
            vault.ui.currentLang = savedLang;
        }
        const savedSortField = localStorage.getItem(STORAGE_KEY_REQ_SORT_FIELD);
        if (savedSortField !== null) {
            vault.ui.reqSortField = savedSortField || null;
        }
        const savedSortAsc = localStorage.getItem(STORAGE_KEY_REQ_SORT_ASC);
        if (savedSortAsc !== null) {
            vault.ui.reqSortAsc = savedSortAsc === 'true';
        }
        const savedDefaultOrder = localStorage.getItem(STORAGE_KEY_REQ_DEFAULT_ORDER);
        if (savedDefaultOrder === 'reverse' || savedDefaultOrder === 'normal') {
            vault.ui.reqDefaultOrder = savedDefaultOrder;
        }
        const savedReqKeyword = localStorage.getItem(STORAGE_KEY_REQ_SEARCH_KEYWORD);
        if (savedReqKeyword !== null) {
            vault.ui.reqFilterKeyword = savedReqKeyword;
        }
        const savedReqField = localStorage.getItem(STORAGE_KEY_REQ_SEARCH_FIELD);
        if (savedReqField) {
            vault.ui.reqSearchField = savedReqField;
        }
        const savedMaterialKeyword = localStorage.getItem(STORAGE_KEY_MATERIAL_SEARCH_KEYWORD);
        if (savedMaterialKeyword !== null) {
            vault.ui.materialSearchKeyword = savedMaterialKeyword;
        }
        const savedMaterialField = localStorage.getItem(STORAGE_KEY_MATERIAL_SEARCH_FIELD);
        if (savedMaterialField) {
            vault.ui.materialSearchField = savedMaterialField;
        }
        const savedPageSize = parseInt(localStorage.getItem(STORAGE_KEY_MATERIAL_PAGE_SIZE) || '', 10);
        if (Number.isFinite(savedPageSize) && savedPageSize > 0) {
            vault.ui.materialPageSize = savedPageSize;
        }
        const savedPage = parseInt(localStorage.getItem(STORAGE_KEY_MATERIAL_CURRENT_PAGE) || '', 10);
        if (Number.isFinite(savedPage) && savedPage > 0) {
            vault.ui.materialCurrentPage = savedPage;
        }
        const savedQuickKeyword = localStorage.getItem(STORAGE_KEY_QUICK_SEARCH_KEYWORD);
        if (savedQuickKeyword !== null) {
            vault.ui.quickSearchKeyword = savedQuickKeyword;
        }
        const savedQuickField = localStorage.getItem(STORAGE_KEY_QUICK_SEARCH_FIELD);
        if (savedQuickField) {
            vault.ui.quickSearchField = savedQuickField;
        }
        const savedReqWidths = localStorage.getItem(STORAGE_KEY_REQ_COLUMN_WIDTHS);
        if (savedReqWidths) {
            try {
                const parsedWidths = JSON.parse(savedReqWidths);
                if (Array.isArray(parsedWidths) && parsedWidths.length === DEFAULT_REQ_COLUMN_WIDTHS.length) {
                    vault.ui.reqColumnWidths = parsedWidths;
                }
            } catch (parseError) {
                console.warn('[main] 列宽解析失败（申请单）:', parseError);
            }
        }
        const savedMaterialWidths = localStorage.getItem(STORAGE_KEY_MATERIAL_COLUMN_WIDTHS);
        if (savedMaterialWidths) {
            try {
                const parsedWidths = JSON.parse(savedMaterialWidths);
                if (Array.isArray(parsedWidths) && parsedWidths.length === DEFAULT_MATERIAL_COLUMN_WIDTHS.length) {
                    vault.ui.materialColumnWidths = parsedWidths;
                }
            } catch (parseError) {
                console.warn('[main] 列宽解析失败（物料库）:', parseError);
            }
        }
    } catch (storageError) {
        console.warn('[main] 恢复 UI 状态失败:', storageError);
    }
}

/**
 * 读取 localStorage 中记录的上次查看的申请单 reqNo
 * M-6：启动时优先恢复
 * @returns {string}  无记录时返回空字符串
 */
function readLastViewedReqNo() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY_LAST_VIEWED_REQ_NO);
        return typeof saved === 'string' ? saved : '';
    } catch (readError) {
        console.warn('[main] 读取上次查看的申请单失败:', readError);
        return '';
    }
}

/**
 * 写入上次查看的申请单 reqNo
 * M-6：在 currentApplication.reqNo 变化时调用
 * @param {string} reqNo
 */
function writeLastViewedReqNo(reqNo) {
    try {
        if (reqNo) {
            localStorage.setItem(STORAGE_KEY_LAST_VIEWED_REQ_NO, reqNo);
        } else {
            localStorage.removeItem(STORAGE_KEY_LAST_VIEWED_REQ_NO);
        }
    } catch (writeError) {
        console.warn('[main] 写入上次查看的申请单失败:', writeError);
    }
}

async function loadInitialVault() {
    const vault = createEmptyVault();
    try {
        const enData = await loadChunkedData('en');
        const zhData = await loadChunkedData('zh');
        vault.materialsEn = Array.isArray(enData) ? enData : [];
        vault.materialsZh = Array.isArray(zhData) ? zhData : [];
    } catch (loadError) {
        console.error('[main] 物料库加载失败:', loadError);
    }

    try {
        const savedRecycleBin = await secureGetItem('app', '__recycleBin__', null);
        if (Array.isArray(savedRecycleBin)) {
            vault.recycleBin = savedRecycleBin;
        }
    } catch (recycleLoadError) {
        console.warn('[main] 回收站加载失败:', recycleLoadError);
    }

    // M-6 修复：优先恢复上次查看的申请单 reqNo
    let defaultReqNo = DEFAULT_REQ_PREFIX + getLocalDateString();
    const lastViewedReqNo = readLastViewedReqNo();
    if (lastViewedReqNo) {
        defaultReqNo = lastViewedReqNo;
    }

    vault.currentApplication = {
        reqNo: defaultReqNo,
        applicant: DEFAULT_APPLICANT,
        applyTime: getLocalDatetimeString(),
        items: [],
    };

    try {
        const savedApplication = await secureGetItem('app', defaultReqNo, null);
        if (savedApplication && typeof savedApplication === 'object') {
            vault.currentApplication = normalizeVault({
                materialsEn: vault.materialsEn,
                materialsZh: vault.materialsZh,
                currentApplication: savedApplication,
                recycleBin: vault.recycleBin,
                ui: vault.ui,
            }).currentApplication;
        }
    } catch (appLoadError) {
        console.warn('[main] 尝试加载历史申请单失败:', appLoadError);
    }

    restoreUiStateFromLocalStorage(vault);

    try {
        const savedSettings = localStorage.getItem(STORAGE_KEY_SETTINGS);
        if (savedSettings) {
            const parsedSettings = JSON.parse(savedSettings);
            if (parsedSettings && typeof parsedSettings === 'object') {
                vault.settings = parsedSettings;
            }
        }
    } catch (settingsError) {
        console.warn('[main] 设置解析失败:', settingsError);
    }

    return normalizeVault(vault);
}

// ==================== 认证流程 ====================

function startAuthFlow() {
    return new Promise(function (resolve) {
        const meta = readMeta();

        bindPasswordStrengthMeter();
        bindAuthEnterKey(function () {
            const submitBtn = document.getElementById('authSubmitBtn');
            if (submitBtn) submitBtn.click();
        });

        if (!meta) {
            setAuthTitle('<i class="fas fa-lock"></i> 首次使用：设定主密码 (AES-256)');
            setPassword2Visibility(true);
            setStrengthContainerVisibility(true);

            bindAuthSubmit(async function () {
                const values = getAuthInputValues();
                if (!values.password1 || values.password1 !== values.password2) {
                    setAuthError('密码不一致');
                    return;
                }
                if (values.password1.length < 6) {
                    setAuthError('至少6位');
                    return;
                }
                try {
                    await setupMasterPassword(values.password1);
                    showMainApp();
                    hideAuthOverlay();
                    resolve(true);
                } catch (setupError) {
                    console.error('[main] 初始化失败:', setupError);
                    setAuthError('初始化失败，请查看控制台信息');
                }
            });
            return;
        }

        setAuthTitle('<i class="fas fa-key"></i> 请输入主密码解锁');
        setPassword2Visibility(false);
        setStrengthContainerVisibility(false);

        const lockState = getLoginLockoutState();
        if (lockState.locked) {
            setAuthSubmitDisabled(true);
            setAuthError('尝试次数过多，请等待 ' + lockState.remainingSeconds + ' 秒后重试');
            const unlockTimer = setInterval(function () {
                const nextState = getLoginLockoutState();
                if (!nextState.locked) {
                    clearInterval(unlockTimer);
                    setAuthSubmitDisabled(false);
                    setAuthError('');
                    resetFailedLogin();
                }
            }, 1000);
        } else {
            setAuthSubmitDisabled(false);
        }

        bindAuthSubmit(async function () {
            const lockStateNow = getLoginLockoutState();
            if (lockStateNow.locked) {
                setAuthError('尝试次数过多，请等待解锁');
                return;
            }
            const values = getAuthInputValues();
            const ok = await verifyPassword(values.password1, true);
            if (ok) {
                resetFailedLogin();
                showMainApp();
                hideAuthOverlay();
                resolve(true);
                return;
            }
            const failResult = recordFailedLogin();
            if (failResult.lockoutUntil > 0 && failResult.attemptsLeft === 0) {
                setAuthSubmitDisabled(true);
                setAuthError('尝试次数过多，请等待30秒后重试');
                const lockTimer = setInterval(function () {
                    const nextState = getLoginLockoutState();
                    if (!nextState.locked) {
                        clearInterval(lockTimer);
                        setAuthSubmitDisabled(false);
                        setAuthError('');
                        resetFailedLogin();
                    }
                }, 1000);
            } else {
                setAuthError('密码错误，剩余尝试次数：' + failResult.attemptsLeft);
            }
            const password1Input = document.getElementById('authPassword1');
            if (password1Input) {
                password1Input.value = '';
                password1Input.focus();
            }
        });
    });
}

// ==================== Tab / 语言 UI 同步（S2 / S3 修复） ====================

// 缓存上一次同步的 tab / 语言，避免每次 ui 变化都重排 DOM
let lastSyncedActiveTab = null;
let lastSyncedLang = null;

// M-6：缓存上次写入 localStorage 的 reqNo，避免重复写
let lastPersistedReqNo = null;

/**
 * 根据 vault.ui.activeTab 同步 tab 按钮与 pane 的 class
 * 【S2 修复】刷新后根据 vault 状态恢复 tab 视觉
 * @param {Object} vault
 */
function syncTabUIFromVault(vault) {
    if (!vault) return;
    const activeTab = vault.ui.activeTab;
    if (activeTab === lastSyncedActiveTab) return;
    lastSyncedActiveTab = activeTab;

    const tabButtons = document.querySelectorAll('.tab-btn');
    for (let index = 0; index < tabButtons.length; index++) {
        const button = tabButtons[index];
        if (button.dataset.tab === activeTab) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    }
    const panes = document.querySelectorAll('.tab-pane');
    for (let index = 0; index < panes.length; index++) {
        const pane = panes[index];
        if (pane.id === activeTab) {
            pane.classList.add('active-pane');
        } else {
            pane.classList.remove('active-pane');
        }
    }
}

/**
 * 根据 vault.ui.currentLang 同步语言按钮文本
 * 【S3 修复】刷新后根据 vault 状态恢复语言按钮文本
 * @param {Object} vault
 */
function syncLangUIFromVault(vault) {
    if (!vault) return;
    const currentLang = vault.ui.currentLang;
    if (currentLang === lastSyncedLang) return;
    lastSyncedLang = currentLang;

    const langText = document.getElementById('langText');
    if (langText) {
        langText.innerText = currentLang === 'en' ? 'EN' : '中';
    }
}

/**
 * M-6：将当前申请单 reqNo 写入 localStorage，供下次启动恢复
 * @param {Object} vault
 */
function persistLastViewedReqNo(vault) {
    if (!vault) return;
    const reqNo = vault.currentApplication.reqNo;
    if (reqNo === lastPersistedReqNo) return;
    lastPersistedReqNo = reqNo;
    writeLastViewedReqNo(reqNo);
}

// ==================== 视图初始化 ====================

function initializeAllViews() {
    initializeRequestTable({
        onExportExcel: handleExportRequest,
        onImportFromExcel: handleImportRequestFromExcel,
        onLoad: handleLoadApplication,
        onNew: handleNewApplication,
        onSave: handleManualSave,
    });

    initializeMaterialTable({
        onEditMaterial: handleEditMaterial,
        onDeleteMaterial: handleDeleteMaterial,
    });

    initializeQuickAdd();

    initializeHistoryList({
        onApplicationLoaded: function (reqNo) {
            updateStatusBar('📋 已加载 ' + reqNo);
        },
    });

    initializeBatchImportUI();

    const currentVault = getVaultSnapshot();
    if (currentVault) {
        applyColumnWidths('reqColgroup', currentVault.ui.reqColumnWidths);
        applyColumnWidths('materialColgroup', currentVault.ui.materialColumnWidths);
    }

    initResizeHandlers(
        'reqTable',
        function () {
            const vault = getVaultSnapshot();
            return vault ? vault.ui.reqColumnWidths : [];
        },
        function (widths) { applyColumnWidths('reqColgroup', widths); },
        'setReqColumnWidths'
    );
    initResizeHandlers(
        'materialSearchTable',
        function () {
            const vault = getVaultSnapshot();
            return vault ? vault.ui.materialColumnWidths : [];
        },
        function (widths) { applyColumnWidths('materialColgroup', widths); },
        'setMaterialColumnWidths'
    );
}

function updateRecycleBinBadge(vault) {
    const badge = document.getElementById('recycleBinBadge');
    if (!badge) return;
    const count = countRecycleBinItems(vault);
    badge.innerText = String(count);
    badge.style.display = count > 0 ? 'inline-block' : 'none';
}

function subscribeAllViews() {
    subscribeRequestTable();
    subscribeMaterialTable();
    subscribeQuickAdd();

    subscribe('recycleBin', function (vault) {
        if (!vault) return;
        updateRecycleBinBadge(vault);
    });

    // 订阅 application：Bug-1 已在 request-table.js 中处理申请单头同步；
    //   这里只负责 M-6 的 localStorage 记录。
    subscribe('application', function (vault) {
        if (!vault) return;
        persistLastViewedReqNo(vault);
    });

    // 订阅 ui 变化：同步 tab 与语言（内部有缓存，无变化时不重排）
    subscribe('ui', function (vault) {
        if (!vault) return;
        syncTabUIFromVault(vault);
        syncLangUIFromVault(vault);
    });

    renderRequestTable();
    updateSortIndicators();
    performMaterialSearch();
    updateLibraryCount();

    const vault = getVaultSnapshot();
    if (vault) {
        updateRecycleBinBadge(vault);
        // 首次同步：立即应用 vault 中的 tab / 语言 / 申请单头状态
        syncTabUIFromVault(vault);
        syncLangUIFromVault(vault);
        // Bug-1：首次启动把 vault 里的申请单头填到 DOM
        syncApplicationHeaderOnStartup(vault);
        // M-6：首次启动记录当前 reqNo
        persistLastViewedReqNo(vault);
    }
}

// ==================== UI 事件处理 ====================

function handleExportRequest() {
    const vault = getVaultSnapshot();
    if (!vault) return;
    const success = exportRequestToExcel(vault);
    if (success) {
        addLog('导出申请单', vault.currentApplication.reqNo);
    }
}

function handleImportRequestFromExcel() {
    importRequestFromExcel();
}

function handleLoadApplication() {
    const reqNoInput = document.getElementById('reqSerial');
    if (!reqNoInput) return;
    const reqNo = reqNoInput.value.trim();
    if (!reqNo) {
        alert('请输入次序号');
        return;
    }
    loadHistoryApplication(reqNo);
}

/**
 * 新建申请单
 *
 * 【M-2 修复】文案改为"覆盖"，与 newApplication 命令的实际语义一致。
 *   旧文案"打开该申请单"暗示加载行为，但实际执行的是创建空白申请单，
 *   原有条目会被替换。此处给出明确提示，避免用户误操作丢失数据。
 */
async function handleNewApplication() {
    const newNo = prompt(
        '新申请次序号',
        DEFAULT_REQ_PREFIX + Date.now().toString().slice(-6)
    );
    if (!newNo) return;

    try {
        const existing = await secureGetItem('app', newNo, null);
        if (existing && typeof existing === 'object') {
            const overwrite = await showConfirmDialog(
                '已存在申请单「' + newNo + '」（含 ' +
                (existing.items ? existing.items.length : 0) +
                ' 条物料）。\n\n继续将用新的空白申请单覆盖该数据。是否继续？'
            );
            if (!overwrite) return;
        }
    } catch (checkError) {
        console.warn('[main] 重名校验失败:', checkError);
    }

    dispatch('newApplication', {
        reqNo: newNo,
        applicant: DEFAULT_APPLICANT,
        applyTime: getLocalDatetimeString(),
    });
    // 申请单头三输入框由 request-table.js 的 subscribe('application') 自动同步，
    // 无需手动赋值 reqNoInput.value。
    updateStatusBar('📋 已创建 ' + newNo);
    await refreshHistoryList();
}

async function handleManualSave() {
    const vault = getVaultSnapshot();
    if (!vault) return;
    try {
        await secureSetItem('app', vault.currentApplication.reqNo, vault.currentApplication);
        updateStatusBar('✅ 已保存 ' + vault.currentApplication.reqNo);
        addLog('保存申请单', vault.currentApplication.reqNo);
        await refreshHistoryList();
    } catch (saveError) {
        console.error('[main] 保存失败:', saveError);
        updateStatusBar('❌ 保存失败', 'error');
    }
}

async function handleEditMaterial(impa) {
    const vault = getVaultSnapshot();
    if (!vault) return;
    const language = vault.ui.currentLang;
    const array = language === 'en' ? vault.materialsEn : vault.materialsZh;
    let material = null;
    for (let index = 0; index < array.length; index++) {
        if (array[index].impa === impa) {
            material = array[index];
            break;
        }
    }
    if (!material) return;

    const result = await openEditMaterialModal(material);
    if (!result) return;

    dispatch('editMaterial', {
        language: language,
        impa: impa,
        description: result.description,
        specification: result.specification,
        unit: result.unit,
        remark: result.remark,
    });
    addLog('编辑物料', impa);
}

async function handleDeleteMaterial(impa) {
    const vault = getVaultSnapshot();
    if (!vault) return;
    const confirmed = await showConfirmDialog(
        '确定删除物料 ' + impa + ' ？\n\n删除后可在回收站中恢复。'
    );
    if (!confirmed) return;
    const didDelete = dispatch('deleteMaterial', {
        language: vault.ui.currentLang,
        impa: impa,
    });
    if (didDelete) {
        showMessage('✅ 已移入回收站');
        addLog('删除物料（软删除）', impa);
    }
}

async function handleExportBackup() {
    const choice = await openExportBackupModal();
    if (!choice) return;
    if (choice.format === 'json') {
        await exportBackupJSON();
    } else {
        await exportBackupExcel(
            choice.includeMaterials,
            choice.includeApplications,
            choice.materialSourceFilter
        );
    }
}

// ==================== 回收站事件处理 ====================

async function handleOpenRecycleBin() {
    dispatch('cleanupExpiredRecycleBinItems', {});

    await openRecycleBinModal({
        getItems: function () {
            const vault = getVaultSnapshot();
            return (vault && Array.isArray(vault.recycleBin)) ? vault.recycleBin : [];
        },
        handlers: {
            onRestoreSingle: handleRecycleRestoreSingle,
            onRestoreBatch: handleRecycleRestoreBatch,
            onPurgeSingle: handleRecyclePurgeSingle,
            onPurgeBatch: handleRecyclePurgeBatch,
            onClearAll: handleRecycleClearAll,
        },
    });
}

async function handleRecycleRestoreSingle(binId) {
    const vault = getVaultSnapshot();
    if (!vault) return false;

    let targetItem = null;
    for (let index = 0; index < vault.recycleBin.length; index++) {
        if (vault.recycleBin[index].id === binId) {
            targetItem = vault.recycleBin[index];
            break;
        }
    }
    if (!targetItem) {
        showMessage('该条目已不存在', true);
        return false;
    }

    const languageLabel = targetItem.language === 'en' ? '英文库' : '中文库';
    const didRestore = dispatch('restoreMaterialFromRecycleBin', { recycleBinItemId: binId });
    if (didRestore) {
        showMessage('✅ 已恢复到「' + languageLabel + '」');
        addLog('回收站恢复', targetItem.material.impa);
        return true;
    }
    showMessage('恢复失败：目标库中已存在相同 IMPA', true);
    return false;
}

async function handleRecycleRestoreBatch(binIds) {
    if (!Array.isArray(binIds) || binIds.length === 0) return false;
    const didRestore = dispatch('restoreMaterialsFromRecycleBin', { recycleBinItemIds: binIds });
    if (didRestore) {
        showMessage('✅ 批量恢复完成（冲突的条目保留在回收站）');
        addLog('回收站批量恢复', binIds.length + ' 条');
        return true;
    }
    showMessage('恢复失败：所有选中条目均与目标库冲突', true);
    return true;
}

async function handleRecyclePurgeSingle(binId) {
    const vault = getVaultSnapshot();
    if (!vault) return false;
    let targetItem = null;
    for (let index = 0; index < vault.recycleBin.length; index++) {
        if (vault.recycleBin[index].id === binId) {
            targetItem = vault.recycleBin[index];
            break;
        }
    }
    if (!targetItem) {
        showMessage('该条目已不存在', true);
        return false;
    }

    const previewText = targetItem.material.description || targetItem.material.impa;
    const confirmed = await showConfirmDialog(
        '确定彻底删除此条目吗？\n\n' + previewText + '\n\n此操作不可恢复。'
    );
    if (!confirmed) return false;

    const didPurge = dispatch('purgeMaterialFromRecycleBin', { recycleBinItemId: binId });
    if (didPurge) {
        showMessage('已彻底删除');
        addLog('回收站彻底删除', targetItem.material.impa);
        return true;
    }
    return false;
}

async function handleRecyclePurgeBatch(binIds) {
    if (!Array.isArray(binIds) || binIds.length === 0) return false;
    const confirmed = await showConfirmDialog(
        '确定彻底删除选中的 ' + binIds.length + ' 条吗？\n\n此操作不可恢复。'
    );
    if (!confirmed) return false;

    const didPurge = dispatch('purgeMaterialsFromRecycleBin', { recycleBinItemIds: binIds });
    if (didPurge) {
        showMessage('已彻底删除 ' + binIds.length + ' 条');
        addLog('回收站批量彻底删除', binIds.length + ' 条');
        return true;
    }
    return false;
}

async function handleRecycleClearAll() {
    const vault = getVaultSnapshot();
    if (!vault || !Array.isArray(vault.recycleBin) || vault.recycleBin.length === 0) return false;
    const confirmed = await showConfirmDialog(
        '确定清空回收站吗？\n\n共 ' + vault.recycleBin.length +
        ' 条将被永久删除，此操作不可恢复。'
    );
    if (!confirmed) return false;

    const didClear = dispatch('clearRecycleBin', {});
    if (didClear) {
        showMessage('回收站已清空');
        addLog('清空回收站', '');
        return true;
    }
    return false;
}

// ==================== 工具栏绑定 ====================

function bindToolbarButtons() {
    const changePasswordBtn = document.getElementById('changePasswordBtn');
    if (changePasswordBtn) {
        changePasswordBtn.addEventListener('click', function () {
            openChangePasswordModal();
        });
    }

    const showAuditLogBtn = document.getElementById('showAuditLogBtn');
    if (showAuditLogBtn) {
        showAuditLogBtn.addEventListener('click', handleShowAuditLog);
    }

    const recycleBinBtn = document.getElementById('recycleBinBtn');
    if (recycleBinBtn) {
        recycleBinBtn.addEventListener('click', handleOpenRecycleBin);
    }

    const toggleLangBtn = document.getElementById('toggleLangBtn');
    if (toggleLangBtn) {
        toggleLangBtn.addEventListener('click', function () {
            const vault = getVaultSnapshot();
            if (!vault) return;
            const nextLang = vault.ui.currentLang === 'en' ? 'zh' : 'en';
            dispatch('setCurrentLang', { currentLang: nextLang });
            // 不再手动设置 langText；由 subscribe('ui') 统一同步
        });
    }

    const exportBackupBtn = document.getElementById('exportBackupBtn');
    if (exportBackupBtn) {
        exportBackupBtn.addEventListener('click', handleExportBackup);
    }

    const importBackupBtn = document.getElementById('importBackupBtn');
    if (importBackupBtn) {
        importBackupBtn.addEventListener('click', handleImportBackup);
    }

    const importLibraryBtn = document.getElementById('importLibraryBtn');
    if (importLibraryBtn) {
        importLibraryBtn.addEventListener('click', function () {
            batchAddMaterialsFromExcel('import');
        });
    }

    const batchAddMaterialBtn = document.getElementById('batchAddMaterialBtn');
    if (batchAddMaterialBtn) {
        batchAddMaterialBtn.addEventListener('click', function () {
            batchAddMaterialsFromExcel('batch');
        });
    }

    const clearLibraryBtn = document.getElementById('clearLibraryBtn');
    if (clearLibraryBtn) {
        clearLibraryBtn.addEventListener('click', handleClearLibrary);
    }

    const addCustomMaterialBtn = document.getElementById('addCustomMaterialBtn');
    if (addCustomMaterialBtn) {
        addCustomMaterialBtn.addEventListener('click', handleAddCustomMaterial);
    }

    const reloadMaterialBtn = document.getElementById('reloadMaterialBtn');
    if (reloadMaterialBtn) {
        reloadMaterialBtn.addEventListener('click', async function () {
            // m-21 修复：静态 import 已提供 loadChunkedData，无需动态 import
            const enData = await loadChunkedData('en');
            const zhData = await loadChunkedData('zh');
            const vault = getVaultSnapshot();
            if (!vault) return;
            replaceVault(Object.assign({}, vault, {
                materialsEn: Array.isArray(enData) ? enData : [],
                materialsZh: Array.isArray(zhData) ? zhData : [],
            }), ['materials']);
            showMessage('✅ 物料库已刷新');
            addLog('手动重载物料库', '');
        });
    }
}

/**
 * 显示审计日志
 * 提示文本明确"确定=导出 / 取消=查看"，减少语义歧义
 */
async function handleShowAuditLog() {
    const logs = getOperationLogs();
    if (!logs.length) {
        alert('暂无操作日志');
        return;
    }
    const recent = logs.slice(0, 100).map(function (logEntry) {
        return logEntry.timestamp + ' | ' + logEntry.action + ' | ' + logEntry.details;
    }).join('\n');
    const exportChoice = await showConfirmDialog(
        '共有 ' + logs.length + ' 条日志。\n\n' +
        '请选择操作：\n' +
        '【确定】= 导出全部日志为加密文件\n' +
        '【取消】= 仅查看最近 100 条'
    );
    if (exportChoice) {
        try {
            const text = formatLogsAsText();
            const encryptedLogs = await encryptData(text);
            const backupObject = {
                encrypted: true,
                type: 'audit_logs',
                data: encryptedLogs,
            };
            const jsonString = JSON.stringify(backupObject, null, 2);
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = '审计日志_加密_' + getLocalDateString() + '.json';
            anchor.click();
            URL.revokeObjectURL(url);
            addLog('导出审计日志', '加密导出');
        } catch (encryptError) {
            alert('加密导出失败：' + encryptError.message);
        }
    } else {
        alert('📋 操作日志(最近100条):\n' + recent);
    }
}

async function handleImportBackup() {
    if (!await requirePasswordAuth('导入JSON备份')) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async function (event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const rawData = JSON.parse(text);

            if (!rawData || rawData.encrypted !== true || typeof rawData.data !== 'string') {
                alert(
                    '导入失败：备份文件格式无效。\n\n' +
                    '系统仅接受本程序导出的加密备份文件（含 encrypted 字段）。'
                );
                return;
            }

            const decryptedJson = await decryptData(rawData.data);
            const decryptedData = JSON.parse(decryptedJson);
            await applyImportedBackup(decryptedData);
        } catch (importError) {
            alert('导入失败：' + importError.message);
            console.error(importError);
        }
    };
    input.click();
}

/**
 * 应用导入的备份数据
 *
 * 【M-new-1 修复】回收站合并语义。
 *   旧实现在 concat 后直接 slice(0, MAX_RECYCLE_BIN_SIZE)，
 *   保留了"现有条目在前、导入条目在后"的顺序，
 *   可能导致旧条目占满配额而丢弃导入中更高优（更新）的条目。
 *   现在只做 concat，交由 normalizeVault → normalizeRecycleBin
 *   统一执行"按 deletedAt 降序 + 去重 + 截断到容量上限"，
 *   与 deleteMaterial / cleanupExpiredRecycleBinItems 的契约保持一致。
 *
 * 【M-8 修复】申请单的读取/写入改为并发（Promise.all），
 *   减少 100 个申请单时累计的串行 IO 延迟。
 */
async function applyImportedBackup(rawData) {
    const vault = getVaultSnapshot();
    if (!vault) return;

    const enData = Array.isArray(rawData.en) ? rawData.en : [];
    const zhData = Array.isArray(rawData.zh) ? rawData.zh : [];
    const recycleBinData = Array.isArray(rawData.recycleBin) ? rawData.recycleBin : [];
    const appsData = rawData.apps && typeof rawData.apps === 'object' ? rawData.apps : null;

    if (!enData.length && !zhData.length && !appsData && !recycleBinData.length) {
        alert('导入失败：无有效数据');
        return;
    }

    let overwriteMode = false;
    if (enData.length || zhData.length) {
        const modeChoice = prompt(
            '物料库导入模式：\n请输入数字选择：\n1 = 覆盖对应语言库\n2 = 合并追加（存在重复时跳过）',
            '2'
        );
        if (modeChoice === null) return;
        const trimmedMode = modeChoice.trim();
        if (trimmedMode === '1') overwriteMode = true;
        else if (trimmedMode === '2') overwriteMode = false;
        else {
            alert('无效选择，操作取消');
            return;
        }
    }

    const mergeArray = function (current, incoming, isOverwrite) {
        if (isOverwrite) return incoming.slice();
        const materialMap = new Map();
        for (let index = 0; index < current.length; index++) {
            materialMap.set(current[index].impa, current[index]);
        }
        for (let index = 0; index < incoming.length; index++) {
            if (!materialMap.has(incoming[index].impa)) {
                materialMap.set(incoming[index].impa, incoming[index]);
            }
        }
        return Array.from(materialMap.values());
    };

    let importedAppCount = 0;
    let skippedAppCount = 0;
    if (appsData && Object.keys(appsData).length > 0) {
        const appKeys = Object.keys(appsData).filter(function (key) {
            return key !== 'meta' && !key.startsWith('chunk_') && !key.startsWith('backup_') && key !== '__recycleBin__';
        });

        // M-8：并发读取冲突检查
        const conflictResults = await Promise.all(
            appKeys.map(async function (appKey) {
                try {
                    const existing = await secureGetItem('app', appKey, null);
                    return (existing && typeof existing === 'object') ? appKey : null;
                } catch (readError) {
                    console.warn('[main] 冲突检查失败: ' + appKey, readError);
                    return null;
                }
            })
        );
        const conflicts = conflictResults.filter(function (item) { return item !== null; });

        let shouldImportApps = true;
        if (conflicts.length > 0) {
            shouldImportApps = await showConfirmDialog(
                '检测到 ' + conflicts.length + ' 个同名申请单将被覆盖：\n\n' +
                conflicts.slice(0, 10).join('\n') +
                (conflicts.length > 10 ? '\n...' : '') +
                '\n\n是否覆盖这些申请单？'
            );
        } else {
            shouldImportApps = await showConfirmDialog(
                '备份中包含 ' + appKeys.length + ' 个申请单。\n是否恢复申请单数据？'
            );
        }

        if (shouldImportApps) {
            // M-8：并发写入
            const writeResults = await Promise.all(
                appKeys.map(async function (appKey) {
                    try {
                        await secureSetItem('app', appKey, appsData[appKey]);
                        return 'ok';
                    } catch (writeError) {
                        console.warn('[main] 申请单 ' + appKey + ' 写入失败:', writeError);
                        return 'fail';
                    }
                })
            );
            for (let index = 0; index < writeResults.length; index++) {
                if (writeResults[index] === 'ok') importedAppCount++;
                else skippedAppCount++;
            }
            await refreshHistoryList();
        }
    }

    // M-new-1 修复：不再在此处硬截断。
    //   合并后的数组交给 normalizeVault → normalizeRecycleBin 处理，
    //   保证"按 deletedAt 降序 + 去重 + 截断到容量上限"的统一语义。
    const currentRecycleBin = Array.isArray(vault.recycleBin) ? vault.recycleBin : [];
    const mergedRecycleBin = recycleBinData.length > 0
        ? currentRecycleBin.concat(recycleBinData)
        : currentRecycleBin;

    const nextVault = normalizeVault({
        materialsEn: enData.length ? mergeArray(vault.materialsEn, enData, overwriteMode) : vault.materialsEn,
        materialsZh: zhData.length ? mergeArray(vault.materialsZh, zhData, overwriteMode) : vault.materialsZh,
        currentApplication: vault.currentApplication,
        recycleBin: mergedRecycleBin,
        ui: vault.ui,
        settings: vault.settings,
        meta: vault.meta,
    });

    replaceVault(nextVault, ['materials', 'application', 'recycleBin', 'ui', 'settings', 'meta']);
    addLog(
        '导入JSON备份',
        'EN:' + enData.length + ' ZH:' + zhData.length +
        ' 回收站:' + recycleBinData.length +
        ' 申请单:' + importedAppCount +
        (skippedAppCount > 0 ? '（跳过 ' + skippedAppCount + ' 个失败）' : '')
    );
    alert(
        '✅ 导入完成！\n' +
        '英文库共 ' + nextVault.materialsEn.length + ' 条，' +
        '中文库共 ' + nextVault.materialsZh.length + ' 条，' +
        '回收站 ' + nextVault.recycleBin.length + ' 条，' +
        '恢复申请单 ' + importedAppCount + ' 个' +
        (skippedAppCount > 0 ? '（跳过 ' + skippedAppCount + ' 个失败）' : '')
    );
}

async function handleClearLibrary() {
    if (!await requirePasswordAuth('清空全部物料库')) return;
    const confirmed = await showConfirmDialog(
        '⚠️ 危险操作：将清空【英文库】和【中文库】所有物料数据！\n\n此操作不可撤销，确认清空全部物料库？'
    );
    if (!confirmed) return;
    dispatch('clearAllMaterials', {});
    addLog('清空库', '所有物料数据已清空');
    alert('物料库已完全清空');
}

function handleAddCustomMaterial() {
    const impaInput = document.getElementById('newImpa');
    const descInput = document.getElementById('newDesc');
    const specInput = document.getElementById('newSpec');
    const unitInput = document.getElementById('newUnit');
    const remarkInput = document.getElementById('newRemark');
    if (!impaInput || !descInput) return;
    const impa = impaInput.value.trim();
    const description = descInput.value.trim();
    if (!impa || !description) {
        alert('IMPA和描述必填');
        return;
    }
    const vault = getVaultSnapshot();
    if (!vault) return;
    const added = dispatch('addMaterial', {
        language: vault.ui.currentLang,
        impa: impa,
        description: description,
        specification: specInput ? specInput.value.trim() : '',
        unit: unitInput ? unitInput.value.trim() : '',
        remark: remarkInput ? remarkInput.value.trim() : '',
        source: 'custom',
    });
    if (!added) {
        alert('IMPA已存在');
        return;
    }
    impaInput.value = '';
    descInput.value = '';
    if (specInput) specInput.value = '';
    if (unitInput) unitInput.value = '';
    if (remarkInput) remarkInput.value = '';
    addLog('添加物料', impa);
}

/**
 * Tab 切换绑定
 * 仅 dispatch，不再手动切换 class；由 subscribe('ui') 统一同步
 */
function bindTabSwitching() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    for (let index = 0; index < tabButtons.length; index++) {
        tabButtons[index].addEventListener('click', function () {
            const targetTab = tabButtons[index].dataset.tab;
            if (!targetTab) return;
            dispatch('setActiveTab', { activeTab: targetTab });
        });
    }
}

function bindCrossTabSync() {
    window.addEventListener('storage', function (event) {
        if (event.key === STORAGE_KEY_META) {
            alert('主密码已更改，请刷新页面重新登录');
            location.reload();
        } else if (
            event.key === STORAGE_KEY_FAILED_ATTEMPTS ||
            event.key === STORAGE_KEY_LOGIN_LOCKOUT_UNTIL
        ) {
            syncLoginStateFromStorage();
        }
    });
}

/**
 * 页面卸载前处理
 * 先 addLog 再 flushLogs，避免日志进入未触发的防抖定时器而丢失
 */
function bindBeforeUnload() {
    window.addEventListener('beforeunload', function () {
        addLog('页面卸载', '用户离开页面');
        flushLogs();
    });
}

async function handleCorruptionRecovery() {
    const choice = await openCorruptionRecoveryModal();
    await handleCorruptionChoice(choice);
}

// ==================== 启动流程 ====================

async function bootstrap() {
    initializeToast();

    try {
        await loadAllLibraries();
    } catch (libError) {
        console.error('[main] 依赖库加载失败:', libError);
        showMessage('⚠️ ' + libError.message + '，请刷新重试', true);
        return;
    }

    if (!initializeRepository()) {
        showMessage('⚠️ 存储初始化失败，请检查浏览器设置', true);
        return;
    }

    const authOk = await startAuthFlow();
    if (!authOk) return;

    let vault;
    try {
        vault = await loadInitialVault();
    } catch (loadError) {
        console.error('[main] Vault 加载失败:', loadError);
        showMessage('⚠️ 应用数据加载失败。请刷新页面重试', true);
        return;
    }

    setVault(vault);

    registerAllCommands();

    initializeAllViews();
    subscribeAllViews();
    bindTabSwitching();
    bindToolbarButtons();
    bindCrossTabSync();
    bindBeforeUnload();

    initializeShortcuts({
        onDeleteSelected: function () {
            const count = getSelectedImpaCount();
            if (count > 0) {
                const batchDeleteReqBtn = document.getElementById('batchDeleteReqBtn');
                if (batchDeleteReqBtn) batchDeleteReqBtn.click();
            }
        },
        onClearSearch: function () {
            dispatch('setReqFilterKeyword', { keyword: '' });
        },
        getSelectedCount: function () {
            return getSelectedImpaCount();
        },
    });

    await refreshHistoryList();

    if (isCorrupted()) {
        setTimeout(function () {
            handleCorruptionRecovery();
        }, 500);
    }
}

bootstrap().catch(function (bootstrapError) {
    console.error('[main] 应用启动失败:', bootstrapError);
    try {
        showMessage('应用启动失败，请刷新页面重试', true);
    } catch (toastError) {
        console.error('[main] Toast 显示失败:', toastError);
    }
});