import Dexie, { Table } from 'dexie';

export interface Box {
  graph: string; // graph name in Logseq db
  name: string; // originalName in Logseq db
  uuid: string; // uuid in Logseq db  
  time: number; // Unix time
  summary: string[];
  image: string;
  archived?: boolean; // viewed/archived toggle
  favorite?: boolean; // plugin-local favorites toggle
  journal?: boolean; // Logseq :block/journal? flag (Logseq mode only)
}

export class CardBoxDexie extends Dexie {
  box!: Table<Box>; 

  constructor(dbName: string) {
    super(dbName);
    this.version(1).stores({
      box: '[graph+name], graph, time'
    });
    this.version(2).stores({
      // add 'archived' as an indexed property for quick filtering if needed
      box: '[graph+name], graph, time, archived'
    }).upgrade(tx => {
      const table = tx.table<Box>('box');
      return table.toCollection().modify((b) => {
        if (typeof b.archived === 'undefined') {
          (b as Box).archived = false;
        }
      });
    });
    this.version(3).stores({
      // add 'favorite' flag (non-indexed) and keep indices; Dexie requires re-declare full schema
      box: '[graph+name], graph, time, archived, favorite'
    }).upgrade(tx => {
      const table = tx.table<Box>('box');
      return table.toCollection().modify((b) => {
        if (typeof b.favorite === 'undefined') {
          (b as Box).favorite = false;
        }
      });
    });
    this.version(4).stores({
      // add 'journal' flag
      box: '[graph+name], graph, time, archived, favorite, journal'
    }).upgrade(tx => {
      const table = tx.table<Box>('box');
      return table.toCollection().modify((b) => {
        if (typeof (b as any).journal === 'undefined') {
          (b as Box).journal = false;
        }
      });
    });
    this.version(5).stores({
      // add 'uuid' index for dedupe by uuid
      box: '[graph+name], graph, time, archived, favorite, journal, uuid'
    });
  }
}

export const db = new CardBoxDexie('logseq-graph-sieve-plugin');
