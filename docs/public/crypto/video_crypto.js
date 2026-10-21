// public/crypto/video_crypto.js
import {
    CUSTOM_UUID,
    uint8ArrayToBase64,
    base64ToBytes,
    formatBytes,
    getMimeInfo,
    compareUint8Arrays,
    triggerDownload,
    generateZipBlob
} from './utils.js';

// DOM 元素选择器
const secretFilesInput = document.getElementById('secretFilesInput');
const secretDropzone = document.getElementById('secretDropzone');
const secretFilesContainer = document.getElementById('secretFilesContainer');
const secretFilesList = document.getElementById('secretFilesList');
const archiveNameVideo = document.getElementById('archiveNameVideo');
const passwordVideoPack = document.getElementById('passwordVideoPack');
const includeKeyCheckboxVideo = document.getElementById('includeKeyCheckboxVideo');
const btnVideoPack = document.getElementById('btnVideoPack');

const encVideoInput = document.getElementById('encVideoInput');
const encVideoDropzone = document.getElementById('encVideoDropzone');
const activeEncVideoName = document.getElementById('activeEncVideoName');
const passwordVideoUnpack = document.getElementById('passwordVideoUnpack');
const btnVideoUnpack = document.getElementById('btnVideoUnpack');

const decryptedFileListCard = document.getElementById('decryptedFileListCard');
const decryptedFileItemsList = document.getElementById('decryptedFileItemsList');
const decryptedDownloadAllBtn = document.getElementById('decryptedDownloadAllBtn');
const decryptedMediaPreviewContainer = document.getElementById('decryptedMediaPreviewContainer');
const decryptedMediaPreviewList = document.getElementById('decryptedMediaPreviewList');

const videoPackProgressContainer = document.getElementById('videoPackProgressContainer');
const videoPackProgressBar = document.getElementById('videoPackProgressBar');
const videoPackStatusMsg = document.getElementById('videoPackStatusMsg');

// 隐写端数据状态维护
let encryptedVideoFile = null;
let secretFilesArray = [];
let generatedUrls = [];
let unpackedFilesCache = null;

function revokeUrls() {
    generatedUrls.forEach(url => URL.revokeObjectURL(url));
    generatedUrls = [];
}

function updateVideoStatus(percent, text) {
    videoPackProgressContainer.style.display = 'block';
    videoPackProgressBar.style.width = percent + '%';
    videoPackStatusMsg.innerHTML = text;
    videoPackStatusMsg.style.display = 'block';
}

// 强制绑定点击区域
secretDropzone.onclick = () => { secretFilesInput.click(); };
secretFilesInput.onclick = (e) => { e.stopPropagation(); };
encVideoDropzone.onclick = () => { encVideoInput.click(); };
encVideoInput.onclick = (e) => { e.stopPropagation(); };

// ==================== 1. 流式分块序列化读取器 (核心：支持 10GB+) ====================
class VirtualStreamReader {
    constructor(files) {
        this.files = files;
        this.fileIndex = 0;
        this.state = 'START';
        this.currentFile = null;
        this.currentFileOffset = 0n; // 使用 BigInt 保证 >4GB 定位安全
        this.encoder = new TextEncoder();
        this.buffer = new Uint8Array(0);
    }

