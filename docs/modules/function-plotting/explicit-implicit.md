# 显函数与隐函数

本章难度较大，参数较多——StuCanvas 的函数绘制引擎设计极为复杂。

## 创建函数对象

```cpp:line-numbers
import std;
import stucanvas;

using namespace StuCanvas;

STUCANVAS_MAIN(Canvas& canvas) {
    auto& graph = canvas.createSObjectGraph<double>();
    auto& func_2d = graph.createFunction2D(); // [!code ++]
    func_2d.addComponent_SamplingRange2D(0.0, 6.28, -1.0, 1.0); // [!code ++]
    
    func_2d.addComponent_XFunction2D<double>([](double x) { // [!code ++]
    return std::sin(x); // [!code ++]
    }); // [!code ++]
};
```

`createFunction2D` 通过 `graph` 创建，无参。`Function2D` 是 SObject，与所有几何对象一致，必须从 `graph.create*` 初始化。绘制函数图像需要两种资产：

### SamplingRange2D

`addComponent_SampingRange2D<double>(x_min, x_max, y_min, y_max)` 定义绘制区间。未挂载此资产时引擎不知道绘制范围，不会产生任何图像。

### XFunction2D

`addComponent_XFunction2D` 接收 `double(double)` 类型的可调用对象。上方 Lambda `std::sin(x)` 对应 $y = \sin x$。这是显函数绘制法：$y = f(x)$。同理，$x = f(y)$ 使用 `addComponent_YFunction2D`。

## 绘制算法

StuCanvas 内置以下函数绘制算法：

<div class="feature-table">

| 算法 | 2D | 3D | 输出 | 性能 | 可去间断点 | 无穷渐近线 | 高频率 | 自交 | NaN渐近线 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 简单采样 | <span class="sup-yes"></span> | <span class="sup-yes"></span> | 线段带 / 面 / 点云 | 快 | <span class="sup-yes"></span> | <span class="sup-no"></span> | <span class="sup-no"></span> | <span class="sup-mix"></span> | <span class="sup-no"></span> |
| Marching | <span class="sup-yes"></span> | <span class="sup-yes"></span> | 线段带 / 面 / 点云 | 慢 | <span class="sup-yes"></span> | <span class="sup-no"></span> | <span class="sup-no"></span> | <span class="sup-mix"></span> | <span class="sup-no"></span> |
| 区间算术 Marching | <span class="sup-yes"></span> | <span class="sup-yes"></span> | 线段带 / 面 / 点云 | 最快 | <span class="sup-yes"></span> | <span class="sup-no"></span> | <span class="sup-no"></span> | <span class="sup-mix"></span> | <span class="sup-no"></span> |
| 全局优化 | <span class="sup-yes"></span> | <span class="sup-yes"></span> | 点云 | 慢 | <span class="sup-yes"></span> | <span class="sup-no"></span> | <span class="sup-yes"></span> | <span class="sup-yes"></span> | <span class="sup-no"></span> |
| StuPlot算法 | <span class="sup-yes"></span> | <span class="sup-yes"></span> | 点云 | 最慢 | <span class="sup-yes"></span> | <span class="sup-yes"></span> | <span class="sup-yes"></span> | <span class="sup-yes"></span> | <span class="sup-yes"></span> |
| 区间算术 | <span class="sup-yes"></span> | <span class="sup-yes"></span> | 点云 | 慢 | <span class="sup-no"></span> | <span class="sup-yes"></span> | <span class="sup-yes"></span> | <span class="sup-yes"></span> | <span class="sup-yes"></span> |

</div>

自交一列：返回点云的算法通过 SDF 渲染，可被视为正确处理自交情况。

默认使用简单采样算法。后续章节介绍如何配置更高级的绘制方式。

## 隐函数

下述 $f(x,y) = y - \sin x$ 使用 Marching Squares 算法绘制。资产由显函数 `addComponent_XFunction2D<double>` 替换为隐函数 `addComponent_XYFunction2D<double>`：

```cpp:line-numbers
import std;
import stucanvas;

using namespace StuCanvas;

STUCANVAS_MAIN(Canvas& canvas) {
    auto& graph = canvas.createSObjectGraph<double>();
    auto& func_2d = graph.createFunction2D();
    func_2d.addComponent_SamplingRange2D<double>(0.0, 6.28, -1.0, 1.0);
    func_2d.addComponent_XFunction2D<double>([](double x) { // [!code --]
    return std::sin(x); // [!code --]
    }); // [!code --]
    func_2d.addComponent_XYFunction2D<double>([](double x, double y) { // [!code ++]
    return y - std::sin(x); // [!code ++]
    }); // [!code ++]
};
```

`addComponent_XYFunction2D<double>` 接收 `[](double x, double y) -> double`，即 $f(x, y)$ 形式的隐函数。Lambda 对应 $y - \sin x = 0$，等价于 $y = \sin x$。

## 区间算术加速

