# Outline Motion（大纲动效）

**简体中文** · [English](#outline-motion)

编辑器里的行不再瞬移：折叠、展开、上下移动、缩进、回车、删除时，每一行从原来的位置滑到新位置，光标移动也带过渡。只加动画，不改笔记内容。

灵感来自 [Bike Outliner](https://www.hogbaysoftware.com/bike/)：这款 Mac 大纲软件在折叠、移动、缩进时的流畅动画让写大纲很有手感，这个插件想把这种手感带到 Obsidian 里。

**目录**

- [哪些地方会动](#哪些地方会动)
- [做法](#做法)
- [反馈与后续](#反馈与后续)

## 哪些地方会动

- **折叠 / 展开**：下面的行滑上来或滑下去。折起来的子项被滑上来的行一行一行盖住，展开的子项一行一行露出来；不淡入淡出，文字不会叠在一起。
- **上下移动、缩进、取消缩进、回车、删除**：受影响的每一行都滑到新位置，横向纵向都有。
- **光标**：换位置时滑过去，不瞬移。
- **笔记下方**：编辑区下面的东西（比如文末的反链区）跟着一起滑。

不认具体命令，只比较每个可见行改动前后的位置，所以别的插件做的折叠、移动也都有动画。

动画时长 200 毫秒。输入法组字中不做动画。打开和切换文档时默认没有动效；如果有需要，可以在设置里打开「在打开和切换文档时有动效」。

在桌面端测过；没有标成仅桌面端，但还没在手机上测过。

## 做法

在 CodeMirror 6 的 ViewPlugin 里用 FLIP：CodeMirror 改 DOM 之前记下每个可见行的位置，改完再量一次，用 `transform` 让每一行从旧位置滑到新位置。版式一步到位，动画只动 `transform` 和 `clip-path`，不会每帧重排整个工作区。

## 反馈与后续

想追踪后续功能、反馈问题、关注后续进展，欢迎关注我的 Twitter：[@Matsurimywaifu](https://x.com/Matsurimywaifu)。

---

# Outline Motion

[简体中文](#outline-motion大纲动效) · **English**

Lines in the Obsidian editor glide instead of jumping. When you fold, unfold, move, indent, add or delete lines, every line slides from where it was to where it ends up, and the cursor follows smoothly. It only adds animation: your notes are never changed.

Inspired by [Bike Outliner](https://www.hogbaysoftware.com/bike/), a Mac outliner whose smooth animations when folding, moving and indenting rows make outlining feel alive. This plugin brings that feel to Obsidian.

**Contents**

- [What moves](#what-moves)
- [How it works](#how-it-works)
- [Installation](#installation)
- [Feedback and updates](#feedback-and-updates)

## What moves

- **Fold / unfold**: the lines below slide up or down. Children being folded away are covered line by line by the lines sliding up; children being unfolded are revealed line by line. Nothing fades, so text never overlaps.
- **Move line up / down, indent / outdent, Enter, Backspace**: every affected line slides to its new place, horizontally as well as vertically.
- **Cursor**: glides to its new position instead of jumping.
- **Below the note**: anything rendered under the editor content (for example the backlinks section at the end of a note) slides along with the lines.

It works with any command or plugin that changes the text or folds, because it does not hook specific commands: it compares where each visible line was before an edit with where it is after.

Animations last 200 ms. Nothing is animated while you are composing with an input method. Opening and switching notes is not animated by default; you can turn on "Animate when opening and switching notes" in settings if you want it.

Tested on desktop. It is not marked desktop-only, but it has not been tested on mobile yet.

## How it works

It uses the FLIP technique inside a CodeMirror 6 view plugin: before CodeMirror updates the DOM it records the position of every visible line, measures again afterwards, and animates each line with a `transform` from the old position to the new one. Layout changes once; only transforms and `clip-path` animate, so the rest of the workspace is not reflowed on every frame.

## Installation

Search for **Outline Motion** in Settings → Community plugins, or copy `main.js`, `manifest.json` and `styles.css` from the latest release into `<vault>/.obsidian/plugins/outline-motion/`.

## Feedback and updates

To follow new features, send feedback or keep up with progress, follow me on Twitter: [@Matsurimywaifu](https://x.com/Matsurimywaifu).
