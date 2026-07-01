/**
 * 导出原生的自解密 HTML 头部模版
 * By Friendships666
 */
export function generateStandaloneHtmlHeader(bundleName, saltBase64) {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>StuCanvas Web 归档工具 - ${bundleName}</title>
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
            font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
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
            background-color: var(--accent-primary);
            color: white;
        }
        button:hover { background-color: var(--accent-primary-hover); }
        button:active { transform: scale(0.98); }
        .status-msg {
            text-align: center;
            font-size: 0.85rem;
            margin-bottom: 15px;
            color: var(--text-secondary);
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
        }
        .btn-download-all:hover { background-color: var(--accent-success-hover); }
        .file-item-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 0;
            border-bottom: 1px solid rgba(255,255,255,0.05);
            font-size: 0.85rem;
        }
        .file-item-row:last-child { border-bottom: none; }
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
        .btn-single-download:hover { background-color: rgba(59, 130, 246, 0.3); }
        
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
        
        /* 列表卡片 */
        .preview-card {
            display: flex;
            align-items: center;
            background-color: rgba(0, 0, 0, 0.4);
            border: 1px solid var(--border-color);
            border-radius: 8px;
            margin-bottom: 12px;
            padding: 12px;
            gap: 18px;
            box-sizing: border-box;
        }
        .preview-card:last-child { margin-bottom: 0; }

        /* 左侧：物理固定分辨率的多媒体容器（默认大小调整为 240x180） */
        .preview-media-wrapper {
            width: 240px;
            height: 180px;
            background-color: #0b0f19;
            border: 1px solid var(--border-color);
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            flex-shrink: 0;
            transition: width 0.2s ease-out, height 0.2s ease-out; /* 缩放过渡平滑动效 */
        }
        .preview-media-wrapper img,
        .preview-media-wrapper video {
            width: 100%;
            height: 100%;
            object-fit: contain;
        }
        .preview-media-wrapper audio {
            width: 90%;
        }

        /* 右侧：信息与控制面板 */
        .preview-info-panel {
            flex-grow: 1;
            display: flex;
            flex-direction: column;
            gap: 10px;
            min-width: 0;
        }
        .preview-file-name {
            font-size: 0.85rem;
            font-weight: 600;
            color: var(--text-primary);
            word-break: break-all;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .preview-file-meta {
            font-size: 0.75rem;
            color: var(--text-secondary);
        }

        /* 缩放按钮样式 */
        .zoom-btn-group {
            display: flex;
            gap: 8px;
        }
        .zoom-btn {
            width: auto !important;
            padding: 6px 12px !important;
            font-size: 0.75rem !important;
            margin-bottom: 0 !important;
            border-radius: 4px !important;
            background-color: rgba(255, 255, 255, 0.05) !important;
            color: var(--text-primary) !important;
            border: 1px solid var(--border-color) !important;
            cursor: pointer;
            display: inline-flex !important;
            align-items: center;
            justify-content: center;
        }
        .zoom-btn:hover {
            background-color: rgba(255, 255, 255, 0.15) !important;
        }
    </style>
    <script>
        window.encryptedChunks = [];
        window.saltBase64 = "${saltBase64}";
        
        function base64ToBytes(b64) {
            if (typeof Uint8Array.fromBase64 === 'function') {
                return Uint8Array.fromBase64(b64);
            }
            const binString = atob(b64);
            const len = binString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binString.charCodeAt(i);
            }
            return bytes;
        }

        window.p = function(id) {
            const el = document.getElementById(id);
            if (!el) return;
            const b64 = el.textContent;
            el.remove(); 
            const bytes = base64ToBytes(b64);
            window.encryptedChunks.push(new Blob([bytes]));
        };
    </script>
