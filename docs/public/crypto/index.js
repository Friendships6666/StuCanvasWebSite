import { generateStandaloneHtmlHeader, generateStandaloneHtmlFooter } from './template.js';

async function main() {
    const fileInput = document.getElementById('fileInput');
    const dropzone = document.getElementById('dropzone');
    const activeFile = document.getElementById('activeFile');
    const passwordInput = document.getElementById('password');
    const archiveNameInput = document.getElementById('archiveName');
    const includeKeyCheckbox = document.getElementById('includeKeyCheckbox');
    const statusMsg = document.getElementById('statusMsg');
    const selectedFilesContainer = document.getElementById('selectedFilesContainer');
    const selectedFilesList = document.getElementById('selectedFilesList');
    const progressBar = document.getElementById('progressBar');
    const progressContainer = document.getElementById('progressContainer');

    // 维护当前待打包的文件数组
    let selectedFilesArray = [];
    let generatedObjectUrls = [];

    // 释放预览 ObjectURL
    function revokePreviewUrls() {
        generatedObjectUrls.forEach(url => URL.revokeObjectURL(url));
        generatedObjectUrls = [];
    }

    // 状态与进度条渲染
    function updateProgress(percent, text) {
        progressContainer.style.display = 'block';
        progressBar.style.width = percent + '%';
        statusMsg.innerHTML = text;
        statusMsg.style.display = 'block';
    }

    // 多媒体格式判定
    const getMimeInfo = (filename) => {
        const ext = filename.split('.').pop().toLowerCase();
        const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'];
        const videoExts = ['mp4', 'webm', 'ogg', 'mov', 'm4v'];
        const audioExts = ['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a', 'opus', 'm4r'];

        if (imageExts.includes(ext)) return { type: 'image', mime: `image/${ext === 'jpg' ? 'jpeg' : ext}` };
        if (videoExts.includes(ext)) return { type: 'video', mime: `video/${ext === 'mov' ? 'mp4' : ext}` };
        if (audioExts.includes(ext)) return { type: 'audio', mime: `audio/${ext === 'mp3' ? 'mpeg' : ext === 'm4a' ? 'mp4' : ext}` };
        return { type: 'other', mime: 'application/octet-stream' };
    };

    // 格式化体积
    function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    // 渲染待打包列表及多媒体大预览卡片
    function updateFilesList() {
        revokePreviewUrls();
        selectedFilesList.innerHTML = '';

        if (selectedFilesArray.length === 0) {
            selectedFilesContainer.style.display = 'none';
            activeFile.textContent = '未选择任何文件';
            statusMsg.style.display = 'none';
            return;
        }

        selectedFilesContainer.style.display = 'block';

        // 计算总文件大小
        let totalBytes = 0;
        selectedFilesArray.forEach(file => totalBytes += file.size);
        const totalSizeStr = formatBytes(totalBytes);

        activeFile.innerHTML = `已选择 ${selectedFilesArray.length} 个文件，总大小：<strong>${totalSizeStr}</strong>`;

        // 大小预警：如果超过 1GB，显示红字醒目警告
        const limitBytes = 1024 * 1024 * 1024; // 1GB
        if (totalBytes > limitBytes) {
            statusMsg.style.display = 'block';
            statusMsg.innerHTML = `<span style="color: var(--accent-error); font-weight: bold;">⚠️ 警告：当前文件总大小（${totalSizeStr}）已超过 1GB 上限！自解密单 HTML 归档在浏览器内执行本地 DOM 词法解析时容易 OOM 崩溃，建议减少打包文件。</span>`;
        } else {
            statusMsg.style.display = 'block';
            statusMsg.innerHTML = `<span style="color: var(--accent-success);">🟢 当前文件大小在安全范围内，可以顺利打包。</span>`;
        }

        selectedFilesArray.forEach((file, index) => {
            const card = document.createElement('div');
            card.className = 'preview-card';

            const mediaWrapper = document.createElement('div');
            mediaWrapper.className = 'preview-media-wrapper';

            const infoPanel = document.createElement('div');
            infoPanel.className = 'preview-info-panel';

            const mimeInfo = getMimeInfo(file.name);
            if (mimeInfo.type !== 'other') {
                const previewUrl = URL.createObjectURL(file);
                generatedObjectUrls.push(previewUrl);

                if (mimeInfo.type === 'image') {
                    const img = document.createElement('img');
                    img.src = previewUrl;
                    mediaWrapper.appendChild(img);
                } else if (mimeInfo.type === 'video') {
                    const video = document.createElement('video');
                    video.src = previewUrl;
                    video.muted = true;
                    video.playsInline = true;
                    mediaWrapper.appendChild(video);
                } else if (mimeInfo.type === 'audio') {
                    const audio = document.createElement('audio');
                    audio.src = previewUrl;
                    audio.controls = true;
                    mediaWrapper.appendChild(audio);
                }
            } else {
                mediaWrapper.innerHTML = `<span style="font-size: 1.8rem;">📂</span>`;
            }

            infoPanel.innerHTML = `
                <div class="preview-file-name" title="${file.name}">📄 ${file.name}</div>
                <div class="preview-file-meta">大小：${formatBytes(file.size)} | 类型：${file.type || '未知'}</div>
                <div style="display: flex; gap: 10px; align-items: center; margin-top: 5px;">
                    <div class="zoom-btn-group">
                        <button class="zoom-btn btn-zoom-in" type="button">🔍 放大</button>
                        <button class="zoom-btn btn-zoom-out" type="button">🔍 缩小</button>
                    </div>
                    <button class="btn-remove-file" type="button" data-idx="${index}">移除</button>
                </div>
            `;

            card.appendChild(mediaWrapper);
            card.appendChild(infoPanel);
            selectedFilesList.appendChild(card);

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
    }

    fileInput.onchange = (e) => {
        if (e.target.files) {
            Array.from(e.target.files).forEach(f => selectedFilesArray.push(f));
            updateFilesList();
        }
    };

    dropzone.ondragover = () => { dropzone.classList.add('dragover'); return false; };
    dropzone.ondragleave = () => { dropzone.classList.remove('dragover'); return false; };
    dropzone.ondrop = (e) => {
        dropzone.classList.remove('dragover');
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            Array.from(e.dataTransfer.files).forEach(f => selectedFilesArray.push(f));
            updateFilesList();
        }
        return false;
    };

    // 内存安全级防堆栈溢出 Base64 转换器
    function uint8ArrayToBase64(uint8) {
        if (typeof uint8.toBase64 === 'function') {
            return uint8.toBase64();
        }
        let binary = "";
        const len = uint8.length;
        const chunk = 16384;
        for (let i = 0; i < len; i += chunk) {
            binary += String.fromCharCode.apply(null, uint8.subarray(i, Math.min(i + chunk, len)));
        }
        return btoa(binary);
    }

    // 序列化打包器
    function packFiles(files) {
        let totalSize = 4;
        const encoder = new TextEncoder();
        const prepared = files.map(f => {
            const nameBytes = encoder.encode(f.name);
            totalSize += 4 + nameBytes.length + 4 + f.data.length;
            return { nameBytes, data: f.data };
        });

        const buffer = new ArrayBuffer(totalSize);
        const view = new DataView(buffer);
        const uint8 = new Uint8Array(buffer);

        let offset = 0;
        view.setUint32(offset, files.length, false);
        offset += 4;

        for (const p of prepared) {
            view.setUint32(offset, p.nameBytes.length, false);
            offset += 4;
            uint8.set(p.nameBytes, offset);
            offset += p.nameBytes.length;

            view.setUint32(offset, p.data.length, false);
            offset += 4;
            uint8.set(p.data, offset);
            offset += p.data.length;
        }

        return uint8;
    }

    // 一键打包主逻辑
    document.getElementById('encBtn').onclick = async () => {
        const pwd = passwordInput.value;
        const customName = archiveNameInput.value.trim();
        if (selectedFilesArray.length === 0 || !pwd) return alert("请先添加待打包的文件并设置密码");

        let totalBytes = 0;
        selectedFilesArray.forEach(file => totalBytes += file.size);
        if (totalBytes > 1024 * 1024 * 1024) {
            const doubleCheck = confirm("当前打包体积已超过推荐的 1GB 极限，是否确认强行打包？（解密端容易崩溃）");
            if (!doubleCheck) return;
        }

        updateProgress(15, "⏳ 正在加载并序列化多轨本地文件...");
        await new Promise(r => setTimeout(r, 200));

        try {
            // 1. 将文件转换为字节流
            const filesToPack = [];
            for (let i = 0; i < selectedFilesArray.length; i++) {
                const file = selectedFilesArray[i];
                const pct = Math.floor(15 + (i / selectedFilesArray.length) * 20);
                updateProgress(pct, `⏳ 正在读取本地大文件内存 (${i + 1}/${selectedFilesArray.length}): ${file.name}...`);
                await new Promise(r => setTimeout(r, 50));

                const arrBuffer = await file.arrayBuffer();
                filesToPack.push({
                    name: file.name,
                    data: new Uint8Array(arrBuffer)
                });
            }

            // 2. 序列化为单个二进制容器
            updateProgress(40, "⏳ 正在生成多轨道二进制打包序列...");
            const packedBytes = packFiles(filesToPack);

            // 3. 产生派生密钥
            updateProgress(50, "⏳ 正在初始化浏览器硬件加速加密组件...");
            const te = new TextEncoder();
            const pwBytes = te.encode(pwd);
            const salt = crypto.getRandomValues(new Uint8Array(16));

            const baseKey = await crypto.subtle.importKey(
                "raw",
                pwBytes,
                "PBKDF2",
                false,
                ["deriveKey"]
            );

            const derivedKey = await crypto.subtle.deriveKey(
                { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
                baseKey,
                { name: "AES-GCM", length: 256 },
                false,
                ["encrypt"]
            );

            // 4. 对打包后的数据进行硬件级加密并切片
            const CHUNK_SIZE = 50 * 1024 * 1024;
            const totalChunks = Math.ceil(packedBytes.length / CHUNK_SIZE);
            const outputChunks = [];

            const displayBundleName = customName ? customName : filesToPack[0].name.split('.')[0] + (filesToPack.length > 1 ? "_等多文件" : "");
            const saltB64 = uint8ArrayToBase64(salt);
            const htmlHeader = generateStandaloneHtmlHeader(displayBundleName, saltB64);
            outputChunks.push(new Blob([htmlHeader]));

            for (let i = 0; i < totalChunks; i++) {
                const pct = Math.floor(60 + (i / totalChunks) * 30);
                updateProgress(pct, `⏳ 正在通过芯片硬件加速加密分块 (${i + 1}/${totalChunks})...`);

                const offset = i * CHUNK_SIZE;
                const chunkBytes = packedBytes.subarray(offset, Math.min(offset + CHUNK_SIZE, packedBytes.length));

                const iv = crypto.getRandomValues(new Uint8Array(12));

                const encryptedBuffer = await crypto.subtle.encrypt(
                    { name: "AES-GCM", iv: iv, tagLength: 128 },
                    derivedKey,
                    chunkBytes
                );

                const encryptedArray = new Uint8Array(encryptedBuffer);

                const packedChunkBytes = new Uint8Array(12 + encryptedArray.length);
                packedChunkBytes.set(iv, 0);
                packedChunkBytes.set(encryptedArray, 12);

                const base64Str = uint8ArrayToBase64(packedChunkBytes);

                const htmlChunk = `<div id="c${i}" style="display:none">${base64Str}</div><script>p("c${i}");<\/script>\n`;
                outputChunks.push(new Blob([htmlChunk]));

                await new Promise(r => setTimeout(r, 0));
            }

            updateProgress(95, "⏳ 正在注入物理自解密引导引擎...");
            const htmlFooter = generateStandaloneHtmlFooter(displayBundleName);
            outputChunks.push(new Blob([htmlFooter]));

            const finalHtmlBlob = new Blob(outputChunks, { type: "text/html;charset=utf-8" });

            let outName = includeKeyCheckbox.checked ? `${displayBundleName}_StuCanvas${pwd}End.html` : `${displayBundleName}.html`;
            updateProgress(100, `✨ <strong>打包成功！</strong> 正在保存单网页归档：${outName}`);

            const url = URL.createObjectURL(finalHtmlBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = outName;
            a.click();

            setTimeout(() => URL.revokeObjectURL(url), 45000);

        } catch (e) {
            console.error(e);
            alert("多文件加密打包失败: " + e.message);
            progressContainer.style.display = 'none';
        }
    };
}

main();