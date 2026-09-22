// filename: src/views/batch-import-ui.js
// 船舶物料申请系统 · 批量导入 UI
// 负责：
//   1. 物料库批量导入（CN/EN 双表）
//   2. 申请单从 Excel 导入（复用物料库匹配）
//
// 【S7 修复保持】申请单导入支持"覆盖 / 追加"选项
// 【m-6 修复保持】申请单导入 addedCount === 0 时给出明确反馈
//
// 【本轮修改】
//   M-10 修复：将三处原生 prompt() 替换为统一模态框。
//     - 物料库导入模式选择（CN+EN 两表）：openConfirmChoiceModal
//     - 物料库导入模式选择（单表）：openConfirmChoiceModal
//     - 申请单工作表选择（CN/EN/合并）：openConfirmChoiceModal
//     - 申请单写入模式选择（覆盖/追加）：openConfirmChoiceModal
//   优点：选项以按钮呈现，避免用户手输数字错误；
//         键盘可达；统一视觉风格与无障碍语义。
//   注意：导入流程本身在文件选择回调中执行，属于异步流程，
//         await 新模态框后行为与 prompt 完全一致。

import {
    $,
} from '../utils/dom.js';
import {
    getVaultSnapshot,
    dispatch,
} from '../core/facade.js';
import {
    requirePasswordAuth,
} from '../core/auth.js';
import {
    addLog,
} from '../core/audit-log.js';
import {
    parseExcelFile,
} from '../services/import-pipeline/parser.js';
import {
    validateSheets,
} from '../services/import-pipeline/validator.js';
import {
    transformToMaterialRecords,
} from '../services/import-pipeline/transformer.js';
import {
    mergeByLanguage,
} from '../services/import-pipeline/merger.js';
import {
    writeToVault,
} from '../services/import-pipeline/writer.js';
import {
    executeRequestImport,
} from '../services/import-pipeline/import-request.js';
import {
    MATERIAL_SOURCES,
    EXPORT_FAILED_ITEMS_PREFIX,
    MAX_HEADER_PROBE_ROWS,
} from '../constants.js';
import {
    getLocalDateString,
} from '../utils/format.js';
import {
    showConfirmDialog,
} from './modals/confirm.js';
import {
    openConfirmChoiceModal,
} from './modals/confirm-choice.js';

let progressArea = null;
let progressText = null;
let progressFill = null;

export function initializeBatchImportUI() {
    progressArea = $('#importProgressArea');
    progressText = $('#importProgressText');
    progressFill = $('#importProgressFill');
}

function updateProgress(text, percent) {
    if (!progressArea) return;
    progressArea.style.display = 'block';
    if (progressText) progressText.innerText = text;
    if (progressFill) progressFill.style.width = percent + '%';
}

function hideProgress(delayMs) {
    if (!progressArea) return;
    setTimeout(function () {
        progressArea.style.display = 'none';
    }, delayMs === undefined ? 800 : delayMs);
}

/**
 * 通过模态框询问"物料库导入模式"
 * 返回：
 *   { overwrite: boolean } —— 用户已选择
 *   null                   —— 用户取消
 * @returns {Promise<{overwrite: boolean}|null>}
 */
async function askMaterialImportMode(hasCnAndEn) {
    const message = hasCnAndEn
        ? '检测到「CN」和「EN」两个工作表。'
        : '请选择导入模式。';
    const result = await openConfirmChoiceModal({
        title: '导入模式',
        message: message,
        choices: [
            {
                value: 'overwrite',
                label: '覆盖对应语言库',
                description: '新数据完全替换原有数据，原有物料将被丢弃。',
            },
            {
                value: 'merge',
                label: '合并追加',
                description: '保留原有数据，重复 IMPA 的条目跳过。',
            },
        ],
        defaultIndex: 1,
        cancelText: '取消',
    });
    if (!result) return null;
    return { overwrite: result.value === 'overwrite' };
}

// ==================== 物料库批量导入 ====================