```cpp:line-numbers
import std;
import stucanvas;

using namespace StuCanvas;

STUCANVAS_MAIN(Canvas& canvas) {
    auto& graph = canvas.createSObjectGraph<double>();
    auto& func_2d = graph.createFunction2D();
    func_2d.addComponent_SamplingRange2D<double>(0.0, 6.28, -1.0, 1.0);
    
    func_2d.addComponent_XYFunction2D<double>([](double x, double y) { 
    return y - std::sin(x);
    });
    
    func_2d.addComponent_XYIntervalFunction2D([](Interval<double> x, Interval<double> y) { // [!code ++] [!code focus]
    return y - Interval::sin(x); // [!code ++] [!code focus]
    }); // [!code ++] [!code focus]
};
```

`addComponent_XYIntervalFunction2D` 接收 `[](Interval<double> x, Interval<double> y) -> Interval<double>`。使用此组件需提供正确的区间算术运算函数，或将原函数的数值范围包装为 `StuCanvas::IntervalSet<double>` 对象。

增加该组件后，算法自动升级为区间算术 Marching Squares，性能提升数十倍，渲染质量不变。




## 转化为StuPlot高阶算法

```cpp:line-numbers
import std;
import stucanvas;

using namespace StuCanvas;

STUCANVAS_MAIN(Canvas& canvas) {
    auto& graph = canvas.createSObjectGraph<double>();
    auto& func_2d = graph.createFunction2D();
    func_2d.addComponent_SamplingRange2D<double>(0.0, 6.28, -1.0, 1.0);
    
    func_2d.addComponent_XYFunction2D<double>([](double x, double y) { 
    return y - std::sin(x);
    });
    
    func_2d.addComponent_XYIntervalFunction2D([](Interval<double> x, Interval<double> y) { 
    return y - Interval::sin(x); 
    });

    func_2d.addComponent_LSHADE(100,4,15000,0,0); // [!code ++] [!code focus]
};
```
`addComponent_LSHADE` 用于为函数配置 **L-SHADE 全局优化算法**。

该算法就像是一群“探路者”在画布上随机摸索并寻找函数图像。其配置参数如下：

* **`100` （初始探路者数量）**：算法刚启动时，在画布上一次性撒下多少个“探路者”（初始种群）。点撒得越多，越不容易漏掉复杂的函数图像细节，但计算也会变慢。
* **`4` （保底探路者数量）**：随着计算的进行，算法会聪明地逐渐淘汰掉那些迷路的探路者，但无论怎么精简，场上最少也要留下多少个探路者（最小种群）继续坚守，防止彻底失去活力。
* **`15000` （最大尝试次数）**：最大进化/迭代次数。这群探路者在画布上最多折腾多少代。一旦达到这个上限就会强制收工，防止算力无限空转。
* **`0` （多线程加速核心数）**：控制计算时占用你电脑的几个 CPU 核心。写 `0` 代表自动调用你电脑上的所有 CPU 核心进行并行加速计算，内存占用较高。
* **`0` （随机数种子）**：控制探路者们初始撒点的位置。



## 转化为Tupper经典区间算术算法

```cpp:line-numbers
import std;
import stucanvas;

using namespace StuCanvas;

STUCANVAS_MAIN(Canvas& canvas) {
    auto& graph = canvas.createSObjectGraph<double>();
    auto& func_2d = graph.createFunction2D();
    func_2d.addComponent_SamplingRange2D<double>(0.0, 6.28, -1.0, 1.0);
    
    func_2d.addComponent_XYFunction2D<double>([](double x, double y) {  // [!code --] 
    return y - std::sin(x); // [!code --]
    }); // [!code --]
    
    func_2d.addComponent_XYIntervalFunction2D([](Interval<double> x, Interval<double> y) { 
    return y - Interval::sin(x); 
    });

    func_2d.addComponent_LSHADE(100,4,15000,0,0); // [!code --]
};
```
删除全局优化配置参数，和标量计算函数，只保留区间计算函数，则转化为Jeff Tupper经典算法，此算法在性能和质量与平衡上表现的非常不错。

但缺点由此可见，它强制要求你必须提供一个区间评估函数，如果一个函数存在大量分支，递归，或者无法写出区间算术，Tupper算法严重受限。



## 转化为纯全局优化算术算法

```cpp:line-numbers
import std;
import stucanvas;

using namespace StuCanvas;

STUCANVAS_MAIN(Canvas& canvas) {
    auto& graph = canvas.createSObjectGraph<double>();
    auto& func_2d = graph.createFunction2D();
    func_2d.addComponent_SamplingRange2D<double>(0.0, 6.28, -1.0, 1.0);
    
    func_2d.addComponent_XYFunction2D<double>([](double x, double y) { 
    return y - std::sin(x);
    }); 
    
    func_2d.addComponent_XYIntervalFunction2D([](Interval<double> x, Interval<double> y) {   // [!code --]
    return y - Interval::sin(x);   // [!code --]
    });  // [!code --]

    func_2d.addComponent_LSHADE(100,4,15000,0,0); 
};
```
只保留标量计算函数，和全局优化配置，即可，此方法适合黑盒标量函数。



