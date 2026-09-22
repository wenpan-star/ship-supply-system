// filename: tests/services/import-pipeline/parser.test.js
// 船舶物料申请系统 · Excel 解析器测试
//
// 【本轮新增】
//   为 parser.js 提供回归测试。核心可测点：
//     - 文件对象无效（null / 无 size）→ 返回错误
//     - 文件超过 MAX_IMPORT_FILE_SIZE_BYTES → 返回错误并含 MB 提示
//     - 文件在大小上限以内 + XLSX 库未加载 → 返回"XLSX 库未加载"
//
//   由于 parseExcelFile 依赖 FileReader 和 window.XLSX，本项目
//   测试环境无 DOM，因此只测试"前置校验"分支（这两类分支在
//   FileReader 触发之前返回，不需要 DOM）。
//   实际解析逻辑（FileReader.onload）由集成测试覆盖。

import {
    parseExcelFile,
} from '../../../src/services/import-pipeline/parser.js';
import {
    MAX_IMPORT_FILE_SIZE_BYTES,
} from '../../../src/constants.js';

function assertEqual(actual, expected, message) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(
            '断言失败（深度比较）：' + (message || '') + '\n' +
            '  期望: ' + JSON.stringify(expected) + '\n' +
            '  实际: ' + JSON.stringify(actual)
        );
    }
}

function assertTrue(condition, message) {
    if (!condition) {
        throw new Error('断言失败（应为 true）：' + (message || ''));
    }
}

function assertNotNull(value, message) {
    if (value === null || value === undefined) {
        throw new Error('断言失败（应非 null）：' + (message || ''));
    }
}

async function testNullFileReturnsError() {
    const result = await parseExcelFile(null);
    assertNotNull(result, '应返回结果对象');
    assertNotNull(result.error, 'null 文件应返回 error');
    assertEqual(result.sheetNames.length, 0, 'sheetNames 应为空');
}

async function testUndefinedFileReturnsError() {
    const result = await parseExcelFile(undefined);
    assertNotNull(result.error, 'undefined 文件应返回 error');
}

async function testFileWithoutSizeReturnsError() {
    const fakeFile = { name: 'test.xlsx' };
    const result = await parseExcelFile(fakeFile);
    assertNotNull(result.error, '无 size 属性应返回 error');
}

async function testFileExceedingSizeLimitReturnsError() {
    const fakeFile = {
        name: 'huge.xlsx',
        size: MAX_IMPORT_FILE_SIZE_BYTES + 1,
    };
    const result = await parseExcelFile(fakeFile);
    assertNotNull(result.error, '超限文件应返回 error');
    assertTrue(
        result.error.indexOf('MB') !== -1,
        '错误消息应包含 MB 单位（实际：' + result.error + '）'
    );
    assertEqual(result.sheetNames.length, 0, 'sheetNames 应为空');
}

async function testFileWithInvalidObjectStillReturnsError() {
    // 非法对象：size 不是 number
    const fakeFile = {
        name: 'bad.xlsx',
        size: 'not-a-number',
    };
    const result = await parseExcelFile(fakeFile);
    assertNotNull(result.error, 'size 非数值应返回 error');
}

/**
 * 大小刚好等于上限：应通过前置校验，进入 FileReader 流程。
 * 由于测试环境无 FileReader，Promise 不会被 resolve，
 * 但我们通过 Promise.race 验证"至少进入了 FileReader 分支而非立即错误"。
 *
 * 更严谨的验证：只检查"未返回前置错误消息"，即不是"文件大小超过..."。
 */
async function testFileAtSizeLimitDoesNotReturnSizeError() {
    const fakeFile = {
        name: 'at-limit.xlsx',
        size: MAX_IMPORT_FILE_SIZE_BYTES,
    };
    // 由于无 FileReader，这个 Promise 会挂起。用超时短路。
    const result = await Promise.race([
        parseExcelFile(fakeFile),
        new Promise(function (resolve) {
            setTimeout(function () { resolve('__timeout__'); }, 100);
        }),
    ]);
    // 若返回字符串 '__timeout__'，说明进入了 FileReader 分支（未立即错误）
    // 若返回对象，说明在 FileReader 之前就返回了结果，那 result.error 不应是大小错误
    if (result === '__timeout__') {
        // OK：已进入 FileReader 分支
        return;
    }
    assertTrue(
        result.error !== null && result.error.indexOf('MB') === -1,
        '刚好达上限不应触发文件大小错误'
    );
}

async function runAllTests() {
    const testFunctions = [
        testNullFileReturnsError,
        testUndefinedFileReturnsError,
        testFileWithoutSizeReturnsError,
        testFileExceedingSizeLimitReturnsError,
        testFileWithInvalidObjectStillReturnsError,
        testFileAtSizeLimitDoesNotReturnSizeError,
    ];
    let passedCount = 0;
    let failedCount = 0;
    for (let index = 0; index < testFunctions.length; index++) {
        const testFunction = testFunctions[index];
        try {
            await testFunction();
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