// filename: src/services/pagination.js
// 船舶物料申请系统 · 分页服务
// 纯函数，无副作用
//
// 【API 保留说明】
//   提供规范的分页计算能力，当前视图层将分页切片逻辑内联。
//
//   保留本模块的理由：
//     1. 单元测试可独立验证边界（空数组、页码越界、页大小非法）
//     2. 未来若引入虚拟滚动，分页计算可集中优化
//     3. computePagination 的语义是应用级"单一真相"
//
// 【本轮修改】
//   无功能性改动。仅契约验证。

/**
 * 计算分页信息
 * @param {number} totalItems
 * @param {number} pageSize
 * @param {number} currentPage
 * @returns {{totalPages: number, safePage: number, startIndex: number, endIndex: number}}
 */
export function computePagination(totalItems, pageSize, currentPage) {
    const safePageSize = (Number.isFinite(pageSize) && pageSize > 0)
        ? Math.floor(pageSize)
        : 1;
    const safeTotal = (Number.isFinite(totalItems) && totalItems >= 0)
        ? Math.floor(totalItems)
        : 0;
    let totalPages = Math.ceil(safeTotal / safePageSize);
    if (totalPages < 1) totalPages = 1;

    let safePage = (Number.isFinite(currentPage) && currentPage > 0)
        ? Math.floor(currentPage)
        : 1;
    if (safePage > totalPages) safePage = totalPages;
    if (safePage < 1) safePage = 1;

    const startIndex = (safePage - 1) * safePageSize;
    const endIndex = Math.min(startIndex + safePageSize, safeTotal);

    return {
        totalPages: totalPages,
        safePage: safePage,
        startIndex: startIndex,
        endIndex: endIndex,
    };
}

/**
 * 从数组中截取指定页的数据
 * @param {Object[]} array
 * @param {number} pageSize
 * @param {number} currentPage
 * @returns {Object[]}
 */
export function slicePage(array, pageSize, currentPage) {
    if (!Array.isArray(array)) return [];
    const pagination = computePagination(array.length, pageSize, currentPage);
    return array.slice(pagination.startIndex, pagination.endIndex);
}