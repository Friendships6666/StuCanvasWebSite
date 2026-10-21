# 求解器对象

上一章介绍了基本几何对象的创建与运行时修改。本章深入对象间的依赖关系，讲解依赖线对象和点对象的派生对象。

## 线段

以下创建一条完整线段：

```cpp:line-numbers
import stucanvas;

using namespace StuCanvas;

STUCANVAS_MAIN(Canvas& canvas) {
    auto& graph = canvas.createSObjectGraph<double>();
    auto& a = graph.createFreePoint2D(1.0, 2.0);
    auto& b = graph.createFreePoint2D(4.0, 5.0);
    auto& seg = graph.createSegment2D(a, b);
};
```

## 垂线与平行线

垂线和平行线均依赖一个线对象和一个点对象。线对象确定方向，点对象确定经过位置。

```cpp:line-numbers
import stucanvas;

using namespace StuCanvas;

STUCANVAS_MAIN(Canvas& canvas) {
    auto& graph = canvas.createSObjectGraph<double>();
    auto& a = graph.createFreePoint2D(1.0, 2.0);
    auto& b = graph.createFreePoint2D(4.0, 5.0);
    auto& seg = graph.createSegment2D(a, b);
    auto& c = graph.createFreePoint2D(6.0, 1.0);
    auto& perp = graph.createPerpendicularLine2D(seg, c); // [!code ++]
    auto& para = graph.createParallelLine2D(seg, c); // [!code ++]
};
```

| 方法 | 参数 | 含义 |
|---|---|---|
| `createPerpendicularLine2D` | 线对象 + 点对象 | 过点且垂直于给定线的直线 |
| `createParallelLine2D` | 线对象 + 点对象 | 过点且平行于给定线的直线 |

垂线和平行线均位于 DAG 依赖图的第三层——同时依赖线对象和点对象。线对象或点对象变更时，垂线和平行线自动重算位置与方向。

## 吸附点

```cpp:line-numbers
import stucanvas;

using namespace StuCanvas;

STUCANVAS_MAIN(Canvas& canvas) {
    auto& graph = canvas.createSObjectGraph<double>();
    auto& a = graph.createFreePoint2D(1.0, 2.0);
    auto& b = graph.createFreePoint2D(4.0, 5.0);
    auto& seg = graph.createSegment2D(a, b);
    auto& c = graph.createFreePoint2D(6.0, 1.0);
    auto& perp = graph.createPerpendicularLine2D(seg, c);
    auto& para = graph.createParallelLine2D(seg, c);
    auto& snap = graph.createSnappedPoint_2D(seg, 3.0, 1.0); // [!code ++]
};
```

`createSnappedPoint_2D` 接收一个几何对象和猜测坐标 `(x, y)`。猜测坐标用于初始状态，确定吸附到对象的哪个位置。

| 吸附目标 | 吸附依据 |
|---|---|
| 线段 / 射线 / 直线 | 参数 `t`（线上位置） |
| 圆 / 圆弧 | 参数 `theta`（角度） |

吸附点始终位于目标对象上。目标对象变更时吸附点跟随移动。更复杂的对象吸附留待后续章节。

## 交点

```cpp:line-numbers
import stucanvas;

using namespace StuCanvas;

STUCANVAS_MAIN(Canvas& canvas) {
    auto& graph = canvas.createSObjectGraph<double>();
    auto& a = graph.createFreePoint2D(1.0, 2.0);
    auto& b = graph.createFreePoint2D(4.0, 5.0);
    auto& seg = graph.createSegment2D(a, b);
    auto& c = graph.createFreePoint2D(6.0, 1.0);
    auto& perp = graph.createPerpendicularLine2D(seg, c);
    auto& para = graph.createParallelLine2D(seg, c);
    auto& snap = graph.createSnappedPoint_2D(seg, 3.0, 1.0);
    auto& circle = graph.createCircle2D_Radius(a, 3.0); // [!code ++]
    auto& isect = graph.createIntersectionPoint_2D(seg, circle, 3.0, 2.0); // [!code ++]
};
```

`createIntersectionPoint_2D` 接收两个几何对象和猜测坐标。猜测坐标用于确定吸附到哪个交点——始终取距离猜测位置最近的交点。两个对象变更时，交点自动重算并保持在最近交点位置。

## 切线

```cpp:line-numbers
import stucanvas;

using namespace StuCanvas;

STUCANVAS_MAIN(Canvas& canvas) {
    auto& graph = canvas.createSObjectGraph<double>();
    auto& a = graph.createFreePoint2D(1.0, 2.0);
    auto& b = graph.createFreePoint2D(4.0, 5.0);
    auto& seg = graph.createSegment2D(a, b);
    auto& c = graph.createFreePoint2D(6.0, 1.0);
    auto& perp = graph.createPerpendicularLine2D(seg, c);
    auto& para = graph.createParallelLine2D(seg, c);
    auto& snap = graph.createSnappedPoint_2D(seg, 3.0, 1.0);
    auto& circle = graph.createCircle2D_Radius(a, 3.0);
    auto& isect = graph.createIntersectionPoint_2D(seg, circle, 3.0, 2.0);
    auto& snap_c = graph.createSnappedPoint_2D(circle, 4.0, 3.0); // [!code ++]
    auto& tangent = graph.createTangentLine_2D(snap_c, circle); // [!code ++]
};
```

`createTangentLine_2D` 接收切点对象和被切对象。切点为吸附点或交点等约束点对象，被切对象为圆或圆弧等曲线。切线过切点且与被切对象在该点处相切。切点或被切对象变更时，切线自动重算。
