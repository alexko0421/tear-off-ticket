# Tear-off Ticket 撕票

[English](https://github.com/alexko0421/tear-off-ticket/blob/main/README.md) | 中文

一张票，票根从一角撕到另一角，齿孔像果冻一样一节一节拉断。

**[在线试玩 →](https://alexko0421.github.io/tear-off-ticket/)**

按住票根往外拉：票根会离开桌面，绕着远端的一角转动，齿孔被拉长，一节接一节断开。主票也会被拉过去一点，每断一节就弹回原位。中途松手，票根会带着剩下的齿孔弹回去；完全撕下后松手，它会像纸一样晃着飘落。

- 零依赖核心(未压缩约 24 KB),任何框架都能用，不用框架也行
- 在核心之上提供 React 组件
- 键盘：聚焦票根后按 Enter 或空格
- `prefers-reduced-motion`:票根直接消失，没有拉伸和飘落

## 安装

```bash
npm install tear-off-ticket
```

## React

```tsx
import { TearOffTicket } from "tear-off-ticket/react";
import "tear-off-ticket/style.css";

<TearOffTicket
  stub={<div className="stub">Seat F12</div>}
  jelly={50}
  joints={7}
  onTorn={() => console.log("torn")}
>
  <div className="main">Late Show</div>
</TearOffTicket>
```

用 ref 调用 `tear()` 和 `reset()`:

```tsx
const ticket = useRef<TearOffTicketHandle>(null);
<button onClick={() => ticket.current?.tear()}>Tear</button>
```

| 属性 | 默认值 | 说明 |
| --- | --- | --- |
| `children` | | 留下的主票部分 |
| `stub` | | 被撕下的票根 |
| `jelly` | `50` | 0–100。齿孔断开前能拉多长，以及晃动的程度 |
| `joints` | `7` | 齿孔上的节数，2–16 |
| `radius` | `20` | 外圆角半径，px |
| `notch` | `10` | 缺口半径，px |
| `theme` | `"light"` | `"light"` 或 `"dark"` |
| `autoReset` | `false` | 撕下后隔多少毫秒自动复原 |
| `stubLabel` | `"Tear off the stub"` | 票根的无障碍名称 |
| `className`、`style` | | 传给 `.tot` 根元素 |
| `onJointBreak` | | `(index, remaining) => void` |
| `onDetach` | | 最后一节断开 |
| `onTorn` | | 票根已经消失 |
| `onReset` | | 票根已经复原 |

## 不用 React

```html
<link rel="stylesheet" href="tear-off-ticket/style.css" />

<div class="tot" id="ticket">
  <div class="tot-main">…</div>
  <div class="tot-stub">…</div>
</div>

<script type="module">
  import { createTearOff } from "tear-off-ticket";

  const ticket = createTearOff(document.getElementById("ticket"), { jelly: 60, joints: 6 });
  // ticket.tear(), ticket.reset(), ticket.update({ jelly: 80 }), ticket.destroy()
</script>
```

票的尺寸由内容决定，`.tot-main` 和 `.tot-stub` 要设成同样高度。核心会把票根包进一个 `.tot-lift` 元素，让它能浮起并投下自己的阴影；如果不想让它改动你的 DOM,可以自己写好这层包装。

## 样式

所有视觉参数都是 `.tot` 上的 CSS 变量:

```css
.tot {
  --tot-paper: #fff;   /* 票面颜色，拉长的齿孔也用这个颜色 */
  --tot-ink: #121212;
  --tot-muted: #8c8c8c;
  --tot-perf: rgb(0 0 0 / 0.3);  /* 齿孔圆点 */
  --tot-radius: 20px;
  --tot-notch: 10px;
}
```

在 `.tot` 上加 `data-theme="dark"` 切换到深色。

## 原理

票根是一个小刚体(位置、角度、速度),以 480 Hz 步进模拟。每一节齿孔都是一根弹簧，连接主票边缘上的一点和票根边缘上对应的一点：抗滑动方向很硬，抗张开方向较软。票根不能压进主票，所以一拉就会绕着仍然顶住的那个角转动，远端的齿孔先张开。

齿孔拉票根多少力，就以同样的力反拉主票。主票较重，被一根很硬的弹簧(相当于桌面)固定住，所以会朝你的手滑动几个像素，每断一节就弹回原位。

齿孔只会在撕裂前沿断开。最先断的是拉伸先超过极限的那一端；之后前沿一节一节走向另一端，每两次断开之间有短暂间隔。每一节断开后分成两半果冻，各自弹回自己的边缘。

每次撕都会生成一条新的撕裂线，两半共用同一条线，所以能严丝合缝地拼回去。每个齿孔在两边都变成半圆形的凹口，孔与孔之间的线带着随机的短纤维弯曲。边缘凹进去的地方用 mask 切掉；纤维伸出元素框外的地方由覆盖层补上。

撕下后，票根在轻重力和强空气阻力下落，一边左右摆动，一边在 3D 中晃动。

所有动画只用 `transform`、`opacity` 和票根上的 drop-shadow。拉长的齿孔是画在接缝上、与票面同色的 SVG 路径。

## 开发

```bash
npm install
npm run dev     # demo 在 http://localhost:5173
npm run build   # 构建库到 dist/
```

## 致谢

灵感来自 [Lorenzo Cabra](https://x.com/cabralorenzo) 在 [bencho.dev](https://bencho.dev) 上的 Tear-off Ticket。本项目是从零开始的独立实现，不包含任何 Bencho 的代码。

## 许可证

MIT
