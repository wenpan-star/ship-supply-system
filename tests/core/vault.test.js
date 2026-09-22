// filename: tests/core/vault.test.js
// 船舶物料申请系统 · Vault 归一化与查询测试
// 使用原生断言，不依赖测试框架
//
// 【M-9 修复保持】assertEqual 保留为深度比较；引用语义单独用专用断言。
//
// 【本轮修改】
//   M-new-1 联动：新增 normalizeRecycleBin 的排序 / 去重 / 截断测试。
//     验证 main.js 的 applyImportedBackup 依赖的语义契约成立。

import {
    createEmptyVault,
    normalizeMaterial,
    normalizeMaterialArray,
    normalizeApplication,
    normalizeRecycleBin,
    normalizeVault,
    hasMaterial,
    findMaterialByImpa,
    applicationHasItem,
    countAllMaterials,
} from '../../src/core/vault.js';
import {
    MAX_RECYCLE_BIN_SIZE,
} from '../../src/constants.js';

function assertEqual(actual, expected, message) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(
            '断言失败（深度比较）：' + (message || '') + '\n' +
            '  期望: ' + JSON.stringify(expected) + '\n' +
            '  实际: ' + JSON.stringify(actual)
        );
    }
}

function assertNotNull(value, message) {
    if (value === null || value === undefined) {
        throw new Error('断言失败（应非 null）：' + (message || ''));
    }
}

function assertTrue(condition, message) {
    if (!condition) {
        throw new Error('断言失败（应为 true）：' + (message || ''));
    }
}

function assertFalse(condition, message) {
    if (condition) {
        throw new Error('断言失败（应为 false）：' + (message || ''));
    }
}

function testCreateEmptyVault() {
    const vault = createEmptyVault();
    assertEqual(vault.materialsEn, [], '英文库应为空数组');
    assertEqual(vault.materialsZh, [], '中文库应为空数组');
    assertEqual(vault.currentApplication.items, [], '申请单 items 应为空');
    assertEqual(vault.ui.activeTab, 'reqTab', '默认 tab 应为 reqTab');
    assertEqual(vault.ui.currentLang, 'zh', '默认语言应为 zh');
    assertEqual(vault.meta.dataCorruptionDetected, false, '默认无损坏');
}

function testNormalizeMaterialValid() {
    const raw = {
        impa: '  999999  ',
        description: '  测试物料  ',
        specification: '规格A',
        unit: 'PCS',
        remark: '备注A',
        source: 'custom',
    };
    const result = normalizeMaterial(raw);
    assertNotNull(result, '应正常返回');
    assertEqual(result.impa, '999999', 'IMPA 应去空格');
    assertEqual(result.description, '测试物料', '描述应去空格');
    assertEqual(result.source, 'custom', '来源应保留');
}

function testNormalizeMaterialInvalidSource() {
    const raw = {
        impa: '999999',
        description: '测试',
        source: 'unknown-value',
    };
    const result = normalizeMaterial(raw);
    assertEqual(result.source, 'import', '非法 source 应回退 import');
}

function testNormalizeMaterialEmptyImpa() {
    const result = normalizeMaterial({ impa: '', description: '测试' });
    assertEqual(result, null, '空 IMPA 应返回 null');
}

function testNormalizeMaterialNullInput() {
    assertEqual(normalizeMaterial(null), null, 'null 应返回 null');
    assertEqual(normalizeMaterial(undefined), null, 'undefined 应返回 null');
    assertEqual(normalizeMaterial('string'), null, 'string 应返回 null');
}

function testNormalizeMaterialArrayDedup() {
    const rawArray = [
        { impa: '1', description: 'A' },
        { impa: '1', description: 'B' },
        { impa: '2', description: 'C' },
    ];
    const result = normalizeMaterialArray(rawArray);
    assertEqual(result.length, 2, '应去重后保留 2 条');
    assertEqual(result[0].description, 'A', '保留首次出现的条目');
}

function testNormalizeApplicationWithItems() {
    const raw = {
        reqNo: 'REQ-001',
        applicant: '2/O',
        applyTime: '2026-01-01T00:00',
        items: [
            { impa: '1', description: 'A', quantity: 5 },
            { impa: '2', description: 'B', quantity: 0 },
            { impa: '1', description: 'A duplicate', quantity: 3 },
        ],
    };
    const result = normalizeApplication(raw);
    assertEqual(result.items.length, 2, 'items 应去重');
    assertEqual(result.items[0].quantity, 5, '数量应保留');
    assertEqual(result.items[1].quantity, 0, '数量 0 应保留');
}

// ==================== M-new-1 联动：回收站排序 / 去重 / 截断 ====================

