// filename: scripts/tools/check-preset-gaps.js
// 船舶物料申请系统 · 预设物料库覆盖率检查
// 校验 src/preset.js 与 scripts/data/impa-default.xlsx 是否一致
//
// 【用法】
//   cd scripts/tools
//   node check-preset-gaps.js
//
// 【退出码】
//   0 = 唯一 IMPA 集合一致（即使存在重复 IMPA 也不阻断构建）
//   1 = 唯一 IMPA 集合不一致，或输入文件缺失
//
// 【本轮增强】
//   在原有"覆盖率对比"基础上，新增三层报告：
//     1. 数据源统计  —— 每个 sheet 的原始行数、唯一 IMPA 数
//     2. 覆盖率对比  —— 与 src/preset.js 唯一集合的差异
//     3. 重复检测    —— 列出所有重复 IMPA 及其出现次数
//
//   背景：
//     generate-preset.js 使用数组完整保留 Excel 每一行；
//     若源 Excel 的同一 sheet 中存在 IMPA 重复行，
//     生成的 preset.js 也会包含这些重复。
//     运行时 vault.js 的 normalizeMaterialArray 会自动去重
//     （保留首次出现的条目），因此不阻断构建；
//     但重复 IMPA 通常意味着数据源质量问题，故在构建日志中
//     显式警告，方便用户定位和修正。
//
//   退出码语义不变：
//     校验仍以"唯一 IMPA 集合"为准，重复不阻断。

'use strict';

const fs = require('fs');
const path = require('path');

let XLSX;
try {
    XLSX = require('xlsx');
} catch (error) {
    console.error('❌ 未找到 xlsx 依赖');
    console.error('   请先运行：cd scripts/tools && npm install --no-save xlsx');
    process.exit(1);
}

const SCRIPT_DIRECTORY = __dirname;
const PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, '..', '..');
const WORKBOOK_PATH = path.join(PROJECT_ROOT, 'scripts', 'data', 'impa-default.xlsx');
const PRESET_FILE = path.join(PROJECT_ROOT, 'src', 'preset.js');

// 每类重复 IMPA 最多列出多少条明细
const DUPLICATE_DETAIL_LIMIT = 20;

// CN / EN sheet 名称的兼容映射（与 generate-preset.js 保持一致）
const CHINESE_SHEET_NAMES = ['CN', '中文'];
const ENGLISH_SHEET_NAMES = ['EN', '英文'];

/**
 * 从工作表提取 IMPA 列表（按原始行顺序，包含重复）
 * @param {Object} worksheet
 * @returns {string[]}
 */
function extractImpaListFromWorksheet(worksheet) {
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    if (rows.length < 2) return [];
    const headers = rows[0].map(function (cellValue) {
        return String(cellValue || '').toLowerCase();
    });
    const impaColumnIndex = headers.findIndex(function (headerText) {
        return headerText.includes('impa');
    });
    if (impaColumnIndex === -1) return [];

    const impaList = [];
    for (let rowIndex = 1; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex];
        if (!row) continue;
        const rawCell = row[impaColumnIndex];
        if (rawCell === undefined || rawCell === null) continue;
        const impa = String(rawCell).trim();
        if (impa.length === 0) continue;
        impaList.push(impa);
    }
    return impaList;
}

/**
 * 统计一组 IMPA 列表的基本信息
 * @param {string[]} impaList
 * @returns {{
 *   rawRowCount: number,
 *   uniqueImpaSet: Set<string>,
 *   uniqueCount: number,
 *   duplicates: Array<{impa: string, count: number}>
 * }}
 */
function analyzeImpaListStatistics(impaList) {
    const countMap = new Map();
    const uniqueImpaSet = new Set();
    for (let index = 0; index < impaList.length; index++) {
        const impa = impaList[index];
        countMap.set(impa, (countMap.get(impa) || 0) + 1);
        uniqueImpaSet.add(impa);
    }

    const duplicates = [];
    countMap.forEach(function (count, impa) {
        if (count > 1) {
            duplicates.push({ impa: impa, count: count });
        }
    });
    // 排序：出现次数多的在前；次数相同时按 IMPA 字典序
    duplicates.sort(function (itemA, itemB) {
        if (itemB.count !== itemA.count) return itemB.count - itemA.count;
        return itemA.impa.localeCompare(itemB.impa);
    });

    return {
        rawRowCount: impaList.length,
        uniqueImpaSet: uniqueImpaSet,
        uniqueCount: uniqueImpaSet.size,
        duplicates: duplicates,
    };
}

/**
 * 从指定 workbook 中查找第一个匹配的 sheet
 * @param {Object} workbook
 * @param {string[]} candidateSheetNames
 * @returns {{sheetName: string, worksheet: Object}|null}
 */
