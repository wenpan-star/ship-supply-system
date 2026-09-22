// filename: src/views/modals/export-backup.js
// 船舶物料申请系统 · 导出备份选项模态框
// 支持选择格式（JSON/Excel）与内容（物料库/申请单）、来源筛选

import {
    MATERIAL_SOURCE_FILTER_OPTIONS,
} from '../../constants.js';

let modalElement = null;
let currentResolve = null;
let excelOptionsDiv = null;
let errorDiv = null;

function buildModal() {
    const modal = document.createElement('div');
    modal.id = 'exportBackupModal';
    modal.className = 'modal-overlay';
    modal.style.display = 'none';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-labelledby', 'exportBackupModalTitle');
    modal.innerHTML =
        '<div class="modal-card" style="max-width:480px;">' +
        '<i class="fas fa-download" style="font-size:2rem;color:#1f6893;"></i>' +
        '<h3 id="exportBackupModalTitle">导出备份</h3>' +
        '<p>请选择备份格式和内容</p>' +
        '<div style="text-align:left;margin-bottom:1rem;">' +
        '<label style="display:block;font-weight:600;margin-bottom:6px;">备份格式</label>' +
        '<div style="margin-bottom:6px;"><label><input type="radio" name="backupFormat" value="json" checked> JSON（加密，含全部数据，推荐）</label></div>' +
        '<div><label><input type="radio" name="backupFormat" value="excel"> Excel（明文，便于查看）</label></div>' +
        '</div>' +
        '<div id="excelOptions" style="text-align:left;margin-bottom:1rem;display:none;">' +
        '<label style="display:block;font-weight:600;margin-bottom:6px;">导出内容</label>' +
        '<div style="margin-bottom:6px;"><label><input type="checkbox" id="includeMaterials" checked> 物料库（中英文）</label></div>' +
        '<div style="margin-bottom:12px;"><label><input type="checkbox" id="includeApplications" checked> 申请单汇总</label></div>' +
        '<label style="display:block;font-weight:600;margin-bottom:6px;">物料来源筛选</label>' +
        '<select id="materialSourceFilter" style="width:100%;padding:8px;border-radius:40px;border:1px solid #ccc;">' +
        '<option value="all">全部物料</option>' +
        '<option value="custom_batch" selected>仅自定义添加 + 批量追加</option>' +
        '<option value="custom">仅快速添加</option>' +
        '<option value="batch">仅批量追加</option>' +
        '<option value="import">仅标准导入</option>' +
        '</select>' +
        '</div>' +
        '<div id="exportBackupError" class="modal-error"></div>' +
        '<div class="modal-actions">' +
        '<button id="exportBackupCancel" type="button">取消</button>' +
        '<button id="exportBackupConfirm" class="confirm-primary" type="button">导出</button>' +
        '</div>' +
        '</div>';
    document.body.appendChild(modal);
    return modal;
}

function cleanup() {
    if (!modalElement) return null;
    modalElement.style.display = 'none';
    modalElement.onkeydown = null;
    const resolver = currentResolve;
    currentResolve = null;
    return resolver;
}

/**
 * 处理"确认导出"逻辑（被按钮点击与 Enter 键共用）
 */
function triggerExport() {
    const format = modalElement.querySelector('input[name="backupFormat"]:checked').value;
    if (format === 'json') {
        const resolver = cleanup();
        if (resolver) resolver({ format: 'json' });
    } else {
        const includeMaterials = modalElement.querySelector('#includeMaterials').checked;
        const includeApplications = modalElement.querySelector('#includeApplications').checked;
        const materialSourceFilter = modalElement.querySelector('#materialSourceFilter').value;
        if (!includeMaterials && !includeApplications) {
            errorDiv.innerText = '请至少选择一项导出内容';
            return;
        }
        const resolver = cleanup();
        if (resolver) {
            resolver({
                format: 'excel',
                includeMaterials: includeMaterials,
                includeApplications: includeApplications,
                materialSourceFilter: materialSourceFilter,
            });
        }
    }
}

/**
 * Enter 键处理：触发"导出"
 * @param {KeyboardEvent} event
 */
function handleKeydown(event) {
    if (event.key === 'Enter') {
        event.preventDefault();
        triggerExport();
    }
}

/**
 * 打开导出备份模态框
 * @returns {Promise<Object|null>}
 */
export function openExportBackupModal() {
    if (!modalElement) {
        modalElement = buildModal();
        excelOptionsDiv = modalElement.querySelector('#excelOptions');
        errorDiv = modalElement.querySelector('#exportBackupError');

        const formatRadios = modalElement.querySelectorAll('input[name="backupFormat"]');
        for (let index = 0; index < formatRadios.length; index++) {
            formatRadios[index].addEventListener('change', function () {
                if (formatRadios[index].value === 'excel') {
                    excelOptionsDiv.style.display = 'block';
                } else {
                    excelOptionsDiv.style.display = 'none';
                }
            });
        }

        modalElement.querySelector('#exportBackupCancel').addEventListener('click', function () {
            const resolver = cleanup();
            if (resolver) resolver(null);
        });

        modalElement.querySelector('#exportBackupConfirm').addEventListener('click', function () {
            triggerExport();
        });
    }

    if (currentResolve) {
        const oldResolver = currentResolve;
        currentResolve = null;
        oldResolver(null);
        cleanup();
    }

    errorDiv.innerText = '';
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
export function forceCloseExportBackupModal() {
    if (!currentResolve) return false;
    const resolver = currentResolve;
    currentResolve = null;
    cleanup();
    resolver(null);
    return true;
}