/**
 * 构造一条回收站条目
 * @param {string} impa
 * @param {number} deletedAt
 * @param {string} language
 * @returns {Object}
 */
function makeRecycleBinItem(impa, deletedAt, language) {
    return {
        id: (language || 'zh') + '::' + impa + '::' + deletedAt,
        language: language || 'zh',
        material: {
            impa: impa,
            description: 'TEST ' + impa,
            specification: '',
            unit: 'PCS',
            remark: '',
            source: 'import',
        },
        deletedAt: deletedAt,
        deletionSource: 'single',
    };
}

/**
 * M-new-1：normalizeRecycleBin 必须按 deletedAt 降序排序。
 * 这保证 applyImportedBackup 合并后"最新在前"的语义。
 */
function testNormalizeRecycleBinSortsByDeletedAtDescending() {
    const rawArray = [
        makeRecycleBinItem('111', 1000),
        makeRecycleBinItem('222', 3000),
        makeRecycleBinItem('333', 2000),
    ];
    const result = normalizeRecycleBin(rawArray);
    assertEqual(result.length, 3, '应保留 3 条');
    assertEqual(result[0].material.impa, '222', '最新（3000）应排第一');
    assertEqual(result[1].material.impa, '333', '中间（2000）应排第二');
    assertEqual(result[2].material.impa, '111', '最旧（1000）应排第三');
}

/**
 * M-new-1：normalizeRecycleBin 必须按 id 去重。
 */
function testNormalizeRecycleBinDedup() {
    const sharedId = 'zh::999::12345';
    const rawArray = [
        {
            id: sharedId,
            language: 'zh',
            material: { impa: '999', description: 'FIRST', specification: '', unit: '', remark: '', source: 'import' },
            deletedAt: 1000,
            deletionSource: 'single',
        },
        {
            id: sharedId,
            language: 'zh',
            material: { impa: '999', description: 'SECOND', specification: '', unit: '', remark: '', source: 'import' },
            deletedAt: 2000,
            deletionSource: 'single',
        },
    ];
    const result = normalizeRecycleBin(rawArray);
    assertEqual(result.length, 1, '相同 id 应去重');
    assertEqual(result[0].material.description, 'FIRST', '保留首次出现的条目');
}

/**
 * M-new-1：normalizeRecycleBin 超过 MAX_RECYCLE_BIN_SIZE 时按时间降序截断。
 */
function testNormalizeRecycleBinTruncatesToMaxSize() {
    const rawArray = [];
    // 构造超过上限的条目（每条 deletedAt 递增）
    for (let index = 0; index < MAX_RECYCLE_BIN_SIZE + 20; index++) {
        rawArray.push(makeRecycleBinItem(String(100000 + index), index + 1));
    }
    const result = normalizeRecycleBin(rawArray);
    assertEqual(result.length, MAX_RECYCLE_BIN_SIZE, '应截断到上限');
    // 降序后第一条应是 deletedAt 最大的
    const expectedFirstDeletedAt = MAX_RECYCLE_BIN_SIZE + 20;
    assertEqual(result[0].deletedAt, expectedFirstDeletedAt, '首条应为最新条目');
}

/**
 * M-new-1：normalizeRecycleBin 对非数组输入返回空数组。
 */
function testNormalizeRecycleBinNonArrayInput() {
    assertEqual(normalizeRecycleBin(null), [], 'null 应返回空数组');
    assertEqual(normalizeRecycleBin(undefined), [], 'undefined 应返回空数组');
    assertEqual(normalizeRecycleBin('string'), [], 'string 应返回空数组');
    assertEqual(normalizeRecycleBin({}), [], '非数组对象应返回空数组');
}

/**
 * M-new-1：normalizeRecycleBin 跳过非法条目（无 deletedAt / 无 material / 无 impa）。
 */
function testNormalizeRecycleBinSkipsInvalidItems() {
    const rawArray = [
        makeRecycleBinItem('111', 1000),
        { id: 'x', language: 'zh', material: { impa: '222' }, deletedAt: 0 },     // deletedAt = 0 无效
        { id: 'y', language: 'zh', material: { impa: '' }, deletedAt: 2000 },     // 空 impa 无效
        { id: 'z', language: 'zh', material: null, deletedAt: 2000 },             // material 无效
        null,                                                                     // null 无效
    ];
    const result = normalizeRecycleBin(rawArray);
    assertEqual(result.length, 1, '应只保留 1 条有效条目');
    assertEqual(result[0].material.impa, '111', '有效条目的 IMPA 正确');
}

/**
 * M-new-1 端到端模拟：
 * 模拟 applyImportedBackup 的"现有 100 条 + 导入 100 条"场景。
 * 合并后交 normalizeRecycleBin 处理，应保留最新的 100 条。
 */
