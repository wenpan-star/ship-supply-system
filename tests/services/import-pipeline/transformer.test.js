// filename: tests/services/import-pipeline/transformer.test.js
// 船舶物料申请系统 · 导入转换器测试

import {
    transformRow,
    transformToMaterialRecords,
} from '../../../src/services/import-pipeline/transformer.js';

function assertEqual(actual, expected, message) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(
            '断言失败（深度比较）：' + (message || '') + '\n' +
            '  期望: ' + JSON.stringify(expected) + '\n' +
            '  实际: ' + JSON.stringify(actual)
        );
    }
}

function testTransformRowBasic() {
    const raw = {
        impa: '999999',
        description: 'Test Material',
        specification: 'Spec A',
        unit: 'PCS',
        remark: 'Note A',
    };
    const result = transformRow(raw, 'import');
    assertEqual(result.impa, '999999', 'IMPA 应正确');
    assertEqual(result.description, 'Test Material', '描述应正确');
    assertEqual(result.source, 'import', '来源应正确');
}

function testTransformRowEmptyDescription() {
    const raw = {
        impa: '999999',
        description: '',
        specification: '',
        unit: '',
        remark: '',
    };
    const result = transformRow(raw, 'batch');
    assertEqual(result.description, 'IMPA 999999', '空描述应回退为 IMPA 前缀');
}

function testTransformRowTrimAndSlice() {
    const raw = {
        impa: '  999999  ',
        description: '  Test  ',
        specification: '  Spec  ',
        unit: '  PCS  ',
        remark: '  Note  ',
    };
    const result = transformRow(raw, 'custom');
    assertEqual(result.impa, '999999', 'IMPA 应去空格');
    assertEqual(result.description, 'Test', '描述应去空格');
    assertEqual(result.specification, 'Spec', '规格应去空格');
    assertEqual(result.unit, 'PCS', '单位应去空格');
    assertEqual(result.remark, 'Note', '备注应去空格');
}

function testTransformToMaterialRecordsCnEn() {
    const validation = {
        zh: [
            { impa: '999999', description: '测试', specification: '规格', unit: 'PCS', remark: '' },
        ],
        en: [
            { impa: '999999', description: 'Test', specification: 'Spec', unit: 'PCS', remark: '' },
        ],
    };
    const result = transformToMaterialRecords(validation, 'import');
    assertEqual(result.zh.length, 1, '中文库应有 1 条');
    assertEqual(result.en.length, 1, '英文库应有 1 条');
    assertEqual(result.zh[0].impa, '999999', '中文 IMPA 正确');
    assertEqual(result.en[0].impa, '999999', '英文 IMPA 正确');
}

function testTransformToMaterialRecordsSingleSheetChinese() {
    const validation = {
        singleSheet: {
            name: 'Sheet1',
            rows: [
                { impa: '999999', description: '测试物料', specification: '', unit: '', remark: '' },
            ],
        },
    };
    const result = transformToMaterialRecords(validation, 'batch');
    assertEqual(result.zh.length, 1, '中文内容应归入中文库');
    assertEqual(result.en.length, 0, '英文库应为空');
}

function testTransformToMaterialRecordsSingleSheetEnglish() {
    const validation = {
        singleSheet: {
            name: 'Sheet1',
            rows: [
                { impa: '999999', description: 'Test Material', specification: '', unit: '', remark: '' },
            ],
        },
    };
    const result = transformToMaterialRecords(validation, 'batch');
    assertEqual(result.en.length, 1, '英文内容应归入英文库');
    assertEqual(result.zh.length, 0, '中文库应为空');
}

function runAllTests() {
    const testFunctions = [
        testTransformRowBasic,
        testTransformRowEmptyDescription,
        testTransformRowTrimAndSlice,
        testTransformToMaterialRecordsCnEn,
        testTransformToMaterialRecordsSingleSheetChinese,
        testTransformToMaterialRecordsSingleSheetEnglish,
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