    async read(bytesToRead) {
        const chunks = [];
        let accumulated = 0;

        while (accumulated < bytesToRead) {
            if (this.buffer.length > 0) {
                const take = Math.min(this.buffer.length, bytesToRead - accumulated);
                chunks.push(this.buffer.subarray(0, take));
                accumulated += take;
                this.buffer = this.buffer.subarray(take);
                continue;
            }

            if (this.state === 'START') {
                // 写入文件总数 (4 字节)
                const temp = new Uint8Array(4);
                const view = new DataView(temp.buffer);
                view.setUint32(0, this.files.length, false);
                this.buffer = temp;
                this.state = 'FILE_HEADER';
                this.fileIndex = 0;
                continue;
            }

            if (this.state === 'FILE_HEADER') {
                if (this.fileIndex >= this.files.length) {
                    this.state = 'END';
                    break;
                }
                this.currentFile = this.files[this.fileIndex];
                const nameBytes = this.encoder.encode(this.currentFile.name);
                const nameLen = nameBytes.length;
                const fileSize = BigInt(this.currentFile.size);

                // 单个文件描述头结构: nameLen (4B) + nameBytes + fileSize (8B Uint64 支持 >4GB 尺寸)
                const headerSize = 4 + nameLen + 8;
                const temp = new Uint8Array(headerSize);
                const view = new DataView(temp.buffer);

                view.setUint32(0, nameLen, false);
                temp.set(nameBytes, 4);
                view.setBigUint64(4 + nameLen, fileSize, false);

                this.buffer = temp;
                this.state = 'FILE_DATA';
                this.currentFileOffset = 0n;
                continue;
            }

            if (this.state === 'FILE_DATA') {
                const remaining = BigInt(this.currentFile.size) - this.currentFileOffset;
                if (remaining <= 0n) {
                    this.fileIndex++;
                    this.state = 'FILE_HEADER';
                    continue;
                }

                // 局部切片读取，绝不一次性将大文件加载进 heap 内存
                const toReadBig = remaining < BigInt(bytesToRead - accumulated) ? remaining : BigInt(bytesToRead - accumulated);
                const toRead = Number(toReadBig);

                const slice = this.currentFile.slice(Number(this.currentFileOffset), Number(this.currentFileOffset) + toRead);
                const arrayBuffer = await slice.arrayBuffer();
                const uint8 = new Uint8Array(arrayBuffer);

                chunks.push(uint8);
                accumulated += uint8.length;
                this.currentFileOffset += BigInt(uint8.length);
                continue;
            }

            if (this.state === 'END') {
                break;
            }
        }

        if (chunks.length === 0) {
            return null;
        }

        const merged = new Uint8Array(accumulated);
        let offset = 0;
        for (const chunk of chunks) {
            merged.set(chunk, offset);
            offset += chunk.length;
        }
        return merged;
    }
}

// ==================== 2. 流式解密指针级提取器 (核心：无损还原 10GB+) ====================
async function unpackFilesFromBlob(decryptedBlob) {
    let offset = 0;
    const decoder = new TextDecoder();

    // 轻量级切片读取助手，只读取基础结构标识
    async function readSlice(start, len) {
        const slice = decryptedBlob.slice(start, start + len);
        return await slice.arrayBuffer();
    }

    const countBuffer = await readSlice(offset, 4);
    if (countBuffer.byteLength < 4) {
        throw new Error("解密流不完整（无法读取文件总数）");
    }
    const countView = new DataView(countBuffer);
    const fileCount = countView.getUint32(0, false);
    offset += 4;

    const files = [];

    for (let i = 0; i < fileCount; i++) {
        // 读取文件名长度 (4B)
        const nameLenBuffer = await readSlice(offset, 4);
        if (nameLenBuffer.byteLength < 4) {
            throw new Error(`归档结构损坏（无法读取第 ${i+1} 个文件的名称长度）`);
        }
        const nameLenView = new DataView(nameLenBuffer);
        const nameLen = nameLenView.getUint32(0, false);
        offset += 4;

        // 读取文件名 (nameLen)
        const nameBuffer = await readSlice(offset, nameLen);
        if (nameBuffer.byteLength < nameLen) {
            throw new Error(`归档结构损坏（无法读取第 ${i+1} 个文件的完整名称）`);
        }
        const name = decoder.decode(nameBuffer);
        offset += nameLen;

        // 读取文件体积大小 (8B Uint64)
        const dataLenBuffer = await readSlice(offset, 8);
        if (dataLenBuffer.byteLength < 8) {
            throw new Error(`归档结构损坏（无法读取第 ${i+1} 个文件的大小数据）`);
        }
        const dataLenView = new DataView(dataLenBuffer);
        const dataLen = dataLenView.getBigUint64(0, false);
        offset += 8;

        // 【最关键一步】：通过 Blob.slice() 创建虚拟指针，实现零物理堆内存分配
        const dataBlob = decryptedBlob.slice(offset, offset + Number(dataLen));
        offset += Number(dataLen);

        files.push({
            name: name,
            blob: dataBlob,
            size: Number(dataLen)
        });
    }

    return files;
}

