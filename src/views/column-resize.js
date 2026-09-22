// filename: src/views/column-resize.js
// 船舶物料申请系统 · 表格列宽拖拽
// 负责：为表头添加拖拽句柄、实时调整列宽、持久化
//
// 【关键设计】
//   workingWidths 在每次 mousedown 时从 getWidths() 重新读取，
//   避免外部修改列宽（导入配置 / 恢复备份 / 未来扩展）后拖拽基准过时。

import {
    dispatch,
} from '../core/facade.js';
import {
    MIN_COLUMN_WIDTH,
} from '../constants.js';

/**
 * 为指定表格添加列宽调整句柄
 * @param {string} tableId
 * @param {Function} getWidths
 * @param {Function} applyWidths
 * @param {string} commandName
 */
export function initResizeHandlers(tableId, getWidths, applyWidths, commandName) {
    const table = document.getElementById(tableId);
    if (!table) return;
    const headers = table.querySelectorAll('thead th');
    const initialWidths = getWidths();
    const initialLength = Array.isArray(initialWidths) ? initialWidths.length : 0;

    for (let index = 0; index < headers.length; index++) {
        if (index >= initialLength) continue;
        const header = headers[index];

        const existingHandle = header.querySelector('.resize-handle');
        if (existingHandle) existingHandle.remove();

        const handle = document.createElement('div');
        handle.className = 'resize-handle';

        (function (columnIndex) {
            handle.addEventListener('mousedown', function (startEvent) {
                startEvent.preventDefault();

                // 每次 mousedown 时从 getWidths() 重新读取，
                // 保证基准宽度与当前 Vault 状态一致
                const latestWidths = getWidths();
                if (!Array.isArray(latestWidths) || latestWidths.length <= columnIndex) return;

                const workingWidths = latestWidths.slice();
                const startX = startEvent.clientX;
                const startWidth = workingWidths[columnIndex];

                function onMouseMove(moveEvent) {
                    let newWidth = startWidth + (moveEvent.clientX - startX);
                    if (isNaN(newWidth)) newWidth = startWidth;
                    if (newWidth < MIN_COLUMN_WIDTH) newWidth = MIN_COLUMN_WIDTH;
                    workingWidths[columnIndex] = Math.round(newWidth);
                    applyWidths(workingWidths);
                }

                function onMouseUp() {
                    document.removeEventListener('mousemove', onMouseMove);
                    document.removeEventListener('mouseup', onMouseUp);
                    dispatch(commandName, { widths: workingWidths.slice() });
                }

                document.addEventListener('mousemove', onMouseMove);
                document.addEventListener('mouseup', onMouseUp);
            });
        })(index);

        header.style.position = 'relative';
        header.appendChild(handle);
    }
}

/**
 * 应用列宽到 colgroup
 * @param {string} colgroupId
 * @param {number[]} widths
 */
export function applyColumnWidths(colgroupId, widths) {
    const colgroup = document.getElementById(colgroupId);
    if (!colgroup) return;
    if (!Array.isArray(widths)) return;
    let html = '';
    for (let index = 0; index < widths.length; index++) {
        html += '<col style="width:' + widths[index] + 'px;">';
    }
    colgroup.innerHTML = html;
}