# 世界映射与 RTS 变换

在 StuCanvas 中，几何图（Graph）中创建的所有几何对象均定义在其自身的**局部坐标系（Local Coordinate System）**中。对于普通的 2D 几何对象（如 2D 自由点、线段等），它们在局部空间中均被默认置于 **$z = 0$ 平面**。

为了将几何图形从局部空间映射到画布的统一世界空间，我们需要通过 `SObjectInstance` 挂载对应的 RTS（Rotation, Translation, Scale）变换。

值得注意的是：
*   **`SObjectInstance` 仅提供三维（3D）变换接口**。即使是处理 2D 几何对象，其世界映射也是通过 3D 的平移、旋转与缩放来完成的。
*   **无函数重载设计**：为了保证编译期强类型安全并避免复杂的重载决议冲突，StuCanvas 严格禁止在 RTS 接口中使用函数重载。每一个变换接口都拥有唯一的函数命名。
*   **精度自动推导**：RTS 接口在内部被设计为成员函数模板，其数值精度（如 `float` 或 `double`）会自动通过传入的实参进行编译期类型推导，以确保与关联的 `SObjectGraph<T>` 的数值精度保持一致。

---

## 创建并配置变换实例

下述代码定义了一个局部平面线段，并通过实参隐式推导 `double` 精度，配置其在 3D 画布世界空间中的几何变换：

```cpp:line-numbers
import std;
import stucanvas;

using namespace StuCanvas;

STUCANVAS_MAIN(Canvas& canvas) {
    // 1. 创建几何图，并指定数值精度为 double（几何对象默认处于 z = 0 平面）
    auto& graph_0 = canvas.createSObjectGraph<double>(); //
    auto& free_point_0 = graph_0.createFreePoint2D(0.0, 0.0); 
    auto& free_point_1 = graph_0.createFreePoint2D(2.0, 0.0); 
    auto& segment_0 = graph_0.createSegment2D(free_point_0, free_point_1);

    // 2. 创建渲染实例并关联几何对象 //[!code focus]
    auto& instance_0 = canvas.createSObjectInstance(); // [!code ++] [!code focus]
    instance_0.object = &segment_0;                   // [!code ++] [!code focus]

    // 3. 配置 3D RTS 变换参数（通过传入 double 型实参自动推导精度模板参数） // [!code ++] [!code focus]
    instance_0.setTranslation(1.5, 2.0, 0.0);                 // 平移 // [!code ++] [!code focus]
    instance_0.setRotationEulerDegrees(0.0, 0.0, 45.0);       // 旋转：绕 Z 轴旋转 45 度（角度制） // [!code ++] [!code focus]
    instance_0.setScaleNonUniform(1.5, 1.5, 1.0);             // 非等比缩放 // [!code ++] [!code focus]

}
```

---

## 默认变换行为与单位矩阵

当一个 `SObjectInstance` 被创建并关联了几何对象后，**若不显式调用任何 RTS 修改函数，该实例默认处于“单位变换”状态**：
*   平移量默认为 $(0, 0, 0)$
*   旋转量默认为单位四元数（不旋转）
*   缩放比例默认为 $(1, 1, 1)$

在这种默认状态下，**物体将保留在其原本的局部坐标位置上（即在 $z = 0$ 平面按原本的数值映射到画布中）而不发生任何偏移、偏转或缩放**。

---

## RTS 变换函数接口

由于禁止函数重载，StuCanvas 为每种变换行为定义了唯一的函数签名，并通过模板参数进行精度集成：

### 1. Translation（空间平移）

平移决定了局部原点在 3D 世界空间中的绝对落脚点。

*   **`template <typename T> void setTranslation(T x, T y, T z)`**
    将几何体平移至世界空间的坐标 $(x, y, z)$。
    对于 2D 几何对象，其 $z$ 分量通常设为 `0.0`。若传入非零的 $z$ 值，可以在画布上实现前后深度排序。

### 2. Rotation（空间旋转）

在 3D 空间中，平面的旋转通过绕 $Z$ 轴旋转来实现。接口根据旋转表达方式划分为不同的函数：

*   **`template <typename T> void setRotationEuler(T pitch, T yaw, T roll)`**
    使用弧度制的欧拉角设定旋转姿态。
*   **`template <typename T> void setRotationEulerDegrees(T pitch_deg, T yaw_deg, T roll_deg)`**
    使用角度制设定旋转姿态。例如在 2D 平面绘图时，传入 `setRotationEulerDegrees(0.0, 0.0, 45.0)` 表示绕 Z 轴偏转 $45^{\circ}$。
*   **`template <typename T> void setRotationQuaternion(T w, T x, T y, T z)`**
    通过传入四元数的四个分量直观设置空间姿态，避免万向锁并保证插值稳定性。

### 3. Scale（空间缩放）

缩放用于调节图形在世界画布中的大小：

*   **`template <typename T> void setScaleUniform(T s)`**
    对三个轴向进行等比、均匀的统一缩放。
*   **`template <typename T> void setScaleNonUniform(T sx, T sy, T sz)`**
    对三个轴向分别指定非等比缩放。对于处于 $z = 0$ 平面的 2D 对象，其 $z$ 方向缩放量（$sz$）设为 `1.0` 即可。

---