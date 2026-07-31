/**
 * Metro in a pnpm monorepo.
 *
 * Two things must be told explicitly:
 *  - watch the repository root, so a change in `packages/*` triggers a reload;
 *  - resolve from both the app's and the root's `node_modules`, because
 *    `node-linker=hoisted` places shared dependencies at the root.
 */
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
config.resolver.disableHierarchicalLookup = true;

module.exports = config;
