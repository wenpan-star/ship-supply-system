// filename: tests/services/import-pipeline/validator.test.js
// 船舶物料申请系统 · 导入校验器测试
//
// 【M-4 联动】validateSheet 现在使用探测式表头查找，
//   新增"带标题行"的测试用例，验证探测行为。

import {
    validateSheet,
    validateSheets,
} from '../../../src/services/import-pipeline/validator.js';

function assertEqual(actual, expected, message) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(
            '断言失败（深度比较）：' + (message || '') + '\n' +
            '  期望: ' + JSON.stringify(expected) + '\n' +
            '  实际: ' + JSON.stringify(actual)
        );
    }
}

function testValidateSheetBasic() {
    const rows = [
        ['IMPA', 'Description', 'Specification', 'Unit', 'Remark'],
        ['999999', 'Test Material', 'Spec A', 'PCS', 'Note A'],
        ['888888', 'Test 2', 'Spec B', 'BOX', 'Note B'],
    ];
    const result = validateSheet(rows, 'CN');
    assertEqual(result.error, null, '应无错误');
    assertEqual(result.validRows.length, 2, '应有 2 条有效行');
    assertEqual(result.validRows[0].impa, '999999', '第一条 IMPA 正确');
    assertEqual(result.validRows[0].description, 'Test Material', '第一条描述正确');
}

function testValidateSheetWithTitleRow() {
    // M-4：表头行不在第 0 行时也应能探测到
    const rows = [
        ['物料清单', '', '', '', ''],
        ['', '', '', '', ''],
        ['IMPA', '物料描述', '规格', '单位', '备注'],
        ['999999', '测试物料', '规格A', 'PCS', '备注A'],
    ];
    const result = validateSheet(rows, 'CN');
    assertEqual(result.error, null, '带标题行应无错误');
    assertEqual(result.headerRowIndex, 2, '表头行索引应为 2');
    assertEqual(result.validRows.length, 1, '应有 1 条有效行');
    assertEqual(result.validRows[0].impa, '999999', '有效行 IMPA 正确');
}

function testValidateSheetMissingImpaColumn() {
    const rows = [
        ['Description', 'Spec'],
        ['Test', 'A'],
    ];
    const result = validateSheet(rows, 'CN');
    assertEqual(result.validRows.length, 0, '无有效行');
    if (result.error === null) {
        throw new Error('应返回错误：缺少 IMPA 列');
    }
}

function testValidateSheetEmptyRows() {
    const result = validateSheet([], 'CN');
    if (result.error === null) {
        throw new Error('空数据应返回错误');
    }
}

function testValidateSheetSkipEmptyImpaRows() {
    const rows = [
        ['IMPA', 'Description'],
        ['999999', 'Has IMPA'],
        ['', 'No IMPA'],
        ['888888', 'Has IMPA 2'],
    ];
    const result = validateSheet(rows, 'CN');
    assertEqual(result.validRows.length, 2, '应跳过空 IMPA 行');
}

function testValidateSheetChineseHeaders() {
    const rows = [
        ['IMPA', '物料描述', '规格', '单位', '备注'],
        ['999999', '测试物料', '规格A', 'PCS', '备注A'],
    ];
    const result = validateSheet(rows, '中文表');
    assertEqual(result.validRows.length, 1, '中文表头应被识别');
    assertEqual(result.validRows[0].description, '测试物料', '中文描述正确');
}

function testValidateSheetsCnEn() {
    const parseResult = {
        sheetNames: ['CN', 'EN'],
        sheets: {
            CN: [
                ['IMPA', '物料描述'],
                ['999999', '测试'],
            ],
            EN: [
                ['IMPA', 'Description'],
                ['999999', 'Test'],
            ],
        },
    };
    const result = validateSheets(parseResult, true, true);
    assertEqual(result.error, null, '应无错误');
    assertEqual(result.zh.length, 1, '中文应有 1 条');
    assertEqual(result.en.length, 1, '英文应有 1 条');
}

function testValidateSheetsBothEmpty() {
    const parseResult = {
        sheetNames: ['CN', 'EN'],
        sheets: {
            CN: [['IMPA', '物料描述']],
            EN: [['IMPA', 'Description']],
        },
    };
    const result = validateSheets(parseResult, true, true);
    if (result.error === null) {
        throw new Error('两表皆空应返回错误');
    }
}

function testValidateSheetsSingleSheet() {
    const parseResult = {
        sheetNames: ['Sheet1'],
        sheets: {
            Sheet1: [
                ['IMPA', 'Description'],
                ['999999', 'Test'],
            ],
        },
    };
    const result = validateSheets(parseResult, false, false);
    assertEqual(result.error, null, '应无错误');
    if (!result.singleSheet) {
        throw new Error('应返回 singleSheet');
    }
    assertEqual(result.singleSheet.rows.length, 1, '单表应有 1 条');
}

function runAllTests() {
    const testFunctions = [
        testValidateSheetBasic,
        testValidateSheetWithTitleRow,
        testValidateSheetMissingImpaColumn,
        testValidateSheetEmptyRows,
        testValidateSheetSkipEmptyImpaRows,
        testValidateSheetChineseHeaders,
        testValidateSheetsCnEn,
        testValidateSheetsBothEmpty,
        testValidateSheetsSingleSheet,
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