export async function batchAddMaterialsFromExcel(sourceType) {
    const effectiveSourceType = (sourceType === 'import')
        ? MATERIAL_SOURCES.IMPORT
        : MATERIAL_SOURCES.BATCH;

    if (!await requirePasswordAuth('批量导入物料（支持中英文表）')) return;

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx';
    input.onchange = async function (event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;

        updateProgress('读取文件...', 5);

        try {
            const parseResult = await parseExcelFile(file);
            if (parseResult.error) {
                throw new Error(parseResult.error);
            }

            const hasCn = parseResult.sheetNames.some(function (name) {
                return name.toUpperCase() === 'CN';
            });
            const hasEn = parseResult.sheetNames.some(function (name) {
                return name.toUpperCase() === 'EN';
            });

            const modeChoice = await askMaterialImportMode(hasCn && hasEn);
            if (!modeChoice) { hideProgress(0); return; }
            const overwriteMode = modeChoice.overwrite;

            updateProgress('解析数据...', 20);

            const validation = validateSheets(parseResult, hasCn, hasEn);
            if (validation.error) throw new Error(validation.error);

            updateProgress('转换数据...', 50);
            const records = transformToMaterialRecords(validation, effectiveSourceType, updateProgress);

            updateProgress('合并数据...', 70);
            const vault = getVaultSnapshot();
            if (!vault) throw new Error('Vault 未初始化');

            const merged = mergeByLanguage(
                vault.materialsEn,
                vault.materialsZh,
                records,
                overwriteMode
            );

            updateProgress('保存数据...', 85);
            const saveResult = await writeToVault(merged, overwriteMode);
            if (!saveResult.success) {
                throw new Error(saveResult.error || '保存失败');
            }

            updateProgress('完成', 100);
            hideProgress();

            addLog(
                '批量导入物料',
                'CN:' + (records.zh ? records.zh.length : 0) +
                ' EN:' + (records.en ? records.en.length : 0) +
                ' 模式:' + (overwriteMode ? '覆盖' : '合并追加')
            );

            alert(
                '✅ 导入完成！\n' +
                '中文库：' + merged.materialsZh.length + ' 条\n' +
                '英文库：' + merged.materialsEn.length + ' 条'
            );
        } catch (importError) {
            hideProgress(0);
            console.error('[batch-import-ui] 导入失败:', importError);
            alert('批量导入失败：' + importError.message);
        }
    };
    input.click();
}

// ==================== 申请单从 Excel 导入 ====================

/**
 * 从 Excel 导入物料项目到当前申请单
 * 【S7 修复保持】当当前申请单非空时，询问"覆盖 / 追加"
 * 【m-6 修复保持】addedCount === 0 时给出明确反馈
 * 【M-10 修复】使用模态框替代 prompt
 */
