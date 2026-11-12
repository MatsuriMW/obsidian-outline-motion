// 大纲动效：编辑器里的行不再瞬移。
// 做法是 FLIP：CodeMirror 更新 DOM 之前记下每个可见行的位置，更新之后再量一次，
// 让每一行从旧位置滑到新位置。折叠、展开、上下移动、缩进、回车、删除都走这一套，不认具体命令。
//   · 新旧行怎么对上：先把旧行的位置按这次改动映射到新文档；对不上的（整行被删掉又插到别处，比如「上移一行」里被越过的那行）再按行文字找
//   · 对不上的新行 = 新出现的（展开出来的子项、新敲的行）；消失的行 = 折起来的、删掉的
//   · 这两种都用「卷帘」：下面的行滑上来（或滑下去）时，它的上边缘走到哪，就把这些行裁到哪，
//     所以是被一行一行盖住 / 露出，不淡入淡出，文字不会叠在一起
//   · 消失的行 CodeMirror 已经把节点摘掉了，拿来放进一个盖在内容区上的浮层里，留在原位置等着被盖住
//   · 内容区下面的东西（文末反链面板）跟着一起滑
//   · 输入法组字中、整篇文档被替换（切换文件）时不做
// 光标的过渡在 styles.css；行在滑的时候给编辑器加 om-moving，让光标和行同速
const { Plugin } = require("obsidian");
const { ViewPlugin } = require("@codemirror/view");

const MS = 200;                                  // 改这里要同时改 styles.css 里的 --om-ms
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)";
const SHOWN = "inset(0 0 0 0)", HIDDEN = "inset(0 0 100% 0)";

// 卷帘的时间点：rows 是一批要露出（reveal）或要盖住的行，idx 是它们在各自快照里的序号。
// 挨着的行算一段，帘子的边缘在整段时长里匀速（再套 EASE）扫过这一段；给每一行标上开始和结束被扫到的进度 0..1
function curtain(rows, reveal) {
  for (let i = 0; i < rows.length; ) {
    let j = i;
    while (j + 1 < rows.length && rows[j + 1].idx === rows[j].idx + 1) j++;
    const top = rows[i].row.top, bottom = rows[j].row.top + rows[j].row.height, h = bottom - top || 1;
    for (let k = i; k <= j; k++) {
      const r = rows[k].row;
      const a = reveal ? (r.top - top) / h : (bottom - r.top - r.height) / h;
      rows[k].from = Math.max(0, a);
      rows[k].to = Math.min(1, a + r.height / h);
    }
    i = j + 1;
  }
  return rows;
}

// 可见的每一块：内容区里的行和块级小部件，加上内容区下面的兄弟节点（pos 为负数，不随改动映射）。
// top / left 是排版位置；这一块正在滑的话，tx / ty 是它此刻离排版位置还差多少。
// ws 是行首的缩进字符，pad 是 Obsidian 给这一行写的列表缩进宽度
function snapshot(view, doc, anims) {
  const base = view.contentDOM.getBoundingClientRect();
  const rows = [];
  const add = (el, pos, text) => {
    const box = el.getBoundingClientRect();
    let tx = 0, ty = 0;
    if (anims.has(el)) {
      const m = new DOMMatrix(getComputedStyle(el).transform);
      tx = m.m41; ty = m.m42;
    }
    rows.push({
      el, pos, text, tx, ty,
      top: box.top - base.top - ty,
      left: box.left - base.left - tx,
      width: box.width,
      height: box.height,
      ws: text ? text.match(/^\s*/)[0] : "",
      pad: parseFloat(el.style.paddingInlineStart) || 0,
    });
  };
  for (const el of view.contentDOM.children) {
    if (el.classList.contains("cm-gap")) continue;
    const pos = Math.min(view.posAtDOM(el), doc.length);
    if (el.classList.contains("cm-line")) add(el, doc.lineAt(pos).from, doc.lineAt(pos).text);
    else add(el, pos, null);
  }
  let tail = -1;
  for (let el = view.contentDOM.parentElement.nextElementSibling; el; el = el.nextElementSibling) add(el, tail--, null);
  return rows;
}

