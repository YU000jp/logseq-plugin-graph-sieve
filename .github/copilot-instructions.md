# GitHub Copilot Instructions for Logseq Graph Sieve Plugin

## Project Overview

This is a **Logseq plugin** called "Graph Sieve" that provides a file system browser and text processing interface for Logseq graph content. The plugin allows users to extract, normalize, and preview plain text from Logseq pages and journals without running Logseq itself.

## Tech Stack & Architecture

- **Framework**: React 18 + TypeScript 5.9
- **Build Tool**: Vite 7 with SWC for fast compilation
- **UI Library**: Material UI 5 (@mui/material, @mui/icons-material) with Emotion styling
- **Database**: Dexie (IndexedDB wrapper) with React hooks
- **Plugin API**: @logseq/libs for Logseq integration
- **Internationalization**: i18next with react-i18next
- **Testing**: Vitest for unit tests
- **Linting**: ESLint with TypeScript rules
- **Package Manager**: npm (with pnpm-lock.yaml for faster installs)

## Key Directories & Files

```
src/
├── components/        # Reusable React components
├── hooks/            # Custom React hooks  
├── i18n/             # Internationalization files (en, ja, de, fr, ko, zh-CN, zh-TW)
├── services/         # Business logic and API services
├── tests/            # Unit tests with Vitest
├── utils/            # Utility functions for text processing, file handling
├── App.tsx           # Main application component
├── db.ts             # Dexie database configuration
├── types.ts          # TypeScript type definitions
└── main.tsx          # Application entry point with Logseq integration
```

## Coding Standards & Patterns

### TypeScript
- Use **strict mode** enabled in tsconfig.json
- Prefer **explicit types** over `any` (current codebase has lint warnings to fix)
- Use **interface** for object shapes, **type** for unions/primitives
- Import types with `import type` syntax

### React Patterns
- Use **functional components** with hooks
- Follow **hooks rules** (no conditional calls, proper dependency arrays)
- Use **React.memo** for performance optimization where needed
- Prefer **controlled components** for form inputs

### State Management
- **Local state**: useState for component-level state
- **Global state**: Dexie database with dexie-react-hooks
- **Settings**: localStorage for user preferences

### File System Access
- Uses **File System Access API** for modern browsers
- Fallback patterns for browsers without support
- File operations are async and should handle errors gracefully

## Component Structure Examples

```typescript
// Good component pattern
interface ComponentProps {
  title: string;
  onAction: (data: SomeType) => void;
}

const Component: React.FC<ComponentProps> = ({ title, onAction }) => {
  const { t } = useTranslation();
  
  return (
    <Box>
      <Typography variant="h6">{t(title)}</Typography>
      {/* ... */}
    </Box>
  );
};

export default React.memo(Component);
```

## Database Patterns

```typescript
// Dexie table definitions in db.ts
export interface PageRecord {
  id?: number;
  path: string;
  title: string;
  content: string;
  lastModified: number;
}

// Using with React hooks
const { data: pages } = useLiveQuery(() => 
  db.pages.where('title').startsWithIgnoreCase(query).toArray()
);
```

## Text Processing Utilities

The `utils/` directory contains specialized functions for:
- **content.ts**: Normalizing Logseq markdown (removing properties, page refs, etc.)
- **linkResolver.ts**: Resolving page links and journal date formats
- **pageLocator.ts**: Finding files in the graph directory structure
- **journal.ts**: Handling date formats and journal page detection

## Internationalization

- Use `useTranslation()` hook from react-i18next
- Key files: `src/i18n/configs.ts` and `src/i18n/{lang}.json`
- Sync with Logseq's language setting in main.tsx

```typescript
const { t } = useTranslation();
return <Button>{t('common.save')}</Button>;
```

## Testing Guidelines

- **Unit tests**: Use Vitest with `.spec.ts` files in `src/tests/`
- **Test utilities**: Focus on core logic like text processing, link resolution
- **Mock external dependencies**: File system access, Logseq APIs
- **Run tests**: `npm test` (should pass before commits)

