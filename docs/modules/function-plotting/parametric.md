# 参数方程

参数方程通过引入一个独立参数 $t$，将坐标 $x$ 和 $y$ 分别表示为 $t$ 的函数：
$$ \begin{cases} x = x(t) \\ y = y(t) \end{cases} \quad t \in [t_{\min}, t_{\max}] $$

在 StuCanvas 中，参数方程的配置延续了组件化的设计。绘制一个二维参数方程需要挂载自变量区间、空间裁剪边界以及两个一维坐标分量函数。

## 创建参数方程对象

下述代码在画布上绘制一个标准的单位圆 $x = \cos t, y = \sin t$：

```cpp:line-numbers
import std;
import stucanvas;

using namespace StuCanvas;

STUCANVAS_MAIN(Canvas& canvas) {
    auto& graph = canvas.createSObjectGraph<double>();
    auto& func_2d = graph.createFunction2D(); // [!code ++]
    
    // 1. 定义自变量 t 的取值范围 [0, 2π]
    func_2d.addComponent_SamplingRange1D<double>(0.0, 6.28); // [!code ++]
    
    // 2. 定义视口画布的空间裁剪范围 [x_min, x_max, y_min, y_max]
    func_2d.addComponent_SamplingRange2D<double>(-1.5, 1.5, -1.5, 1.5); // [!code ++]
    
    // 3. 挂载 X 分量标量函数 x = cos(t)
    func_2d.addComponent_XFunction1D<double>([](double t) { // [!code ++]
        return std::cos(t); // [!code ++]
    }); // [!code ++]
    
    // 4. 挂载 Y 分量标量函数 y = sin(t)
    func_2d.addComponent_YFunction1D<double>([](double t) { // [!code ++]
        return std::sin(t); // [!code ++]
    }); // [!code ++]
};
```

### SamplingRange1D

`addComponent_SamplingRange1D<double>(t_min, t_max)` 定义参数 $t$ 的取值域。未挂载此资产时，引擎无法获取参数的自变量边界，不会生成任何图像。

### SamplingRange2D

参数方程同样需要挂载 `addComponent_SamplingRange2D<double>(x_min, x_max, y_min, y_max)`。它的主要作用是向渲染引擎声明**画布的视口裁剪边界**。引擎会据此对超出物理视口的曲线片段进行裁剪，避免产生无用的屏幕外绘制开销。

### XFunction1D 与 YFunction1D

分别通过 `addComponent_TXFunction1D` 和 `addComponent_YFunction1D` 挂载。它们各接收一个 `double(double)` 类型的可callable对象，分别代表参数 $t$ 映射到 $x$ 坐标与 $y$ 坐标的分量规律。


## 区间算术加速

对于参数方程，添加区间算术同样可以获得显著的性能提升：

```cpp:line-numbers
import std;
import stucanvas;

using namespace StuCanvas;

STUCANVAS_MAIN(Canvas& canvas) {
    auto& graph = canvas.createSObjectGraph<double>();
    auto& func_2d = graph.createFunction2D();
    func_2d.addComponent_SamplingRange1D<double>(0.0, 6.28);
    func_2d.addComponent_SamplingRange2D<double>(-1.5, 1.5, -1.5, 1.5);
    
    func_2d.addComponent_TXFunction2D<double>([](double t) {
        return std::cos(t);
    });
    func_2d.addComponent_TYFunction2D<double>([](double t) {
        return std::sin(t);
    });

    // 挂载 X 分量的区间评估函数 // [!code ++] [!code focus]
    func_2d.addComponent_XIntervalFunction1D([](Interval<double> t) { // [!code ++] [!code focus]
        return Interval::cos(t); // [!code ++] [!code focus]
    }); // [!code ++] [!code focus]

    // 挂载 Y 分量的区间评估函数 // [!code ++] [!code focus]
    func_2d.addComponent_YIntervalFunction1D([](Interval<double> t) { // [!code ++] [!code focus]
        return Interval::sin(t); // [!code ++] [!code focus]
    }); // [!code ++] [!code focus]
};
```

`addComponent_XIntervalFunction1D` 与 `addComponent_YIntervalFunction1D` 各自接收 `Interval<double>(Interval<double>)` 形式的区间评估函数。

### 无 Marching 机制的自适应剪枝

需要注意的是，参数方程在数学上是从 $1$ 维参数空间向 $2$ 维物理空间的“正向映射”，其拓扑结构不属于隐函数的二维标量场。因此，**参数方程在挂载区间算术后，并不会触发 Marching Squares 算法**。

取而代之的是，引擎会自动开启**自适应区间剪枝与细分算法**：
1. **区间剪枝（Pruning）**：引擎传入参数区间 $[t_a, t_b]$，通过区间函数快速计算出坐标响应区间 $X_{[t_a, t_b]}$ 与 $Y_{[t_a, t_b]}$。若该区域与 `SamplingRange2D` 定义的视口边界完全无交集，则整段参数分支会被直接丢弃。
2. **像素级自适应细分（Adaptive Subdivision）**：对于视口内的有效区间，引擎会根据当前相机的缩放级别（Zoom）进行自适应的分裂和采样，在保证渲染曲线平滑的同时，避免了传统离散工具由于固定采样步长带来的精度失真或计算冗余。