## 实时自适应细分：为什么无需设置“采样步长”？

很多接触过 **Manim** 或其他传统绘图  （如 matplotlib）的开发者*，在编写上述代码时可能会产生一个疑问：*

> **“为什么在创建 `Function2D` 时，我不需要指定诸如‘采样点数’（如 `num_points`）或‘采样步长’（如 `dx` / `step_size`）这样的参数？”**

这是 StuCanvas 的函数渲染引擎与传统工具最为核心的区别之一：

### 1. 传统离散工具的局限（以 Manim 为例）
传统的数学动画和绘图工具通常采用**预先均匀离散化**的策略。当用户定义一个函数时，引擎会按照用户指定的固定步长在定义域内均匀采样（例如固定采样 100 个点，再用线段相连）。
* 如果图像在后续被相机放大，或者函数在某些区域存在剧烈的高频振荡，固定的步长就会暴露出严重的**折线、锯齿感**，甚至丢失波峰数据。而盲目调小步长又会造成极大的内存与算力浪费。

### 2. StuCanvas 的自动矢量化引擎
在 StuCanvas 中，只要用户不需要对函数提取具体的离散数值点进行额外的分析，仅仅是为了高画质渲染，那么**细分程度的计算将由引擎完全自适应接管**：
* **免干涉平滑体验**：StuCanvas 拥有精密的**自动矢量化引擎**。它会在渲染阶段实时结合当前的**相机视距（Zoom 级别）**、**视口分辨率**以及**函数的局部曲率（变化率）**，自适应计算并插值。
* **像素级抗锯齿**：引擎能确保曲线在屏幕空间内始终以“像素级平滑”展现。无论用户如何拉近、推远镜头，图像边缘永远平滑圆润，完全无需开发者在代码中手动干涉任何细分程度参数。



<style scoped>
/* ==================== 1. 基础结构与组件覆盖 ==================== */
.feature-table td span {
  display: none !important;
}

.feature-table {
  margin: 2rem 0;
  overflow-x: auto;
}

.feature-table table {
  border-collapse: collapse !important;
  width: 100%;
  font-size: 0.9rem;
  border: none !important;
}


/* ==================== 🌞 浅色模式样式（优雅、清晰） ==================== */
.feature-table th,
.feature-table td {
  border: 1px solid #e2e8f0 !important; /* 柔和的浅灰色分割线 */
  padding: 12px 8px !important;
  text-align: center;
  vertical-align: middle !important;
}

/* 描述性列：浅灰色背景 + 深灰色文字 */
.feature-table td {
  background-color: #f8f9fa !important;
  color: #212529 !important;
}

.feature-table th {
  background-color: #f1f3f5 !important;
  color: #212529 !important;
  font-weight: 600 !important;
}

/* 🟢 支持 (sup-yes) -> 经典浅绿 */
.feature-table td:has(.sup-yes) {
  background-color: #a3fca3 !important;
  color: #0b510b !important;
  font-weight: bold;
}
.feature-table td:has(.sup-yes)::after {
  content: "Yes";
}

/* 🔴 不支持 (sup-no) -> 经典浅红 */
.feature-table td:has(.sup-no) {
  background-color: #ffb3b3 !important;
  color: #7d1515 !important;
}
.feature-table td:has(.sup-no)::after {
  content: "—";
}

/* 🟡 混合支持 (sup-mix) -> 经典浅黄 */
.feature-table td:has(.sup-mix) {
  background-color: #ffd880 !important;
  color: #7d5100 !important;
  font-weight: bold;
}
.feature-table td:has(.sup-mix)::after {
  content: "Mix";
}


/* ==================== 🌙 深色模式样式（高级半透荧光配色） ==================== */
html.dark .feature-table th,
html.dark .feature-table td {
  /* 替换掉刺眼的白线，改为暗灰色精致边框 */
  border: 1px solid #2d2d30 !important; 
}

/* 描述性列：彻底变为沉稳的暗灰底色，文字提亮为高对比浅灰，彻底解决看不清的问题 */
html.dark .feature-table td {
  background-color: #1a1a1e !important;
  color: #cbd5e1 !important;
}

html.dark .feature-table th {
  background-color: #252529 !important;
  color: #ffffff !important;
}

/* 🟢 Yes 状态：半透明翡翠绿底色 + 浅薄荷绿荧光文字 */
html.dark .feature-table td:has(.sup-yes) {
  background-color: rgba(46, 125, 50, 0.25) !important;
  color: #81c784 !important;
  font-weight: bold;
}

/* 🔴 — 状态：半透明珊瑚红底色 + 柔和粉红文字 */
html.dark .feature-table td:has(.sup-no) {
  background-color: rgba(198, 40, 40, 0.18) !important;
  color: #e57373 !important;
}

/* 🟡 Mix 状态：半透明暖橙底色 + 柔和琥珀黄文字 */
html.dark .feature-table td:has(.sup-mix) {
  background-color: rgba(239, 108, 0, 0.18) !important;
  color: #ffb74d !important;
  font-weight: bold;
}
</style>