// 加密端选择文件及拖拽逻辑
secretFilesInput.onchange = (e) => {
    if (e.target.files) {
        Array.from(e.target.files).forEach(f => secretFilesArray.push(f));
        updateSecretFilesList();
    }
};

secretDropzone.ondragover = () => { secretDropzone.classList.add('dragover'); return false; };
secretDropzone.ondragleave = () => { secretDropzone.classList.remove('dragover'); return false; };
secretDropzone.ondrop = (e) => {
    secretDropzone.classList.remove('dragover');
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        Array.from(e.dataTransfer.files).forEach(f => secretFilesArray.push(f));
        updateSecretFilesList();
    }
    return false;
};

// 解密端选择文件及拖拽逻辑
encVideoInput.onchange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
        encryptedVideoFile = e.target.files[0];
        activeEncVideoName.textContent = encryptedVideoFile.name;
    }
};

encVideoDropzone.ondragover = () => { encVideoDropzone.classList.add('dragover'); return false; };
encVideoDropzone.ondragleave = () => { encVideoDropzone.classList.remove('dragover'); return false; };
encVideoDropzone.ondrop = (e) => {
    encVideoDropzone.classList.remove('dragover');
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        encryptedVideoFile = e.dataTransfer.files[0];
        activeEncVideoName.textContent = encryptedVideoFile.name;
    }
    return false;
};