function findFirstMatchingSheet(workbook, candidateSheetNames) {
    for (let index = 0; index < candidateSheetNames.length; index++) {
        const sheetName = candidateSheetNames[index];
        if (workbook.Sheets[sheetName]) {
            return {
                sheetName: sheetName,
                worksheet: workbook.Sheets[sheetName],
            };
        }
    }
    return null;
}

/**
 * 解析 workbook，返回中英文两库的统计信息
 * @returns {{
 *   zh: { sheetName: string, rawRowCount: number, uniqueImpaSet: Set, uniqueCount: number, duplicates: Array }|null,
 *   en: { sheetName: string, rawRowCount: number, uniqueImpaSet: Set, uniqueCount: number, duplicates: Array }|null
 * }}
 */
function parseWorkbookStatistics() {
    const workbook = XLSX.readFile(WORKBOOK_PATH);

    const zhMatch = findFirstMatchingSheet(workbook, CHINESE_SHEET_NAMES);
    const enMatch = findFirstMatchingSheet(workbook, ENGLISH_SHEET_NAMES);

    let zh = null;
    let en = null;

    if (zhMatch) {
        const stats = analyzeImpaListStatistics(extractImpaListFromWorksheet(zhMatch.worksheet));
        zh = {
            sheetName: zhMatch.sheetName,
            rawRowCount: stats.rawRowCount,
            uniqueImpaSet: stats.uniqueImpaSet,
            uniqueCount: stats.uniqueCount,
            duplicates: stats.duplicates,
        };
    }

    if (enMatch) {
        const stats = analyzeImpaListStatistics(extractImpaListFromWorksheet(enMatch.worksheet));
        en = {
            sheetName: enMatch.sheetName,
            rawRowCount: stats.rawRowCount,
            uniqueImpaSet: stats.uniqueImpaSet,
            uniqueCount: stats.uniqueCount,
            duplicates: stats.duplicates,
        };
    }

    return { zh: zh, en: en };
}

/**
 * 解析 src/preset.js，返回中英文两库的唯一 IMPA 集合
 * @returns {{zh: Set<string>, en: Set<string>}}
 */
function parsePresetFileImpaSets() {
    const fileContent = fs.readFileSync(PRESET_FILE, 'utf-8');
    const result = { zh: new Set(), en: new Set() };

    const enMatch = fileContent.match(/export\s+const\s+PRESET_MATERIALS_EN\s*=\s*(\[[\s\S]*?\]);/);
    if (enMatch) {
        const enArray = JSON.parse(enMatch[1]);
        for (let index = 0; index < enArray.length; index++) {
            if (enArray[index] && enArray[index].impa) {
                result.en.add(String(enArray[index].impa));
            }
        }
    }

    const zhMatch = fileContent.match(/export\s+const\s+PRESET_MATERIALS_ZH\s*=\s*(\[[\s\S]*?\]);/);
    if (zhMatch) {
        const zhArray = JSON.parse(zhMatch[1]);
        for (let index = 0; index < zhArray.length; index++) {
            if (zhArray[index] && zhArray[index].impa) {
                result.zh.add(String(zhArray[index].impa));
            }
        }
    }

    return result;
}

/**
 * 打印单个库的数据源统计
 * @param {string} label  例如 "中文库（CN）"
 * @param {{sheetName: string, rawRowCount: number, uniqueCount: number, duplicates: Array}|null} stats
 */
function reportLibraryStatistics(label, stats) {
    if (!stats) {
        console.log(label + '：源文件中未找到对应工作表');
        return;
    }
    const duplicateRowCount = stats.rawRowCount - stats.uniqueCount;
    console.log(label + '（工作表「' + stats.sheetName + '」）：');
    console.log('  原始行数：' + stats.rawRowCount);
    console.log('  唯一 IMPA：' + stats.uniqueCount);
    if (duplicateRowCount > 0) {
        console.log('  重复行数：' + duplicateRowCount +
                    '（涉及 ' + stats.duplicates.length + ' 个不同的 IMPA）');
    } else {
        console.log('  重复行数：0');
    }
}

/**
 * 比较两个 Set 并打印结果
 * @param {Set<string>} expectedSet
 * @param {Set<string>} actualSet
 * @param {string} label
 * @returns {boolean}
 */
