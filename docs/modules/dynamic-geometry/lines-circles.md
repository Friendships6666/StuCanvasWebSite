# 直线和圆

所有 StuCanvas 代码以模块导入开始：
```cpp:line-numbers
import stucanvas; // [!code ++]

using namespace StuCanvas; // [!code ++]
```

`import stucanvas;` 是 C++20 模块声明，取代 `#include`。编译器在处理 `import` 时只读取预编译的模块接口单元（BMI），不递归解析头文件，以此缩短编译时间。

后端代码编译为动态库，前端进程加载该动态库并将函数指针注入自身地址空间，前端内存数据在重载前后保持不变。

`STUCANVAS_MAIN` 是入口点宏，替代 `int main`。它展开为 C ABI 导出函数，供前端进程通过函数指针注入并调用。

```cpp:line-numbers
import stucanvas;

using namespace StuCanvas;

STUCANVAS_MAIN(Canvas& canvas) { // [!code ++]
}; // [!code ++]
```

## 有向无环图（DAG）

StuCanvas 的几何对象构建采用有向无环图（Directed Acyclic Graph）模型。每个几何对象作为图中的一个节点，对象之间的引用关系构成有向边。当上游节点（如自由点坐标）改变时，下游节点（如依该点定义的线段）自动重新计算。

这种依赖驱动设计是 Creo、SolidWorks 等工业 CAD 软件的主流架构。直接创建孤立对象需手动同步全部变更；依赖图则保证一次修改自动传播到所有相关节点，避免不一致。

GeoGebra 和几何画板同样采用依赖图模型：用户定义点，再由点派生线、圆等几何元素。

## SObjectGraph

```cpp:line-numbers
import stucanvas;

using namespace StuCanvas;

STUCANVAS_MAIN(Canvas& canvas) {
    auto& graph = canvas.createSObjectGraph<double>(); // [!code ++]
};
```

`double` 指浮点精度类型，对应 IEEE 754 双精度（f64）。模板参数支持 `float`（f32）和 `double`（f64），以及任意精度数值类型。

StuCanvas 内所有对象均为 `StuObject`，简写为 `SObject`。`createSObjectGraph` 是 SObject 容器，所有后续 SObject 均通过 `graph.create*` 创建。`graph` 必须在任何几何对象创建之前初始化，其在堆上分配，生命周期由 Canvas 统一管理。

## 自由点

```cpp:line-numbers
import stucanvas;

using namespace StuCanvas;

STUCANVAS_MAIN(Canvas& canvas) {
    auto& graph = canvas.createSObjectGraph<double>();
    auto& p1 = graph.createFreePoint2D(1.0, 2.0); // [!code ++]
    auto& p2 = graph.createFreePoint2D(4.0, 5.0); // [!code ++]
};
```

Graph 内所有对象共享同一世界坐标系。自由点（`FreePoint2D`）是没有几何约束的点，位于 DAG 依赖图的叶子层——不依赖其他几何对象，仅由坐标值定义。

`createFreePoint2D` 的数值精度与 `createSObjectGraph` 的模板参数保持一致。`createSObjectGraph<double>()` 下，点坐标类型为 `double`。

## 内存安全

`createFreePoint2D` 返回引用（`auto&`）。读者可能疑问：引用指向堆上对象，后续创建操作是否会使指针失效？

不会。StuCanvas 内部以内存池管理 SObject 生命周期，对象地址在存活期间恒定不变，不因后续分配而迁移。即使代码中丢失某个引用，仍可通过 `graph` 成员函数将指针重新取出。所有 SObject 由 Canvas 统一析构，不存在内存泄露。

## 线段

```cpp:line-numbers
import stucanvas;

using namespace StuCanvas;

STUCANVAS_MAIN(Canvas& canvas) {
    auto& graph = canvas.createSObjectGraph<double>();
    auto& p1 = graph.createFreePoint2D(1.0, 2.0);
    auto& p2 = graph.createFreePoint2D(4.0, 5.0);
    auto& seg = graph.createSegment2D(p1, p2); // [!code ++]
};
```

`createSegment2D` 接收两个 `FreePoint2D` 引用，返回 `Segment2D` 引用。线段是 DAG 依赖图的第二层——数据来源于两个自由点对象，而非坐标值。`p1` 或 `p2` 坐标变更时，线段自动重算位置。

## 射线与直线

