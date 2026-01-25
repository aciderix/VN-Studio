/**
 * VN-Studio - Moteur de Visual Novel
 *
 * Port React de Virtual Navigator 2.1 (Sopra Multimedia, 1999)
 *
 * Usage:
 * ```tsx
 * import { GameContainer, useVNEngine, VNProjectInfo } from 'vn-studio';
 *
 * function App() {
 *   const project: VNProjectInfo = { ... };
 *   return <GameContainer project={project} width={800} height={600} />;
 * }
 * ```
 */

// Engine
export * from './engine';

// Components
export * from './components';

// Hooks
export * from './hooks';

// Types
export * from './types/vn.types';
