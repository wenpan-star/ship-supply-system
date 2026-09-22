// filename: src/services/import-pipeline/merger.js
// 船舶物料申请系统 · 导入数据合并器
// 职责：将新物料合并到现有库（覆盖或追加）
//
// 【合并语义】
//   - overwriteMode = true：新数据完全替换旧数据
//   - overwriteMode = false：旧数据保留，新数据中不冲突的追加
//     （按 IMPA 去重，冲突时保留旧值）
//
// 【为什么用 Map 而非 Set】
//   Map 保留 IMPA → 物料的映射关系，合并时无需二次遍历。
//   Map 的迭代顺序即插入顺序，保证合并结果的稳定性。
//
// 【本轮修改】
//   无功能性改动。仅契约验证。

/**
 * 合并单语言库
 * @param {Object[]} currentArray
 * @param {Object[]} incomingArray
 * @param {boolean} overwriteMode
 * @returns {Object[]}
 */
export function mergeArray(currentArray, incomingArray, overwriteMode) {
    if (overwriteMode) {
        return incomingArray.slice();
    }
    const materialMap = new Map();
    for (let index = 0; index < currentArray.length; index++) {
        materialMap.set(currentArray[index].impa, currentArray[index]);
    }
    for (let index = 0; index < incomingArray.length; index++) {
        const material = incomingArray[index];
        if (!materialMap.has(material.impa)) {
            materialMap.set(material.impa, material);
        }
    }
    return Array.from(materialMap.values());
}

/**
 * 按语言合并
 * 【重要】单侧为空时，保留该侧原数组（不因空导入清空库）
 * @param {Object[]} currentEn
 * @param {Object[]} currentZh
 * @param {{en: Object[], zh: Object[]}} incoming
 * @param {boolean} overwriteMode
 * @returns {{materialsEn: Object[], materialsZh: Object[]}}
 */
export function mergeByLanguage(currentEn, currentZh, incoming, overwriteMode) {
    const nextEn = incoming.en.length > 0
        ? mergeArray(currentEn, incoming.en, overwriteMode)
        : currentEn.slice();
    const nextZh = incoming.zh.length > 0
        ? mergeArray(currentZh, incoming.zh, overwriteMode)
        : currentZh.slice();
    return {
        materialsEn: nextEn,
        materialsZh: nextZh,
    };
}