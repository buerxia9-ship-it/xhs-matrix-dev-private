'use strict';
// Account-scoped opt-in. Do not infer a business identity from persona IDs or nicknames.
const PROTECTED_PROFILE = 'yubao-copy-v1';
function blocked(reason) { return { kind: 'blocked', reason }; }
function parseAccountProfile(raw) {
  if (raw == null || raw === '') return { kind: 'standard' };
  let config;
  try { config = typeof raw === 'string' ? JSON.parse(raw) : raw; }
  catch { return blocked('账号活跃时段配置不是有效 JSON，无法确认内容权限。'); }
  if (!config || typeof config !== 'object' || Array.isArray(config)) return blocked('账号配置格式无效。');
  if (config.contentProfile == null) return { kind: 'standard' };
  const profile = config.contentProfile;
  if (!profile || typeof profile !== 'object' || Array.isArray(profile) ||
      profile.key !== PROTECTED_PROFILE || profile.version !== 1 || profile.protectedPackaging !== true) {
    return blocked('账号内容能力配置无效或版本不受支持。');
  }
  return { kind: 'protected' };
}
function publisherIds(campaign) {
  const raw = campaign?.publishAccountIds;
  if (raw == null || raw === '') return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return null;
  try { const parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed : null; }
  catch { return null; }
}
async function resolveContentProfile(service, campaign) {
  const ids = publisherIds(campaign);
  if (!ids) return blocked('发布账号列表不是有效数组，无法确认内容权限。');
  if (!ids.length) return { kind: 'standard' };
  if (!campaign?.personaId) return blocked('项目未绑定人设，无法确认发布账号内容权限。');
  if (ids.some(id => typeof id !== 'string' || !id.trim()) || new Set(ids).size !== ids.length) {
    return blocked('发布账号列表含空值或重复账号，无法安全绑定内容权限。');
  }
  const accounts = await service.prisma.account.findMany({
    where: { id: { in: ids } },
    select: { id: true, role: true, personaId: true, activeWindow: true },
  });
  if (accounts.length !== ids.length) return blocked('部分发布账号不存在，无法确认内容权限。');
  let protectedCount = 0;
  for (const account of accounts) {
    if (account.role !== 'publisher' || account.personaId !== campaign.personaId) {
      return blocked('发布账号与项目人设绑定不一致，已阻止跨账号使用资料。');
    }
    const profile = parseAccountProfile(account.activeWindow);
    if (profile.kind === 'blocked') return profile;
    if (profile.kind === 'protected') protectedCount++;
  }
  if (protectedCount && protectedCount !== ids.length) {
    return blocked('同一项目混用受保护与普通账号，请拆分项目分别生成。');
  }
  return { kind: protectedCount ? 'protected' : 'standard' };
}
module.exports = { PROTECTED_PROFILE, parseAccountProfile, resolveContentProfile };
