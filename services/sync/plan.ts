/**
 * 同步计划：纯逻辑，给定「本地 + 远端 + 上次同步快照」，算出每本书该怎么处置。
 *
 * 单独成文件、不碰网络也不碰存储，是因为这里的规则最容易出错，
 * 而只要它能被单独喂数据测试，就不必真的架一个云端来验证。
 *
 * 三种模式的语义：
 *   upload   备份：本地覆盖远端。远端多出来的书不动（可能是别的设备传的）。
 *   download 恢复：远端覆盖本地。本地多出来的书不动（不删用户本机的东西）。
 *   two-way  双向：只看「谁改过」。两个方向都改过就判定冲突。
 *
 * 双向判断用的是「三方比对」——本地摘要、远端摘要，以及上次同步时记下的基线摘要：
 *   与基线相同的一方 = 没动过；与基线不同 = 改过。
 *   两边都改过 → 冲突；只有一边改过 → 往另一边同步。
 * 没有基线（这本从没同步过）时只能看两端是否一致：不一致就算冲突，
 * 因为无从判断谁更新，而「猜错方向」会直接覆盖掉用户的书稿。
 *
 * 「本机没有、云端有」有两种截然不同的含义，必须靠基线区分：
 *   - 基线里有这本 → 本机确实删过它 → forget-remote（从云端清单摘掉）；
 *   - 基线里没有   → 本机从没见过它 → download（是「恢复」而不是「删除」）。
 * 若不分青红皂白一律当删除，那么在一台新设备上做首次双向同步时，
 * 云端所有书都会被当成「本机删过的」而全部丢失。
 */

import {
  BookDescriptor,
  PlanItem,
  SyncAction,
  SyncMode,
  SyncSnapshot,
} from './types';

export interface PlanInput {
  mode: SyncMode;
  local: BookDescriptor[];
  remote: BookDescriptor[];
  snapshot: SyncSnapshot | null;
}

export interface SyncPlan {
  items: PlanItem[];
  /** 实际需要传输的条目（不含 in-sync） */
  pending: PlanItem[];
}

const byHash = (books: BookDescriptor[]): Map<string, BookDescriptor> =>
  new Map(books.map((b) => [b.id, b]));

/**
 * 生成同步计划。
 * 返回的 items 顺序稳定（先按动作分组，再按标题），方便界面可读地展示。
 */
export const buildSyncPlan = ({ mode, local, remote, snapshot }: PlanInput): SyncPlan => {
  const localMap = byHash(local);
  const remoteMap = byHash(remote);
  const baseHashes = snapshot?.books ?? {};

  const ids = Array.from(new Set([...localMap.keys(), ...remoteMap.keys()]));
  const items: PlanItem[] = [];

  for (const id of ids) {
    const localBook = localMap.get(id);
    const remoteBook = remoteMap.get(id);
    const title = localBook?.title || remoteBook?.title || '未命名书籍';
    const base = baseHashes[id]?.hash;

    let action: SyncAction;
    let reason: string;

    if (mode === 'upload') {
      if (!localBook) {
        if (base && remoteBook) {
          // 备份的语义是「让云端与我的书库一致」：本机删过的书也一并摘掉
          action = 'forget-remote';
          reason = '本机已删除，从云端清单移除（保留云端数据）';
        } else {
          // 云端有、本机从没有过（别的设备传的）：备份模式不碰它
          action = 'in-sync';
          reason = '仅存在于云端，备份模式不处理';
        }
      } else {
        action = 'upload';
        reason = remoteBook ? '用本地版本覆盖云端' : '上传到云端';
      }
    } else if (mode === 'download') {
      if (!remoteBook) {
        action = 'in-sync';
        reason = '仅存在于本机，恢复模式不处理';
      } else {
        action = 'download';
        reason = localBook ? '用云端版本覆盖本地' : '从云端恢复到本机';
      }
    } else {
      // ─── 双向 ───
      if (localBook && remoteBook && localBook.hash === remoteBook.hash) {
        action = 'in-sync';
        reason = '两端内容一致';
      } else if (!localBook && remoteBook) {
        if (base) {
          // 基线记得这本，说明本机曾经有、现在是删掉了
          action = 'forget-remote';
          reason = '本机已删除，从云端清单移除（保留云端数据）';
        } else {
          action = 'download';
          reason = '云端有、本机没有，下载到本机';
        }
      } else if (localBook && !remoteBook) {
        action = 'upload';
        reason = '本机有、云端没有，上传到云端';
      } else if (!base) {
        // 两端都有但内容不同，且从未同步过：无法判断谁更新
        action = 'conflict';
        reason = '两端内容不同且无同步记录，保留本地并另存云端副本';
      } else {
        const localChanged = localBook!.hash !== base;
        const remoteChanged = remoteBook!.hash !== base;

        if (localChanged && remoteChanged) {
          action = 'conflict';
          reason = '两端都改动过，保留本地并另存云端副本';
        } else if (localChanged) {
          action = 'upload';
          reason = '本地有改动，上传到云端';
        } else if (remoteChanged) {
          action = 'download';
          reason = '云端有改动，下载到本机';
        } else {
          action = 'in-sync';
          reason = '自上次同步后两端都没有改动';
        }
      }
    }

    items.push({ bookId: id, title, action, reason });
  }

  // 排序让界面好读：真正要动的手在前，且同组内按标题排
  const order: Record<SyncAction, number> = {
    upload: 0,
    download: 1,
    conflict: 2,
    'forget-remote': 3,
    'in-sync': 4,
  };
  items.sort((a, b) => order[a.action] - order[b.action] || a.title.localeCompare(b.title, 'zh'));

  return { items, pending: items.filter((i) => i.action !== 'in-sync') };
};

/** 计划的一句话概述，用于界面顶部 */
export const summarizePlan = (plan: SyncPlan): string => {
  const count = (action: SyncAction) => plan.items.filter((i) => i.action === action).length;
  const parts: string[] = [];
  const up = count('upload');
  const down = count('download');
  const conflict = count('conflict');
  const forget = count('forget-remote');
  const inSync = count('in-sync');

  if (up) parts.push(`上传 ${up} 本`);
  if (down) parts.push(`下载 ${down} 本`);
  if (conflict) parts.push(`冲突 ${conflict} 本`);
  if (forget) parts.push(`移除记录 ${forget} 本`);
  if (inSync) parts.push(`无需处理 ${inSync} 本`);

  return parts.length > 0 ? parts.join('，') : '没有需要同步的书';
};
