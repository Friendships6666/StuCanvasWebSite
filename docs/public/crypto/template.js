/**
 * 导出独立的自解密 HTML 模版生成器 (静默预加载初始化，彻底解决首击卡死及二次点击Bug)
 * 100% 消除 IDE 嵌套反引号转义报错，恢复清爽绿标
 * By Friendships666
 */
export function generateStandaloneHtml(bundleName, wasmJsBase64, wasmBinaryBase64, encryptedBase64) {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>StuCanvas Secure Archive - ${bundleName}</title>
    <style>
        :root {
            --bg-color: #0b0f19;
            --card-bg: #111827;
            --border-color: #1f2937;
            --text-primary: #f3f4f6;
            --text-secondary: #9ca3af;
            --accent-primary: #3b82f6;
            --accent-primary-hover: #2563eb;
            --accent-success: #10b981;
            --accent-success-hover: #059669;
            --focus-ring: rgba(59, 130, 246, 0.5);
            --accent-error: #ef4444;
        }
        body {
            background-color: var(--bg-color);
            color: var(--text-primary);
            font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            margin: 0;
            padding: 40px 10px;
            display: flex;
            flex-direction: column;
            align-items: center;
            min-height: 100vh;
            box-sizing: border-box;
        }
        .container {
            max-width: 640px;
            width: 100%;
            background-color: var(--card-bg);
            border: 1px solid var(--border-color);
            border-radius: 16px;
            padding: 25px 20px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
            box-sizing: border-box;
        }
        .header {
            text-align: center;
            margin-bottom: 20px;
        }
        .header h3 {
            margin: 0 0 6px 0;
            font-size: 1.3rem;
            font-weight: 700;
            background: linear-gradient(to right, #60a5fa, #3b82f6);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .header p {
            margin: 0;
            font-size: 0.85rem;
            color: var(--text-secondary);
            word-break: break-all;
        }
        .input-group {
            margin-bottom: 15px;
        }
        .input-group label {
            display: block;
            font-size: 0.85rem;
            margin-bottom: 6px;
            color: var(--text-secondary);
        }
        .input-group input[type="password"] {
            width: 100%;
            background-color: rgba(17, 24, 39, 0.8);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 12px;
            color: var(--text-primary);
            font-size: 1rem;
            box-sizing: border-box;
        }
        .input-group input[type="password"]:focus {
            outline: none;
            border-color: var(--accent-primary);
            box-shadow: 0 0 0 3px var(--focus-ring);
        }
        button {
            width: 100%;
            padding: 12px;
            font-size: 0.95rem;
            font-weight: 600;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            transition: background-color 0.15s, transform 0.1s;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            margin-bottom: 12px;
        }
        button:active {
            transform: scale(0.98);
        }
        .btn-decrypt {
            background-color: var(--accent-primary);
            color: white;
        }
        .btn-decrypt:hover {
            background-color: var(--accent-primary-hover);
        }
        .status-msg {
            text-align: center;
            font-size: 0.85rem;
            margin-bottom: 15px;
            display: none;
        }
        /* 进度条组件 */
        .progress-container {
            width: 100%;
            height: 6px;
            background-color: var(--border-color);
            border-radius: 3px;
            margin: 15px 0;
            overflow: hidden;
            display: none;
        }
        .progress-bar {
            width: 0%;
            height: 100%;
            background: linear-gradient(90deg, var(--accent-primary) 0%, var(--accent-success) 100%);
            transition: width 0.25s ease-out;
        }
        /* 解密后的文件列表 */
        .file-list-card {
            margin-top: 20px;
            border: 1px solid var(--border-color);
            border-radius: 8px;
            padding: 15px;
            background-color: rgba(0,0,0,0.15);
            display: none;
        }
        .file-list-title {
            font-size: 0.9rem;
            font-weight: 600;
            color: var(--text-secondary);
            margin-bottom: 12px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .btn-download-all {
            background: linear-gradient(135deg, #059669 0%, #10b981 100%);
            color: white;
            padding: 6px 12px;
            font-size: 0.8rem;
            width: auto;
            margin: 0;
            box-shadow: 0 4px 10px rgba(16, 185, 129, 0.2);
        }
        .file-item-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 0;
            border-bottom: 1px solid rgba(255,255,255,0.05);
            font-size: 0.85rem;
        }
        .file-item-row:last-child {
            border-bottom: none;
        }
        .btn-single-download {
            background-color: rgba(59, 130, 246, 0.15);
            color: #60a5fa;
            border: 1px solid rgba(59, 130, 246, 0.3);
            padding: 4px 8px;
            font-size: 0.75rem;
            width: auto;
            margin: 0;
            border-radius: 4px;
        }
        .btn-single-download:hover {
            background-color: rgba(59, 130, 246, 0.3);
        }
        /* 多媒体预览区域 */
        .preview-container {
            margin-top: 25px;
            border-top: 1px solid var(--border-color);
            padding-top: 15px;
            display: none;
        }
        .preview-section-title {
            font-size: 0.9rem;
            font-weight: 600;
            color: var(--text-secondary);
            margin-bottom: 15px;
        }
        .preview-card {
            background-color: rgba(0, 0, 0, 0.4);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            margin-bottom: 15px;
            overflow: hidden;
        }
        .preview-card-header {
            background-color: rgba(255,255,255,0.03);
            padding: 8px 12px;
            font-size: 0.8rem;
            color: var(--text-secondary);
            border-bottom: 1px solid var(--border-color);
            word-break: break-all;
        }
        .preview-card-body {
            padding: 15px;
            display: flex;
            justify-content: center;
            align-items: center;
        }
        .preview-card-body img {
            max-width: 100%;
            max-height: 350px;
            border-radius: 4px;
            object-fit: contain;
        }
        .preview-card-body video {
            width: 100%;
            max-height: 350px;
            border-radius: 4px;
            outline: none;
        }
    </style>
</head>
<body>

    <!-- 极轻快秒开的数据流缓冲屏 (默认展示) -->
    <div class="container" id="loadingScreen">
        <div class="header" style="margin-bottom: 15px;">
            <h3>StuCanvas 归档读取中</h3>
            <p>正在从本网页中安全解析并解压缩大文件资产...</p>
        </div>
        <div class="progress-container" style="display:block;">
            <div class="progress-bar" id="loadProgressBar" style="width: 0%;"></div>
        </div>
        <div class="status-msg" id="loadStatusMsg" style="display:block;">正在建立本地解码管道...</div>
    </div>

    <!-- 主交互解密端 (预加载完毕后激活呈现) -->
    <div class="container" id="mainContainer" style="display:none;">
        <div class="header">
            <h3>StuCanvas 安全加密归档</h3>
            <p>归档文件：<strong>${bundleName}</strong></p>
            <p style="font-size: 0.75rem; color: var(--accent-primary); margin-top: 8px; opacity: 0.8; font-weight: 600;">By Friendships666</p>
        </div>
        <div class="input-group">
            <label for="password">解密密钥密码</label>
            <input type="password" id="password" placeholder="请输入解锁密码">
        </div>
        <button class="btn-decrypt" id="decBtn">🔓 验证解密并展开归档</button>
        
        <!-- 核心解密进度条 -->
        <div class="progress-container" id="progressContainer">
            <div class="progress-bar" id="progressBar"></div>
        </div>

        <div class="status-msg" id="statusMsg"></div>

        <!-- 解密后的文件列表卡片 -->
        <div class="file-list-card" id="fileListCard">
            <div class="file-list-title">
                <span>📦 归档内的文件：</span>
                <button class="btn-download-all" id="downloadAllBtn">📥 一键下载全部 (ZIP)</button>
            </div>
            <div id="fileItemsList"></div>
        </div>

        <!-- 多媒体批量预览卡片 -->
        <div class="preview-container" id="previewContainer">
            <div class="preview-section-title">👁️ 多媒体即时预览列表：</div>
            <div id="previewItemsList"></div>
        </div>
    </div>

    <!-- 极高能性能优化手段：使用 text/plain DOM 容器避开浏览器对 100MB+ Base64 的 AST 树深度解析，缩短开屏等待时间 -->
    <script id="wasmJsData" type="text/plain">${wasmJsBase64}</script>
    <script id="wasmBinaryData" type="text/plain">${wasmBinaryBase64}</script>
    <script id="encryptedData" type="text/plain">${encryptedBase64}</script>

    <script type="module">
        // 彻底杜绝使用繁重的 JS 文本字面量。利用 DOM 的 textContent 获取大字符串。
        // 这避开了 Chrome 编译器对巨型字符串做编译语法分析（AST）所产生的卡顿死锁，速度提升极多。
        const wasmJsBase64 = document.getElementById('wasmJsData').textContent.trim();
        const wasmBinaryBase64 = document.getElementById('wasmBinaryData').textContent.trim();
        const encryptedBase64 = document.getElementById('encryptedData').textContent.trim();
        const bundleName = "${bundleName}";

        // 异步分块 Base64 解码器
        async function base64ToUint8ArrayAsync(base64, onProgress) {
            const len = base64.length;
            const result = new Uint8Array(Math.floor((len * 3) / 4));
            let resultOffset = 0;
            const chunkSize = 1024 * 1024; // 严格以 1MB 为一个处理块（4的倍数）
            
            for (let offset = 0; offset < len; offset += chunkSize) {
                const end = Math.min(offset + chunkSize, len);
                const chunk = base64.substring(offset, end);
                const binaryString = window.atob(chunk);
                for (let i = 0; i < binaryString.length; i++) {
                    result[resultOffset++] = binaryString.charCodeAt(i);
                }
                if (onProgress) {
                    const percent = Math.floor((offset / len) * 100);
                    onProgress(percent);
                }
                // 让出主线程时间片给浏览器，渲染进度条
                await new Promise(resolve => setTimeout(resolve, 0));
            }
            return result.subarray(0, resultOffset);
        }

        // 二进制解包核心算法
        function unpackFiles(packedBytes) {
            let offset = 0;
            const view = new DataView(packedBytes.buffer, packedBytes.byteOffset, packedBytes.byteLength);
            const decoder = new TextDecoder();
            
            const fileCount = view.getUint32(offset, false);
            offset += 4;

            const files = [];
            for (let i = 0; i < fileCount; i++) {
                const nameLen = view.getUint32(offset, false);
                offset += 4;
                
                const nameBytes = packedBytes.subarray(offset, offset + nameLen);
                const name = decoder.decode(nameBytes);
                offset += nameLen;

                const dataLen = view.getUint32(offset, false);
                offset += 4;
                
                const data = packedBytes.slice(offset, offset + dataLen);
                offset += dataLen;

                files.push({ name, data });
            }
            return files;
        }

        // ==========================================
        // 核心亮点：手写原生极轻量级 40 行 uncompressed ZIP 压缩生成器
        // 杜绝对多文件并发下载的拦截，产出标准的 .zip 格式下载！
        // ==========================================
        function crc32(arr) {
            let crc = -1;
            const tbl = [];
            for (let n = 0; n < 256; n++) {
                let c = n;
                for (let k = 0; k < 8; k++) {
                    c = ((c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1));
                }
                tbl[n] = c;
            }
            for (let i = 0; i < arr.length; i++) {
                crc = (crc >>> 8) ^ tbl[(crc ^ arr[i]) & 0xFF];
            }
            return (crc ^ (-1)) >>> 0;
        }

        function putUint32s(arr, offset, ...values) {
            const dv = new DataView(arr.buffer);
            values.forEach((v, i) => dv.setUint32(offset + i * 4, v, true));
        }

        function putUint16s(arr, offset, ...values) {
            const dv = new DataView(arr.buffer);
            values.forEach((v, i) => dv.setUint16(offset + i * 2, v, true));
        }

        function generateZipBlob(files) {
            const records = [];
            const te = new TextEncoder('utf8');
            let offset = 0;
            let cdSz = 0;

            files.forEach(file => {
                const fname = te.encode(file.name);
                const chksum = crc32(file.data);

                const fh = new Uint8Array(30 + fname.length);
                putUint32s(fh, 0, 0x04034b50); 
                putUint32s(fh, 14, chksum, file.data.length, file.data.length);
                putUint16s(fh, 26, fname.length);
                fh.set(fname, 30);
                
                file.header = fh;
                file.offset = offset;
                file.chksum = chksum;
                file.fnameBytes = fname;

                records.push(fh);
                records.push(file.data);

                offset += fh.length + file.data.length;
            });

            const startOfCD = offset;
            files.forEach(file => {
                const cdr = new Uint8Array(46 + file.fnameBytes.length);
                putUint32s(cdr, 0, 0x02014b50); 
                putUint32s(cdr, 16, file.chksum, file.data.length, file.data.length);
                putUint16s(cdr, 28, file.fnameBytes.length);
                putUint32s(cdr, 42, file.offset); 
                cdr.set(file.fnameBytes, 46);

                records.push(cdr);
                cdSz += cdr.length;
                offset += cdr.length;
            });

            const eocd = new Uint8Array(22);
            putUint32s(eocd, 0, 0x06054b50); 
            putUint16s(eocd, 8, files.length, files.length); 
            putUint32s(eocd, 12, cdSz, startOfCD); 
            records.push(eocd);

            return new Blob(records, { type: 'application/zip' });
        }

        const jsModuleUrl = "data:text/javascript;base64," + wasmJsBase64;
        
        let decrypt_file_fn = null;
        let init_fn = null;
        let engineReady = false; 
        let encryptedBytes = null; // 全局缓存解码完毕的加密字节流

        const getMimeInfo = (filename) => {
            const ext = filename.split('.').pop().toLowerCase();
            const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'];
            const videoExts = ['mp4', 'webm', 'ogg', 'mov', 'm4v'];
            const audioExts = ['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a', 'opus', 'm4r'];

            if (imageExts.includes(ext)) return { type: 'image', mime: 'image/' + (ext === 'jpg' ? 'jpeg' : ext) };
            if (videoExts.includes(ext)) return { type: 'video', mime: 'video/' + (ext === 'mov' ? 'mp4' : ext) };
            if (audioExts.includes(ext)) return { type: 'audio', mime: 'audio/' + (ext === 'mp3' ? 'mpeg' : ext === 'm4a' ? 'mp4' : ext) };
            return { type: 'other', mime: 'application/octet-stream' };
        };

        function formatBytes(bytes) {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
        }

        let unpackedFilesCache = null;

        // 安全延时内存垃圾回收机制
        const triggerDownload = (blob, filename) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => {
                URL.revokeObjectURL(url);
            }, 15000); 
        };

        // 解密控制阶段进度条
        function updateProgress(percent, text) {
            const container = document.getElementById('progressContainer');
            const bar = document.getElementById('progressBar');
            const status = document.getElementById('statusMsg');

            container.style.display = 'block';
            bar.style.width = percent + '%';
            status.innerHTML = text;
            status.style.display = 'block';
        }

        // ==========================================
        // 静默预初始化流：开屏载入
        // ==========================================
        function updateLoadProgress(percent, text) {
            const bar = document.getElementById('loadProgressBar');
            const status = document.getElementById('loadStatusMsg');
            bar.style.width = percent + '%';
            status.innerHTML = text;
        }

        async function initEngineAndData() {
            try {
                // 1. 动态加载 Wasm 绑定层
                updateLoadProgress(5, "⏳ 正在提取解密脚手架模块...");
                await new Promise(r => setTimeout(r, 100));
                
                const module = await import(jsModuleUrl);
                init_fn = module.default;
                decrypt_file_fn = module.decrypt_file;

                // 2. 异步分块加载 Wasm 字节码核心 (约 1MB 左右，极快)
                updateLoadProgress(15, "⏳ 正在提取 Wasm 算力核心模块...");
                const wasmBytes = await base64ToUint8ArrayAsync(wasmBinaryBase64, (p) => {
                    updateLoadProgress(15 + Math.floor(p * 0.15), '⏳ 正在提取 Wasm 算力核心模块 (' + p + '%)...');
                });

                // 3. 编译 Wasm 引擎
                updateLoadProgress(30, "⏳ 正在本地编译 Wasm 密码学引擎...");
                await new Promise(r => setTimeout(r, 100));
                await init_fn(wasmBytes);

                // 4. 异步分块解析大文本归档 (100MB+ 专属分块加载，进度条主要展现期，绝不卡死)
                updateLoadProgress(40, "⏳ 正在载入大文件归档数据...");
                encryptedBytes = await base64ToUint8ArrayAsync(encryptedBase64, (p) => {
                    updateLoadProgress(40 + Math.floor(p * 0.55), '⏳ 正在解开归档高熵数据流 (' + p + '%)...');
                });

                updateLoadProgress(100, "✨ 数据加载完毕！");
                await new Promise(r => setTimeout(r, 150));

                // 预加载完毕，瞬间切换显示，体验行云流水
                document.getElementById('loadingScreen').style.display = 'none';
                document.getElementById('mainContainer').style.display = 'block';
                engineReady = true;

            } catch (err) {
                console.error("Initialization error:", err);
                updateLoadProgress(0, '<span style="color: var(--accent-error);">❌ 归档加载失败：' + (err.message || err) + '</span>');
            }
        }

        // 页面打开瞬间启动
        initEngineAndData();

        document.getElementById('decBtn').onclick = async () => {
            const pwd = document.getElementById('password').value;
            const statusMsg = document.getElementById('statusMsg');
            if (!pwd) return alert("请输入解锁密码");

            // 极速检测
            if (!engineReady || !decrypt_file_fn || !encryptedBytes) {
                return alert("归档数据仍在初始化中，请稍候再试。");
            }

            updateProgress(30, "⏳ 正在对归档执行本地 AES-256-GCM 算力解密...");
            await new Promise(r => setTimeout(r, 100));

            try {
                // 使用已经异步解码出来的全局缓存，此处耗时仅在微秒级
                const decryptedBytes = decrypt_file_fn(encryptedBytes, pwd);
                
                updateProgress(75, "⏳ 解密成功，正在还原多文件结构体归档...");
                await new Promise(r => setTimeout(r, 100));

                unpackedFilesCache = unpackFiles(decryptedBytes);

                // 1. 渲染文件列表
                const fileItemsList = document.getElementById('fileItemsList');
                fileItemsList.innerHTML = '';
                
                unpackedFilesCache.forEach((file, index) => {
                    const row = document.createElement('div');
                    row.className = 'file-item-row';
                    // 彻底避免任何模板反引号、转义插值表达式。使用最纯净安全的单引号与字符串拼接
                    row.innerHTML = '<span>📄 ' + file.name + ' (<span style="color: var(--text-secondary);">' + formatBytes(file.data.length) + '</span>)</span>' +
                                    '<button class="btn-single-download" data-idx="' + index + '">下载</button>';
                    fileItemsList.appendChild(row);
                });

                document.getElementById('fileListCard').style.display = 'block';

                // 绑定单文件手动下载事件
                fileItemsList.querySelectorAll('.btn-single-download').forEach(btn => {
                    btn.onclick = (e) => {
                        const idx = parseInt(e.target.getAttribute('data-idx'));
                        const file = unpackedFilesCache[idx];
                        triggerDownload(new Blob([file.data]), file.name);
                    };
                });

                // 2. 批量渲染媒体预览卡片
                const previewItemsList = document.getElementById('previewItemsList');
                previewItemsList.innerHTML = '';
                let hasMedia = false;

                unpackedFilesCache.forEach(file => {
                    const mediaInfo = getMimeInfo(file.name);
                    if (mediaInfo.type === 'other') return;

                    hasMedia = true;
                    const card = document.createElement('div');
                    card.className = 'preview-card';
                    
                    const header = document.createElement('div');
                    header.className = 'preview-card-header';
                    header.textContent = '📄 ' + file.name;
                    card.appendChild(header);

                    const body = document.createElement('div');
                    body.className = 'preview-card-body';

                    const blob = new Blob([file.data], { type: mediaInfo.mime });
                    const mediaUrl = URL.createObjectURL(blob);

                    if (mediaInfo.type === 'image') {
                        const img = document.createElement('img');
                        img.src = mediaUrl;
                        body.appendChild(img);
                    } else if (mediaInfo.type === 'video') {
                        const video = document.createElement('video');
                        video.src = mediaUrl;
                        video.controls = true;
                        video.autoplay = false; 
                        video.playsInline = true;
                        body.appendChild(video);
                    } else if (mediaInfo.type === 'audio') {
                        const audioDiv = document.createElement('div');
                        audioDiv.style.width = '100%';
                        audioDiv.innerHTML = '<audio src="' + mediaUrl + '" controls style="width: 100%; display: block;"></audio>';
                        body.appendChild(audioDiv);
                    }

                    card.appendChild(body);
                    previewItemsList.appendChild(card);
                });

                if (hasMedia) {
                    document.getElementById('previewContainer').style.display = 'block';
                } else {
                    document.getElementById('previewContainer').style.display = 'none';
                }

                updateProgress(100, "✨ <strong>验证成功！</strong> 归档内容已全部解出。");

            } catch (e) {
                updateProgress(0, "❌ 解密失败，可能密码输入有误。");
                document.getElementById('progressContainer').style.display = 'none';
                document.getElementById('fileListCard').style.display = 'none';
                document.getElementById('previewContainer').style.display = 'none';
            }
        };

        // 一键打包为 ZIP 下载，彻底避开浏览器的“疑似并发自动下载”拦截
        document.getElementById('downloadAllBtn').onclick = () => {
            if (unpackedFilesCache) {
                try {
                    const zipBlob = generateZipBlob(unpackedFilesCache);
                    triggerDownload(zipBlob, "${bundleName}_StuFiles.zip");
                } catch(e) {
                    alert("ZIP 打包失败，请点击各文件旁边的「下载」按钮单独保存。");
                }
            }
        };
    </script>
</body>
</html>`;
}