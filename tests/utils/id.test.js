// filename: tests/utils/id.test.js
// 船舶物料申请系统 · ID 生成器测试
// 使用原生断言，不依赖测试框架
//
// 【本轮新增】
//   为 m-new-4 修复提供回归测试：
//     - generateRecycleBinItemId 在时间戳之后追加随机串
//     - 同一毫秒内对同语言同 IMPA 连续删除，能得到不同的 ID
//     - 格式约定：<language>::<impa>::<timestamp>-<random>

import {
    generateUniqueId,
    generateRecycleBinItemId,
} from '../../src/utils/id.js';

function assertTrue(condition, message) {
    if (!condition) {
        throw new Error('断言失败（应为 true）：' + (message || ''));
    }
}

function assertNotEqual(actual, expected, message) {
    if (actual === expected) {
        throw new Error('断言失败（不应相等）：' + (message || '') + '\n  值: ' + String(actual));
    }
}

function assertMatchPattern(text, pattern, message) {
    if (!pattern.test(text)) {
        throw new Error(
            '断言失败（正则不匹配）：' + (message || '') + '\n' +
            '  文本: ' + String(text) + '\n' +
            '  正则: ' + String(pattern)
        );
    }
}

function testGenerateUniqueIdFormat() {
    const id = generateUniqueId();
    assertTrue(typeof id === 'string', 'ID 应为字符串');
    assertMatchPattern(id, /^\d+-[a-z0-9]+$/, 'ID 应符合 <时间戳>-<随机串> 格式');
}

function testGenerateUniqueIdUniqueness() {
    // 连续生成 1000 个，应全部互异（含极小的碰撞概率）
    const seenIds = new Set();
    for (let index = 0; index < 1000; index++) {
        seenIds.add(generateUniqueId());
    }
    assertTrue(seenIds.size === 1000, '1000 次连续生成应全部唯一');
}

function testGenerateRecycleBinItemIdFormat() {
    const id = generateRecycleBinItemId('zh', '999999');
    assertMatchPattern(
        id,
        /^zh::999999::\d+-[a-z0-9]+$/,
        '回收站 ID 应符合 <language>::<impa>::<时间戳>-<随机串> 格式'
    );
}

function testGenerateRecycleBinItemIdEnglish() {
    const id = generateRecycleBinItemId('en', 'ABC123');
    assertMatchPattern(
        id,
        /^en::ABC123::\d+-[a-z0-9]+$/,
        '英文库 ID 应使用 en 前缀'
    );
}

/**
 * m-new-4 关键回归测试：
 * 同一毫秒内对同语言同 IMPA 连续删除，必须得到不同 ID。
 *
 * 旧实现使用 language + '::' + impa + '::' + Date.now()，
 * 在快速连续调用下会产生相同 ID，被 normalizeRecycleBin 去重丢弃。
 * 新实现追加随机串，避免碰撞。
 */
function testGenerateRecycleBinItemIdUniquenessInSameMillisecond() {
    const seenIds = new Set();
    // 连续快速生成 500 个（JS 同步循环通常在同一毫秒或相邻毫秒内完成）
    for (let index = 0; index < 500; index++) {
        seenIds.add(generateRecycleBinItemId('zh', '999999'));
    }
    assertTrue(
        seenIds.size === 500,
        '同毫秒内对同语言同 IMPA 连续生成 500 个 ID，应全部唯一（实际唯一数：' + seenIds.size + '）'
    );
}

function testGenerateRecycleBinItemIdDifferentImpaDifferentId() {
    const idA = generateRecycleBinItemId('zh', '999999');
    const idB = generateRecycleBinItemId('zh', '888888');
    assertNotEqual(idA, idB, '不同 IMPA 应得到不同 ID');
}

function testGenerateRecycleBinItemIdDifferentLanguageDifferentId() {
    const idA = generateRecycleBinItemId('zh', '999999');
    const idB = generateRecycleBinItemId('en', '999999');
    assertNotEqual(idA, idB, '不同语言应得到不同 ID');
}

function runAllTests() {
    const testFunctions = [
        testGenerateUniqueIdFormat,
        testGenerateUniqueIdUniqueness,
        testGenerateRecycleBinItemIdFormat,
        testGenerateRecycleBinItemIdEnglish,
        testGenerateRecycleBinItemIdUniquenessInSameMillisecond,
        testGenerateRecycleBinItemIdDifferentImpaDifferentId,
        testGenerateRecycleBinItemIdDifferentLanguageDifferentId,
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