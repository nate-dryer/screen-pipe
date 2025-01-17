import { $ } from 'bun'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'



const originalCWD = process.cwd()
// Change CWD to src-tauri
process.chdir(path.join(__dirname, '../src-tauri'))
const platform = {
	win32: 'windows',
	darwin: 'macos',
	linux: 'linux',
}[os.platform()]
const cwd = process.cwd()
console.log('cwd', cwd)
function hasFeature(name) {
	return process.argv.includes(`--${name}`) || process.argv.includes(name)
}

const config = {
	ffmpegRealname: 'ffmpeg',
	openblasRealname: 'openblas',
	clblastRealname: 'clblast',
	windows: { // TODO probably windows lack mp3
		ffmpegName: 'ffmpeg-7.0-windows-desktop-vs2022-default',
		ffmpegUrl: 'https://unlimited.dl.sourceforge.net/project/avbuild/windows-desktop/ffmpeg-7.0-windows-desktop-vs2022-default.7z?viasf=1',

		openBlasName: 'OpenBLAS-0.3.26-x64',
		openBlasUrl: 'https://github.com/OpenMathLib/OpenBLAS/releases/download/v0.3.26/OpenBLAS-0.3.26-x64.zip',

		clblastName: 'CLBlast-1.6.2-windows-x64',
		clblastUrl: 'https://github.com/CNugteren/CLBlast/releases/download/1.6.2/CLBlast-1.6.2-windows-x64.zip',

		vcpkgPackages: ['opencl'],
	},
	linux: {
		aptPackages: [
			'ffmpeg',
			'libopenblas-dev', // Runtime
			'pkg-config',
			'build-essential',
			'libglib2.0-dev',
			'libgtk-3-dev',
			'libwebkit2gtk-4.1-dev',
			'clang',
			'cmake', // Tauri
			'libavutil-dev',
			'libavformat-dev',
			'libavfilter-dev',
			'libavdevice-dev', // FFMPEG
			'libasound2-dev', // cpal
			'libomp-dev', // OpenMP in ggml.ai
			'libstdc++-12-dev', //ROCm
		],
	},
	macos: {
		ffmpegName: 'ffmpeg-7.0-macOS-default',
		ffmpegUrl: 'https://master.dl.sourceforge.net/project/avbuild/macOS/ffmpeg-7.0-macOS-default.tar.xz?viasf=1',
	},
}

// Export for Github actions
const exports = {
	ffmpeg: path.join(cwd, config.ffmpegRealname),
	openBlas: path.join(cwd, config.openblasRealname),
	clblast: path.join(cwd, config.clblastRealname, 'lib/cmake/CLBlast'),
	libClang: 'C:\\Program Files\\LLVM\\bin',
	cmake: 'C:\\Program Files\\CMake\\bin',
}

/* ########## Linux ########## */
if (platform == 'linux') {
	// Install APT packages
	await $`sudo apt-get update`
	if (hasFeature('opencl')) {
		config.linux.aptPackages.push('libclblast-dev')
	}
	for (const name of config.linux.aptPackages) {
		await $`sudo apt-get install -y ${name}`
	}
}

