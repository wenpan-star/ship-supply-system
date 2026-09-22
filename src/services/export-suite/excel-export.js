// filename: src/services/export-suite/excel-export.js
// 船舶物料申请系统 · Excel 导出服务
// 负责：申请单导出（CN/EN 双表）、Excel 明文备份导出

import {
    EXPORT_REQUEST_PREFIX,
    EXPORT_BACKUP_PREFIX,
    MATERIAL_SOURCE_FILTER_OPTIONS,
    MATERIAL_SOURCES,
} from '../../constants.js';
import {
    sanitizeExcelCell,
} from '../../utils/excel.js';
import {
    getFileTimestamp,
} from '../../utils/format.js';
import {
    getKeys,
} from '../../core/repository.js';
import {
    secureGetItem,
} from '../../core/persist.js';
import {
    getVaultSnapshot,
} from '../../core/facade.js';

/**
 * 导出申请单为 Excel（CN/EN 双表）
 * @param {Object} vault
 * @returns {boolean}
 */
export function exportRequestToExcel(vault) {
    if (typeof window.XLSX === 'undefined') {
        alert('XLSX 库未加载，无法导出');
        return false;
    }
    const application = vault.currentApplication;
    if (!application.reqNo) {
        alert('请填写申请次序号');
        return false;
    }

    const zhMaterialMap = new Map();
    for (let index = 0; index < vault.materialsZh.length; index++) {
        zhMaterialMap.set(vault.materialsZh[index].impa, vault.materialsZh[index]);
    }
    const enMaterialMap = new Map();
    for (let index = 0; index < vault.materialsEn.length; index++) {
        enMaterialMap.set(vault.materialsEn[index].impa, vault.materialsEn[index]);
    }

    const items = application.items;

    const zhHeaders = ['IMPA', '物料描述', '规格型号', '单位', '库存', '申请数量', '备注'];
    const enHeaders = ['IMPA', 'Description', 'Specification', 'Unit', 'Stock', 'Quantity', 'Remark'];

    const zhData = [
        ['物料申请单', '', '', '', '', '', ''],
        ['申请次序号', application.reqNo, '申请人', application.applicant, '申请时间', application.applyTime || '', ''],
        [],
        zhHeaders,
    ];
    for (let index = 0; index < items.length; index++) {
        const item = items[index];
        const zhMaterial = zhMaterialMap.get(item.impa);
        zhData.push([
            sanitizeExcelCell(item.impa),
            sanitizeExcelCell(zhMaterial ? zhMaterial.description : item.description),
            sanitizeExcelCell(zhMaterial ? (zhMaterial.specification || '') : (item.spec || '')),
            sanitizeExcelCell(zhMaterial ? (zhMaterial.unit || '') : (item.unit || '')),
            sanitizeExcelCell(item.manualStock == null ? 0 : item.manualStock),
            sanitizeExcelCell(item.quantity),
            sanitizeExcelCell(item.remark || ''),
        ]);
    }

    const enData = [
        ['Material Requisition', '', '', '', '', '', ''],
        ['Requisition No.', application.reqNo, 'Applicant', application.applicant, 'Date', application.applyTime || '', ''],
        [],
        enHeaders,
    ];
    for (let index = 0; index < items.length; index++) {
        const item = items[index];
        const enMaterial = enMaterialMap.get(item.impa);
        enData.push([
            sanitizeExcelCell(item.impa),
            sanitizeExcelCell(enMaterial ? enMaterial.description : item.description),
            sanitizeExcelCell(enMaterial ? (enMaterial.specification || '') : (item.spec || '')),
            sanitizeExcelCell(enMaterial ? (enMaterial.unit || '') : (item.unit || '')),
            sanitizeExcelCell(item.manualStock == null ? 0 : item.manualStock),
            sanitizeExcelCell(item.quantity),
            sanitizeExcelCell(item.remark || ''),
        ]);
    }

    const columnWidths = [{ wch: 14 }, { wch: 34 }, { wch: 20 }, { wch: 8 }, { wch: 12 }, { wch: 10 }, { wch: 20 }];

    const zhWorksheet = window.XLSX.utils.aoa_to_sheet(zhData);
    zhWorksheet['!cols'] = columnWidths;
    const enWorksheet = window.XLSX.utils.aoa_to_sheet(enData);
    enWorksheet['!cols'] = columnWidths;

    const workbook = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(workbook, zhWorksheet, 'CN');
    window.XLSX.utils.book_append_sheet(workbook, enWorksheet, 'EN');

    window.XLSX.writeFile(workbook, EXPORT_REQUEST_PREFIX + application.reqNo + '.xlsx');
    return true;
}

/**
 * 过滤物料来源
 * @param {Object[]} array
 * @param {string} filter
 * @returns {Object[]}
 */
function filterBySource(array, filter) {
    if (filter === MATERIAL_SOURCE_FILTER_OPTIONS.ALL) return array;
    if (filter === MATERIAL_SOURCE_FILTER_OPTIONS.CUSTOM_BATCH) {
        return array.filter(function (material) {
            return material.source === MATERIAL_SOURCES.CUSTOM ||
                   material.source === MATERIAL_SOURCES.BATCH;
        });
    }
    if (filter === MATERIAL_SOURCE_FILTER_OPTIONS.CUSTOM) {
        return array.filter(function (material) {
            return material.source === MATERIAL_SOURCES.CUSTOM;
        });
    }
    if (filter === MATERIAL_SOURCE_FILTER_OPTIONS.BATCH) {
        return array.filter(function (material) {
            return material.source === MATERIAL_SOURCES.BATCH;
        });
    }
    if (filter === MATERIAL_SOURCE_FILTER_OPTIONS.IMPORT) {
        return array.filter(function (material) {
            return material.source === MATERIAL_SOURCES.IMPORT;
        });
    }
    return array;
}