// 渲染加密端预览
function updateSecretFilesList() {
    revokeUrls();
    secretFilesList.innerHTML = '';

    if (secretFilesArray.length === 0) {
        secretFilesContainer.style.display = 'none';
        return;
    }

    secretFilesContainer.style.display = 'block';

    secretFilesArray.forEach((file, index) => {
        const card = document.createElement('div');
        card.className = 'preview-card';

        const mediaWrapper = document.createElement('div');
        mediaWrapper.className = 'preview-media-wrapper';

        const infoPanel = document.createElement('div');
        infoPanel.className = 'preview-info-panel';

        const mimeInfo = getMimeInfo(file.name);
        if (mimeInfo.type !== 'other') {
            const previewUrl = URL.createObjectURL(file);
            generatedUrls.push(previewUrl);

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

                video.addEventListener('error', () => {
                    if (file.size < 35 * 1024 * 1024) {
                        const reader = new FileReader();
                        reader.onload = (e) => { video.src = e.target.result; };
                        reader.readAsDataURL(file);
                    } else {
                        mediaWrapper.innerHTML = '<div style="text-align: center; color: var(--accent-error); font-size: 0.75rem; padding: 8px; font-weight: 500;">⚠️ 暂不支持大体积流式预载，生成完毕后请保存观看。</div>';
                    }
                }, { once: true });
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
            <div class="preview-file-meta">大小：${formatBytes(file.size)}</div>
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
        secretFilesList.appendChild(card);

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

    secretFilesList.querySelectorAll('.btn-remove-file').forEach(btn => {
        btn.onclick = (e) => {
            const idx = parseInt(e.currentTarget.getAttribute('data-idx'));
            secretFilesArray.splice(idx, 1);
            updateSecretFilesList();
        };
    });
}

function toHex(uint8) {
    return Array.from(uint8).map(b => b.toString(16).padStart(2, '0')).join(' ');
}


// ==================== 3. 视频隐写打包逻辑 (流式支持大体积) ====================
btnVideoPack.onclick = async () => {
    const pwd = passwordVideoPack.value.trim();
    if (secretFilesArray.length === 0 || !pwd) {
        return alert("请确保已选择了待隐藏的文件并设置了密码");
    }

    updateVideoStatus(5, "⏳ 正在拉取底座视频 decoy_video.mp4...");
    await new Promise(r => setTimeout(r, 200));

    try {
        const response = await fetch('./decoy_video.mp4');
        if (!response.ok) {
            throw new Error("底座视频 './decoy_video.mp4' 加载失败，请确保该文件存在！");
        }
        const decoyBuffer = await response.arrayBuffer();
        const decoyBlob = new Blob([decoyBuffer]);

        updateVideoStatus(15, `⏳ 成功加载底座视频 (${formatBytes(decoyBlob.size)})。正在流式初始化打包流...`);
        await new Promise(r => setTimeout(r, 100));

        // 提前计算封装流的大小
        const te = new TextEncoder();
        let totalPackedSize = 4; // 存储文件数量的 4B 空间
        for (const f of secretFilesArray) {
            const nameBytes = te.encode(f.name);
            totalPackedSize += 4 + nameBytes.length + 8 + f.size;
        }

        const streamReader = new VirtualStreamReader(secretFilesArray);
        const CHUNK_SIZE = 50 * 1024 * 1024; // 保持 50MB 物理分块颗粒
        const totalChunks = Math.ceil(totalPackedSize / CHUNK_SIZE);
        const uuidPayloadChunks = [];

        // 首位装填安全密钥派生盐（16B）
        const salt = crypto.getRandomValues(new Uint8Array(16));
        uuidPayloadChunks.push(new Blob([salt]));

        const pwBytes = te.encode(pwd);
        const baseKey = await crypto.subtle.importKey("raw", pwBytes, "PBKDF2", false, ["deriveKey"]);
        const derivedKey = await crypto.subtle.deriveKey(
            { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
            baseKey,
            { name: "AES-GCM", length: 256 },
            false,
            ["encrypt"]
        );

        let chunkIndex = 0;
        while (true) {
            const pct = Math.min(90, Math.floor(20 + (chunkIndex / totalChunks) * 70));
            updateVideoStatus(pct, `⏳ 正在读取并进行 AES-GCM 流式分块加密 [${chunkIndex + 1}/${totalChunks}] (${formatBytes(chunkIndex * CHUNK_SIZE)} / ${formatBytes(totalPackedSize)})...`);

            const chunkBytes = await streamReader.read(CHUNK_SIZE);
            if (!chunkBytes || chunkBytes.length === 0) {
                break;
            }

            const iv = crypto.getRandomValues(new Uint8Array(12));
            const encryptedBuffer = await crypto.subtle.encrypt(
                { name: "AES-GCM", iv: iv, tagLength: 128 },
                derivedKey,
                chunkBytes
            );
            const encryptedArray = new Uint8Array(encryptedBuffer);

            const packedChunk = new Uint8Array(12 + encryptedArray.length);
            packedChunk.set(iv, 0);
            packedChunk.set(encryptedArray, 12);

            // 转换成 Blob 数组而不是保留在 JS 堆内存中，让浏览器在内存紧张时自动 offload 到本地磁盘缓存
            uuidPayloadChunks.push(new Blob([packedChunk]));
            chunkIndex++;
            await new Promise(r => setTimeout(r, 0));
        }

        updateVideoStatus(92, "⏳ 正在包装 UUID 标准数据箱...");
        const uuidPayloadBlob = new Blob(uuidPayloadChunks);
        const uuidBoxSize = 8 + 16 + uuidPayloadBlob.size;

        const boxHeaderBuffer = new ArrayBuffer(8);
        const headerView = new DataView(boxHeaderBuffer);
        headerView.setUint32(0, uuidBoxSize, false); // 大端

        const typeBytes = new Uint8Array(boxHeaderBuffer, 4, 4);
        typeBytes.set([0x75, 0x75, 0x69, 0x64]); // "uuid"

        const outputChunks = [];
        outputChunks.push(decoyBlob);
        outputChunks.push(new Blob([boxHeaderBuffer]));
        outputChunks.push(new Blob([CUSTOM_UUID]));
        outputChunks.push(uuidPayloadBlob);

        // 物理尾部反向对齐指针
        const footerBuffer = new ArrayBuffer(18);
        const footerView = new DataView(footerBuffer);
        footerView.setBigUint64(0, BigInt(uuidBoxSize), true); // 小端

        const footerBytes = new Uint8Array(footerBuffer);
        const magic = te.encode("STUARCHIVE");
        footerBytes.set(magic, 8);

        outputChunks.push(new Blob([footerBuffer]));

        updateVideoStatus(97, "⏳ 正在拼接反向对齐指针并输出 Chameleon 文件结构...");
        const finalChameleonBlob = new Blob(outputChunks, { type: "video/mp4" });

        const customName = archiveNameVideo.value.trim();
        const includeKey = includeKeyCheckboxVideo.checked;

        let baseName = "";
        if (customName) {
            baseName = customName.replace(/\.[^/.]+$/, "");
        } else if (secretFilesArray.length > 0) {
            baseName = secretFilesArray[0].name.replace(/\.[^/.]+$/, "");
        } else {
            baseName = "steg_video";
        }

        const outName = includeKey ? `${baseName}_StuKey${pwd}End.mp4` : `${baseName}.mp4`;
        updateVideoStatus(100, `✨ <strong>物理隐写归档成功！</strong> 文件正在保存至您的磁盘：${outName}`);

        triggerDownload(finalChameleonBlob, outName);

    } catch (e) {
        console.error(e);
        alert("打包隐写视频失败: " + e.message);
        videoPackProgressContainer.style.display = 'none';
    }
};


// ==================== 4. 视频隐写安全解密逻辑 (流式提取) ====================
btnVideoUnpack.onclick = async () => {
    const pwd = passwordVideoUnpack.value.trim();
    if (!encryptedVideoFile || !pwd) {
        return alert("请选择待解密视频并输入密码");
    }

    updateVideoStatus(5, "⏳ 正在读取底端指针对齐魔数...");
    await new Promise(r => setTimeout(r, 200));

    try {
        const fileSize = encryptedVideoFile.size;

        const footerBlob = encryptedVideoFile.slice(fileSize - 18, fileSize);
        const footerBuffer = await footerBlob.arrayBuffer();
        const view = new DataView(footerBuffer);

        const magicBytes = new Uint8Array(footerBuffer, 8, 10);
        const magicString = new TextDecoder().decode(magicBytes);

        if (magicString !== "STUARCHIVE") {
            videoPackProgressContainer.style.display = 'none';
            return alert("❌ 解密验证失败：未在该视频最末尾检测到正确的指针标记。请确认输入的是隐写视频原件。");
        }

        const uuidBoxSize = Number(view.getBigUint64(0, true));
        const uuidBoxOffset = fileSize - 18 - uuidBoxSize;

        const headerBlob = encryptedVideoFile.slice(uuidBoxOffset, uuidBoxOffset + 8);
        const headerBuf = await headerBlob.arrayBuffer();
        const headerView = new DataView(headerBuf);
        const checkType = new TextDecoder().decode(new Uint8Array(headerBuf, 4, 4));

        if (checkType !== "uuid") {
            videoPackProgressContainer.style.display = 'none';
            return alert("❌ 解密验证失败：内部指针对齐标志已被转码截断破坏。");
        }

        const signatureBlob = encryptedVideoFile.slice(uuidBoxOffset + 8, uuidBoxOffset + 24);
        const signatureBuf = await signatureBlob.arrayBuffer();
        const signatureBytes = new Uint8Array(signatureBuf);

        if (!compareUint8Arrays(signatureBytes, CUSTOM_UUID)) {
            videoPackProgressContainer.style.display = 'none';
            return alert("❌ 解密验证失败：物理指纹签名不匹配。");
        }

        const payloadStart = uuidBoxOffset + 24;
        const payloadEnd = uuidBoxOffset + uuidBoxSize;
        let currentOffset = payloadStart;

        const saltBlob = encryptedVideoFile.slice(currentOffset, currentOffset + 16);
        const saltBuffer = await saltBlob.arrayBuffer();
        const salt = new Uint8Array(saltBuffer);
        currentOffset += 16;

        updateVideoStatus(25, "⏳ 正在派生原生硬件 AES-GCM 解密秘钥...");
        const te = new TextEncoder();
        const pwBytes = te.encode(pwd);

        const baseKey = await crypto.subtle.importKey("raw", pwBytes, "PBKDF2", false, ["deriveKey"]);
        const derivedKey = await crypto.subtle.deriveKey(
            { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
            baseKey,
            { name: "AES-GCM", length: 256 },
            false,
            ["decrypt"]
        );

        const CHUNK_SIZE = 50 * 1024 * 1024 + 12 + 16;
        const decryptedChunks = [];
        let chunkIndex = 0;
        const totalChunks = Math.ceil((payloadEnd - currentOffset) / CHUNK_SIZE);

        while (currentOffset < payloadEnd) {
            const nextEnd = Math.min(currentOffset + CHUNK_SIZE, payloadEnd);
            const pct = Math.floor(30 + (chunkIndex / totalChunks) * 55);
            updateVideoStatus(pct, `⏳ 正在还原多轨物理加密块 [${chunkIndex + 1}/${totalChunks}] (已完成 ${pct}%)...`);

            const chunkBlob = encryptedVideoFile.slice(currentOffset, nextEnd);
            const chunkBuffer = await chunkBlob.arrayBuffer();
            const chunkBytes = new Uint8Array(chunkBuffer);

            const iv = chunkBytes.subarray(0, 12);
            const ciphertext = chunkBytes.subarray(12);

            const decryptedBuffer = await crypto.subtle.decrypt(
                { name: "AES-GCM", iv: iv, tagLength: 128 },
                derivedKey,
                ciphertext
            );

            // 直接存储解密的 Blob（无需存入大数组）
            decryptedChunks.push(new Blob([decryptedBuffer]));
            currentOffset = nextEnd;
            chunkIndex++;

            await new Promise(r => setTimeout(r, 0));
        }

        updateVideoStatus(88, "⏳ 密文完全展开。正在指针反序列化建立多轨流...");
        const finalDecryptedBlob = new Blob(decryptedChunks, { type: "application/octet-stream" });

        // 调用新型切片反序列化器，避免 ArrayBuffer 10GB 堆崩溃
        unpackedFilesCache = await unpackFilesFromBlob(finalDecryptedBlob);

        // 渲染解密提取文件列表
        decryptedFileItemsList.innerHTML = '';
        unpackedFilesCache.forEach((file, index) => {
            const row = document.createElement('div');
            row.className = 'file-item-row';
            row.innerHTML = `<span>📄 ${file.name} (<span style="color: var(--text-secondary);">${formatBytes(file.size)}</span>)</span>` +
                `<button class="btn-single-download" data-idx="${index}">下载</button>`;
            decryptedFileItemsList.appendChild(row);
        });
        decryptedFileListCard.style.display = 'block';

        decryptedFileItemsList.querySelectorAll('.btn-single-download').forEach(btn => {
            btn.onclick = (e) => {
                const idx = parseInt(e.target.getAttribute('data-idx'));
                const file = unpackedFilesCache[idx];
                triggerDownload(file.blob, file.name);
            };
        });

        // 绑定一键 ZIP 下载（增加大体积拦截安全阀）
        decryptedDownloadAllBtn.onclick = () => {
            if (unpackedFilesCache) {
                try {
                    const totalSize = unpackedFilesCache.reduce((sum, f) => sum + f.size, 0);
                    if (totalSize > 1.5 * 1024 * 1024 * 1024) {
                        alert("由于提取的文件总体积过大（超过 1.5GB），为防止浏览器堆内存溢出导致卡死崩溃，无法一键打包。请点击下方列表右侧的「下载」按钮单独保存您的各个文件。");
                        return;
                    }

                    updateVideoStatus(90, "⏳ 正在进行内存对齐拼装一键 ZIP 归档包...");
                    (async () => {
                        const legacyFiles = [];
                        for (const file of unpackedFilesCache) {
                            const buffer = await file.blob.arrayBuffer();
                            legacyFiles.push({
                                name: file.name,
                                data: new Uint8Array(buffer)
                            });
                        }
                        const zipBlob = generateZipBlob(legacyFiles);
                        triggerDownload(zipBlob, "Unpacked_VideoArchive.zip");
                        updateVideoStatus(100, "✨ 一键打包下载完毕！");
                    })();
                } catch(e) {
                    console.error(e);
                    alert("ZIP打包合并失败，请点击各文件旁边的「下载」按钮单独下载。");
                }
            }
        };

        // 渲染多媒体预览
        updateVideoStatus(95, "⏳ 提取成功！正在渲染媒体实时预览面板...");
        decryptedMediaPreviewList.innerHTML = '';
        let hasMedia = false;

        unpackedFilesCache.forEach(file => {
            const mediaInfo = getMimeInfo(file.name);
            if (mediaInfo.type === 'other') return;

            // 超大视频、音频及文件不需要自动生成本地预览，防止显存及页面直接挂起
            if (file.size > 150 * 1024 * 1024) return;

            hasMedia = true;
            const card = document.createElement('div');
            card.className = 'preview-card';

            const mediaWrapper = document.createElement('div');
            mediaWrapper.className = 'preview-media-wrapper';

            const infoPanel = document.createElement('div');
            infoPanel.className = 'preview-info-panel';

            const blob = file.blob;
            const mediaBlob = blob.type ? blob : new Blob([blob], { type: mediaInfo.mime });
            const mediaUrl = URL.createObjectURL(mediaBlob);

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

                video.addEventListener('error', () => {
                    if (blob.size < 35 * 1024 * 1024) {
                        const reader = new FileReader();
                        reader.onload = (e) => { video.src = e.target.result; };
                        reader.readAsDataURL(blob);
                    } else {
                        mediaWrapper.innerHTML = '<div style="text-align: center; color: var(--accent-error); font-size: 0.75rem; padding: 8px; font-weight: 500;">⚠️ 本地流载入受限，请直接点击上方「下载」保存播放。</div>';
                    }
                }, { once: true });
            } else if (mediaInfo.type === 'audio') {
                const audio = document.createElement('audio');
                audio.src = mediaUrl;
                audio.controls = true;
                mediaWrapper.appendChild(audio);
            }

            infoPanel.innerHTML = `
                <div class="preview-file-name" title="${file.name}">📄 ${file.name}</div>
                <div class="preview-file-meta">大小：${formatBytes(file.size)}</div>
                <div class="zoom-btn-group">
                    <button class="zoom-btn btn-zoom-in">🔍 放大</button>
                    <button class="zoom-btn btn-zoom-out">🔍 缩小</button>
                </div>
            `;

            card.appendChild(mediaWrapper);
            card.appendChild(infoPanel);
            decryptedMediaPreviewList.appendChild(card);

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
            decryptedMediaPreviewContainer.style.display = 'block';
        } else {
            decryptedMediaPreviewContainer.style.display = 'none';
        }

        updateVideoStatus(100, `✨ <strong>隐写解密成功！</strong> 已无损还原 ${unpackedFilesCache.length} 个物理文件。`);

    } catch (e) {
        console.error(e);
        videoPackStatusMsg.innerHTML = "<span style='color: var(--accent-error);'>❌ 解密验证失败：密码错误、物理特征指纹损坏或文件已在传输中被转码破坏。已将日志输出在开发者控制台(F12)。</span>";
        btnVideoUnpack.disabled = false;
    }
};