/* ########## Windows ########## */
if (platform == 'windows') {
	// Setup FFMPEG
	if (!(await fs.exists(config.ffmpegRealname))) {
		await $`C:\\msys64\\usr\\bin\\wget.exe -nc --show-progress ${config.windows.ffmpegUrl} -O ${config.windows.ffmpegName}.7z`
		await $`'C:\\Program Files\\7-Zip\\7z.exe' x ${config.windows.ffmpegName}.7z`
		await $`mv ${config.windows.ffmpegName} ${config.ffmpegRealname}`
		await $`rm -rf ${config.windows.ffmpegName}.7z`
		await $`mv ${config.ffmpegRealname}/lib/x64/* ${config.ffmpegRealname}/lib/`
	}

	// Setup OpenBlas
	if (!(await fs.exists(config.openblasRealname)) && hasFeature('openblas')) {
		await $`C:\\msys64\\usr\\bin\\wget.exe -nc --show-progress ${config.windows.openBlasUrl} -O ${config.windows.openBlasName}.zip`
		await $`"C:\\Program Files\\7-Zip\\7z.exe" x ${config.windows.openBlasName}.zip -o${config.openblasRealname}`
		await $`rm ${config.windows.openBlasName}.zip`
		fs.cp(path.join(config.openblasRealname, 'include'), path.join(config.openblasRealname, 'lib'), { recursive: true, force: true })
		// It tries to link only openblas.lib but our is libopenblas.lib`
		fs.cp(path.join(config.openblasRealname, 'lib/libopenblas.lib'), path.join(config.openblasRealname, 'lib/openblas.lib'))
	}

	// Setup CLBlast
	if (!(await fs.exists(config.clblastRealname)) && !hasFeature('cuda')) {
		await $`C:\\msys64\\usr\\bin\\wget.exe -nc --show-progress ${config.windows.clblastUrl} -O ${config.windows.clblastName}.zip`
		await $`"C:\\Program Files\\7-Zip\\7z.exe" x ${config.windows.clblastName}.zip` // 7z file inside
		await $`"C:\\Program Files\\7-Zip\\7z.exe" x ${config.windows.clblastName}.7z` // Inner folder
		await $`mv ${config.windows.clblastName} ${config.clblastRealname}`
		await $`rm ${config.windows.clblastName}.zip`
		await $`rm ${config.windows.clblastName}.7z`
	}

	// Setup vcpkg packages
	await $`C:\\vcpkg\\vcpkg.exe install ${config.windows.vcpkgPackages}`.quiet()
}

/* ########## macOS ########## */
if (platform == 'macos') {
	const nativeArch = os.arch();
	const architectures = ['arm64', 'x86_64'];
	// Additional steps for x86_64 build on ARM Mac
	if (nativeArch === 'arm64') {
		console.log('\nTo build for x86_64 on your ARM Mac:');
		console.log('1. Install Rosetta 2 if not already installed:');
		console.log('   softwareupdate --install-rosetta');
		console.log('2. Set up an x86_64 Homebrew environment:');
		console.log('   arch -x86_64 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install.sh)"');
		// console.log('3. When building, use this command:');
		// console.log('   arch -x86_64 bunx tauri build -- --target x86_64-apple-darwin');
	}
	for (const arch of architectures) {
		const tesseractBinary = `./tesseract-${arch}-apple-darwin`;
		if (!(await fs.exists(tesseractBinary))) {
			console.log(`Setting up Tesseract for ${arch}...`);

			if (arch === 'arm64' || (arch === 'x86_64' && nativeArch === 'x64')) {
				// Native architecture or x86_64 on Intel Mac
				await $`brew install tesseract`;
				await $`cp $(brew --prefix)/bin/tesseract ${tesseractBinary}`;
				await $`cp /usr/local/bin/tesseract ${tesseractBinary}`;
			} else if (arch === 'x86_64' && nativeArch === 'arm64') {
				// x86_64 on ARM Mac
				console.log('Installing x86_64 version using Rosetta 2...');
				await $`arch -x86_64 /usr/local/bin/brew install tesseract`;
				await $`cp /usr/local/bin/tesseract /tmp/tesseract`
				await $`cp /tmp/tesseract ${tesseractBinary}`;
			}

			console.log(`Tesseract for ${arch} set up successfully.`);
		} else {
			console.log(`Tesseract for ${arch} already exists.`);
		}
	}


	// Setup FFMPEG
	if (!(await fs.exists(config.ffmpegRealname))) {
		await $`wget -nc ${config.macos.ffmpegUrl} -O ${config.macos.ffmpegName}.tar.xz`
		await $`tar xf ${config.macos.ffmpegName}.tar.xz`
		await $`mv ${config.macos.ffmpegName} ${config.ffmpegRealname}`
		await $`rm ${config.macos.ffmpegName}.tar.xz`
	}
	// Try multiple potential paths for the screenpipe binary
	// ! ugly hack bcs CI acts weird
	const potentialPaths = [
		'../../../../target/release/screenpipe',
		'/Users/runner/work/screen-pipe/screen-pipe/target/release/screenpipe',
		'../../../target/release/screenpipe',
		'../../target/release/screenpipe',
		'../../../../target/aarch64-apple-darwin/release/screenpipe',
		'../../../../target/x86_64-apple-darwin/release/screenpipe',
	];
	let found = false;
	for (const path of potentialPaths) { // TODO intel mac
		try {
			await $`cp ${path} ./screenpipe-aarch64-apple-darwin`
			console.log(`Successfully copied screenpipe from ${path}`);
			found = true;
			break;
		} catch (error) {
			console.warn(`Failed to copy from ${path}: ${error.message}`);
		}
	}
	if (!found) {
		console.error("Failed to find screenpipe");
		console.error("Here's how you can build screenpipe's CLI for Intel or Silicon:");
		console.error("place yourself in the root directory of screenpipe");
		console.error("export PKG_CONFIG_PATH=\"/usr/local/opt/ffmpeg/lib/pkgconfig:$PKG_CONFIG_PATH\"");
		console.error("export PKG_CONFIG_ALLOW_CROSS=1");
		console.error("cargo build --release --metal --target aarch64-apple-darwin");
		console.error("or for x86_64:");
		console.error("cargo build --release --metal --target x86_64-apple-darwin");
		process.exit(1);
	}
	// await $`cp /opt/homebrew/bin/tesseract /tmp/tesseract`
	// await $`mv /tmp/tesseract ./tesseract-aarch64-apple-darwin` // TODO intel
}