</head>
<body>
    <div class="container">
        <div class="header">
            <h3>StuCanvas Web-Archive</h3>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 4px;">由 stucanvas.org 生成本文件</p>
            <p style="font-size: 0.85rem; color: var(--text-secondary); margin-top: 8px;">归档内容：<strong>${bundleName}</strong></p>
            <p style="font-size: 0.75rem; color: var(--accent-primary); margin-top: 8px; opacity: 0.8; font-weight: 600;">By Friendships666</p>
        </div>
        <div class="input-group">
            <label for="password">解密密钥密码</label>
            <input type="password" id="password" placeholder="请输入解锁密码">
        </div>
        <button id="decBtn">🔓 验证解密并展开归档</button>
        <div class="status-msg" id="statusMsg">等待输入密码...</div>

        <!-- 解密后的多文件列表卡片 -->
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
`;
}

/**
 * 导出原生的自解密 HTML 尾部模版
 * By Friendships666
 */
export function generateStandaloneHtmlFooter(bundleName) {
    return `
    <script>
        const statusMsg = document.getElementById('statusMsg');
        const decBtn = document.getElementById('decBtn');
        const fileListCard = document.getElementById('fileListCard');
        const fileItemsList = document.getElementById('fileItemsList');
        const previewContainer = document.getElementById('previewContainer');
        const previewItemsList = document.getElementById('previewItemsList');
        const downloadAllBtn = document.getElementById('downloadAllBtn');

        let unpackedFilesCache = null;

        function base64ToBytes(b64) {
            if (typeof Uint8Array.fromBase64 === 'function') {
                return Uint8Array.fromBase64(b64);
            }
            const binString = atob(b64);
            const len = binString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binString.charCodeAt(i);
            }
            return bytes;
        }

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

        const triggerDownload = (blob, filename) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 15000); 
        };

        decBtn.onclick = async () => {
            const pwd = document.getElementById('password').value;
            if (!pwd) return alert("请输入解锁密码");

            decBtn.disabled = true;
            statusMsg.innerHTML = "⏳ 正在初始化...";

            try {
                const te = new TextEncoder();
                const pwBytes = te.encode(pwd);

                const baseKey = await crypto.subtle.importKey(
                    "raw",
                    pwBytes,
                    "PBKDF2",
                    false,
                    ["deriveKey"]
                );

                const derivedKey = await crypto.subtle.deriveKey(
                    {
                        name: "PBKDF2",
                        salt: base64ToBytes(window.saltBase64),
                        iterations: 100000,
                        hash: "SHA-256"
                    },
                    baseKey,
                    {
                        name: "AES-GCM",
                        length: 256
                    },
                    false,
                    ["decrypt"]
                );

                const decryptedChunks = [];
                const total = window.encryptedChunks.length;

                for (let i = 0; i < total; i++) {
                    statusMsg.innerHTML = \`⏳ 正在调用 CPU 硬件加速解密物理分块 (\${i + 1}/\${total})...\`;
                    
                    const encBlob = window.encryptedChunks[i];
                    const encBuffer = await encBlob.arrayBuffer();
                    const encBytes = new Uint8Array(encBuffer);

                    const iv = encBytes.subarray(0, 12);
                    const ciphertext = encBytes.subarray(12);

                    const decryptedBuffer = await crypto.subtle.decrypt(
                        {
                            name: "AES-GCM",
                            iv: iv,
                            tagLength: 128
                        },
                        derivedKey,
                        ciphertext
                    );

                    const decBlob = new Blob([decryptedBuffer]);
                    decryptedChunks.push(decBlob);

                    await new Promise(r => setTimeout(r, 0));
                }

                statusMsg.innerHTML = "⏳ 正在重构并还原打包文件...";
                const finalDecryptedBlob = new Blob(decryptedChunks, { type: "application/octet-stream" });
                const packedBuffer = await finalDecryptedBlob.arrayBuffer();
                const packedBytes = new Uint8Array(packedBuffer);

                unpackedFilesCache = unpackFiles(packedBytes);

                // 渲染多文件列表
                fileItemsList.innerHTML = '';
                unpackedFilesCache.forEach((file, index) => {
                    const row = document.createElement('div');
                    row.className = 'file-item-row';
                    row.innerHTML = '<span>📄 ' + file.name + ' (<span style="color: var(--text-secondary);">' + formatBytes(file.data.length) + '</span>)</span>' +
                                    '<button class="btn-single-download" data-idx="' + index + '">下载</button>';
                    fileItemsList.appendChild(row);
                });
                fileListCard.style.display = 'block';

                fileItemsList.querySelectorAll('.btn-single-download').forEach(btn => {
                    btn.onclick = (e) => {
                        const idx = parseInt(e.target.getAttribute('data-idx'));
                        const file = unpackedFilesCache[idx];
                        triggerDownload(new Blob([file.data]), file.name);
                    };
                });

                // 渲染多媒体即时预览
                previewItemsList.innerHTML = '';
                let hasMedia = false;

                unpackedFilesCache.forEach(file => {
                    const mediaInfo = getMimeInfo(file.name);
                    if (mediaInfo.type === 'other') return;

                    hasMedia = true;
                    const card = document.createElement('div');
                    card.className = 'preview-card';
                    
                    const mediaWrapper = document.createElement('div');
                    mediaWrapper.className = 'preview-media-wrapper';

                    const infoPanel = document.createElement('div');
                    infoPanel.className = 'preview-info-panel';

                    const blob = new Blob([file.data], { type: mediaInfo.mime });
                    const mediaUrl = URL.createObjectURL(blob);

                    if (mediaInfo.type === 'image') {
                        const img = document.createElement('img');
                        img.src = mediaUrl;
                        mediaWrapper.appendChild(img);
                    } else if (mediaInfo.type === 'video') {
                        const video = document.createElement('video');
                        video.src = mediaUrl;
                        video.controls = true;
                        video.playsInline = true;
                        mediaWrapper.appendChild(video);
                    } else if (mediaInfo.type === 'audio') {
                        const audio = document.createElement('audio');
                        audio.src = mediaUrl;
                        audio.controls = true;
                        mediaWrapper.appendChild(audio);
                    }

                    infoPanel.innerHTML = \`
                        <div class="preview-file-name" title="\${file.name}">📄 \${file.name}</div>
                        <div class="preview-file-meta">大小：\${formatBytes(file.data.length)}</div>
                        <div class="zoom-btn-group">
                            <button class="zoom-btn btn-zoom-in">🔍 放大</button>
                            <button class="zoom-btn btn-zoom-out">🔍 缩小</button>
                        </div>
                    \`;

                    card.appendChild(mediaWrapper);
                    card.appendChild(infoPanel);
                    previewItemsList.appendChild(card);

                    // 绑定缩放事件
                    const zoomInBtn = infoPanel.querySelector('.btn-zoom-in');
                    const zoomOutBtn = infoPanel.querySelector('.btn-zoom-out');
                    let currentWidth = 240;
                    let currentHeight = 180;

                    zoomInBtn.onclick = (e) => {
                        e.preventDefault();
                        if (currentWidth < 600) {
                            currentWidth += 40;
                            currentHeight += 30;
                            mediaWrapper.style.width = currentWidth + 'px';
                            mediaWrapper.style.height = currentHeight + 'px';
                        }
                    };
                    zoomOutBtn.onclick = (e) => {
                        e.preventDefault();
                        if (currentWidth > 120) {
                            currentWidth -= 40;
                            currentHeight -= 30;
                            mediaWrapper.style.width = currentWidth + 'px';
                            mediaWrapper.style.height = currentHeight + 'px';
                        }
                    };
                });

                if (hasMedia) {
                    previewContainer.style.display = 'block';
                }

                statusMsg.innerHTML = "✨ <strong>验证成功！</strong> 归档内容已全部展开解出。";

            } catch (err) {
                console.error(err);
                statusMsg.innerHTML = "<span style='color: var(--accent-error);'>❌ 解密失败，密码输入有误或归档损坏。</span>";
                decBtn.disabled = false;
            }
        };

        downloadAllBtn.onclick = () => {
            if (unpackedFilesCache) {
                try {
                    const zipBlob = generateZipBlob(unpackedFilesCache);
                    triggerDownload(zipBlob, "${bundleName}_DecryptArchive.zip");
                } catch(e) {
                    alert("ZIP打包合并失败，请点击各文件旁边的「下载」按钮单独下载。");
                }
            }
        };
    <\/script>
</body>
</html>`;
}