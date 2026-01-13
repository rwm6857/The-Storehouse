const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const APP_NAME = 'The Storehouse';
const DEFAULT_PORT = 3040;
const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_CONFIG = {
  port: DEFAULT_PORT,
  host: DEFAULT_HOST,
  admin_passcode: 'change-me'
};

function isWindows() {
  return process.platform === 'win32';
}

function getProgramDataRoot() {
  const programData = process.env.ProgramData || process.env.PROGRAMDATA || 'C:\\ProgramData';
  return path.join(programData, APP_NAME);
}

function resolvePaths() {
  const baseRoot = isWindows() ? getProgramDataRoot() : process.cwd();
  const dataDir = process.env.STOREHOUSE_DATA_DIR ||
    (isWindows() ? path.join(baseRoot, 'data') : path.join(process.cwd(), 'data'));
  const configDir = process.env.STOREHOUSE_CONFIG_DIR ||
    (isWindows() ? path.join(baseRoot, 'config') : process.cwd());
  const logDir = process.env.STOREHOUSE_LOG_DIR ||
    (isWindows() ? path.join(baseRoot, 'logs') : path.join(process.cwd(), 'logs'));

  return {
    baseRoot,
    dataDir,
    configDir,
    logDir,
    configPath: path.join(configDir, 'config.json'),
    envPath: path.join(configDir, '.env')
  };
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function ensureDirectories(paths) {
  ensureDir(paths.dataDir);
  ensureDir(paths.configDir);
  ensureDir(paths.logDir);
}

function logMigration(paths, message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  try {
    ensureDir(paths.logDir);
    fs.appendFileSync(path.join(paths.logDir, 'migration.log'), line);
  } catch {
    // ignore logging failures
  }
  // eslint-disable-next-line no-console
  console.log(message);
}

function copyMissingEntries(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) return;
  ensureDir(targetDir);
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(sourceDir, entry.name);
    const destPath = path.join(targetDir, entry.name);
    if (fs.existsSync(destPath)) continue;
    if (entry.isDirectory()) {
      fs.cpSync(srcPath, destPath, { recursive: true });
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function migrateLegacyPaths(paths) {
  if (!isWindows()) return;

  const legacyDataDir = path.join(process.cwd(), 'data');
  const legacyDbPath = path.join(legacyDataDir, 'storehouse.sqlite');
  const targetDbPath = path.join(paths.dataDir, 'storehouse.sqlite');

  if (!fs.existsSync(targetDbPath) && fs.existsSync(legacyDbPath)) {
    copyMissingEntries(legacyDataDir, paths.dataDir);
    logMigration(paths, `Migrated legacy data from ${legacyDataDir} to ${paths.dataDir}.`);
  }

  const legacyConfigPath = path.join(process.cwd(), 'config.json');
  if (!fs.existsSync(paths.configPath) && fs.existsSync(legacyConfigPath)) {
    ensureDir(paths.configDir);
    fs.copyFileSync(legacyConfigPath, paths.configPath);
    logMigration(paths, `Migrated legacy config from ${legacyConfigPath} to ${paths.configPath}.`);
  }

  const legacyEnvPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(paths.envPath) && fs.existsSync(legacyEnvPath)) {
    ensureDir(paths.configDir);
    fs.copyFileSync(legacyEnvPath, paths.envPath);
    logMigration(paths, `Migrated legacy .env from ${legacyEnvPath} to ${paths.envPath}.`);
  }
}

function loadEnv(paths) {
  dotenv.config({ path: paths.envPath });
  if (paths.envPath !== path.join(process.cwd(), '.env')) {
    dotenv.config();
  }
}

function loadConfigFile(paths) {
  if (!fs.existsSync(paths.configPath)) {
    if (isWindows()) {
      ensureDir(paths.configDir);
      fs.writeFileSync(paths.configPath, JSON.stringify(DEFAULT_CONFIG, null, 2));
      logMigration(paths, `Created default config at ${paths.configPath}.`);
    }
    return { ...DEFAULT_CONFIG };
  }

  try {
    const raw = fs.readFileSync(paths.configPath, 'utf-8');
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch (err) {
    logMigration(paths, `Failed to read ${paths.configPath}; using defaults. (${err.message})`);
    return { ...DEFAULT_CONFIG };
  }
}

let cachedConfig = null;

function getRuntimeConfig() {
  if (cachedConfig) return cachedConfig;

  const paths = resolvePaths();
  loadEnv(paths);
  ensureDirectories(paths);
  migrateLegacyPaths(paths);

  const config = loadConfigFile(paths);

  cachedConfig = { paths, config };
  return cachedConfig;
}

module.exports = {
  APP_NAME,
  DEFAULT_PORT,
  DEFAULT_HOST,
  getRuntimeConfig
};