// Nvidia
let cudaPath
if (hasFeature('cuda')) {
	if (process.env['CUDA_PATH']) {
		cudaPath = process.env['CUDA_PATH']
	} else if (platform === 'windows') {
		const cudaRoot = 'C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA\\'
		cudaPath = 'C:\\Program Files\\NVIDIA GPU Computing Toolkit\\CUDA\\v12.5'
		if (await fs.exists(cudaRoot)) {
			const folders = await fs.readdir(cudaRoot)
			if (folders.length > 0) {
				cudaPath = cudaPath.replace('v12.5', folders[0])
			}
		}
	}

	if (process.env.GITHUB_ENV) {
		console.log('CUDA_PATH', cudaPath)
	}

	if (platform === 'windows') {
		const windowsConfig = {
			bundle: {
				resources: {
					'ffmpeg\\bin\\x64\\*': './',
					'openblas\\bin\\*.dll': './',
					[`${cudaPath}\\bin\\cudart64_*`]: './',
					[`${cudaPath}\\bin\\cublas64_*`]: './',
					[`${cudaPath}\\bin\\cublasLt64_*`]: './',
				},
			},
		}
		await fs.writeFile('tauri.windows.conf.json', JSON.stringify(windowsConfig, null, 4))
	}
	if (platform === 'linux') {
		// Add cuda toolkit depends package
		const tauriConfigContent = await fs.readFile('tauri.linux.conf.json', { encoding: 'utf-8' })
		const tauriConfig = JSON.parse(tauriConfigContent)
		tauriConfig.bundle.linux.deb.depends.push('nvidia-cuda-toolkit')
		await fs.writeFile('tauri.linux.conf.json', JSON.stringify(tauriConfig, null, 4))
	}
}

if (hasFeature('opencl')) {
	if (platform === 'windows') {
		const tauriConfigContent = await fs.readFile('tauri.windows.conf.json', { encoding: 'utf-8' })
		const tauriConfig = JSON.parse(tauriConfigContent)
		tauriConfig.bundle.resources['clblast\\bin\\*.dll'] = './'
		tauriConfig.bundle.resources['C:\\vcpkg\\packages\\opencl_x64-windows\\bin\\*.dll'] = './'
		await fs.writeFile('tauri.windows.conf.json', JSON.stringify(tauriConfig, null, 4))
	}
}

// OpenBlas
if (hasFeature('openblas')) {
	if (platform === 'windows') {
		const tauriConfigContent = await fs.readFile('tauri.windows.conf.json', { encoding: 'utf-8' })
		const tauriConfig = JSON.parse(tauriConfigContent)
		tauriConfig.bundle.resources['openblas\\bin\\*.dll'] = './'
		await fs.writeFile('tauri.windows.conf.json', JSON.stringify(tauriConfig, null, 4))
	}
}

// ROCM
let rocmPath = '/opt/rocm'
if (hasFeature('rocm')) {
	if (process.env.GITHUB_ENV) {
		console.log('ROCM_PATH', rocmPath)
	}
	if (platform === 'linux') {
		// Add rocm toolkit depends package
		const tauriConfigContent = await fs.readFile('tauri.linux.conf.json', { encoding: 'utf-8' })
		const tauriConfig = JSON.parse(tauriConfigContent)
		tauriConfig.bundle.linux.deb.depends.push('rocm')
		await fs.writeFile('tauri.linux.conf.json', JSON.stringify(tauriConfig, null, 4))
	}
}

