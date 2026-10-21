// Run-length subpixel raster. Only boundary intervals and free row spans are
// stored, so raising geometric resolution does not allocate a viewport-sized grid.
export class RegionGrid {
  constructor(columns, rows) {
    this.columns = columns; this.rows = rows;
    this.mask = Array.from({ length: rows }, () => []);
  }
  stamp(x, y, extent, owner) {
    const top = Math.max(0, Math.ceil(y - extent - .5));
    const bottom = Math.min(this.rows - 1, Math.floor(y + extent - .5));
    for (let row = top; row <= bottom; row++) {
      const horizontal = Math.sqrt(Math.max(0, extent ** 2 - (row + .5 - y) ** 2));
      const left = Math.max(0, Math.ceil(x - horizontal - .5));
      const right = Math.min(this.columns - 1, Math.floor(x + horizontal - .5));
      if (left <= right) this.mask[row].push({ left, right, owners: [owner] });
    }
  }
  *prepare() {
    this.spans = [];
    for (let row = 0; row < this.rows; row++) {
      const blocks = this.mask[row].sort((a, b) => a.left - b.left || a.right - b.right);
      const merged = [];
      for (const block of blocks) {
        const last = merged.at(-1);
        if (last && block.left <= last.right + 1) {
          last.right = Math.max(last.right, block.right);
          for (const owner of block.owners) if (!last.owners.includes(owner)) last.owners.push(owner);
        } else merged.push(block);
      }
      this.mask[row] = merged;
      const spans = [];
      let left = 0;
      for (const block of merged) {
        if (block.left > left) spans.push({ left, right: block.left - 1, row });
        left = block.right + 1;
      }
      if (left < this.columns) spans.push({ left, right: this.columns - 1, row });
      this.spans.push(spans);
      if (row % 128 === 0) yield;
    }
  }
  *flood(x, y, cell, margin) {
    const seed = this.spans[y]?.find(span => span.left <= x && span.right >= x);
    if (!seed) return null;
    const queue = [seed], visited = new Set([seed]), owners = new Set();
    let area = 0;
    for (let head = 0; head < queue.length; head++) {
      const current = queue[head], { left, right, row } = current;
      if (left === 0 || right === this.columns - 1 || row === 0 || row === this.rows - 1) return null;
      area += right - left + 1;
      for (const index of [row - 1, row, row + 1]) {
        // Binary search avoids comparing every span on oscillatory curves.
        const blocks = this.mask[index];
        let lo = 0, hi = blocks.length;
        while (lo < hi) { const mid = (lo + hi) >>> 1; if (blocks[mid].right < left - 1) lo = mid + 1; else hi = mid; }
        for (let at = lo; at < blocks.length && blocks[at].left <= right + 1; at++) {
          for (const owner of blocks[at].owners) owners.add(owner);
        }
        if (index === row) continue;
        const spans = this.spans[index];
        lo = 0; hi = spans.length;
        while (lo < hi) { const mid = (lo + hi) >>> 1; if (spans[mid].right < left) lo = mid + 1; else hi = mid; }
        for (let at = lo; at < spans.length && spans[at].left <= right; at++) {
          const span = spans[at];
          if (!visited.has(span)) { visited.add(span); queue.push(span); }
        }
      }
      if (head % 1024 === 0) yield;
    }
    const rectangles = [];
    let active = new Map();
    for (let row = 0; row < this.rows; row++) {
      const next = new Map();
      for (const span of this.spans[row]) {
        if (!visited.has(span)) continue;
        const key = `${span.left}:${span.right}`;
        let rectangle = active.get(key);
        if (rectangle === undefined) {
          rectangle = rectangles.length;
          rectangles.push(span.left * cell - margin, row * cell - margin, (span.right + 1) * cell - margin, (row + 1) * cell - margin);
        } else rectangles[rectangle + 3] = (row + 1) * cell - margin;
        next.set(key, rectangle);
      }
      active = next;
      if (row % 128 === 0) yield;
    }
    return { rectangles: new Float64Array(rectangles), parents: [...owners], area: area * cell ** 2 };
  }
}