```cpp:line-numbers
import stucanvas;

using namespace StuCanvas;

STUCANVAS_MAIN(Canvas& canvas) {
    auto& graph = canvas.createSObjectGraph<double>();
    auto& p1 = graph.createFreePoint2D(1.0, 2.0);
    auto& p2 = graph.createFreePoint2D(4.0, 5.0);
    auto& seg = graph.createSegment2D(p1, p2);
    auto& ray = graph.createRay2D(p1, p2); // [!code ++]
    auto& line = graph.createLine2D(p1, p2); // [!code ++]
};
```

三种线性对象均依赖两个自由点：

| 类型 | 方法 | 行为 |
|---|---|---|
| `Segment2D` | `createSegment2D` | 端点 p1 到 p2，有限长度 |
| `Ray2D` | `createRay2D` | 起点 p1，穿过 p2，单方向无限延伸 |
| `Line2D` | `createLine2D` | 穿过 p1 与 p2，双方向无限延伸 |

## 标签

```cpp:line-numbers
import stucanvas;

using namespace StuCanvas;

STUCANVAS_MAIN(Canvas& canvas) {
    auto& graph = canvas.createSObjectGraph<double>();
    auto& p1 = graph.createFreePoint2D(1.0, 2.0);
    auto& p2 = graph.createFreePoint2D(4.0, 5.0);
    auto& seg = graph.createSegment2D(p1, p2);
    auto& ray = graph.createRay2D(p1, p2);
    auto& line = graph.createLine2D(p1, p2);
    graph.modifyName(p1, "A"); // [!code ++]
    graph.modifyName(p2, "B"); // [!code ++]
    graph.modifyID(p1, 1); // [!code ++]
    graph.modifyID(p2, 2); // [!code ++]
};
```

每个 SObject 节点有一个名称（`name`）和一个标识符（`id`）。`graph.modifyName` 设置节点名称，`graph.modifyID` 设置节点 ID。

若未显式设置，名称取内部默认值，不同对象可重名。ID 也可重复，是否设置均属自愿。

## 查找

```cpp:line-numbers
import stucanvas;

using namespace StuCanvas;

STUCANVAS_MAIN(Canvas& canvas) {
    auto& graph = canvas.createSObjectGraph<double>();
    auto& p1 = graph.createFreePoint2D(1.0, 2.0);
    auto& p2 = graph.createFreePoint2D(4.0, 5.0);
    auto& seg = graph.createSegment2D(p1, p2);
    auto& ray = graph.createRay2D(p1, p2);
    auto& line = graph.createLine2D(p1, p2);
    graph.modifyName(p1, "A");
    graph.modifyName(p2, "B");
    graph.modifyID(p1, 1);
    graph.modifyID(p2, 2);
    auto result = graph.findByName("A").findByID(2).findByType(SObjectType::FreePoint2D).findEnd(); // [!code ++]
};
```

`graph.findByName` / `findByID` / `findByType` 组成链式调用，以 `.findEnd()` 终结，返回 `std::vector<const SObject&>`。每个链节逐级缩小匹配范围，按交集筛选。

`type` 为内置枚举类型（如 `SObjectType::FreePoint2D`），对应各 SObject 子类。该 API 用于批量获取同类对象，或引用丢失时重新获取指针。

`canvas` 同样支持 `modifyName` / `modifyID` 及链式查找，API 与 `graph` 一致。`canvas` 作为 `STUCANVAS_MAIN` 的参数引用不会丢失；若需存储 `graph` 引用，可通过 `canvas` 查找取回。

## 圆

```cpp:line-numbers
import stucanvas;

using namespace StuCanvas;

STUCANVAS_MAIN(Canvas& canvas) {
    auto& graph = canvas.createSObjectGraph<double>();
    auto& p1 = graph.createFreePoint2D(1.0, 2.0);
    auto& p2 = graph.createFreePoint2D(4.0, 5.0);
    auto& p3 = graph.createFreePoint2D(7.0, 3.0); // [!code ++]
    auto& seg = graph.createSegment2D(p1, p2);
    auto& ray = graph.createRay2D(p1, p2);
    auto& line = graph.createLine2D(p1, p2);
    graph.modifyName(p1, "A");
    graph.modifyName(p2, "B");
    graph.modifyID(p1, 1);
    graph.modifyID(p2, 2);
    auto result = graph.findByName("A").findByID(2).findByType(SObjectType::FreePoint2D).findEnd();
    auto& c1 = graph.createCircle2D_Radius(p1, 3.0); // [!code ++]
    auto& c2 = graph.createCircle2D_2Points(p1, p2); // [!code ++]
    auto& c3 = graph.createCircle2D_3Points(p1, p2, p3); // [!code ++]
};
```

不使用函数重载，每种构造模式对应独立方法名：