## 转化为 StuPlot 高阶算法

通过同时挂载**标量函数**、**区间评估函数**以及配置 **L-SHADE 全局优化算法**，引擎会自动升级为高级的 **StuPlot 混合寻优算法**：

```cpp:line-numbers
import std;
import stucanvas;

using namespace StuCanvas;

STUCANVAS_MAIN(Canvas& canvas) {
    auto& graph = canvas.createSObjectGraph<double>();
    auto& func_2d = graph.createFunction2D();
    func_2d.addComponent_SamplingRange1D<double>(0.0, 6.28);
    func_2d.addComponent_SamplingRange2D<double>(-1.5, 1.5, -1.5, 1.5);
    
    func_2d.addComponent_XFunction1D<double>([](double t) {
        return std::cos(t);
    });
    func_2d.addComponent_YFunction1D<double>([](double t) {
        return std::sin(t);
    });

    func_2d.addComponent_XIntervalFunction1D([](Interval<double> t) { 
        return Interval::cos(t); 
    });
    func_2d.addComponent_YIntervalFunction1D([](Interval<double> t) { 
        return Interval::sin(t); 
    });

    func_2d.addComponent_LSHADE(100,4,15000,0,0); // [!code ++] [!code focus]
};
```

对于参数方程，StuPlot 混合算法能表现出极高的拓扑追踪能力：
* L-SHADE 的多模态寻优群体在空间中自发寻找和逼近曲线，而区间算术组件则提供确定性的空间边界剪枝。
* 两者结合使算法能够高效解决高频振荡参数曲线或具有复杂自交（Self-intersection）结构的参数拓扑，防止出现漏点或线段断裂。


## 转化为纯全局优化算法

如果面对的是**黑盒标量方程**（例如包含无法推导区间算术的分支控制、递归、外部物理模拟输出的参数曲线），可以删除区间评估函数，仅保留标量计算和全局优化配置：

```cpp:line-numbers
import std;
import stucanvas;

using namespace StuCanvas;

STUCANVAS_MAIN(Canvas& canvas) {
    auto& graph = canvas.createSObjectGraph<double>();
    auto& func_2d = graph.createFunction2D();
    func_2d.addComponent_SamplingRange1D<double>(0.0, 6.28);
    func_2d.addComponent_SamplingRange2D<double>(-1.5, 1.5, -1.5, 1.5);
    
    func_2d.addComponent_XFunction1D<double>([](double t) {
        return std::cos(t);
    });
    func_2d.addComponent_YFunction1D<double>([](double t) {
        return std::sin(t);
    });

    func_2d.addComponent_TIntervalFunction1D([](Interval<double> t) { // [!code --]
        return Interval::cos(t); // [!code --]
    }); // [!code --]
    func_2d.addComponent_YIntervalFunction1D([](Interval<double> t) { // [!code --]
        return Interval::sin(t); // [!code --]
    }); // [!code --]

    func_2d.addComponent_LSHADE(100,4,15000,0,0); 
};
```

在此模式下，算法退化为**纯全局优化算法**。引擎完全依靠 L-SHADE 差分进化群体的探索，在参数定义域 $[t_{\min}, t_{\max}]$ 中自适应地搜索并点亮处于视口内的曲线坐标。该模式计算开销相对较高，但能够兼容任意形式的 C++ 标量逻辑。


## 转化为纯区间自适应算法

如果不需要 L-SHADE 的随机启发式搜索，可以同时移除 L-SHADE 算法组件和标量评估函数，只保留区间评估函数：

```cpp:line-numbers
import std;
import stucanvas;

using namespace StuCanvas;

STUCANVAS_MAIN(Canvas& canvas) {
    auto& graph = canvas.createSObjectGraph<double>();
    auto& func_2d = graph.createFunction2D();
    func_2d.addComponent_SamplingRange1D<double>(0.0, 6.28);
    func_2d.addComponent_SamplingRange2D<double>(-1.5, 1.5, -1.5, 1.5);
    
    func_2d.addComponent_XFunction1D<double>([](double t) { // [!code --]
        return std::cos(t); // [!code --]
    }); // [!code --]
    func_2d.addComponent_YFunction1D<double>([](double t) { // [!code --]
        return std::sin(t); // [!code --]
    }); // [!code --]

    func_2d.addComponent_XIntervalFunction1D([](Interval<double> t) { 
        return Interval::cos(t); 
    });
    func_2d.addComponent_YIntervalFunction1D([](Interval<double> t) { 
        return Interval::sin(t); 
    });

    func_2d.addComponent_LSHADE(100,4,15000,0,0); // [!code --]
};
```

移除 L-SHADE 后，引擎退化为**纯区间自适应算法**：
* 算法采用确定性的区间二分细分（Interval Bisection）来寻找定义域内的对应曲段。
* **优势**：它完全避免了随机全局优化算法所固有的随机性（Stochasticity），能保证每次渲染得到的点集和曲线逻辑完全一致，且计算开销远低于 L-SHADE，适合数学公式已知且能够写出区间形式的常规参数曲线。