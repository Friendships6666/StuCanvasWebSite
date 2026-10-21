# 三维物体

## 自由点

```cpp:line-numbers
import stucanvas;

using namespace StuCanvas;

STUCANVAS_MAIN(Canvas& canvas) {
    auto& graph = canvas.createSObjectGraph<double>();
    auto& p1 = graph.createFreePoint3D(1.0, 2.0, 3.0);
    auto& p2 = graph.createFreePoint3D(4.0, 5.0, 6.0);
    auto& p3 = graph.createFreePoint3D(7.0, 3.0, 2.0);
};
```

`createFreePoint3D` 创建三维自由点，参数为 `(x, y, z)`。与二维自由点相同，位于 DAG 叶子层，无几何约束。

## 平面

平面对象由两个向量张成：第一个参数为起点，后两个参数为终点，三点构成空间中的平面区域。

```cpp:line-numbers
import stucanvas;

using namespace StuCanvas;

STUCANVAS_MAIN(Canvas& canvas) {
    auto& graph = canvas.createSObjectGraph<double>();
    auto& a = graph.createFreePoint3D(0.0, 0.0, 0.0);
    auto& b = graph.createFreePoint3D(3.0, 0.0, 0.0);
    auto& c = graph.createFreePoint3D(0.0, 4.0, 0.0);
    auto& inf_plane = graph.createInfinitePlane_3D(a, b, c); // [!code ++]
    auto& tri_plane = graph.createTrianglePlane_3D(a, b, c); // [!code ++]
    auto& para_plane = graph.createParallelogramPlane_3D(a, b, c); // [!code ++]
};
```

| 方法 | 参数 | 含义 |
|---|---|---|
| `createInfinitePlane_3D` | 起点 + 两终点 | 由两个向量张成的无限平面 |
| `createTrianglePlane_3D` | 起点 + 两终点 | 三点围成的三角形区域 |
| `createParallelogramPlane_3D` | 起点 + 两终点 | 起点与两向量张成的平行四边形区域 |

三个点均为 `FreePoint3D` 引用。点坐标变更时平面自动更新。

## 三维求解器

三维空间中的直线创建方式与二维一致（`createSegment2D` → `createSegment3D`，`createLine2D` → `createLine3D`，`createRay2D` → `createRay3D`）。求解器对象的变化如下：

| 二维 | 三维 |
|---|---|
| `createPerpendicularLine2D` | `createPerpendicularPlane_3D`（垂面） |
| `createParallelLine2D` | `createParallelPlane_3D`（平行面） |
| — | `createNormalLine_3D`（法线） |
| `createTangentLine_2D` | `createTangentLine_3D`（切线）、`createTangentPlane_3D`（切平面） |
| `createIntersectionPoint_2D` | `createIntersectionPoint_3D`（交点） |
| — | `createIntersectionCurve_3D`（交线） |

三维不再提供垂线和平行线，改为垂面和平行面（依赖面对象和点对象）。法线依赖面对象和点对象，过点垂直于面。三维切线作用于拓扑维度为 1 的曲线，切平面作用于拓扑维度为 2 的曲面（如球体）。交点仍可用，新增交线用于求解两个三维物体之间的相交曲线。

## 圆柱与圆锥

```cpp:line-numbers
import stucanvas;

using namespace StuCanvas;

STUCANVAS_MAIN(Canvas& canvas) {
    auto& graph = canvas.createSObjectGraph<double>();
    auto& a = graph.createFreePoint3D(0.0, 0.0, 0.0);
    auto& b = graph.createFreePoint3D(0.0, 0.0, 5.0);
    auto& c = graph.createFreePoint3D(0.0, 0.0, 3.0);
    auto& cylinder = graph.createCylinder_3D(a, b, 2.0); // [!code ++]
    auto& cone = graph.createCone_3D(c, b, 30.0, 3.0); // [!code ++]
};
```

| 方法 | 参数 | 含义 |
|---|---|---|
| `createCylinder_3D` | 两中心点 + 半径 | 两点定义中心轴方向，半径定义柱体粗细 |
| `createCone_3D` | 两中心点 + 张角 + 高度 | 两点定义中心轴方向，张角（度）和高度定义锥体形状 |

## 球体

```cpp:line-numbers
import stucanvas;

using namespace StuCanvas;

STUCANVAS_MAIN(Canvas& canvas) {
    auto& graph = canvas.createSObjectGraph<double>();
    auto& a = graph.createFreePoint3D(1.0, 0.0, 0.0);
    auto& b = graph.createFreePoint3D(0.0, 1.0, 0.0);
    auto& c = graph.createFreePoint3D(0.0, 0.0, 1.0);
    auto& center = graph.createFreePoint3D(0.0, 0.0, 0.0);
    auto& s1 = graph.createSphere_3D_Radius(center, 4.0); // [!code ++]
    auto& s2 = graph.createSphere_3D_4Points(a, b, c, center); // [!code ++]
};
```

| 方法 | 参数 | 含义 |
|---|---|---|
| `createSphere_3D_Radius` | 球心 + 半径 | 球心点与半径值 |
| `createSphere_3D_4Points` | 四个点 | 四点确定一个球体 |

## 柏拉图多面体

```cpp:line-numbers
import stucanvas;

using namespace StuCanvas;

STUCANVAS_MAIN(Canvas& canvas) {
    auto& graph = canvas.createSObjectGraph<double>();
    auto& center = graph.createFreePoint3D(0.0, 0.0, 0.0);
    auto& tetra = graph.createTetrahedron_3D(center, 2.0); // [!code ++]
    auto& cube = graph.createCube_3D(center, 2.0); // [!code ++]
    auto& octa = graph.createOctahedron_3D(center, 2.0); // [!code ++]
    auto& dodeca = graph.createDodecahedron_3D(center, 2.0); // [!code ++]
    auto& icosa = graph.createIcosahedron_3D(center, 2.0); // [!code ++]
};
```

面数内置于函数名，参数为中心点和边长：

| 方法 | 面数 |
|---|---|
| `createTetrahedron_3D` | 4（正四面体） |
| `createCube_3D` | 6（正六面体） |
| `createOctahedron_3D` | 8（正八面体） |
| `createDodecahedron_3D` | 12（正十二面体） |
| `createIcosahedron_3D` | 20（正二十面体） |