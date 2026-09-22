// filename: tests/services/merger.test.js
// 船舶物料申请系统 · 合并器服务测试
//
// 【M-9 修复】分离深度比较与引用比较。

import {
    mergeArray,
    mergeByLanguage,
} from '../../src/services/import-pipeline/merger.js';

function assertEqual(actual, expected, message) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(
            '断言失败（深度比较）：' + (message || '') + '\n' +
            '  期望: ' + JSON.stringify(expected) + '\n' +
            '  实际: ' + JSON.stringify(actual)
        );
    }
}

function testMergeArrayOverwrite() {
    const current = [{ impa: '1', description: 'A' }];
    const incoming = [{ impa: '2', description: 'B' }];
    const result = mergeArray(current, incoming, true);
    assertEqual(result.length, 1, '覆盖模式应只保留新数据');
    assertEqual(result[0].impa, '2', '新数据应为 impa 2');
}

function testMergeArrayAppend() {
    const current = [{ impa: '1', description: 'A' }];
    const incoming = [{ impa: '2', description: 'B' }];
    const result = mergeArray(current, incoming, false);
    assertEqual(result.length, 2, '追加模式应包含两条');
}

function testMergeArraySkipDuplicate() {
    const current = [{ impa: '1', description: 'A' }];
    const incoming = [{ impa: '1', description: 'B' }, { impa: '2', description: 'C' }];
    const result = mergeArray(current, incoming, false);
    assertEqual(result.length, 2, '追加模式应跳过重复');
    let foundMaterialA = null;
    for (let index = 0; index < result.length; index++) {
        if (result[index].impa === '1') foundMaterialA = result[index];
    }
    assertEqual(foundMaterialA.description, 'A', '重复项的原始值应保留');
}

function testMergeArrayEmptyIncoming() {
    const current = [{ impa: '1', description: 'A' }];
    const result = mergeArray(current, [], false);
    assertEqual(result.length, 1, '空导入应保留原数据');
}

function testMergeByLanguage() {
    const currentEn = [{ impa: '1', description: 'A' }];
    const currentZh = [{ impa: '1', description: '甲' }];
    const incoming = {
        en: [{ impa: '2', description: 'B' }],
        zh: [],
    };
    const result = mergeByLanguage(currentEn, currentZh, incoming, false);
    assertEqual(result.materialsEn.length, 2, '英文库应有 2 条');
    assertEqual(result.materialsZh.length, 1, '中文库应保留 1 条（空导入不变）');
}

function testMergeByLanguageOverwrite() {
    const currentEn = [{ impa: '1', description: 'A' }];
    const currentZh = [{ impa: '1', description: '甲' }];
    const incoming = {
        en: [{ impa: '2', description: 'B' }],
        zh: [{ impa: '3', description: '丙' }],
    };
    const result = mergeByLanguage(currentEn, currentZh, incoming, true);
    assertEqual(result.materialsEn.length, 1, '英文库应只有新数据');
    assertEqual(result.materialsEn[0].impa, '2', '英文库首条应为 impa 2');
    assertEqual(result.materialsZh.length, 1, '中文库应只有新数据');
    assertEqual(result.materialsZh[0].impa, '3', '中文库首条应为 impa 3');
}

function runAllTests() {
    const testFunctions = [
        testMergeArrayOverwrite,
        testMergeArrayAppend,
        testMergeArraySkipDuplicate,
        testMergeArrayEmptyIncoming,
        testMergeByLanguage,
        testMergeByLanguageOverwrite,
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