// Development hints
if (!process.env.GITHUB_ENV) {
	console.log('\nCommands to build 🔨:')
	if (originalCWD != cwd) {
		// Get relative path to desktop folder
		const relativePath = path.relative(originalCWD, path.join(cwd, '..'))
		console.log(`cd ${relativePath}`)
	}
	console.log('bun install')
	if (platform == 'windows') {
		console.log(`$env:FFMPEG_DIR = "${exports.ffmpeg}"`)
		console.log(`$env:OPENBLAS_PATH = "${exports.openBlas}"`)
		console.log(`$env:LIBCLANG_PATH = "${exports.libClang}"`)
		console.log(`$env:PATH += "${exports.cmake}"`)
		if (hasFeature('older-cpu')) {
			console.log(`$env:WHISPER_NO_AVX = "ON"`)
			console.log(`$env:WHISPER_NO_AVX2 = "ON"`)
			console.log(`$env:WHISPER_NO_FMA = "ON"`)
			console.log(`$env:WHISPER_NO_F16C = "ON"`)
		}
		if (hasFeature('cuda')) {
			console.log(`$env:CUDA_PATH = "${cudaPath}"`)
		}
		if (hasFeature('opencl')) {
			console.log(`$env:CLBlast_DIR = "${exports.clblast}"`)
		}
		if (hasFeature('rocm')) {
			console.log(`$env:ROCM_VERSION = "6.1.2"`)
			console.log(`$env:ROCM_PATH = "${rocmPath}"`)
		}
	}
	if (!process.env.GITHUB_ENV) {
		console.log('bunx tauri build'
			+ (platform === 'macos' ? ' -- --features metal' : ''))
	}
}

// Config Github ENV
if (process.env.GITHUB_ENV) {
	console.log('Adding ENV')
	if (platform == 'macos' || platform == 'windows') {
		const ffmpeg = `FFMPEG_DIR=${exports.ffmpeg}\n`
		console.log('Adding ENV', ffmpeg)
		await fs.appendFile(process.env.GITHUB_ENV, ffmpeg)
	}
	if (platform == 'macos') {
		const embed_metal = 'WHISPER_METAL_EMBED_LIBRARY=ON'
		await fs.appendFile(process.env.GITHUB_ENV, embed_metal)
	}
	if (platform == 'windows') {
		const openblas = `OPENBLAS_PATH=${exports.openBlas}\n`
		console.log('Adding ENV', openblas)
		await fs.appendFile(process.env.GITHUB_ENV, openblas)

		if (hasFeature('opencl')) {
			const clblast = `CLBlast_DIR=${exports.clblast}\n`
			console.log('Adding ENV', clblast)
			await fs.appendFile(process.env.GITHUB_ENV, clblast)
		}

		if (hasFeature('older-cpu')) {
			await fs.appendFile(process.env.GITHUB_ENV, `WHISPER_NO_AVX=ON\n`)
			await fs.appendFile(process.env.GITHUB_ENV, `WHISPER_NO_AVX2=ON\n`)
			await fs.appendFile(process.env.GITHUB_ENV, `WHISPER_NO_FMA=ON\n`)
			await fs.appendFile(process.env.GITHUB_ENV, `WHISPER_NO_F16C=ON\n`)
		}
	}
}

// --dev or --build
const action = process.argv?.[2]
if (action?.includes('--build' || action.includes('--dev'))) {
	process.chdir(path.join(cwd, '..'))
	process.env['FFMPEG_DIR'] = exports.ffmpeg
	if (platform === 'windows') {
		process.env['OPENBLAS_PATH'] = exports.openBlas
		process.env['CLBlast_DIR'] = exports.clblast
		process.env['LIBCLANG_PATH'] = exports.libClang
		process.env['PATH'] = `${process.env['PATH']};${exports.cmake}`
	}
	if (platform == 'macos') {
		process.env['WHISPER_METAL_EMBED_LIBRARY'] = 'ON'
	}
	await $`bun install`
	await $`bunx tauri ${action.includes('--dev') ? 'dev' : 'build'}`
}

