// public/crypto/utils.js

export const CUSTOM_UUID = new Uint8Array([
    0x53, 0x54, 0x55, 0x43, 0x41, 0x4e, 0x56, 0x41, 0x53, 0x5f, 0x53, 0x45, 0x43, 0x55, 0x52, 0x45
]);

export function uint8ArrayToBase64(uint8) {
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

export function base64ToBytes(b64) {
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

export function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function getMimeInfo(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'];
    const videoExts = ['mp4', 'webm', 'ogg', 'mov', 'm4v'];
    const audioExts = ['mp3', 'wav', 'ogg', 'aac', 'flac', 'm4a', 'opus', 'm4r'];

    if (imageExts.includes(ext)) return { type: 'image', mime: `image/${ext === 'jpg' ? 'jpeg' : ext}` };
    if (videoExts.includes(ext)) return { type: 'video', mime: `video/${ext === 'mov' ? 'mp4' : ext}` };
    if (audioExts.includes(ext)) return { type: 'audio', mime: `audio/${ext === 'mp3' ? 'mpeg' : ext === 'm4a' ? 'mp4' : ext}` };
    return { type: 'other', mime: 'application/octet-stream' };
}

export function packFiles(files) {
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

export function unpackFiles(packedBytes) {
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

        const dataCopy = new Uint8Array(data.length);
        dataCopy.set(data);

        files.push({ name, data: dataCopy });
    }
    return files;
}

export function compareUint8Arrays(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

export function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 15000);
}

// 简易 ZIP 生成组件
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

export function generateZipBlob(files) {
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