export function importRequestFromExcel() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.xlsx';
    input.onchange = async function (event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;

        try {
            const parseResult = await parseExcelFile(file);
            if (parseResult.error) {
                throw new Error(parseResult.error);
            }

            const allSheetNames = parseResult.sheetNames;
            const hasCnSheet = allSheetNames.some(function (name) {
                return name.toUpperCase() === 'CN';
            });
            const hasEnSheet = allSheetNames.some(function (name) {
                return name.toUpperCase() === 'EN';
            });

            let chosenSheetNames = [];
            if (hasCnSheet && hasEnSheet) {
                const sheetChoice = await openConfirmChoiceModal({
                    title: '选择工作表',
                    message: '检测到文件包含 CN 和 EN 两个工作表，请选择要导入的来源。',
                    choices: [
                        {
                            value: 'CN',
                            label: '导入 CN（中文）',
                            description: '使用中文工作表作为数据源。',
                        },
                        {
                            value: 'EN',
                            label: '导入 EN（英文）',
                            description: '使用英文工作表作为数据源。',
                        },
                        {
                            value: 'BOTH',
                            label: '合并两个工作表导入',
                            description: 'CN 优先，EN 作为补充。',
                        },
                    ],
                    defaultIndex: 0,
                });
                if (!sheetChoice) return;
                if (sheetChoice.value === 'EN') chosenSheetNames = ['EN'];
                else if (sheetChoice.value === 'BOTH') chosenSheetNames = ['CN', 'EN'];
                else chosenSheetNames = ['CN'];
            } else {
                chosenSheetNames = [allSheetNames[0]];
            }

            const vault = getVaultSnapshot();
            if (!vault) throw new Error('Vault 未初始化');

            const result = await executeRequestImport(
                parseResult,
                chosenSheetNames,
                vault,
                MAX_HEADER_PROBE_ROWS
            );

            // m-6 修复保持：全失败时明确反馈
            if (result.addedCount === 0 && result.failedRows.length > 0) {
                addLog(
                    '导入申请单',
                    '模式:无 成功 0 项，失败 ' + result.failedRows.length + ' 项（均未匹配物料库）'
                );
                exportFailedRows(result.failedRows, result.headerRow);
                await showConfirmDialog(
                    '导入未完成：所有行均未匹配到物料库。\n\n' +
                    '本次共 ' + result.failedRows.length + ' 行，' +
                    '均因 IMPA 不在物料库中而被跳过。\n\n' +
                    '失败项已自动导出为 Excel，请检查 IMPA 拼写或先导入物料库。'
                );
                return;
            }

            // S7 修复保持：处理导入项的写入模式
            let importedCount = 0;
            let skippedDuplicateCount = 0;
            let overwriteMode = true;

            if (result.addedCount > 0) {
                const currentItems = vault.currentApplication.items;
                if (currentItems.length > 0) {
                    const writeChoice = await openConfirmChoiceModal({
                        title: '导入方式',
                        message:
                            '当前申请单已有 ' + currentItems.length + ' 条物料。\n' +
                            '本次导入解析出 ' + result.addedCount + ' 条物料。',
                        choices: [
                            {
                                value: 'overwrite',
                                label: '覆盖',
                                description: '清空现有物料，仅保留导入内容。',
                            },
                            {
                                value: 'append',
                                label: '追加',
                                description: '保留现有物料，跳过重复项后追加新项。',
                            },
                        ],
                        defaultIndex: 1,
                    });
                    if (!writeChoice) return;
                    overwriteMode = writeChoice.value === 'overwrite';
                }

                if (overwriteMode) {
                    // 覆盖模式：一次替换
                    dispatch('replaceApplicationItems', { items: result.items });
                    importedCount = result.items.length;
                } else {
                    // 追加模式：合并现有 + 新导入，跳过重复
                    const existingImpaSet = new Set();
                    for (let index = 0; index < currentItems.length; index++) {
                        existingImpaSet.add(currentItems[index].impa);
                    }
                    const appendedItems = [];
                    for (let index = 0; index < result.items.length; index++) {
                        const incomingItem = result.items[index];
                        if (existingImpaSet.has(incomingItem.impa)) {
                            skippedDuplicateCount++;
                            continue;
                        }
                        appendedItems.push(incomingItem);
                    }
                    const mergedItems = currentItems.concat(appendedItems);
                    dispatch('replaceApplicationItems', { items: mergedItems });
                    importedCount = appendedItems.length;
                }
            }

            const modeLabel = overwriteMode ? '覆盖' : '追加';
            addLog(
                '导入申请单',
                '模式:' + modeLabel +
                ' 成功 ' + importedCount + ' 项' +
                (skippedDuplicateCount > 0 ? '，跳过重复 ' + skippedDuplicateCount + ' 项' : '') +
                '，失败 ' + result.failedRows.length + ' 项'
            );

            if (result.failedRows.length > 0) {
                exportFailedRows(result.failedRows, result.headerRow);
            }

            let summaryMessage =
                '导入完成！\n\n' +
                '模式：' + modeLabel + '\n' +
                '成功 ' + importedCount + ' 项\n';
            if (skippedDuplicateCount > 0) {
                summaryMessage += '跳过重复 ' + skippedDuplicateCount + ' 项\n';
            }
            summaryMessage += '失败 ' + result.failedRows.length + ' 项';
            if (result.failedRows.length > 0) {
                summaryMessage += '\n\n失败项已自动导出为 Excel';
            }
            await showConfirmDialog(summaryMessage);
        } catch (importError) {
            console.error('[batch-import-ui] 申请单导入失败:', importError);
            alert('导入失败：' + importError.message);
        }
    };
    input.click();
}

/**
 * 导出申请单导入失败项
 * @param {Array} failedRows
 * @param {Array} headerRow
 */
function exportFailedRows(failedRows, headerRow) {
    if (typeof window.XLSX === 'undefined') return;
    try {
        const exportData = [headerRow].concat(failedRows);
        const worksheet = window.XLSX.utils.aoa_to_sheet(exportData);
        const workbook = window.XLSX.utils.book_new();
        window.XLSX.utils.book_append_sheet(workbook, worksheet, '导入失败项');
        window.XLSX.writeFile(
            workbook,
            EXPORT_FAILED_ITEMS_PREFIX + getLocalDateString() + '.xlsx'
        );
    } catch (exportError) {
        console.error('[batch-import-ui] 导出失败项失败:', exportError);
    }
}