function compareSets(expectedSet, actualSet, label) {
    const missing = [];
    expectedSet.forEach(function (impa) {
        if (!actualSet.has(impa)) missing.push(impa);
    });
    const extra = [];
    actualSet.forEach(function (impa) {
        if (!expectedSet.has(impa)) extra.push(impa);
    });

    console.log(label + ' 基准：' + expectedSet.size + ' 条，实际：' + actualSet.size + ' 条');
    if (missing.length === 0 && extra.length === 0) {
        console.log('  ✅ 一致');
        return true;
    }
    if (missing.length > 0) {
        console.log('  ⚠️ 缺失 ' + missing.length + ' 条：' + missing.slice(0, 20).join(', ') +
                    (missing.length > 20 ? ' ...' : ''));
    }
    if (extra.length > 0) {
        console.log('  ⚠️ 多余 ' + extra.length + ' 条：' + extra.slice(0, 20).join(', ') +
                    (extra.length > 20 ? ' ...' : ''));
    }
    return false;
}

/**
 * 打印某库的重复 IMPA 明细
 * @param {string} label
 * @param {Array<{impa: string, count: number}>} duplicates
 */
function reportDuplicateDetail(label, duplicates) {
    if (duplicates.length === 0) return;
    console.log('  ' + label + ' 检测到 ' + duplicates.length + ' 个重复 IMPA：');
    const displayLimit = Math.min(duplicates.length, DUPLICATE_DETAIL_LIMIT);
    for (let index = 0; index < displayLimit; index++) {
        const entry = duplicates[index];
        console.log('    - ' + entry.impa + ' （出现 ' + entry.count + ' 次）');
    }
    if (duplicates.length > displayLimit) {
        console.log('    ... 另有 ' + (duplicates.length - displayLimit) + ' 个重复 IMPA 未列出');
    }
}

/**
 * 主流程
 */
function main() {
    console.log('========================================');
    console.log('  预设物料库覆盖率检查');
    console.log('========================================');
    console.log('');

    if (!fs.existsSync(WORKBOOK_PATH)) {
        console.error('❌ 未找到源文件：' + WORKBOOK_PATH);
        process.exit(1);
    }
    if (!fs.existsSync(PRESET_FILE)) {
        console.error('❌ 未找到预设文件：' + PRESET_FILE);
        console.error('   请先运行 generate-preset.js');
        process.exit(1);
    }

    console.log('源文件：' + WORKBOOK_PATH);
    console.log('预设文件：' + PRESET_FILE);
    console.log('');

    const workbookStats = parseWorkbookStatistics();

    if (!workbookStats.zh && !workbookStats.en) {
        console.error('❌ 源文件中未找到 CN/中文 或 EN/英文 工作表');
        process.exit(1);
    }

    // ---------- 1) 数据源统计 ----------
    console.log('---------- 数据源统计 ----------');
    reportLibraryStatistics('中文库', workbookStats.zh);
    reportLibraryStatistics('英文库', workbookStats.en);
    console.log('');

    // ---------- 2) 覆盖率对比 ----------
    console.log('---------- 覆盖率对比 ----------');
    const presetSets = parsePresetFileImpaSets();

    let zhConsistent = true;
    let enConsistent = true;

    if (workbookStats.zh) {
        zhConsistent = compareSets(
            workbookStats.zh.uniqueImpaSet,
            presetSets.zh,
            '中文库'
        );
    }
    if (workbookStats.en) {
        enConsistent = compareSets(
            workbookStats.en.uniqueImpaSet,
            presetSets.en,
            '英文库'
        );
    }
    console.log('');

    // ---------- 3) 重复检测 ----------
    const hasZhDuplicates = workbookStats.zh && workbookStats.zh.duplicates.length > 0;
    const hasEnDuplicates = workbookStats.en && workbookStats.en.duplicates.length > 0;

    if (hasZhDuplicates || hasEnDuplicates) {
        console.log('---------- 重复检测 ----------');
        if (hasZhDuplicates) {
            reportDuplicateDetail('中文库', workbookStats.zh.duplicates);
        }
        if (hasEnDuplicates) {
            reportDuplicateDetail('英文库', workbookStats.en.duplicates);
        }
        console.log('');
        console.log('  说明：运行时 normalizeMaterialArray 会自动去重（保留首次出现的条目），');
        console.log('        重复 IMPA 不影响应用功能，也不会阻断本次构建。');
        console.log('        但重复通常意味着数据源质量问题，');
        console.log('        建议检查 scripts/data/impa-default.xlsx 并删除冗余行。');
        console.log('');
    }

    // ---------- 4) 结论 ----------
    if (zhConsistent && enConsistent) {
        if (hasZhDuplicates || hasEnDuplicates) {
            console.log('✅ 校验通过：预设文件与源数据的唯一 IMPA 集合一致');
            console.log('   （提示：存在重复 IMPA，已在上面列出明细，不阻断构建）');
        } else {
            console.log('✅ 校验通过：预设文件与源数据完全一致');
        }
        process.exit(0);
    } else {
        console.log('❌ 校验未通过：预设文件与源数据不一致，请重新运行 generate-preset.js');
        process.exit(1);
    }
}

main();