function testNormalizeRecycleBinSimulatesImportedBackup() {
    const currentRecycleBin = [];
    const importedRecycleBin = [];
    // 现有条目 deletedAt 1000~1099
    for (let index = 0; index < 100; index++) {
        currentRecycleBin.push(makeRecycleBinItem('C' + index, 1000 + index));
    }
    // 导入条目 deletedAt 2000~2099（更新）
    for (let index = 0; index < 100; index++) {
        importedRecycleBin.push(makeRecycleBinItem('I' + index, 2000 + index));
    }
    const merged = currentRecycleBin.concat(importedRecycleBin);
    const result = normalizeRecycleBin(merged);
    assertEqual(result.length, MAX_RECYCLE_BIN_SIZE, '应保留 100 条');
    // 全部应是导入的条目（deletedAt 更新）
    for (let index = 0; index < result.length; index++) {
        assertTrue(
            result[index].material.impa.indexOf('I') === 0,
            '所有保留条目应来自导入（最新）'
        );
    }
}

function testNormalizeVaultFullRound() {
    const raw = {
        materialsEn: [{ impa: '1', description: 'A' }],
        materialsZh: [{ impa: '1', description: '甲' }],
        currentApplication: { reqNo: 'REQ-X', items: [] },
        ui: { activeTab: 'materialTab', currentLang: 'en' },
    };
    const result = normalizeVault(raw);
    assertEqual(result.materialsEn.length, 1, '英文库应有 1 条');
    assertEqual(result.materialsZh.length, 1, '中文库应有 1 条');
    assertEqual(result.ui.activeTab, 'materialTab', 'tab 应保留');
    assertEqual(result.ui.currentLang, 'en', '语言应保留');
}

function testHasMaterial() {
    const vault = createEmptyVault();
    vault.materialsZh.push({ impa: '999', description: 'X' });
    assertTrue(hasMaterial(vault, 'zh', '999'), '中文库应命中');
    assertFalse(hasMaterial(vault, 'zh', '111'), '未命中的 IMPA');
    assertFalse(hasMaterial(vault, 'en', '999'), '英文库未命中');
}

function testFindMaterialByImpa() {
    const vault = createEmptyVault();
    vault.materialsZh.push({ impa: '999', description: 'X' });
    const found = findMaterialByImpa(vault, 'zh', '999');
    assertNotNull(found, '应找到');
    assertEqual(found.description, 'X', '返回的描述应正确');

    const notFound = findMaterialByImpa(vault, 'zh', '000');
    assertEqual(notFound, null, '未找到应返回 null');
}

function testApplicationHasItem() {
    const vault = createEmptyVault();
    vault.currentApplication.items.push({ impa: '1' });
    assertTrue(applicationHasItem(vault, '1'), '应命中');
    assertFalse(applicationHasItem(vault, '2'), '未命中');
}

function testCountAllMaterials() {
    const vault = createEmptyVault();
    vault.materialsEn.push({ impa: '1', description: 'A' });
    vault.materialsZh.push({ impa: '2', description: '甲' });
    vault.materialsZh.push({ impa: '3', description: '乙' });
    assertEqual(countAllMaterials(vault), 3, '总数应为 3');
}

function runAllTests() {
    const testFunctions = [
        testCreateEmptyVault,
        testNormalizeMaterialValid,
        testNormalizeMaterialInvalidSource,
        testNormalizeMaterialEmptyImpa,
        testNormalizeMaterialNullInput,
        testNormalizeMaterialArrayDedup,
        testNormalizeApplicationWithItems,
        testNormalizeRecycleBinSortsByDeletedAtDescending,
        testNormalizeRecycleBinDedup,
        testNormalizeRecycleBinTruncatesToMaxSize,
        testNormalizeRecycleBinNonArrayInput,
        testNormalizeRecycleBinSkipsInvalidItems,
        testNormalizeRecycleBinSimulatesImportedBackup,
        testNormalizeVaultFullRound,
        testHasMaterial,
        testFindMaterialByImpa,
        testApplicationHasItem,
        testCountAllMaterials,
    ];
    let passedCount = 0;
    let failedCount = 0;
    for (let index = 0; index < testFunctions.length; index++) {
        const testFunction = testFunctions[index];
        try {
            testFunction();
            console.log('✅ ' + testFunction.name);
            passedCount++;
        } catch (testError) {
            console.error('❌ ' + testFunction.name + ': ' + testError.message);
            failedCount++;
        }
    }
    console.log('');
    console.log('通过：' + passedCount + ' / ' + testFunctions.length);
    if (failedCount > 0) {
        console.error('失败：' + failedCount);
    }
}

runAllTests();