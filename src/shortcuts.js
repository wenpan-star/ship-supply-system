// filename: src/shortcuts.js
// 船舶物料申请系统 · 键盘快捷键
// 全局键盘事件处理
//
// 【M-31 修复保持】Ctrl/Cmd+K 根据当前 Tab 聚焦对应搜索框
//
// 【本轮修改】
//   新增两个模态框到 Esc 关闭链：
//     - confirm-input.js 的 forceCloseConfirmInputModal
//     - confirm-choice.js 的 forceCloseConfirmChoiceModal
//   关闭顺序（从高到低）：
//     1. 确认对话框 (confirm)
//     2. 输入模态框 (confirm-input)  ← 新增
//     3. 选项模态框 (confirm-choice) ← 新增
//     4. 编辑物料 (edit-material)
//     5. 修改密码 (change-password)
//     6. 导出备份 (export-backup)
//     7. 回收站面板 (recycle-bin)
//     8. 数据损坏恢复 (corruption-recovery)
//   顺序与 README 中"Esc 优先级链"的描述保持一致。

import {
    getVaultSnapshot,
} from './core/facade.js';
import {
    forceCloseConfirmDialog,
} from './views/modals/confirm.js';
import {
    forceCloseConfirmInputModal,
} from './views/modals/confirm-input.js';
import {
    forceCloseConfirmChoiceModal,
} from './views/modals/confirm-choice.js';
import {
    forceCloseEditMaterialModal,
} from './views/modals/edit-material.js';
import {
    forceCloseChangePasswordModal,
} from './views/modals/change-password.js';
import {
    forceCloseExportBackupModal,
} from './views/modals/export-backup.js';
import {
    forceCloseCorruptionRecoveryModal,
} from './views/modals/corruption-recovery.js';
import {
    forceCloseRecycleBinModal,
} from './views/modals/recycle-bin-modal.js';

/**
 * 关闭最上层浮层
 * 顺序：从"最后打开的"往"最早打开的"回退。
 * 由于应用不支持多模态框叠加（打开新模态框会关闭旧的），
 * 这个固定顺序等价于 LIFO。
 * @returns {boolean}
 */
function closeTopmostOverlay() {
    if (forceCloseConfirmDialog()) return true;
    if (forceCloseConfirmInputModal()) return true;
    if (forceCloseConfirmChoiceModal()) return true;
    if (forceCloseEditMaterialModal()) return true;
    if (forceCloseChangePasswordModal()) return true;
    if (forceCloseExportBackupModal()) return true;
    if (forceCloseRecycleBinModal()) return true;
    if (forceCloseCorruptionRecoveryModal()) return true;
    return false;
}

/**
 * 判断元素是否在模态框内
 * @param {Element} element
 * @returns {boolean}
 */
function isInsideModal(element) {
    if (!element || typeof element.closest !== 'function') return false;
    return element.closest('.modal-overlay') !== null ||
           element.closest('.auth-overlay') !== null;
}

/**
 * 初始化快捷键
 * @param {Object} options
 * @param {Function} options.onDeleteSelected
 * @param {Function} options.onClearSearch
 * @param {Function} options.getSelectedCount
 */
export function initializeShortcuts(options) {
    document.addEventListener('keydown', function (event) {
        const targetTagName = event.target.tagName;
        const isInputFocused = targetTagName === 'INPUT' ||
                              targetTagName === 'TEXTAREA' ||
                              event.target.isContentEditable;

        // ---------- 输入框内的键盘处理 ----------
        if (isInputFocused) {
            if (event.key === 'Escape' && !event.isComposing) {
                // 若输入框位于模态框内，Esc 优先关闭最上层模态框
                if (isInsideModal(event.target)) {
                    if (closeTopmostOverlay()) {
                        return;
                    }
                }
                // 否则仅失焦
                event.target.blur();
                return;
            }
            return;
        }

        // ---------- Ctrl/Cmd + K：聚焦当前 Tab 对应的搜索框 ----------
        // 【M-31 修复】根据 activeTab 决定目标
        if ((event.ctrlKey || event.metaKey) && (event.key === 'k' || event.key === 'K')) {
            event.preventDefault();
            const vault = getVaultSnapshot();
            const activeTab = vault ? vault.ui.activeTab : 'reqTab';
            let targetInputId = 'searchKeyword';
            if (activeTab === 'reqTab') {
                targetInputId = 'reqSearchKeyword';
            } else if (activeTab === 'materialTab') {
                targetInputId = 'searchKeyword';
            }
            const searchInput = document.getElementById(targetInputId);
            if (searchInput) {
                searchInput.focus();
                searchInput.select();
            }
            return;
        }

        // ---------- Esc：关闭浮层 → 清空搜索 ----------
        if (event.key === 'Escape') {
            const closedAnyOverlay = closeTopmostOverlay();
            if (closedAnyOverlay) return;
            if (typeof options.onClearSearch === 'function') {
                options.onClearSearch();
            }
            const reqSearchKeyword = document.getElementById('reqSearchKeyword');
            if (reqSearchKeyword) reqSearchKeyword.blur();
            return;
        }

        // ---------- Delete：删除已勾选的申请单项 ----------
        if (event.key === 'Delete' && typeof options.onDeleteSelected === 'function') {
            if (typeof options.getSelectedCount === 'function' && options.getSelectedCount() > 0) {
                event.preventDefault();
                options.onDeleteSelected();
            }
        }
    });
}