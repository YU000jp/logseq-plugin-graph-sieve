import type { BlockEntity, BlockUUIDTuple, IDatom } from '@logseq/libs/dist/LSPlugin.user';

export type Operation = 'create' | 'modified' | 'delete' | '';

export type MarkdownOrOrg = 'markdown' | 'org';

export type SearchResultPage = string[];

export type PrimaryKey = [string, string];

export type FileChanges = {
  blocks: (BlockEntity | BlockUUIDTuple)[];
  txData: IDatom[];
  txMeta?: {
    outlinerOp: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
  };
};