/**
 * 导出 Excel 明文备份
 * @param {boolean} includeMaterials
 * @param {boolean} includeApplications
 * @param {string} materialSourceFilter
 * @returns {Promise<void>}
 */
export async function exportBackupExcel(includeMaterials, includeApplications, materialSourceFilter) {
    if (typeof window.XLSX === 'undefined') {
        alert('XLSX 库未加载，无法导出');
        return;
    }
    try {
        const vault = getVaultSnapshot();
        if (!vault) {
            alert('Vault 未初始化');
            return;
        }
        const workbook = window.XLSX.utils.book_new();

        if (includeMaterials) {
            const zhFiltered = filterBySource(vault.materialsZh, materialSourceFilter);
            const enFiltered = filterBySource(vault.materialsEn, materialSourceFilter);

            const zhRows = [['IMPA', '物料描述', '规格型号', '单位', '备注']];
            for (let index = 0; index < zhFiltered.length; index++) {
                const item = zhFiltered[index];
                zhRows.push([
                    sanitizeExcelCell(item.impa),
                    sanitizeExcelCell(item.description),
                    sanitizeExcelCell(item.specification || ''),
                    sanitizeExcelCell(item.unit || ''),
                    sanitizeExcelCell(item.remark || ''),
                ]);
            }
            const wsZh = window.XLSX.utils.aoa_to_sheet(zhRows);
            wsZh['!cols'] = [{ wch: 14 }, { wch: 34 }, { wch: 20 }, { wch: 8 }, { wch: 20 }];
            window.XLSX.utils.book_append_sheet(workbook, wsZh, 'CN');

            const enRows = [['IMPA', 'Description', 'Specification', 'Unit', 'Remark']];
            for (let index = 0; index < enFiltered.length; index++) {
                const item = enFiltered[index];
                enRows.push([
                    sanitizeExcelCell(item.impa),
                    sanitizeExcelCell(item.description),
                    sanitizeExcelCell(item.specification || ''),
                    sanitizeExcelCell(item.unit || ''),
                    sanitizeExcelCell(item.remark || ''),
                ]);
            }
            const wsEn = window.XLSX.utils.aoa_to_sheet(enRows);
            wsEn['!cols'] = [{ wch: 14 }, { wch: 34 }, { wch: 20 }, { wch: 8 }, { wch: 20 }];
            window.XLSX.utils.book_append_sheet(workbook, wsEn, 'EN');
        }

        if (includeApplications) {
            const appKeys = await getKeys('app');
            const validKeys = appKeys.filter(function (key) {
                return !key.startsWith('chunk_') &&
                       key !== 'meta' &&
                       !key.startsWith('backup_') &&
                       key !== '__recycleBin__';
            });
            const appRows = [['申请单号', '申请人', '申请时间', '物料条数', '备注']];
            for (let index = 0; index < validKeys.length; index++) {
                const key = validKeys[index];
                try {
                    const app = await secureGetItem('app', key, null);
                    if (app) {
                        appRows.push([
                            sanitizeExcelCell(app.reqNo || key),
                            sanitizeExcelCell(app.applicant || ''),
                            sanitizeExcelCell(app.applyTime || ''),
                            app.items ? app.items.length : 0,
                            sanitizeExcelCell(app.remark || ''),
                        ]);
                    }
                } catch (readError) {
                    console.warn('[excel-export] 读取申请单失败:', key, readError);
                }
            }
            const wsApp = window.XLSX.utils.aoa_to_sheet(appRows);
            wsApp['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 18 }, { wch: 10 }, { wch: 20 }];
            window.XLSX.utils.book_append_sheet(workbook, wsApp, '申请单汇总');
        }

        // 回收站摘要工作表（仅在有数据时导出）
        const recycleBinData = Array.isArray(vault.recycleBin) ? vault.recycleBin : [];
        if (recycleBinData.length > 0) {
            const recycleRows = [['IMPA', '物料描述', '来源语言', '删除时间', '删除来源']];
            for (let index = 0; index < recycleBinData.length; index++) {
                const item = recycleBinData[index];
                const deletedDate = item.deletedAt > 0
                    ? new Date(item.deletedAt).toLocaleString('zh-CN')
                    : '未知';
                recycleRows.push([
                    sanitizeExcelCell(item.material.impa),
                    sanitizeExcelCell(item.material.description),
                    sanitizeExcelCell(item.language === 'en' ? '英文库' : '中文库'),
                    sanitizeExcelCell(deletedDate),
                    sanitizeExcelCell(item.deletionSource === 'batch' ? '批量' : '单条'),
                ]);
            }
            const wsRecycle = window.XLSX.utils.aoa_to_sheet(recycleRows);
            wsRecycle['!cols'] = [{ wch: 14 }, { wch: 34 }, { wch: 10 }, { wch: 22 }, { wch: 10 }];
            window.XLSX.utils.book_append_sheet(workbook, wsRecycle, '回收站');
        }

        if (workbook.SheetNames.length === 0) {
            alert('没有选择要导出的内容');
            return;
        }

        window.XLSX.writeFile(workbook, EXPORT_BACKUP_PREFIX + getFileTimestamp() + '.xlsx');
    } catch (exportError) {
        console.error('[excel-export] 导出失败:', exportError);
        alert('导出 Excel 备份失败：' + exportError.message);
    }
}