const motion = ViewPlugin.fromClass(class {
  constructor() {
    this.before = null;       // 这一轮更新前的快照，位置已映射到当前文档
    this.skip = false;
    this.anims = new Map();   // 正在滑的块 → 它的动画
  }

  // CodeMirror 在改 DOM 之前调这里，所以这时量到的还是旧位置
  update(u) {
    if (!this.before) {
      if (u.view.composing) return;
      if (!u.docChanged && !u.transactions.some((tr) => tr.effects.length)) return;
      this.before = snapshot(u.view, u.startState.doc, this.anims);
      u.view.requestMeasure({ key: this, read: (v) => this.diff(v), write: (m, v) => this.play(m, v) });
    }
    for (const r of this.before) if (r.pos >= 0) r.pos = u.changes.mapPos(r.pos, 1);
    const len = u.startState.doc.length;
    if (u.docChanged && len && u.changes.touchesRange(0, len) === "cover") this.skip = true;
  }

  diff(view) {
    const before = this.before, skip = this.skip;
    this.before = null;
    this.skip = false;
    if (skip) return null;
    const doc = view.state.doc;
    const after = snapshot(view, doc, this.anims);

    // 旧行按映射后的位置归到新文档的行首（块级小部件用原位置）
    for (const r of before) {
      if (r.text !== null) r.pos = doc.lineAt(Math.min(r.pos, doc.length)).from;
    }
    // 三轮配对，文字一样的优先，免得整块搬动时按位置配错：
    // ① 位置和文字都对得上 ② 文字对得上（整行被删掉又插到别处）③ 只有位置对得上（这一行被改写了）
    const used = new Set();
    const match = new Map(), back = new Map();
    const pick = (a, ok) => {
      if (match.has(a)) return;
      const o = before.find((r) => !used.has(r) && (r.text === null) === (a.text === null) && ok(r));
      if (o) { used.add(o); match.set(a, o); back.set(o, a); }
    };
    for (const a of after) pick(a, (r) => r.pos === a.pos && r.text === a.text);
    for (const a of after) if (a.text) pick(a, (r) => r.text === a.text);
    for (const a of after) pick(a, (r) => r.pos === a.pos);

    // 每种缩进对应多宽，取改动前的值：刚改完那一刻 Obsidian 写在行上的缩进宽度会短暂出错，稍后它自己纠正，
    // 直接拿新旧宽度相减会让没动缩进的行平白横移一下
    const padOf = new Map();
    for (const r of before) if (r.text !== null && !padOf.has(r.ws)) padOf.set(r.ws, r.pad);

    const moves = [], fresh = [];
    let carry = 0;   // 上一块此刻离它新位置的纵向距离；夹在中间新出现的行跟着它走
    after.forEach((a, idx) => {
      const o = match.get(a);
      if (!o) {
        fresh.push({ row: a, idx });
        if (Math.abs(carry) >= 1) moves.push({ el: a.el, dx: 0, dy: carry });
        return;
      }
      // 排版位置没变：正在滑的接着滑，不打断（紧跟着来的第二次更新常常什么都没挪）
      if (o.el === a.el && o.ws === a.ws && Math.abs(o.top - a.top) < 1) { carry = a.ty; return; }
      // 变了：从它此刻看上去的位置出发
      const dx = o.tx + (o.ws !== a.ws && padOf.has(a.ws) ? o.pad - padOf.get(a.ws) : 0);
      const dy = carry = o.top + o.ty - a.top;
      if (Math.abs(dx) >= 1 || Math.abs(dy) >= 1 || this.anims.has(a.el)) moves.push({ el: a.el, dx, dy });
    });
    // 只有别的行也在动时才做卷帘：普通打字换行不闪
    if (!moves.length) return null;

    // 没配上、节点也已经不在页面里的旧行 = 折起来或删掉的；它跟着上一块留下来的行一起挪
    const gone = [];
    let shift = 0;
    before.forEach((r, idx) => {
      const a = back.get(r);
      if (a) shift = a.top - r.top;
      else if (r.text !== null && !r.el.isConnected) gone.push({ row: r, idx, shift });
    });
    let layer = null;
    if (gone.length) {
      const s = view.scrollDOM.getBoundingClientRect(), c = view.contentDOM.getBoundingClientRect();
      layer = { left: c.left - s.left + view.scrollDOM.scrollLeft, top: c.top - s.top + view.scrollDOM.scrollTop, width: c.width };
    }
    return { moves, fresh: curtain(fresh, true), gone: curtain(gone, false), layer };
  }

  play(m, view) {
    if (!m) return;
    const opt = { duration: MS, easing: EASE };
    for (const { el, dx, dy } of m.moves) {
      const old = this.anims.get(el);
      if (old) old.cancel();
      const a = el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], opt);
      this.anims.set(el, a);
      a.onfinish = () => { if (this.anims.get(el) === a) this.anims.delete(el); };
    }
    for (const { row, from, to } of m.fresh) {
      row.el.animate([{ clipPath: HIDDEN }, { clipPath: HIDDEN, offset: from }, { clipPath: SHOWN, offset: to }, { clipPath: SHOWN }], opt);
    }
    if (m.layer) {
      const layer = view.scrollDOM.createDiv({ cls: "cm-content om-ghosts", attr: { "aria-hidden": "true" } });
      layer.setCssStyles({ left: `${m.layer.left}px`, top: `${m.layer.top}px`, width: `${m.layer.width}px` });
      let last;
      for (const { row, from, to, shift } of m.gone) {
        row.el.setCssStyles({ position: "absolute", top: `${row.top}px`, left: `${row.left}px`, width: `${row.width}px` });
        layer.appendChild(row.el);
        last = row.el.animate([
          { clipPath: SHOWN, transform: "none" },
          { clipPath: SHOWN, offset: from },
          { clipPath: HIDDEN, offset: to },
          { clipPath: HIDDEN, transform: `translateY(${shift}px)` },
        ], { ...opt, fill: "forwards" });
      }
      last.onfinish = () => layer.remove();
    }
    view.dom.classList.add("om-moving");
    clearTimeout(this.timer);
    this.timer = setTimeout(() => view.dom.classList.remove("om-moving"), MS);
  }

  destroy() {
    for (const a of this.anims.values()) a.cancel();
    clearTimeout(this.timer);
  }
});

module.exports = class OutlineMotion extends Plugin {
  onload() {
    this.registerEditorExtension(motion);
  }
};
