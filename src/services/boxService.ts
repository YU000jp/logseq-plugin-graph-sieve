import { db, Box } from '../db';

// Box テーブル操作用の薄いサービス層（将来の最適化やキャッシュの受け皿）
export const boxService = {
  async upsert(box: Box): Promise<void> {
    await db.box.put(box);
    // Logseqモードでは同一uuidの重複を排除
    const u = (box.uuid || '').trim();
    if (u) {
      const dups = await db.box.where('uuid').equals(u).toArray();
      if (dups.length > 1) {
        for (const b of dups) {
          if (b.graph === box.graph && b.name !== box.name) {
            await db.box.delete([b.graph, b.name]);
          }
        }
      }
    }
  },
  async findByUuid(uuid: string, graph?: string): Promise<Box[]> {
    if (!uuid) return [];
    const q = db.box.where('uuid').equals(uuid);
    if (!graph) return q.toArray();
    return q.filter(b => b.graph === graph).toArray();
  },
  async dedupeByUuid(graph: string, uuid: string, canonicalName: string): Promise<void> {
    if (!uuid) return;
    const list = await this.findByUuid(uuid, graph);
    if (!list || list.length <= 1) return;
    for (const b of list) {
      if (b.name !== canonicalName) {
        await db.box.delete([b.graph, b.name]);
      }
    }
  },
  async get(pk: [string, string]): Promise<Box | undefined> {
    return db.box.get(pk);
  },
  async update(pk: [string, string], patch: Partial<Box>): Promise<number> {
    return db.box.update(pk, patch);
  },
  async remove(pk: [string, string]): Promise<void> {
    await db.box.delete(pk);
  },
  async removeByGraph(graph: string): Promise<void> {
    await db.box.where('graph').equals(graph).delete();
  },
  async recent(graph: string, limit: number): Promise<Box[]> {
    const q = db.box.orderBy('time').filter((b) => b.graph === graph).reverse();
    if (!isFinite(limit) || limit <= 0) return q.toArray();
    return q.limit(limit).toArray();
  },
  async recentAll(limit: number): Promise<Box[]> {
    // Across all graphs, by time desc
    const q = db.box.orderBy('time').reverse();
    if (!isFinite(limit) || limit <= 0) return q.toArray();
    return q.limit(limit).toArray();
  },
  async allByGraph(graph: string): Promise<Box[]> {
    return db.box.where('graph').equals(graph).toArray();
  },
  async favoritesByGraph(graph: string): Promise<Box[]> {
    return db.box.where('graph').equals(graph).and((b) => !!b.favorite).reverse().sortBy('time');
  },
};
