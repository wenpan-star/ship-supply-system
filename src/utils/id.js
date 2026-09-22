// filename: src/utils/id.js
// 船舶物料申请系统 · ID 生成器
// 使用时间戳 + 随机串，保证局部唯一且可读
//
// 【本轮修改】
//   m-new-4 修复：新增 generateRecycleBinItemId 专用函数。
//     旧实现在 deleteMaterial 中直接拼接
//       language + '::' + impa + '::' + Date.now()
//     若同一毫秒对同语言同 IMPA 连续删除两次（例如快速撤销/重做
//     或脚本化批量操作），id 会碰撞。
//     normalizeRecycleBinItem 的去重会保留第一条，导致第二条被静默丢弃。
//     新函数在时间戳之外加入随机串，避免碰撞。

/**
 * 生成唯一 ID
 * 格式：<毫秒时间戳>-<8 位随机串>
 * @returns {string}
 */
export function generateUniqueId() {
    const timestampPart = Date.now().toString();
    const randomPart = Math.random().toString(36).substring(2, 10);
    return timestampPart + '-' + randomPart;
}

/**
 * 生成回收站条目 ID
 *
 * 格式：<language>::<impa>::<时间戳>-<随机串>
 *
 * 【m-new-4 修复】在时间戳之后追加随机串，
 * 保证即使在同一毫秒内对同语言同 IMPA 连续删除也能得到不同 id。
 *
 * @param {string} language  'en' | 'zh'
 * @param {string} impa
 * @returns {string}
 */
export function generateRecycleBinItemId(language, impa) {
    const timestampPart = Date.now().toString();
    const randomPart = Math.random().toString(36).substring(2, 10);
    return language + '::' + impa + '::' + timestampPart + '-' + randomPart;
}