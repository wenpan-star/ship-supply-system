// filename: src/views/modals/corruption-recovery.js
// 船舶物料申请系统 · 数据损坏恢复模态框
//
// 【Enter 键策略】
//   两个选项分别是"重置系统"（危险）与"标记为正常"（安全）。
//   按 Enter 时触发"标记为正常"，避免误触危险操作。

import {
    resetSystemAfterCorruption,
    requirePasswordAuth,
} from '../../core/auth.js';
import {
    clearCorrupted,
} from '../../core/corruption.js';
import {
    addLog,
} from '../../core/audit-log.js';

let modalElement = null;
let currentResolve = null;

function buildModal() {
    const modal = document.createElement('div');
    modal.id = 'corruptionRecoveryModal';
    modal.className = 'modal-overlay';
    modal.style.display = 'none';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'corruptionRecoveryModalTitle');
    modal.innerHTML =
        '<div class="modal-card" style="max-width:520px;">' +
        '<i class="fas fa-exclamation-triangle" style="font-size:2.5rem;color:#cc7d1a;"></i>' +
        '<h3 id="corruptionRecoveryModalTitle">检测到数据损坏</h3>' +
        '<p style="text-align:left;">系统已阻止保存操作，防止损坏数据被覆盖。请选择处理方式：</p>' +
        '<div style="text-align:left;margin:1rem 0;line-height:1.6;font-size:0.9rem;">' +
        '<div style="margin-bottom:0.8rem;padding:0.8rem;background:#fbeae9;border-radius:10px;">' +
        '<strong>选项 1：重置系统</strong><br>' +
        '清空所有数据，重新开始。此操作不可撤销。' +
        '</div>' +
        '<div style="padding:0.8rem;background:#fef0d8;border-radius:10px;">' +
        '<strong>选项 2：标记数据为正常</strong><br>' +
        '仅当您确认数据完整性无问题时使用。若数据实际已损坏，可能导致进一步问题。' +
        '</div>' +
        '</div>' +
        '<div class="modal-actions">' +
        '<button id="corruptionReset" type="button" style="background:#fbeae9;color:#9e2a2b;border-color:#e7bcbc;">重置系统</button>' +
        '<button id="corruptionMarkOk" class="confirm-primary" type="button">标记为正常</button>' +
        '</div>' +
        '</div>';
    document.body.appendChild(modal);
    return modal;
}

function cleanup() {
    if (!modalElement) return;
    modalElement.style.display = 'none';
    modalElement.onkeydown = null;
    currentResolve = null;
}

/**
 * Enter 键处理：触发"标记为正常"（安全选项）
 * @param {KeyboardEvent} event
 */
function handleKeydown(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        const markOkButton = modalElement.querySelector('#corruptionMarkOk');
        if (markOkButton) markOkButton.click();
    }
}

/**
 * 打开数据损坏恢复模态框
 * @returns {Promise<'reset' | 'markOk' | null>}
 */
export function openCorruptionRecoveryModal() {
    if (!modalElement) {
        modalElement = buildModal();

        modalElement.querySelector('#corruptionReset').addEventListener('click', async function () {
            const authorized = await requirePasswordAuth('重置系统');
            if (!authorized) return;
            cleanup();
            if (currentResolve) {
                const resolver = currentResolve;
                currentResolve = null;
                resolver('reset');
            }
        });

        modalElement.querySelector('#corruptionMarkOk').addEventListener('click', async function () {
            const authorized = await requirePasswordAuth('标记数据为正常');
            if (!authorized) return;
            cleanup();
            if (currentResolve) {
                const resolver = currentResolve;
                currentResolve = null;
                resolver('markOk');
            }
        });
    }

    modalElement.style.display = 'flex';
    modalElement.onkeydown = handleKeydown;

    return new Promise(function (resolve) {
        currentResolve = resolve;
    });
}

/**
 * 强制关闭（供 Esc 调用）
 * @returns {boolean}
 */
export function forceCloseCorruptionRecoveryModal() {
    if (!currentResolve) return false;
    cleanup();
    return true;
}

/**
 * 处理选择结果（在主入口调用）
 * @param {'reset' | 'markOk' | null} choice
 */
export async function handleCorruptionChoice(choice) {
    if (choice === 'reset') {
        await resetSystemAfterCorruption();
    } else if (choice === 'markOk') {
        clearCorrupted();
        const statusEl = document.getElementById('autoSaveStatus');
        if (statusEl) {
            statusEl.innerText = '✅ 数据损坏标志已清除，保存功能已恢复';
            setTimeout(function () {
                statusEl.innerText = '安全加密 · 实时保存已就绪 · IndexedDB 存储 ✅';
            }, 3000);
        }
        addLog('清除数据损坏标志', '用户确认数据完整性后恢复写操作');
    }
}