## Linting & Build

- **Lint**: `npm run lint` (currently has warnings to address)
- **Build**: `npm run build` (TypeScript compilation + Vite bundle)
- **Dev**: `npm run dev` (development server)

## Common Patterns to Follow

### Error Handling
```typescript
try {
  const result = await someAsyncOperation();
  // handle success
} catch (error) {
  console.error('Operation failed:', error);
  // graceful fallback
}

// Silent error handling for non-critical operations (like storage)
export function setString(key: string, val: string): void {
  try { localStorage.setItem(key, val); } catch { /* ignore */ }
}
```

### Component Patterns
```typescript
// Use React.memo for performance optimization
const Component = memo<Props>(({ prop1, prop2 }) => {
  const { t } = useTranslation();
  
  // Helper functions defined inside component
  const helperFunction = (data: string) => {
    // Process data
    return processedData;
  };
  
  return <div>{/* JSX */}</div>;
});

// Export with display name for debugging
Component.displayName = 'ComponentName';
export default Component;
```

### Text Highlighting Pattern
```typescript
// Common pattern for search result highlighting
const highlightText = (text: string, terms: string[]) => {
  const words = (terms || []).map(s => (s||'').trim()).filter(Boolean);
  if (words.length === 0) return text;
  
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    const re = new RegExp(`(${words.map(esc).join('|')})`, 'gi');
    // Create JSX with <mark> elements for highlights
  } catch { 
    return text; // Fallback on regex errors
  }
};
```

### LocalStorage Utilities

Use the safe wrapper functions from `utils/storage.ts`:

```typescript
import { getString, setString, getBoolean, setBoolean, getNumber, setNumber } from '../utils/storage';

// Safe localStorage access with defaults
const userSetting = getString('userPreference', 'defaultValue');
const enabled = getBoolean('featureEnabled', true);
const count = getNumber('itemCount', 0);

// Safe storage that won't throw on quota/access errors  
setString('userPreference', newValue);
setBoolean('featureEnabled', false);
```
```typescript
// Prefer sx prop over styled components for simple styles
<Box sx={{ p: 2, bgcolor: 'background.paper' }}>
  <Typography variant="body1">{content}</Typography>
</Box>
```

### File System Operations
```typescript
// Always handle FileSystemAccess API errors
const handleDirectorySelect = async () => {
  try {
    const dirHandle = await window.showDirectoryPicker();
    // process directory
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.error('Directory selection failed:', error);
    }
  }
};
```

## Plugin-Specific Context

- **Target**: Logseq users who want to browse/export graph content
- **Use case**: Text extraction, normalization, and preview without running Logseq
- **File formats**: Mainly markdown (.md) files in pages/ and journals/ directories
- **Logseq conventions**: Page references [[Page Title]], properties, blocks, queries

### Logseq Integration Patterns

```typescript
// Plugin lifecycle - main.tsx
const openCardBox = () => {
  logseq.showMainUI(); // Show plugin UI
};

// Sync with Logseq's language preference
const syncI18nWithLogseq = async () => {
  const cfg: any = await logseq.App.getUserConfigs();
  const tagRaw = String(cfg?.preferredLanguage || cfg?.preferredLocale || '').trim();
  // Map to supported i18n keys
};

// Register plugin commands and UI
logseq.provideModel({
  openCardBox,
});

logseq.App.registerUIItem('toolbar', {
  key: 'graph-sieve',
  template: `<div class="button"><span>🔍</span></div>`,
});
```

## Development Notes

- The plugin runs in Logseq's plugin sandbox with limited file system access
- UI should be responsive and accessible (Material UI helps with this)
- Performance matters when processing large graphs with many files
- Support both English and Japanese users (other languages available)

When suggesting code changes:
1. Maintain existing patterns and architecture
2. Consider internationalization for user-facing strings  
3. Add appropriate TypeScript types
4. Include error handling for file operations
5. Follow React best practices for performance
6. Write tests for core utility functions