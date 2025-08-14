import { db, Box } from '../db';

// Box テーブル操作用の薄いサービス層（将来の最適化やキャッシュの受け皿）
export const boxService = {
  async upsert(box: Box): Promise<void> {
    await db.box.put(box);
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
    return db.box
      .orderBy('time')
      .filter((b) => b.graph === graph)
      .reverse()
      .limit(limit)
      .toArray();
  },
  async recentAll(limit: number): Promise<Box[]> {
    // Across all graphs, by time desc
    return db.box.orderBy('time').reverse().limit(limit).toArray();
  },
  async allByGraph(graph: string): Promise<Box[]> {
    return db.box.where('graph').equals(graph).toArray();
  },
  async favoritesByGraph(graph: string): Promise<Box[]> {
    return db.box.where('graph').equals(graph).and((b) => !!b.favorite).reverse().sortBy('time');
  },
};
