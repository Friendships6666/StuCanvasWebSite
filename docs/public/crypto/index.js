import init, { encrypt_file } from './wasm_enc.js';
import { generateStandaloneHtml } from './template.js';

async function main() {
    await init(); // 启动基础 Wasm 模块

    const fileInput = document.getElementById('fileInput');
    const dropzone = document.getElementById('dropzone');
    const activeFile = document.getElementById('activeFile');
    const passwordInput = document.getElementById('password');
    const archiveNameInput = document.getElementById('archiveName');
    const includeKeyCheckbox = document.getElementById('includeKeyCheckbox');
    const statusMsg = document.getElementById('statusMsg');
    const selectedFilesContainer = document.getElementById('selectedFilesContainer');
    const selectedFilesList = document.getElementById('selectedFilesList');

    // 内存中维护待打包的文件列表
    let selectedFilesArray = [];
    let generatedObjectUrls = [];

    function revokePreviewUrls() {
        generatedObjectUrls.forEach(url => URL.revokeObjectURL(url));
        generatedObjectUrls = [];
    }

    // 状态进度条渲染函数
    function updateProgress(percent, text) {
        let container = document.getElementById('progressContainer');
        if (!container) {
            // 动态创建进度条
            container = document.createElement('div');
            container.id = 'progressContainer';
            container.className = 'progress-container';
            container.innerHTML = '<div id="progressBar" class="progress-bar"></div>';
            statusMsg.parentNode.insertBefore(container, statusMsg);
        }
        const bar = document.getElementById('progressBar');
        container.style.display = 'block';
        bar.style.width = percent + '%';
        statusMsg.innerHTML = text;
        statusMsg.style.display = 'block';
    }

    // 辅助判定多媒体格式
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

    // 渲染待打包列表及多媒体大预览卡片 (与解密端同款排版，长图、视频绝不畸变，列表在最下方滚动)
    function updateFilesList() {
        revokePreviewUrls();
        selectedFilesList.innerHTML = '';

        if (selectedFilesArray.length === 0) {
            selectedFilesContainer.style.display = 'none';
            activeFile.textContent = '未选择任何文件';
            return;
        }

        selectedFilesContainer.style.display = 'block';
        activeFile.textContent = `已选择 ${selectedFilesArray.length} 个文件`;

        selectedFilesArray.forEach((file, index) => {
            const card = document.createElement('div');
            card.className = 'preview-card';

            const header = document.createElement('div');
            header.className = 'preview-card-header';
            header.innerHTML = `
                <span>📄 ${file.name} (<span style="color: var(--text-secondary);">${(file.size / 1024 / 1024).toFixed(2)} MB</span>)</span>
                <button class="btn-remove-file" data-idx="${index}">移除</button>
            `;
            card.appendChild(header);

            // 预览大盒
            const body = document.createElement('div');
            body.className = 'preview-card-body';

            const mimeInfo = getMimeInfo(file.name);
            if (mimeInfo.type !== 'other') {
                const previewUrl = URL.createObjectURL(file);
                generatedObjectUrls.push(previewUrl);

                if (mimeInfo.type === 'image') {
                    const img = document.createElement('img');
                    img.src = previewUrl;
                    body.appendChild(img);
                } else if (mimeInfo.type === 'video') {
                    const video = document.createElement('video');
                    video.src = previewUrl;
                    video.controls = true;
                    video.playsInline = true;
                    body.appendChild(video);
                } else if (mimeInfo.type === 'audio') {
                    const audioDiv = document.createElement('div');
                    audioDiv.style.width = '100%';
                    audioDiv.innerHTML = `<audio src="${previewUrl}" controls style="width: 100%; display: block;"></audio>`;
                    body.appendChild(audioDiv);
                }
                card.appendChild(body);
            } else {
                body.innerHTML = `<div style="font-size: 0.8rem; color: var(--text-secondary);">📦 此文件类型非标准多媒体，无法在本地预览，打包后可在解密端直接下载原文件。</div>`;
                card.appendChild(body);
            }

            selectedFilesList.appendChild(card);
        });

        // 绑定移除事件
        selectedFilesList.querySelectorAll('.btn-remove-file').forEach(btn => {
            btn.onclick = (e) => {
                const idx = parseInt(e.currentTarget.getAttribute('data-idx'));
                selectedFilesArray.splice(idx, 1);
                updateFilesList();
            };
        });
    }

    fileInput.onchange = (e) => {
        if (e.target.files) {
            Array.from(e.target.files).forEach(f => selectedFilesArray.push(f));
            updateFilesList();
        }
    };

    dropzone.ondragover = () => {
        dropzone.classList.add('dragover');
        return false;
    };

    dropzone.ondragleave = () => {
        dropzone.classList.remove('dragover');
        return false;
    };

    dropzone.ondrop = (e) => {
        dropzone.classList.remove('dragover');
        e.preventDefault();
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            Array.from(e.dataTransfer.files).forEach(f => selectedFilesArray.push(f));
            updateFilesList();
        }
        return false;
    };

    // 修复重名/残缺文件名
    function repairFilename(name) {
        let workingName = name;
        workingName = workingName.replace(/\.(\w+)\s*\(\d+\)/gi, '.$1');
        workingName = workingName.replace(/\.(\w+)[_\s-]+\d+/gi, '.$1');
        workingName = workingName.replace(/\s*\(\d+\)(?=\.\w+)/gi, '');
        workingName = workingName.replace(/\s*-\s*副本/g, '');
        workingName = workingName.replace(/\s*\(\d+\)$/gi, '');
        return workingName;
    }

    // 内存友好型 Base64 转换器
    function arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        const chunk = 8192;
        for (let i = 0; i < bytes.length; i += chunk) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
        }
        return window.btoa(binary);
    }

    // 极简二进制打包
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

    // 延时 10 秒内存回收机制下载，规避高吞吐量下的下载中断与并发拦截
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
        }, 15000); // 为浏览器预留 15 秒建立通道时间
    };

    // 一键打包
    document.getElementById('encBtn').onclick = async () => {
        const pwd = passwordInput.value;
        const customName = archiveNameInput.value.trim();
        if (selectedFilesArray.length === 0 || !pwd) return alert("请先添加待打包的文件并设置密码");

        updateProgress(15, "⏳ 正在本地抽取核心 Wasm 密码学资产...");
        await new Promise(r => setTimeout(r, 200));

        try {
            const wasmBinaryRes = await fetch('./wasm_enc_bg.wasm');
            if (!wasmBinaryRes.ok) throw new Error("无法拉取 Wasm 字节码核心");
            const wasmBinaryBuffer = await wasmBinaryRes.arrayBuffer();

            const wasmJsRes = await fetch('./wasm_enc.js');
            if (!wasmJsRes.ok) throw new Error("无法拉取 JS 脚手架核心");
            const wasmJsText = await wasmJsRes.text();

            // 串行大文件异步读取与进度长线渲染
            const filesToPack = [];
            for (let i = 0; i < selectedFilesArray.length; i++) {
                const file = selectedFilesArray[i];
                const pct = Math.floor(20 + (i / selectedFilesArray.length) * 30);
                updateProgress(pct, `⏳ 正在读取本地大文件内存 (${i + 1}/${selectedFilesArray.length}): ${file.name}...`);
                await new Promise(r => setTimeout(r, 100)); // 让出 UI 主线程渲染 UI 进度

                const arrBuffer = await file.arrayBuffer();
                filesToPack.push({
                    name: repairFilename(file.name),
                    data: new Uint8Array(arrBuffer)
                });
            }

            updateProgress(55, "⏳ 正在序列化多文件，打包打包为高性能二进制归档容器...");
            await new Promise(r => setTimeout(r, 200));

            const packedBytes = packFiles(filesToPack);

            updateProgress(75, "⏳ 正在调用本地 Wasm 进行 AES-256 复合加密...");
            await new Promise(r => setTimeout(r, 200));

            const encryptedBytes = encrypt_file(packedBytes, pwd);

            updateProgress(90, "⏳ 正在对加密资产进行 Base64 编译并构建自解密网页模版...");
            await new Promise(r => setTimeout(r, 200));

            const wasmBinaryBase64 = arrayBufferToBase64(wasmBinaryBuffer);
            const wasmJsBase64 = window.btoa(unescape(encodeURIComponent(wasmJsText)));
            const encryptedBase64 = arrayBufferToBase64(encryptedBytes);

            let displayBundleName = "";
            if (customName) {
                displayBundleName = repairFilename(customName);
            } else {
                const firstFileNameCleaned = filesToPack[0].name.split('.')[0];
                displayBundleName = filesToPack.length > 1 ? `${firstFileNameCleaned}_等多文件归档` : firstFileNameCleaned;
            }

            let outName = "";
            if (includeKeyCheckbox.checked) {
                outName = `${displayBundleName}_StuKey${pwd}End.html`;
            } else {
                outName = `${displayBundleName}.html`;
            }

            const standaloneHtml = generateStandaloneHtml(displayBundleName, wasmJsBase64, wasmBinaryBase64, encryptedBase64);
            const blob = new Blob([standaloneHtml], { type: 'text/html;charset=utf-8' });

            updateProgress(100, `✨ <strong>归档成功！</strong> 正在保存单网页：${outName}`);
            triggerDownload(blob, outName);

        } catch (e) {
            alert("多文件打包 HTML 失败: " + e.message);
            document.getElementById('progressContainer').style.display = 'none';
        }
    };
}

main();