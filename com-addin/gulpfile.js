/**
 * Gulp build watcher for SlideScribe COM Add-in
 * Watches C# source files and triggers MSBuild on changes
 */

const gulp = require('gulp');
const { exec } = require('child_process');
const path = require('path');

// Paths to watch
const paths = {
  cs: ['./**/*.cs', '!./obj/**', '!./bin/**'],
  config: ['./**/*.csproj', './**/*.manifest', './**/*.xml', '!./obj/**', '!./bin/**']
};

// Color codes for console output
const colors = {
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
  reset: '\x1b[0m'
};

// Timestamp formatter
function timestamp() {
  const now = new Date();
  return now.toLocaleTimeString('en-US', { hour12: false });
}

// Log with colors
function log(message, color = 'reset') {
  console.log(`${colors[color]}[${timestamp()}] ${message}${colors.reset}`);
}

// Build task - runs the PowerShell build script
function build(callback) {
  const buildScript = path.join(__dirname, 'BuildAddin.ps1');
  const command = `powershell -ExecutionPolicy Bypass -File "${buildScript}" -Configuration Release`;

  log('Building COM Add-in...', 'cyan');

  const buildProcess = exec(command, (error, stdout, stderr) => {
    if (error) {
      log(`❌ Build failed: ${error.message}`, 'red');
      console.error(stderr);
      if (callback) callback(error);
      return;
    }

    // Output the build results
    if (stdout) {
      console.log(stdout);
    }

    log('✅ Build completed successfully', 'green');
    if (callback) callback();
  });
}

// Watch task - watches for file changes
function watch() {
  log('COM Add-in File Watcher Started', 'green');
  log('Watching: *.cs, *.csproj, *.manifest, *.xml', 'cyan');
  log('Press Ctrl+C to stop', 'yellow');
  console.log('');

  // Initial build
  build();

  // Watch C# files
  gulp.watch(paths.cs, { ignoreInitial: true })
    .on('change', (filePath) => {
      log(`File changed: ${path.basename(filePath)}`, 'yellow');
      build();
    })
    .on('add', (filePath) => {
      log(`File added: ${path.basename(filePath)}`, 'yellow');
      build();
    });

  // Watch config files
  gulp.watch(paths.config, { ignoreInitial: true })
    .on('change', (filePath) => {
      log(`Config changed: ${path.basename(filePath)}`, 'yellow');
      build();
    });

  log('Watching for changes...', 'cyan');
}

// Export tasks
exports.build = build;
exports.watch = watch;
exports.default = watch;
