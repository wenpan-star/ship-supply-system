// filename: scripts/tools/generate-preset.js
// 船舶物料申请系统 · 预设物料库生成工具
// 将 scripts/data/impa-default.xlsx 转换为 src/preset.js 中的预设数据
//
// 【依赖】
//   xlsx 包。需手动安装：
//     cd scripts/tools
//     npm install --no-save xlsx
//
// 【用法】
//   cd scripts/tools
//   node generate-preset.js
//
// 【输入】
//   scripts/data/impa-default.xlsx（预期含 CN 和 EN 两张 sheet）
//
// 【输出】
//   src/preset.js
//
// 【兼容性】
//   Node 14.0.0+

'use strict';

const fs = require('fs');
const path = require('path');

let XLSX;
try {
    XLSX = require('xlsx');
} catch (error) {
    console.error('');
    console.error('❌ 未找到 xlsx 依赖。请先安装：');
    console.error('     cd scripts/tools');
    console.error('     npm install --no-save xlsx');
    console.error('');
    process.exit(1);
}

const SCRIPT_DIRECTORY = __dirname;
const PROJECT_ROOT = path.resolve(SCRIPT_DIRECTORY, '..', '..');
const WORKBOOK_PATH = path.join(PROJECT_ROOT, 'scripts', 'data', 'impa-default.xlsx');
const OUTPUT_FILE = path.join(PROJECT_ROOT, 'src', 'preset.js');

function parseSheet(worksheet, sheetName) {
    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
    if (rows.length < 2) return [];
    const headers = rows[0].map(c => String(c || '').toLowerCase());
    const impaIndex = headers.findIndex(h => h.includes('impa'));
    const descIndex = headers.findIndex(h => h.includes('description') || h.includes('物料描述'));
    const specIndex = headers.findIndex(h => h.includes('spec') || h.includes('规格'));
    const unitIndex = headers.findIndex(h => h === 'unit' || h === '单位');
    const remarkIndex = headers.findIndex(h => h.includes('remark') || h.includes('备注'));
    if (impaIndex === -1) return [];
    const materials = [];
    for (let index = 1; index < rows.length; index++) {
        const row = rows[index];
        if (!row || !row[impaIndex]) continue;
        const impa = String(row[impaIndex]).trim();
        if (!impa) continue;
        materials.push({
            impa: impa.slice(0, 30),
            description: descIndex !== -1 ? String(row[descIndex] || '').trim().slice(0, 200) : ('IMPA ' + impa),
            specification: specIndex !== -1 ? String(row[specIndex] || '').trim().slice(0, 100) : '',
            unit: unitIndex !== -1 ? String(row[unitIndex] || '').trim().slice(0, 20) : '',
            remark: remarkIndex !== -1 ? String(row[remarkIndex] || '').trim().slice(0, 200) : '',
            source: 'import',
        });
    }
    console.log('  ' + sheetName + '：' + materials.length + ' 条');
    return materials;
}

function main() {
    console.log('========================================');
    console.log('  预设物料库生成工具');
    console.log('========================================');
    console.log('');

    if (!fs.existsSync(WORKBOOK_PATH)) {
        console.error('❌ 未找到源文件：' + WORKBOOK_PATH);
        process.exit(1);
    }
    console.log('源文件：' + WORKBOOK_PATH);

    const workbook = XLSX.readFile(WORKBOOK_PATH);
    let zhMaterials = [];
    let enMaterials = [];

    if (workbook.Sheets['CN']) {
        zhMaterials = parseSheet(workbook.Sheets['CN'], 'CN');
    } else if (workbook.Sheets['中文']) {
        zhMaterials = parseSheet(workbook.Sheets['中文'], '中文');
    }

    if (workbook.Sheets['EN']) {
        enMaterials = parseSheet(workbook.Sheets['EN'], 'EN');
    } else if (workbook.Sheets['英文']) {
        enMaterials = parseSheet(workbook.Sheets['英文'], '英文');
    }

    if (zhMaterials.length === 0 && enMaterials.length === 0) {
        console.error('❌ 两个工作表中均未提取到数据');
        process.exit(1);
    }

    const fileContent =
        '// filename: src/preset.js\n' +
        '// 船舶物料申请系统 · 内置预设物料库\n' +
        '// 由 scripts/tools/generate-preset.js 自动生成\n' +
        '// 生成时间：' + new Date().toISOString() + '\n' +
        '\n' +
        'export const PRESET_MATERIALS_EN = ' + JSON.stringify(enMaterials, null, 4) + ';\n' +
        '\n' +
        'export const PRESET_MATERIALS_ZH = ' + JSON.stringify(zhMaterials, null, 4) + ';\n';

    fs.writeFileSync(OUTPUT_FILE, fileContent, 'utf-8');
    console.log('');
    console.log('✅ 已写入：' + OUTPUT_FILE);
    console.log('  英文库：' + enMaterials.length + ' 条');
    console.log('  中文库：' + zhMaterials.length + ' 条');
}

main();