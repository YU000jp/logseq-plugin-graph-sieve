import type { BlockEntity } from '@logseq/libs/dist/LSPlugin.user';
import type { MarkdownOrOrg, Operation, FileChanges } from './types';
import { logger } from './logger';

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export const encodeLogseqFileName = (name: string) => {
  if (!name) return '';
  return name
    .replace(/\/$/, '')
    .replace(/^(CON|PRN|AUX|NUL|COM1|COM2|COM3|COM4|COM5|COM6|COM7|COM8|COM9|LPT1|LPT2|LPT3|LPT4|LPT5|LPT6|LPT7|LPT8|LPT9)$/,'$1___')
    .replace(/\.$/, '.___')
    .replace(/_\/_/g, '%5F___%5F')
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E')
    .replace(/:/g, '%3A')
    .replace(/"/g, '%22')
    .replace(/\//g, '___')
    .replace(/\\/g, '%5C')
    .replace(/\|/g, '%7C')
    .replace(/\?/g, '%3F')
    .replace(/\*/g, '%2A')
    .replace(/#/g, '%23')
    .replace(/^\./, '%2E');
};

export const decodeLogseqFileName = (name: string) => {
  if (!name) return '';
  return name
    .replace(/^(CON|PRN|AUX|NUL|COM1|COM2|COM3|COM4|COM5|COM6|COM7|COM8|COM9|LPT1|LPT2|LPT3|LPT4|LPT5|LPT6|LPT7|LPT8|LPT9)___$/, '$1')
    .replace(/\.___$/, '.')
    .replace(/%5F___%5F/g, '_/_')
    .replace(/%3C/g, '<')
    .replace(/%3E/g, '>')
    .replace(/%3A/g, ':')
    .replace(/%22/g, '"')
    .replace(/___/g, '/')
    .replace(/%5C/g, '\\')
    .replace(/%7C/g, '|')
    .replace(/%3F/g, '?')
    .replace(/%2A/g, '*')
    .replace(/%23/g, '#')
    .replace(/%2E/g, '.');
};

export const getLastUpdatedTime = async (
  fileName: string,
  handle: FileSystemDirectoryHandle,
  preferredFormat: MarkdownOrOrg
): Promise<number> => {
  let path = fileName + (preferredFormat === 'markdown' ? '.md' : '.org');

  let fileHandle = await handle.getFileHandle(path).catch(() => {
    logger.debug(`Failed to get file handle: ${path}`);
    return null;
  });
  if (!fileHandle) {
    path = fileName + (preferredFormat === 'markdown' ? '.org' : '.md');
    logger.debug(`Retry: ${path}`);
    fileHandle = await handle.getFileHandle(path).catch(() => {
      logger.debug(`Failed to get file handle: ${path}`);
      return null;
    });
  }

  if (!fileHandle) return 0;

  const file = await fileHandle.getFile();
  const date = new Date(file.lastModified);

  return date.getTime();
};

export const getSummary = (blocks: BlockEntity[]): [string[], string] => {
  const max = 100;
  let total = 0;
  const summary: string[] = [];
  let image = '';
  type ParentBlocks = { blocks: BlockEntity[]; index: number };
  const parentStack: ParentBlocks[] = [];

  if (blocks && blocks.length > 0) {
    parentStack.push({ blocks: blocks as BlockEntity[], index: 0 });

    while (total < max) {
      let currentParent: ParentBlocks = parentStack[parentStack.length - 1];
      while (currentParent.index >= currentParent.blocks.length) {
        parentStack.pop();
        if (parentStack.length === 0) break;
        currentParent = parentStack[parentStack.length - 1];
      }
      if (parentStack.length === 0) break;

      const block = currentParent.blocks[currentParent.index++];

      if (Object.prototype.hasOwnProperty.call(block, 'id')) {
        let content = (block as BlockEntity).content.substring(0, max);
        if (!content.match(/^\w+?:: ./) && !content.match(/^---\n/)) {
          if (parentStack.length > 1) {
            content = '  '.repeat(parentStack.length - 1) + '* ' + content;
          }
          total += content.length;
          summary.push(content);
        }
        if ((block as BlockEntity).children && (block as BlockEntity).children!.length > 0) {
          parentStack.push({
            blocks: (block as BlockEntity).children! as BlockEntity[],
            index: 0,
          });
        }
      }
    }

    // Search embedded image
    parentStack.splice(0, parentStack.length);
    parentStack.push({ blocks: blocks as BlockEntity[], index: 0 });

    while (parentStack.length > 0) {
      let currentParent: ParentBlocks = parentStack[parentStack.length - 1];
      while (currentParent.index >= currentParent.blocks.length) {
        parentStack.pop();
        if (parentStack.length === 0) break;
        currentParent = parentStack[parentStack.length - 1];
      }
      if (parentStack.length === 0) break;

      const block = currentParent.blocks[currentParent.index++];

      if (Object.prototype.hasOwnProperty.call(block, 'id')) {
        const ma = (block as BlockEntity).content.match(/[[(]..\/assets\/(.+\.(png|jpg|jpeg))[\])]/i);
        if (ma) {
          image = ma[1];
          break;
        }

        if ((block as BlockEntity).children && (block as BlockEntity).children!.length > 0) {
          parentStack.push({
            blocks: (block as BlockEntity).children! as BlockEntity[],
            index: 0,
          });
        }
      }
    }
  }
  return [summary, image];
};

export const parseOperation = (changes: FileChanges): [Operation, string] => {
  let operation: Operation = '';
  let originalName = '';

  for (const block of changes.blocks as BlockEntity[]) {
    if (Object.prototype.hasOwnProperty.call(block, 'path')) {
      if (changes.txData.length === 0) continue;
      if (changes.txData[0][1] === 'file/last-modified-at') {
        const path = (block as unknown as { path: string }).path;
        const ma = path.match(/pages\/(.*)\.(md|org)/);
        if (ma) {
          const fileName = ma[1];

          originalName = decodeLogseqFileName(fileName);
          operation = 'modified';
          return [operation, originalName];
        }
      }
    }
  }

  for (const data of changes.txData) {
    if (data.length === 5 && data[1] === 'block/original-name') {
      originalName = data[2] as unknown as string;
      let createOrDelete: Operation = 'create';
      if (data[4] === false) {
        createOrDelete = 'delete';
      } else {
        logger.debug(`created, ${originalName}`);
      }
      operation = createOrDelete;

      return [operation, originalName];
    }
  }

  return [operation, originalName];
};
