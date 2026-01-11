const { spawn } = require('child_process');
const pc = require('picocolors');

const colorEnabled =
  Boolean(process.stdout.isTTY) &&
  pc.isColorSupported &&
  process.env.NO_COLOR !== '1' &&
  process.env.STOREHOUSE_NO_COLOR !== '1';
const tuiDisabled = process.env.STOREHOUSE_NO_TUI === '1' || process.env.STOREHOUSE_NO_TUI === 'true';

const accent = (text) => (colorEnabled ? pc.cyan(text) : text);
const success = (text) => (colorEnabled ? pc.green(text) : text);
const warning = (text) => (colorEnabled ? pc.yellow(text) : text);
const dim = (text) => (colorEnabled ? pc.dim(text) : text);
const bold = (text) => (colorEnabled ? pc.bold(text) : text);

const ansiRegex =
  // eslint-disable-next-line no-control-regex
  /[\u001B\u009B][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g;

function stripAnsi(value) {
  return value.replace(ansiRegex, '');
}

function makeBox(lines) {
  const width = Math.max(...lines.map((line) => stripAnsi(line).length));
  const border = '+' + '-'.repeat(width + 2) + '+';
  const body = lines.map((line) => `| ${line.padEnd(width)} |`).join('\n');
  return `${border}\n${body}\n${border}`;
}

function formatInfoPanel({ appName, urls, dbPath, envLabel }) {
  const lines = [];
  lines.push(`${bold(appName)} is ready`);
  lines.push(`Local : ${urls.local}`);
  lines.push(`LAN   : ${urls.lan || warning('waiting for network...')}`);
  lines.push(`Admin : ${urls.admin}`);
  lines.push(`Data  : ${dbPath}`);
  if (envLabel) {
    lines.push(`Mode  : ${envLabel}`);
  }
  return makeBox(lines);
}

function openUrl(url) {
  if (!url) return;

  const platform = process.platform;
  let command;
  let args;

  if (platform === 'win32') {
    command = 'cmd';
    args = ['/c', 'start', '', url];
  } else if (platform === 'darwin') {
    command = 'open';
    args = [url];
  } else {
    command = 'xdg-open';
    args = [url];
  }

  try {
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    child.unref();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.log(warning(`Could not open browser automatically (${err.message}).`));
  }
}

function copyToClipboard(text) {
  if (!text) return Promise.resolve(false);

  return new Promise((resolve) => {
    let child;
    if (process.platform === 'win32') {
      const escaped = text.replace(/'/g, "''");
      child = spawn('powershell', ['-NoProfile', '-Command', `Set-Clipboard -Value '${escaped}'`], {
        stdio: 'ignore'
      });
    } else if (process.platform === 'darwin') {
      child = spawn('pbcopy', [], { stdio: ['pipe', 'ignore', 'ignore'] });
      child.stdin.write(text);
      child.stdin.end();
    } else {
      child = spawn('xclip', ['-selection', 'clipboard'], { stdio: ['pipe', 'ignore', 'ignore'] });
      child.stdin.write(text);
      child.stdin.end();
    }

    child.on('error', () => resolve(false));
    child.on('exit', (code) => resolve(code === 0));
  });
}

function formatShortcuts() {
  const keys = [
    `${bold('o')} open in browser`,
    `${bold('O')} open LAN URL`,
    `${bold('c')} copy URL`,
    `${bold('l')} print LAN URL`,
    `${bold('r')} refresh info`,
    `${bold('h')} help`,
    `${bold('q')} quit`
  ];
  return dim(`Shortcuts: ${keys.join('  |  ')}`);
}

function formatHelpText({ urls, dbPath }) {
  return [
    makeBox([
      'Keyboard shortcuts',
      '',
      'o / Enter : open the web app on this machine',
      'O         : open the LAN URL (for testing on host)',
      'c         : copy the local/LAN URL to clipboard',
      'l         : print the LAN URL (for phones on Wi-Fi)',
      'r         : refresh the info panel',
      'h or ?    : show this help',
      'q or Ctrl+C: quit gracefully'
    ]),
    '',
    dim(`Data lives at: ${dbPath}`),
    dim(`Local URL   : ${urls.local}`),
    dim(`Admin area  : ${urls.admin}`),
    ''
  ].join('\n');
}

function createTerminalUi({ appName, host, port, lanIp, dbPath }) {
  const localHostDisplay = host === '0.0.0.0' ? 'localhost' : host;
  const urls = {
    local: `http://${localHostDisplay}:${port}`,
    lan: lanIp ? `http://${lanIp}:${port}` : null,
    admin: `http://${lanIp || localHostDisplay}:${port}/admin`
  };

  let detachKeys = null;
  let shuttingDown = false;

  function printPanel() {
    const envLabel = process.env.NODE_ENV ? process.env.NODE_ENV : 'local';
    const panel = formatInfoPanel({ appName, urls, dbPath, envLabel });
    // eslint-disable-next-line no-console
    console.log('\n' + accent('=== The Storehouse ==='));
    // eslint-disable-next-line no-console
    console.log(panel);
    // eslint-disable-next-line no-console
    console.log(formatShortcuts());
  }

  function handleShutdown(server) {
    if (shuttingDown) return;
    shuttingDown = true;
    if (detachKeys) {
      detachKeys();
      detachKeys = null;
    }
    // eslint-disable-next-line no-console
    console.log(dim('Shutting down...'));
    if (server) {
      server.close(() => process.exit(0));
    } else {
      process.exit(0);
    }
  }

  function attachKeyHandlers(server) {
    if (!process.stdin.isTTY || tuiDisabled) return null;

    const onKey = (chunk) => {
      const key = chunk.toString();
      if (key === '\u0003') {
        handleShutdown(server);
        return;
      }
      switch (key) {
        case 'q':
          handleShutdown(server);
          break;
        case 'o':
        case '\r':
          openUrl(urls.local);
          break;
        case 'O':
          openUrl(urls.lan || urls.local);
          break;
        case 'c':
          copyToClipboard(urls.lan || urls.local).then((ok) => {
            // eslint-disable-next-line no-console
            console.log(ok ? success('URL copied to clipboard.') : warning('Clipboard copy failed.'));
          });
          break;
        case 'l':
          // eslint-disable-next-line no-console
          console.log(urls.lan ? `LAN: ${success(urls.lan)}` : warning('LAN IP not detected yet.'));
          break;
        case 'r':
          printPanel();
          break;
        case 'h':
        case '?':
          // eslint-disable-next-line no-console
          console.log(formatHelpText({ urls, dbPath }));
          break;
        default:
          break;
      }
    };

    try {
      process.stdin.setRawMode(true);
    } catch (_) {
      return null;
    }
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', onKey);

    return () => {
      process.stdin.off('data', onKey);
      try {
        process.stdin.setRawMode(false);
      } catch (_) {
        /* ignore */
      }
      process.stdin.pause();
    };
  }

  function start(server) {
    if (tuiDisabled) {
      // eslint-disable-next-line no-console
      console.log(`The Storehouse running on ${urls.local}`);
      if (urls.lan) {
        // eslint-disable-next-line no-console
        console.log(`LAN access: ${urls.lan}`);
      }
      // eslint-disable-next-line no-console
      console.log(`Data: ${dbPath}`);
      return;
    }

    const logoLines = [accent('Storehouse micro-economy server'), dim('Ready for phones on the same Wi-Fi/LAN')];
    const logo = makeBox(logoLines);
    // eslint-disable-next-line no-console
    console.log(logo);
    printPanel();
    detachKeys = attachKeyHandlers(server);
  }

  function stop() {
    if (detachKeys) {
      detachKeys();
    }
  }

  return {
    start,
    stop,
    printPanel,
    handleShutdown
  };
}

module.exports = {
  createTerminalUi
};