| 方法 | 参数 | 含义 |
|---|---|---|
| `createCircle2D_Radius` | 圆心 + 半径 | 第一个参数为圆心点，第二个为半径值 |
| `createCircle2D_2Points` | 两个点 | 第一个参数为圆心，第二个为圆周上一点 |
| `createCircle2D_3Points` | 三个点 | 三点确定一个圆 |

圆同样依赖自由点对象，圆心或圆周点变更时圆自动更新。

## 圆弧

```cpp:line-numbers
import stucanvas;

using namespace StuCanvas;

STUCANVAS_MAIN(Canvas& canvas) {
    auto& graph = canvas.createSObjectGraph<double>();
    auto& p1 = graph.createFreePoint2D(1.0, 2.0);
    auto& p2 = graph.createFreePoint2D(4.0, 5.0);
    auto& p3 = graph.createFreePoint2D(7.0, 3.0);
    auto& p4 = graph.createFreePoint2D(5.0, 1.0); // [!code ++]
    auto& seg = graph.createSegment2D(p1, p2);
    auto& ray = graph.createRay2D(p1, p2);
    auto& line = graph.createLine2D(p1, p2);
    graph.modifyName(p1, "A");
    graph.modifyName(p2, "B");
    graph.modifyID(p1, 1);
    graph.modifyID(p2, 2);
    auto result = graph.findByName("A").findByID(2).findByType(SObjectType::FreePoint2D).findEnd();
    auto& c1 = graph.createCircle2D_Radius(p1, 3.0);
    auto& c2 = graph.createCircle2D_2Points(p1, p2);
    auto& c3 = graph.createCircle2D_3Points(p1, p2, p3);
    auto& arc = graph.createArc2D_3Points(p1, p2, p4); // [!code ++]
    graph.modifyArcMajorMinor_2D(arc, ArcMajorMinor::Minor); // [!code ++]
};
```

`createArc2D_3Points` 的三个参数：

| 参数 | 含义 |
|---|---|
| 第一个点 | 圆心 |
| 第二个点 | 圆弧上的点，确定半径与起点方向 |
| 第三个点 | 确定圆心角，以圆心到该点的向量决定圆弧终止位置 |

圆弧默认为优弧（圆心角 ≥ 180°）。`graph.modifyArcMajorMinor_2D(arc, ArcMajorMinor::Minor)` 切换为劣弧，`ArcMajorMinor::Major` 恢复优弧。

## 动态更新

仅创建对象不足以实现动态几何——必须支持运行时变更。`graph.modify*` 系列函数负责此职责。

```cpp:line-numbers
import std;
import stucanvas;

using namespace StuCanvas;

STUCANVAS_MAIN(Canvas& canvas) {
    auto& graph = canvas.createSObjectGraph<double>();
    auto& p1 = graph.createFreePoint2D(1.0, 2.0);
    auto& p2 = graph.createFreePoint2D(4.0, 5.0);
    auto& p3 = graph.createFreePoint2D(7.0, 3.0);
    auto& p4 = graph.createFreePoint2D(5.0, 1.0);
    auto& seg = graph.createSegment2D(p1, p2);
    auto& ray = graph.createRay2D(p1, p2);
    auto& line = graph.createLine2D(p1, p2);
    graph.modifyName(p1, "A");
    graph.modifyName(p2, "B");
    graph.modifyID(p1, 1);
    graph.modifyID(p2, 2);
    auto result = graph.findByName("A").findByID(2).findByType(SObjectType::FreePoint2D).findEnd();
    auto& c1 = graph.createCircle2D_Radius(p1, 3.0);
    auto& c2 = graph.createCircle2D_2Points(p1, p2);
    auto& c3 = graph.createCircle2D_3Points(p1, p2, p3);
    auto& arc = graph.createArc2D_3Points(p1, p2, p4);
    graph.modifyArcMajorMinor_2D(arc, ArcMajorMinor::Minor);
    graph.modifyFreePoint_2D(p1, 10.0, 20.0); // [!code ++]
    auto new_parents = std::vector<const SObject&>{p3, p4}; // [!code ++]
    graph.modifyParents(seg, new_parents); // [!code ++]
};
```

### modifyFreePoint_2D

`graph.modifyFreePoint_2D(obj, x, y)` 更新自由点坐标。点坐标变更后，依赖该点的线段、射线、直线、圆、圆弧等下游节点被标记为脏节点，渲染时自动传播变化。

### modifyParents

`graph.modifyParents(obj, new_parents)` 替换对象的父节点引用。传入 `std::vector<const SObject&>` 指定新的依赖对象，对象将解绑原有父节点并绑定新节点。例如一个线段可重新指向新的两个自由点。
