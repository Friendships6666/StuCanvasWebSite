# 快速开始

以下代码绘制一条静态线段，持续 1 秒，随后消失。

```cpp:line-numbers
import stucanvas;

// 入口函数：接收 Canvas 引用
STUCANVAS_MAIN(Canvas& canvas) {
    // 创建 Clip，帧范围 0-60，60 FPS → 持续 1 秒
    auto& clip_0 = canvas.createClip_Frame(0, 60);
    canvas.fps = 60;

    // 创建几何图，全部使用 auto& 接收引用
    auto& graph_0 = canvas.createSObjectGraph<double>();
    auto& free_point_0 = graph_0.createFreePoint2D(2.3, 4.0);
    auto& free_point_1 = graph_0.createFreePoint2D(6.0, 7.2);
    auto& segment_0 = graph_0.createSegment2D(free_point_0, free_point_1);

    // 将几何对象转换为渲染实例
    auto& instance_0 = canvas.createSObjectInstance();

    // 配置外观属性（点号访问成员）
    auto& appearance_segment = canvas.createSObjectAppearance(SObjectAppearanceMode::Common);
    appearance_segment.line_width = 0.2f;
    appearance_segment.rgba.r = 0.3f;
    appearance_segment.rgba.g = 0.3f;
    appearance_segment.rgba.b = 0.3f;
    appearance_segment.rgba.a = 1.0f;

    // 关联实例与外观、几何对象
    instance_0.appearance = &appearance_segment;
    instance_0.object = &segment_0;

    // 将实例提交到 Clip 的时间轴更新函数中
    clip_0.update_function = [&instance_0](Clip& clip, const Camera& camera,
                                            uint64_t time_frame, double time_ms) {
        clip.submitSObjectInstance(instance_0);
    };
}
```

编译为动态库后，在前端点击"重新加载"即可注入函数指针，无需重启进程。

StuCanvas 内所有 `create*` 方法创建的对象，其指针地址在对象存活期间保持稳定，不会因后续创建操作或内存管理行为导致悬垂引用。Lambda 捕获中存储的引用可在整个加载周期内安全使用。

下一节将讲解如何让这个线段动起来。

## API 设计说明

### 全引用语义（`auto&`）

所有工厂方法返回对象引用而非指针或句柄。调用方持有引用，生命周期由 Canvas 统一管理，不涉及拷贝或所有权转移。

### 函数入口宏（`STUCANVAS_MAIN`）

以 `Canvas&` 为参数的函数入口替换传统 `main()`。编译为动态库后，前端将动态库中的该函数指针注入自身进程并调用。

### Clip 时间模型

`createClip_Frame(0, 60)` 声明一个帧区间，结合 `canvas.fps = 60` 构成 1 秒时间窗口。`clip.submitSObjectInstance()` 每帧被调用一次；超出 Clip 帧范围后不再提交，对象自然消失。无需手动销毁逻辑。

### 外观与几何分离

`createSObjectInstance()` 作为中间层，分别通过指针字段关联外观（`appearance`）和几何（`object`）。外观配置独立于几何数据，可复用。

### Lambda 捕获与热重载

`clip_0.update_function` 为可调用对象。前端每次"重新加载"时替换整个动态库的函数指针，Lambda 捕获的引用在当前加载周期内保持有效。
