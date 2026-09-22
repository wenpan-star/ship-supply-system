// filename: src/services/search.js
// 船舶物料申请系统 · 搜索服务
// 纯函数，无副作用
//
// 【API 保留说明】
//   本模块提供规范的物料搜索能力，但当前视图层（material-table.js、
//   quick-add.js、request-table.js）出于性能考虑，将搜索逻辑内联到
//   各自的渲染路径中。
//
//   保留本模块的理由：
//     1. 单元测试可以独立验证搜索语义（多字段、大小写、空值）
//     2. 未来若视图层迁移到统一搜索入口，可直接复用
//     3. filterMaterials / matchMaterial 的语义是应用级"单一真相"
//
// 【本轮修改】
//   无功能性改动。仅契约验证。

/**
 * 判断单条物料是否匹配关键词
 * @param {Object} material
 * @param {string} keyword  已转小写
 * @param {string} field
 * @returns {boolean}
 */
export function matchMaterial(material, keyword, field) {
    if (!keyword) return true;
    if (field === 'impa') {
        return material.impa.toLowerCase().includes(keyword);
    }
    if (field === 'description') {
        return material.description.toLowerCase().includes(keyword);
    }
    if (field === 'specification') {
        return (material.specification || '').toLowerCase().includes(keyword);
    }
    if (field === 'unit') {
        return (material.unit || '').toLowerCase().includes(keyword);
    }
    if (field === 'remark') {
        return (material.remark || '').toLowerCase().includes(keyword);
    }
    return material.impa.toLowerCase().includes(keyword) ||
           material.description.toLowerCase().includes(keyword) ||
           (material.specification || '').toLowerCase().includes(keyword) ||
           (material.unit || '').toLowerCase().includes(keyword) ||
           (material.remark || '').toLowerCase().includes(keyword);
}

/**
 * 过滤物料数组
 * @param {Object[]} materials
 * @param {string} keyword
 * @param {string} field
 * @returns {Object[]}
 */
export function filterMaterials(materials, keyword, field) {
    if (!Array.isArray(materials)) return [];
    const trimmedKeyword = String(keyword || '').trim().toLowerCase();
    if (!trimmedKeyword) return materials.slice();
    return materials.filter(function (material) {
        return matchMaterial(material, trimmedKeyword, field);
    });
}

/**
 * 在物料数组中查找指定 IMPA
 * @param {Object[]} materials
 * @param {string} impa
 * @returns {Object|null}
 */
export function findMaterialInArray(materials, impa) {
    if (!Array.isArray(materials)) return null;
    for (let index = 0; index < materials.length; index++) {
        if (materials[index].impa === impa) {
            return materials[index];
        }
    }
    return null;
}