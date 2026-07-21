const fs = require('fs-extra');
const path = require('path');
const obfuscator = require('javascript-obfuscator');
const { execSync } = require('child_process');

async function build() {
  console.log('Starting secure build process...');
  const sourceDir = __dirname;
  const buildDir = path.join(__dirname, 'build-dist');

  // 1. Clean and copy to build directory
  if (fs.existsSync(buildDir)) {
    fs.removeSync(buildDir);
  }
  fs.mkdirSync(buildDir);

  const filesToCopy = [
    'css',
    'js',
    'main.js',
    'preload.js',
    'index.html',
    'cincoscribe.svg',
    'activation.html',
    'invalid.html',
    'offline-expired.html',
    'package.json',
    'electron-builder.yml',
    'tts_generate.py'
  ];

  for (const item of filesToCopy) {
    const srcPath = path.join(sourceDir, item);
    if (fs.existsSync(srcPath)) {
      fs.copySync(srcPath, path.join(buildDir, item));
    }
  }

  // 2. Obfuscate JS files
  const jsFilesToObfuscate = [
    'main.js',
    'preload.js',
    'js/router.js',
    'js/sidebar.js',
    'js/state.js',
    'js/utils.js',
    'js/whisper.js'
  ];

  for (const file of jsFilesToObfuscate) {
    const filePath = path.join(buildDir, file);
    if (fs.existsSync(filePath)) {
      console.log(`Obfuscating ${file}...`);
      const code = fs.readFileSync(filePath, 'utf8');
      const obfuscatedCode = obfuscator.obfuscate(code, {
        compact: true,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.75,
        deadCodeInjection: true,
        deadCodeInjectionThreshold: 0.4,
        stringArray: true,
        stringArrayEncoding: ['base64'],
        stringArrayThreshold: 0.75,
        disableConsoleOutput: true
      }).getObfuscatedCode();
      fs.writeFileSync(filePath, obfuscatedCode);
    }
  }

  console.log('Obfuscation complete. Running electron-builder...');
  
  // 3. Run electron-builder
  try {
    console.log('Running electron-builder...');
    let builderCmd = 'npx electron-builder --win --x64';
    if (process.env.GH_TOKEN) {
      builderCmd += ' --publish always';
    }
    
    execSync(builderCmd, {
      cwd: buildDir,
      stdio: 'inherit'
    });
    
    // Copy output artifacts to the root dist folder
    const mainDistDir = path.join(sourceDir, 'dist');
    const buildDistOutDir = path.join(buildDir, 'dist');
    if (fs.existsSync(buildDistOutDir)) {
      console.log('Copying build artifacts back to root dist folder...');
      if (fs.existsSync(mainDistDir)) {
        fs.removeSync(mainDistDir);
      }
      fs.copySync(buildDistOutDir, mainDistDir);
      console.log('Artifacts copied to:', mainDistDir);
    }
    
    console.log('Build completed successfully!');
  } catch (err) {
    console.error('Build failed:', err);
    process.exit(1);
  }
}

build();
