# 显函数与隐函数

本章难度较大，参数较多——StuCanvas 的函数绘制引擎设计极为复杂。

## 创建函数对象

```cpp:line-numbers{5-7}
import stucanvas;

STUCANVAS_MAIN(Canvas& canvas) {
    auto& graph = canvas.createSObjectGraph<double>();
    auto& func_2d = graph.createFunction2D();
    func_2d.addAsset_Range2D(0.0, 6.28, -1.0, 1.0);
    func_2d.addAsset_XFunction2D = [](double x) -> double { return std::sin(x); };
};
```

`createFunction2D` 通过 `graph` 创建，无参。`Function2D` 是 SObject，与所有几何对象一致，必须从 `graph.create*` 初始化。绘制函数图像需要两种资产：

### Range2D

`addAsset_Range2D(x_min, x_max, y_min, y_max)` 定义绘制区间。未挂载此资产时引擎不知道绘制范围，不会产生任何图像。

### XFunction2D

`addAsset_XFunction2D` 接收 `double(double)` 类型的可调用对象。上方 Lambda `std::sin(x)` 对应 $y = \sin x$。这是显函数绘制法：$y = f(x)$。

同理，$x = f(y)$ 使用 `addAsset_YFunction2D`，接收 `double(double)`，参数为 `y`，返回值对应 `x`。

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
